package com.yamie.repairtrack

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
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
import org.json.JSONObject
import java.io.File

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPhoto: Uri? = null
    private var printView: WebView? = null
    private var pendingOpen: String? = null

    // Gallery / file picker for <input type="file">
    private val pickContent = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }

    // Camera for <input type="file" capture>
    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val cb = fileCallback
        fileCallback = null
        val u = pendingPhoto
        cb?.onReceiveValue(if (ok && u != null) arrayOf(u) else null)
    }

    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = true
        }
        web.addJavascriptInterface(Bridge(), "YamieNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == APP_HOST) return false
                openExternal(url)   // tel: opens the dialer, wa.me opens WhatsApp
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val images = params.acceptTypes.any { it.startsWith("image") }
                return try {
                    if (images && params.isCaptureEnabled) {
                        val dir = File(cacheDir, "photos").apply { mkdirs() }
                        val now = System.currentTimeMillis()
                        dir.listFiles()?.forEach { if (now - it.lastModified() > 6 * 3600 * 1000L) it.delete() }
                        val f = File(dir, "photo_$now.jpg")
                        val u = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                        pendingPhoto = u
                        takePicture.launch(u)
                    } else {
                        val i = Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = if (images) "image/*" else "*/*"
                        }
                        pickContent.launch(Intent.createChooser(i, if (images) "Choose photo" else "Choose backup file"))
                    }
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(function(){try{return window.onNativeBack?!!window.onNativeBack():false}catch(e){return false}})()") { r ->
                    if (r != "true") finish()
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$APP_HOST/assets/index.html")

        Reminders.ensureChannel(this)
        Reminders.schedule(this)
        takeIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        takeIntent(intent)
    }

    // Notification tapped: open that repair job
    private fun takeIntent(i: Intent?) {
        val id = i?.getStringExtra(Reminders.EXTRA_OPEN) ?: return
        if (id.isEmpty()) return
        pendingOpen = id
        web.postDelayed({ deliverOpen() }, 700)
    }

    private fun deliverOpen() {
        val id = pendingOpen ?: return
        web.evaluateJavascript("(function(){if(window.onNativeOpen){window.onNativeOpen(${JSONObject.quote(id)});return 1}return 0})()") { r ->
            if (r == "1") pendingOpen = null else web.postDelayed({ deliverOpen() }, 800)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun openExternal(url: Uri) {
        try {
            val action = if (url.scheme == "tel") Intent.ACTION_DIAL else Intent.ACTION_VIEW
            startActivity(Intent(action, url))
        } catch (e: Exception) { }
    }

    inner class Bridge {


        @JavascriptInterface
        fun version(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (e: Exception) { "" }

        // Picture card to WhatsApp: image + caption, straight into the customer's chat when possible
        @JavascriptInterface
        fun shareWhatsApp(phone: String, text: String, imagesJson: String) {
            runOnUiThread {
                try {
                    val imgs = try { org.json.JSONArray(imagesJson) } catch (e: Exception) { org.json.JSONArray() }
                    val digits = phone.filter { it.isDigit() }
                    if (imgs.length() == 0) {
                        openExternal(Uri.parse("https://wa.me/" + digits + "?text=" + Uri.encode(text)))
                        return@runOnUiThread
                    }
                    val dir = File(cacheDir, "share").apply { mkdirs() }
                    dir.listFiles()?.forEach { if (it.name.startsWith("card_")) it.delete() }
                    val data = imgs.getString(0).substringAfter("base64,")
                    val f = File(dir, "card_${System.currentTimeMillis()}.jpg")
                    f.writeBytes(Base64.decode(data, Base64.DEFAULT))
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "image/jpeg"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        putExtra(Intent.EXTRA_TEXT, text)
                        if (digits.isNotEmpty()) putExtra("jid", "$digits@s.whatsapp.net")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    val sent = listOf("com.whatsapp", "com.whatsapp.w4b").any { pkg ->
                        try { startActivity(Intent(intent).setPackage(pkg)); true } catch (e: android.content.ActivityNotFoundException) { false }
                    }
                    if (!sent) startActivity(Intent.createChooser(intent, "Send picture card"))
                } catch (e: Exception) { }
            }
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            runOnUiThread { openExternal(Uri.parse(url)) }
        }

        // Reminder schedule from the app: [{key, job, at (ms), title, body}]
        @JavascriptInterface
        fun setReminders(json: String) {
            Reminders.save(this@MainActivity, json)
            Reminders.schedule(this@MainActivity)
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread { try { askNotify.launch(Manifest.permission.POST_NOTIFICATIONS) } catch (e: Exception) { } }
            }
        }

        // Backup / report export: save to Downloads (Android 10+) and offer to share
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
                try {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = mime
                        putExtra(Intent.EXTRA_STREAM, u)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(Intent.createChooser(send, if (saved) "Saved to Downloads · share" else "Share file"))
                } catch (e: Exception) { }
            }
        }

        // Print a voucher through Android printing (Wi-Fi printers, Save as PDF)
        @JavascriptInterface
        fun printHtml(html: String, job: String) {
            runOnUiThread {
                try {
                    val v = WebView(this@MainActivity)
                    v.settings.javaScriptEnabled = false
                    v.webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                            assetLoader.shouldInterceptRequest(request.url)

                        override fun onPageFinished(view: WebView, url: String) {
                            val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
                            val name = job.ifBlank { "Yamie repair voucher" }
                            pm.print(name, view.createPrintDocumentAdapter(name),
                                PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
                        }
                    }
                    printView = v
                    v.loadDataWithBaseURL("https://$APP_HOST/assets/", html, "text/html", "utf-8", null)
                } catch (e: Exception) { }
            }
        }
    }

    companion object {
        const val APP_HOST = "appassets.androidplatform.net"
    }
}
