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
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView

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
        web.webChromeClient = WebChromeClient()
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

    @JavascriptInterface fun testAlarm() { Scheduler.testAlarm(ctx) }

    @JavascriptInterface fun version(): String = try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "1.0"
    } catch (e: Exception) { "1.0" }
}
