package com.yamie.stockcheck

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.FrameLayout
import java.io.File

/**
 * Yamie Core (stock + cash) — Android shell around the live web app (BuildConfig.APP_URL).
 * Adds: camera + gallery for photo inputs, file picker for the ERP PDF,
 * external links (WhatsApp) in their own apps, and saving/sharing CSV exports.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private val appHost by lazy { Uri.parse(BuildConfig.APP_URL).host }

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback; fileCallback = null
        if (cb == null) return@registerForActivityResult
        if (res.resultCode != RESULT_OK) { cb.onReceiveValue(null); return@registerForActivityResult }
        val data = res.data
        val uris = mutableListOf<Uri>()
        data?.clipData?.let { c -> for (i in 0 until c.itemCount) uris.add(c.getItemAt(i).uri) }
        if (uris.isEmpty()) data?.data?.let { uris.add(it) }
        if (uris.isEmpty()) cameraUri?.let { u ->
            val f = File(cacheDir, "photos/" + u.lastPathSegment)
            if (f.exists() && f.length() > 0) uris.add(u)
        }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(0xFF8F171B.toInt())   // no white flash before the Yamie Core splash
        // Keep the app inside the screen: never under the status bar, the phone's navigation bar or the keyboard,
        // so the app's bottom bar (Home · Counter · Trays · Boxes · Total · More) is always visible.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        root.setBackgroundColor(0xFF8F171B.toInt())
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = true
            useWideViewPort = true
            loadWithOverviewMode = false
            textZoom = 100                 // ignore phone font-size setting so the layout never overflows
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            userAgentString = "$userAgentString YamieStockCheckApp/${BuildConfig.VERSION_NAME}"
        }
        web.addJavascriptInterface(Bridge(), "YamieStock")
        web.overScrollMode = android.view.View.OVER_SCROLL_NEVER
        web.isHorizontalScrollBarEnabled = false

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == appHost) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, url)); true } catch (e: Exception) { true }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.loadDataWithBaseURL(null, OFFLINE, "text/html", "utf-8", null)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val accept = params.acceptTypes.joinToString(",").lowercase()
                val isImage = accept.contains("image")
                val isPdf = accept.contains("pdf")
                val multiple = params.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                return try {
                    val camera = if (isImage) cameraIntent() else null
                    if (isImage && params.isCaptureEnabled && camera != null) { chooser.launch(camera); return true }
                    val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = when { isImage -> "image/*"; isPdf -> "application/pdf"; else -> "*/*" }
                        if (multiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                    val title = if (isImage) "Take photo or choose from gallery" else if (isPdf) "Choose ERP PDF" else "Choose file"
                    val ch = Intent.createChooser(pick, title)
                    if (camera != null) ch.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                    chooser.launch(ch)
                    true
                } catch (e: Exception) { fileCallback = null; false }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Close an open window in the page first, then go back, then leave
                web.evaluateJavascript("(function(){var x=document.getElementById('xBtn');if(x){x.click();return 1}return 0})()") { r ->
                    if (r != "1") { if (web.canGoBack()) web.goBack() else finish() }
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(BuildConfig.APP_URL)
    }

    private fun cameraIntent(): Intent? {
        val dir = File(cacheDir, "photos").apply { mkdirs() }
        val f = File(dir, "cam_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        cameraUri = uri
        val i = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return if (i.resolveActivity(packageManager) != null) i else null
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    inner class Bridge {
        /** CSV / text exports: saved to a file and offered to Share (WhatsApp, Drive, Files…). */
        @JavascriptInterface
        fun shareFile(name: String, mime: String, text: String) {
            runOnUiThread {
                try {
                    val dir = File(cacheDir, "share").apply { mkdirs() }
                    val f = File(dir, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
                    f.writeText(text, Charsets.UTF_8)
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivity(Intent.createChooser(send, "Save or share $name"))
                } catch (e: Exception) { }
            }
        }
        /** v1.19 documents: a photo / PDF / QR (base64) — opened in a viewer (view = true) or offered to Share (WhatsApp, Drive…). */
        @JavascriptInterface
        fun shareData(name: String, mime: String, b64: String, view: Boolean) {
            runOnUiThread {
                try {
                    val dir = File(cacheDir, "share").apply { mkdirs() }
                    val f = File(dir, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
                    f.writeBytes(android.util.Base64.decode(b64, android.util.Base64.DEFAULT))
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val i = if (view) Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                            else Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivity(Intent.createChooser(i, if (view) "Open $name" else "Share $name"))
                } catch (e: Exception) { }
            }
        }
        /** v1.19 share plain text (bank details, GSTIN…) */
        @JavascriptInterface
        fun shareText(text: String) {
            runOnUiThread {
                try { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share")) } catch (e: Exception) { }
            }
        }
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun reload() { runOnUiThread { web.loadUrl(BuildConfig.APP_URL) } }
    }

    companion object {
        private const val OFFLINE = """<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;background:#FBF9F6;color:#1D1714;display:grid;place-items:center;min-height:90vh;text-align:center">
<div><div style="font-size:48px">📶</div><h2 style="color:#8F171B">No internet</h2><p>Yamie Core needs a connection to the shop database.</p>
<button onclick="YamieStock.reload()" style="background:#8F171B;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-size:16px">Try again</button></div></body>"""
    }
}
