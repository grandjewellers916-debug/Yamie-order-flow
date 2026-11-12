package com.yamie.pricecheck

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ActivityNotFoundException
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
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
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
    // Quote photos for customers: camera or gallery, sent back as JPEG data URLs
    private var pendingQuotePhoto: Uri? = null
    private val takeQuotePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingQuotePhoto
        if (ok && uri != null) sendPhotos(listOf(uri)) else sendPhotosJson(JSONArray())
    }
    private val pickQuotePhotos = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        sendPhotos(uris.take(10))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Phones stay portrait; tablets (smallest width >= 600dp) turn freely so the wide two-column layout can be used in landscape.
        requestedOrientation = if (resources.configuration.smallestScreenWidthDp >= 600)
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

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
        takeIntent(intent)
    }

    // WhatsApp text shared into the app, or a tapped notification
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        takeIntent(intent)
    }

    // Background checks for approvals and leads while the app is not on screen
    override fun onStart() { super.onStart(); Notify.foreground = true; Notify.stopQuick(this) }
    override fun onStop() { super.onStop(); Notify.foreground = false; Notify.quick(this, 30) }

    private var pendingShared: String? = null
    private var pendingOpen: String? = null
    private fun takeIntent(i: Intent?) {
        if (i == null) return
        if (i.action == Intent.ACTION_SEND && i.type?.startsWith("text/") == true) {
            val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: return
            pendingShared = t
            web.postDelayed({ deliverPending() }, 600)
        }
        i.getStringExtra(Notify.EXTRA_OPEN)?.let { pendingOpen = it; web.postDelayed({ deliverPending() }, 600) }
    }
    private fun deliverPending() {
        pendingShared?.let { t ->
            web.evaluateJavascript("(function(){if(window.onSharedText){window.onSharedText(${JSONObject.quote(t)});return 1}return 0})()") { r ->
                if (r == "1") pendingShared = null else web.postDelayed({ deliverPending() }, 800)
            }
        }
        pendingOpen?.let { o ->
            web.evaluateJavascript("(function(){if(window.onNativeOpen){window.onNativeOpen(${JSONObject.quote(o)});return 1}return 0})()") { r ->
                if (r == "1") pendingOpen = null else web.postDelayed({ deliverPending() }, 800)
            }
        }
    }

    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

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

        // Live barcode scanner (Google Play services). Falls back to a photo if unavailable.
        @JavascriptInterface
        fun scanBarcode() {
            runOnUiThread {
                try {
                    val opts = GmsBarcodeScannerOptions.Builder().enableAutoZoom().build()
                    GmsBarcodeScanning.getClient(this@MainActivity, opts).startScan()
                        .addOnSuccessListener { b -> sendBarcode(b.rawValue ?: "", null) }
                        .addOnCanceledListener { sendBarcode("", "cancelled") }
                        .addOnFailureListener { sendBarcode("", "fallback") }
                } catch (e: Exception) {
                    sendBarcode("", "fallback")
                }
            }
        }

        @JavascriptInterface
        fun pickPhotos(source: String) {
            runOnUiThread {
                try {
                    if (source == "camera") {
                        val dir = File(cacheDir, "photos").apply { mkdirs() }
                        val file = File(dir, "quote_${System.currentTimeMillis()}.jpg")
                        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                        pendingQuotePhoto = uri
                        takeQuotePhoto.launch(uri)
                    } else pickQuotePhotos.launch("image/*")
                } catch (e: Exception) { sendPhotosJson(JSONArray()) }
            }
        }

        // Share a quote to WhatsApp: text plus optional photos (JPEG data URLs). phone: digits with country code, or "".
        @JavascriptInterface
        fun shareWhatsApp(phone: String, text: String, imagesJson: String) {
            runOnUiThread {
                try {
                    val imgs = try { JSONArray(imagesJson) } catch (e: Exception) { JSONArray() }
                    val digits = phone.filter { it.isDigit() }
                    if (imgs.length() == 0) {
                        val url = "https://wa.me/" + digits + "?text=" + Uri.encode(text)
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return@runOnUiThread
                    }
                    val dir = File(cacheDir, "share").apply { mkdirs() }
                    dir.listFiles()?.forEach { it.delete() }
                    val uris = ArrayList<Uri>()
                    for (i in 0 until imgs.length()) {
                        val data = imgs.getString(i).substringAfter("base64,")
                        val f = File(dir, "photo_${i + 1}.jpg")
                        f.writeBytes(Base64.decode(data, Base64.DEFAULT))
                        uris.add(FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f))
                    }
                    val intent = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
                        type = "image/jpeg"
                        if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                        putExtra(Intent.EXTRA_TEXT, text)
                        if (digits.isNotEmpty() && uris.size == 1) putExtra("jid", "$digits@s.whatsapp.net")  // several pictures: WhatsApp asks for the chat
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    val sent = listOf("com.whatsapp", "com.whatsapp.w4b").any { pkg ->
                        try { startActivity(Intent(intent).setPackage(pkg)); true } catch (e: ActivityNotFoundException) { false }
                    }
                    if (!sent) startActivity(Intent.createChooser(intent, "Share quote"))
                } catch (e: Exception) {
                    web.evaluateJavascript("window.onNativeShareError && window.onNativeShareError()", null)
                }
            }
        }

        // Save an exported file (Excel / PDF): into Downloads (Android 10+), then offer to open or share it
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (e: Exception) { return }
            val safe = name.replace(Regex("[^A-Za-z0-9._ -]"), "_")
            var saved = false
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    val cv = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, safe)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                    if (uri != null) { contentResolver.openOutputStream(uri)?.use { it.write(bytes) }; saved = true }
                } catch (e: Exception) { }
            }
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val f = File(dir, safe)
            f.writeBytes(bytes)
            val u = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
            runOnUiThread {
                web.evaluateJavascript("window.onNativeSaved && window.onNativeSaved(${JSONObject.quote(safe)}, $saved)", null)
                try {
                    val send = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, u); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                    startActivity(Intent.createChooser(send, if (saved) "Saved to Downloads · share" else "Share export"))
                } catch (e: Exception) { }
            }
        }

        // Theme: colour of the status and navigation bars; light = dark icons on a light bar
        @JavascriptInterface
        fun setBars(color: String, light: Boolean) {
            runOnUiThread {
                try {
                    val c = android.graphics.Color.parseColor(color)
                    window.statusBarColor = c
                    window.navigationBarColor = if (light) android.graphics.Color.WHITE else c
                    val ctl = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                    ctl.isAppearanceLightStatusBars = light
                    ctl.isAppearanceLightNavigationBars = light
                } catch (e: Exception) {}
            }
        }

        // Notifications: show one now (key = so the background check does not repeat it)
        @JavascriptInterface
        fun notify(title: String, body: String, key: String, open: String, show: Boolean) {
            Notify.markSeen(this@MainActivity, key)
            if (show) Notify.show(this@MainActivity, title, body, key, open)
        }

        // The app has marked what this user already saw; background checks may notify from now on
        @JavascriptInterface
        fun inboxReady() { Notify.ready(this@MainActivity) }

        // Background check for approvals and leads (every 15 minutes, while logged in); empty config stops it
        @JavascriptInterface
        fun setInbox(config: String) {
            Notify.configure(this@MainActivity, config)
            if (config.isNotEmpty() && Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                runOnUiThread { try { askNotify.launch(android.Manifest.permission.POST_NOTIFICATIONS) } catch (e: Exception) {} }
            }
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            runOnUiThread { try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) {} }
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

    private fun sendPhotos(uris: List<Uri>) {
        thread {
            val out = JSONArray()
            uris.forEach { u -> try { out.put(scaled(u, 1280, 82)) } catch (e: Exception) {} }
            sendPhotosJson(out)
        }
    }

    private fun sendPhotosJson(arr: JSONArray) {
        val arg = JSONObject.quote(arr.toString())
        runOnUiThread { web.evaluateJavascript("window.onNativePhotos && window.onNativePhotos($arg)", null) }
    }

    private fun scaled(uri: Uri, max: Int, quality: Int): String {
        val bmp: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { decoder, info, _ ->
                val s = max.toDouble() / maxOf(info.size.width, info.size.height)
                if (s < 1) decoder.setTargetSize((info.size.width * s).toInt(), (info.size.height * s).toInt())
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= max) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
                ?: throw IllegalStateException("decode failed")
        }
        val bytes = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, quality, bytes)
        return "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    }

    private fun sendBarcode(code: String, err: String?) {
        val c = JSONObject.quote(code)
        val e = if (err == null) "null" else JSONObject.quote(err)
        runOnUiThread { web.evaluateJavascript("window.onNativeBarcode && window.onNativeBarcode($c,$e)", null) }
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
