package com.yamie.pricecheck

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var pendingPhoto: Uri? = null
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val barcodes by lazy { BarcodeScanning.getClient() }
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // Lets the page's <input type="file"> open the phone's file picker (stock Excel import)
    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }

    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingPhoto
        if (ok && uri != null) readTag(uri) else sendScan(JSONObject().put("error", "No photo taken."))
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) readTag(uri)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
        }
        web.addJavascriptInterface(Bridge(), "YamieNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == APP_HOST) return false
                // WhatsApp and other links open in their own apps
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url)); true
                } catch (e: Exception) { true }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    val i = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel", "application/vnd.ms-excel.sheet.macroEnabled.12",
                            "text/csv", "text/comma-separated-values", "application/octet-stream"))
                    }
                    pickFile.launch(Intent.createChooser(i, "Choose stock Excel file"))
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$APP_HOST/assets/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    inner class Bridge {
        @JavascriptInterface
        fun scan(source: String) {
            runOnUiThread {
                try {
                    if (source == "gallery") {
                        pickImage.launch("image/*")
                    } else {
                        val dir = File(cacheDir, "tags").apply { mkdirs() }
                        dir.listFiles()?.forEach { it.delete() }
                        val file = File(dir, "tag_${System.currentTimeMillis()}.jpg")
                        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                        pendingPhoto = uri
                        takePicture.launch(uri)
                    }
                } catch (e: Exception) {
                    sendScan(JSONObject().put("error", "Could not open the camera. Try From gallery."))
                }
            }
        }

        @JavascriptInterface
        fun fetchRates() {
            thread {
                val body = try {
                    val c = URL(RATES_URL).openConnection() as HttpURLConnection
                    c.connectTimeout = 10000
                    c.readTimeout = 10000
                    c.setRequestProperty("Accept", "application/json")
                    try {
                        if (c.responseCode in 200..299) c.inputStream.bufferedReader().use { it.readText() } else null
                    } finally { c.disconnect() }
                } catch (e: Exception) { null }
                val arg = if (body == null) "null" else JSONObject.quote(body)
                runOnUiThread { web.evaluateJavascript("window.onNativeRates && window.onNativeRates($arg)", null) }
            }
        }

        @JavascriptInterface
        fun copy(text: String) {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Yamie quote", text))
        }
    }

    private fun readTag(uri: Uri) {
        web.evaluateJavascript("window.onNativeScanStart && window.onNativeScanStart()", null)
        val thumb = try { thumbnail(uri) } catch (e: Exception) { null }
        val image = try { InputImage.fromFilePath(this, uri) } catch (e: Exception) {
            sendScan(JSONObject().put("error", "Could not open that photo.")); return
        }
        // Read the printed barcode first (for stock lookup), then the text on the tag
        barcodes.process(image).addOnCompleteListener { bt ->
            val codes = JSONArray()
            if (bt.isSuccessful) bt.result?.forEach { b -> b.rawValue?.let { if (it.isNotBlank()) codes.put(it.trim()) } }
            recognizer.process(image)
                .addOnSuccessListener { result ->
                    val out = JSONObject().put("text", result.text).put("barcodes", codes)
                    if (thumb != null) out.put("thumb", thumb)
                    sendScan(out)
                }
                .addOnFailureListener {
                    val out = JSONObject().put("barcodes", codes)
                    if (codes.length() == 0) out.put("error", "Could not read text in that photo. Retake it closer, in good light.") else out.put("text", "")
                    if (thumb != null) out.put("thumb", thumb)
                    sendScan(out)
                }
        }
    }

    private fun thumbnail(uri: Uri): String {
        val bmp: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { decoder, info, _ ->
                val s = 240.0 / maxOf(info.size.width, info.size.height)
                if (s < 1) decoder.setTargetSize((info.size.width * s).toInt(), (info.size.height * s).toInt())
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 240) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
                ?: throw IllegalStateException("decode failed")
        }
        val bytes = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 80, bytes)
        return "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    }

    private fun sendScan(json: JSONObject) {
        val arg = JSONObject.quote(json.toString())
        runOnUiThread { web.evaluateJavascript("window.onNativeScan && window.onNativeScan($arg)", null) }
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val RATES_URL = "https://grandjewellers.com/api/kiosk-rates"
    }
}
