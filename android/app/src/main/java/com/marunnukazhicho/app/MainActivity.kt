package com.marunnukazhicho.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notifier.ensureChannel(this)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.textZoom = 100
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return pickPhoto()
            }
        }
        web.addJavascriptInterface(Bridge(this), "Android")
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        Scheduler.rescheduleAll(this)
        web.evaluateJavascript("window.onResumeApp && window.onResumeApp()", null)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        web.evaluateJavascript("window.onResumeApp && window.onResumeApp()", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript(
            "(function(){var e=document.getElementById('editor');if(e&&e.classList.contains('open')){closeEditor();return 1}if(typeof tab!=='undefined'&&tab!=='today'){go('today');return 1}return 0})()"
        ) { r ->
            if (r != "1") finish()
        }
    }

    /** Camera or gallery, so a photo of the tablet/strip can be added. */
    private fun pickPhoto(): Boolean {
        cameraUri = null
        val extra = ArrayList<Intent>()
        try {
            val dir = File(cacheDir, "photos").apply { mkdirs() }
            val f = File(dir, "med_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
            val cam = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            cameraUri = uri
            extra.add(cam)
        } catch (e: Exception) { }
        val gallery = Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
        val chooser = Intent.createChooser(gallery, "Add medicine photo")
            .putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toTypedArray())
        return try {
            @Suppress("DEPRECATION")
            startActivityForResult(chooser, 7)
            true
        } catch (e: Exception) {
            fileCallback?.onReceiveValue(null); fileCallback = null
            false
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 7) return
        var result: Array<Uri>? = null
        if (resultCode == RESULT_OK) {
            val picked = data?.data
            result = when {
                picked != null -> arrayOf(picked)
                cameraUri != null -> arrayOf(cameraUri!!)
                else -> null
            }
        }
        fileCallback?.onReceiveValue(result)
        fileCallback = null
    }

    fun share(text: String) {
        val base = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            try { startActivity(Intent(base).setPackage(pkg)); return } catch (e: Exception) { }
        }
        Toast.makeText(this, "WhatsApp not found — choose another app", Toast.LENGTH_SHORT).show()
        try { startActivity(Intent.createChooser(base, "Share")) } catch (e: Exception) { }
    }

    fun openSettings(what: String) {
        val pkg = Uri.parse("package:$packageName")
        val i: Intent = when (what) {
            "notif" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            "exact" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg)
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            "fullscreen" -> if (Build.VERSION.SDK_INT >= 34)
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        }
        try {
            startActivity(i)
        } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)) } catch (_: Exception) { }
        }
    }
}

/** Methods the web screens call as window.Android.* */
class Bridge(private val act: MainActivity) {
    private val ctx: Context get() = act.applicationContext

    @JavascriptInterface fun getData(): String = Store.getData(ctx)
    @JavascriptInterface fun getLog(): String = Store.getLog(ctx)

    @JavascriptInterface fun saveData(s: String) {
        Store.saveData(ctx, s)
        Scheduler.rescheduleAll(ctx)
    }

    @JavascriptInterface fun saveLog(s: String) { Store.saveLog(ctx, s) }

    @JavascriptInterface fun status(): String {
        val o = JSONObject()
        o.put("notif", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        o.put("exact", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms())
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        o.put("fullscreen", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        o.put("battery", pm.isIgnoringBatteryOptimizations(ctx.packageName))
        return o.toString()
    }

    @JavascriptInterface fun fix(what: String) { act.runOnUiThread { act.openSettings(what) } }

    @JavascriptInterface fun share(text: String) { act.runOnUiThread { act.share(text) } }

    @JavascriptInterface fun testAlarm() { Scheduler.testAlarm(ctx) }

    @JavascriptInterface fun version(): String = try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "1.0"
    } catch (e: Exception) { "1.0" }
}
