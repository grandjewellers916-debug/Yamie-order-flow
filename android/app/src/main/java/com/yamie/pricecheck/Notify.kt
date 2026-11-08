package com.yamie.pricecheck

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

// Phone notifications for quote approvals and WhatsApp leads.
// The app polls while open; this worker checks every 15 minutes while it is closed.
object Notify {
    const val EXTRA_OPEN = "ypc_open"
    private const val CHANNEL = "alerts"
    private const val PREFS = "ypc_notify"
    private const val WORK = "ypc_inbox"
    private const val QUICK = "ypc_inbox_quick"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun configure(c: Context, config: String) {
        prefs(c).edit().putString("config", config).apply()
        val wm = WorkManager.getInstance(c)
        if (config.isEmpty()) { wm.cancelUniqueWork(WORK); wm.cancelUniqueWork(QUICK); return }
        val req = PeriodicWorkRequestBuilder<InboxWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    // While the app is in the background: check about every minute (Android may space this out when the phone sleeps)
    fun quick(c: Context, delaySec: Long) {
        if ((prefs(c).getString("config", "") ?: "").isEmpty()) return
        val req = OneTimeWorkRequestBuilder<QuickWorker>()
            .setInitialDelay(delaySec, TimeUnit.SECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniqueWork(QUICK, ExistingWorkPolicy.REPLACE, req)
    }
    fun stopQuick(c: Context) { WorkManager.getInstance(c).cancelUniqueWork(QUICK) }
    var foreground = false

    // The app has synced what this user has already seen: background checks may now notify
    fun ready(c: Context) { prefs(c).edit().putBoolean("init", true).apply() }

    @Synchronized
    fun markSeen(c: Context, key: String): Boolean {
        val p = prefs(c)
        val seen = (p.getString("seen", "") ?: "").split('\n').filter { it.isNotEmpty() }.toMutableList()
        if (seen.contains(key)) return false
        seen.add(key)
        p.edit().putString("seen", seen.takeLast(400).joinToString("\n")).apply()
        return true
    }

    fun show(c: Context, title: String, body: String, key: String, open: String) {
        try {
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Approvals and leads", NotificationManager.IMPORTANCE_HIGH))
            val i = Intent(c, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_OPEN, open)
            }
            val pi = PendingIntent.getActivity(c, key.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            NotificationManagerCompat.from(c).notify(key.hashCode(), n)
        } catch (e: SecurityException) {
        } catch (e: Exception) {
        }
    }

    // One check: what is new for this user since the last check
    fun check(c: Context) {
        val cfg = try { JSONObject(prefs(c).getString("config", "") ?: "") } catch (e: Exception) { return }
        val site = cfg.optString("site"); val key = cfg.optString("key"); val me = cfg.optString("user")
        if (site.isEmpty() || key.isEmpty() || me.isEmpty()) return
        val approver = cfg.optBoolean("approver")
        val body = try {
            val conn = URL("$site/api/sync?op=inbox").openConnection() as HttpURLConnection
            conn.connectTimeout = 15000; conn.readTimeout = 15000
            conn.setRequestProperty("x-shop-key", key)
            try { if (conn.responseCode in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else null } finally { conn.disconnect() }
        } catch (e: Exception) { null } ?: return
        val j = try { JSONObject(body) } catch (e: Exception) { return }
        val first = !prefs(c).getBoolean("init", false)
        fun each(name: String, f: (JSONObject) -> Unit) { val a = j.optJSONArray(name) ?: return; for (i in 0 until a.length()) a.optJSONObject(i)?.let(f) }
        if (approver) each("pending") { p ->
            if (p.optString("by") != me && (p.optString("to").isEmpty() || p.optString("to") == me)) {
                val k = "p:" + p.optString("id") + ":" + p.optLong("at")
                if (markSeen(c, k) && !first) show(c, "Approve " + p.optString("no", "quote") + nameOf(p),
                    "From " + p.optString("byName", "staff") + " · tap to set the discount and approve", k, "pending:" + p.optString("id"))
            }
        }
        each("approved") { a ->
            if (a.optString("to") == me) {
                val k = "a:" + a.optString("id") + ":" + a.optLong("at")
                if (markSeen(c, k) && !first) show(c, a.optString("no", "Quote") + " approved" + nameOf(a),
                    "By " + a.optString("byName", "manager") + " · ready to share", k, "approved:" + a.optString("id"))
            }
        }
        each("leads") { l ->
            if (l.optString("to") == me) {
                val k = "l:" + l.optString("id")
                if (markSeen(c, k) && !first) show(c, "New WhatsApp lead" + nameOf(l),
                    "From " + l.optString("byName", "manager") + " · tap to start the quote", k, "lead:" + l.optString("id"))
            }
        }
        if (first) prefs(c).edit().putBoolean("init", true).apply()
    }

    private fun nameOf(o: JSONObject): String { val n = o.optString("name"); return if (n.isNotEmpty()) " · $n" else "" }
}

class QuickWorker(c: Context, p: WorkerParameters) : Worker(c, p) {
    override fun doWork(): Result {
        if (Notify.foreground) return Result.success()
        Notify.check(applicationContext)
        Notify.quick(applicationContext, 60)
        return Result.success()
    }
}

class InboxWorker(c: Context, p: WorkerParameters) : Worker(c, p) {
    override fun doWork(): Result {
        Notify.check(applicationContext)
        return Result.success()
    }
}
