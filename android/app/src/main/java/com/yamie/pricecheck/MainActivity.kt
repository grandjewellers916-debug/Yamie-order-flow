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
import android.print.PrintAttributes
import android.provider.ContactsContract
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
    private lateinit var assetLoader: WebViewAssetLoader
    private var printView: WebView? = null   // kept until the print job is handed over
    private var pendingPhoto: Uri? = null
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val barcodes by lazy { BarcodeScanning.getClient() }
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val outFiles = java.util.concurrent.ConcurrentHashMap<String, Array<String>>()

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

        otaPrune()
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", OtaHandler())
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
                val zip = params.acceptTypes.any { it.contains("zip") }
                return try {
                    val i = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, if (zip) arrayOf("application/zip", "application/x-zip-compressed", "application/x-zip", "application/octet-stream")
                        else arrayOf(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel", "application/vnd.ms-excel.sheet.macroEnabled.12",
                            "text/csv", "text/comma-separated-values", "application/octet-stream"))
                    }
                    pickFile.launch(Intent.createChooser(i, if (zip) "Choose backup file" else "Choose stock Excel file"))
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
        otaCheck(true)
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) otaCheck(false)
    }

    // ---------- V1.9.12 automatic updates (no new APK needed for screen changes) ----------
    // The app checks the website's ota.json, downloads only the files that changed into app storage and serves
    // them in place of the built-in copy. Same address, so saved data and sign-in stay. If the website needs a
    // newer phone app (nativeApi), the update waits for a new APK. A newer APK replaces any downloaded copy.
    private val otaRoot by lazy { File(filesDir, "ota") }
    private val otaWeb get() = File(otaRoot, "web")
    @Volatile private var otaLast = 0L
    @Volatile private var otaBusy = false
    private fun otaHost() = if (packageName.contains("grand")) "grand-price-check.netlify.app" else "yamie-price-check.netlify.app"
    private fun appVersion(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "0" } catch (e: Exception) { "0" }
    private fun verCmp(a: String, b: String): Int {
        val x = a.split('.').map { it.toIntOrNull() ?: 0 }; val y = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) { val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }; if (d != 0) return d }
        return 0
    }
    private fun otaState(): JSONObject = try { JSONObject(File(otaRoot, "state.json").readText()) } catch (e: Exception) { JSONObject() }
    private fun otaPrune() {
        val v = otaState().optString("v", "")
        if (v.isEmpty() || verCmp(appVersion(), v) >= 0) { otaWeb.deleteRecursively(); File(otaRoot, "state.json").delete() }
    }
    private fun sha(input: java.io.InputStream): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        input.use { val b = ByteArray(65536); while (true) { val n = it.read(b); if (n < 0) break; md.update(b, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
    private fun assetSha(path: String): String? = try { sha(assets.open(path)) } catch (e: Exception) { null }
    private fun otaGet(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8000; c.readTimeout = 20000; c.useCaches = false
        try { if (c.responseCode != 200) throw Exception("HTTP ${c.responseCode}"); return c.inputStream.use { it.readBytes() } } finally { c.disconnect() }
    }
    private fun otaCheck(force: Boolean) {
        val now = System.currentTimeMillis()
        if (otaBusy || (!force && now - otaLast < 15 * 60_000L)) return
        otaLast = now; otaBusy = true
        thread(name = "ota") {
            val next = File(otaRoot, "next")
            try {
                val host = otaHost()
                val man = JSONObject(String(otaGet("https://$host/ota.json?t=$now")))
                val v = man.optString("v", ""); val build = man.optString("build", "")
                if (man.optInt("nativeApi", 1) > NATIVE_API || v.isEmpty() || build.isEmpty()) return@thread
                if (verCmp(v, appVersion()) <= 0 || otaState().optString("build") == build) return@thread
                val files = man.getJSONObject("files")
                next.deleteRecursively(); next.mkdirs()
                for (p in files.keys()) {
                    if (p == "brand-id.js" || p == "ota.json" || p.contains("..") || p.startsWith("/")) continue
                    val want = files.getString(p)
                    if (assetSha(p) == want) continue                       // same as the built-in copy
                    val dst = File(next, p); dst.parentFile?.mkdirs()
                    val cur = File(otaWeb, p)
                    if (cur.isFile && sha(cur.inputStream()) == want) { cur.copyTo(dst, true); continue }
                    val bytes = otaGet("https://$host/" + p.split('/').joinToString("/") { Uri.encode(it) } + "?b=" + Uri.encode(build))
                    if (sha(bytes.inputStream()) != want) throw Exception("changed while downloading: $p")
                    dst.writeBytes(bytes)
                }
                otaWeb.deleteRecursively(); otaRoot.mkdirs()
                if (!next.renameTo(otaWeb)) throw Exception("swap")
                File(otaRoot, "state.json").writeText(JSONObject().put("v", v).put("build", build).put("at", now).toString())
                runOnUiThread { web.evaluateJavascript("window.__otaReady&&window.__otaReady(${JSONObject.quote(v)})", null) }
            } catch (e: Exception) {
                next.deleteRecursively()
            } finally { otaBusy = false }
        }
    }
    private fun mimeOf(p: String) = when (p.substringAfterLast('.').lowercase()) {
        "html", "htm" -> "text/html"; "js", "mjs" -> "text/javascript"; "css" -> "text/css"; "json" -> "application/json"
        "webmanifest" -> "application/manifest+json"; "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "svg" -> "image/svg+xml"
        "webp" -> "image/webp"; "gif" -> "image/gif"; "ico" -> "image/x-icon"; "wasm" -> "application/wasm"; "txt" -> "text/plain"
        else -> "application/octet-stream"
    }
    private inner class OtaHandler : WebViewAssetLoader.PathHandler {
        private val base = WebViewAssetLoader.AssetsPathHandler(this@MainActivity)
        override fun handle(path: String): WebResourceResponse? {
            if (path != "brand-id.js") {
                val f = File(otaWeb, path)
                try {
                    if (f.isFile && f.canonicalPath.startsWith(otaWeb.canonicalPath + File.separator)) {
                        val m = mimeOf(path)
                        return WebResourceResponse(m, if (m.startsWith("text/") || m.contains("json") || m.contains("javascript")) "utf-8" else null, f.inputStream())
                    }
                } catch (e: Exception) { }
            }
            return base.handle(path)
        }
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

    // V1.9.16 phone book: pick one number (no contacts permission needed for a picked entry), like Order Desk
    private val pickContact = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uri = res.data?.data
        var name = ""; var phone = ""
        if (res.resultCode == RESULT_OK && uri != null) {
            try {
                contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
                    if (c.moveToFirst()) { name = c.getString(0) ?: ""; phone = c.getString(1) ?: "" }
                }
            } catch (e: Exception) { }
        }
        val o = JSONObject().put("name", name).put("phone", phone).put("ok", phone.isNotEmpty())
        web.evaluateJavascript("window.onContactPicked&&window.onContactPicked(${o})", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    inner class Bridge {
        @JavascriptInterface
        fun pickContact(): Boolean {
            runOnUiThread {
                try { pickContact.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)) }
                catch (e: Exception) { web.evaluateJavascript("window.onContactPicked&&window.onContactPicked({ok:false,error:'No contacts app'})", null) }
            }
            return true
        }
        @JavascriptInterface
        fun checkUpdate() { runOnUiThread { otaCheck(true) } }   // V1.9.12
        @JavascriptInterface
        fun webVersion(): String = otaState().optString("v", "")
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

        // Large files (backups): written in pieces, then saved to Downloads and offered to share
        @JavascriptInterface
        fun fileBegin(name: String, mime: String): String {
            val id = java.util.UUID.randomUUID().toString().substring(0, 8)
            val safe = name.replace(Regex("[^A-Za-z0-9._ -]"), "_")
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val now = System.currentTimeMillis()
            dir.listFiles()?.forEach { if (now - it.lastModified() > 6 * 3600 * 1000L) it.delete() }
            val f = File(dir, safe)
            f.delete()
            outFiles[id] = arrayOf(f.absolutePath, safe, mime)
            return id
        }

        @JavascriptInterface
        fun fileAppend(id: String, base64: String): Boolean {
            val o = outFiles[id] ?: return false
            return try {
                java.io.FileOutputStream(o[0], true).use { it.write(Base64.decode(base64, Base64.DEFAULT)) }
                true
            } catch (e: Exception) { false }
        }

        @JavascriptInterface
        fun fileEnd(id: String) {
            val o = outFiles.remove(id) ?: return
            val f = File(o[0]); val safe = o[1]; val mime = o[2]
            var saved = false
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    val cv = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, safe)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                    if (uri != null) { contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } }; saved = true }
                } catch (e: Exception) { }
            }
            val u = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
            runOnUiThread {
                web.evaluateJavascript("window.onNativeSaved && window.onNativeSaved(${JSONObject.quote(safe)}, $saved)", null)
                try {
                    val send = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, u); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                    startActivity(Intent.createChooser(send, if (saved) "Saved to Downloads · share" else "Share backup"))
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

        // V1.8.15 print the quote (A4) through Android printing: any network / Wi-Fi printer the phone sees (Mopria, HP, Epson… print services)
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
                            val name = job.ifBlank { "Quotation" }
                            pm.print(name, view.createPrintDocumentAdapter(name),
                                PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
                        }
                    }
                    printView = v
                    v.loadDataWithBaseURL("https://$APP_HOST/assets/", html, "text/html", "utf-8", null)
                } catch (e: Exception) {
                    web.evaluateJavascript("window.onNativePrintError && window.onNativePrintError()", null)
                }
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
        // V1.9.12 bump with NATIVE_API in web/index.html when the screens need something new from this phone app
        const val NATIVE_API = 1
        private const val RATES_URL = "https://grandjewellers.com/api/kiosk-rates"
    }
}
