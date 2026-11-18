package com.yamie.repairtrack

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Repair reminders as phone notifications, even when the app is closed.
 * The app sends its list of deadlines (issue to smith, inform customer, smith due, pickup);
 * a background check every 15 minutes notifies once for each deadline that has passed.
 */
object Reminders {
    const val CHANNEL = "repair_reminders"
    const val EXTRA_OPEN = "open_job"

    private fun prefs(c: Context) = c.getSharedPreferences("reminders", Context.MODE_PRIVATE)

    fun save(c: Context, json: String) {
        prefs(c).edit().putString("items", json).apply()
    }

    fun schedule(c: Context) {
        val req = PeriodicWorkRequestBuilder<Check>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("repair-reminders", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = c.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Repair reminders", NotificationManager.IMPORTANCE_HIGH))
        }
    }

    fun check(c: Context) {
        val items = try { JSONArray(prefs(c).getString("items", "[]")) } catch (e: Exception) { JSONArray() }
        val seen = (prefs(c).getStringSet("seen", emptySet()) ?: emptySet()).toMutableSet()
        val now = System.currentTimeMillis()
        val live = HashSet<String>()
        val due = ArrayList<JSONObject>()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val key = o.optString("key")
            if (key.isEmpty()) continue
            live.add(key)
            if (o.optLong("at") <= now && key !in seen) due.add(o)
        }
        seen.retainAll(live)
        ensureChannel(c)
        if (due.size in 1..3) {
            for (o in due) show(c, o.optString("title"), o.optString("body"), o.optString("key").hashCode(), o.optString("job"))
        } else if (due.size > 3) {
            val body = due.take(6).joinToString("\n") { it.optString("title") }
            show(c, "${due.size} repairs need action", body, 1, "")
        }
        for (o in due) seen.add(o.optString("key"))
        prefs(c).edit().putStringSet("seen", seen).apply()
    }

    private fun show(c: Context, title: String, body: String, id: Int, job: String) {
        val i = Intent(c, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_OPEN, job)
        }
        val pi = PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_repair)
            .setColor(0xFF78213F.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        try {
            (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, n)
        } catch (e: SecurityException) { }
    }

    class Check(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
        override fun doWork(): Result {
            check(applicationContext)
            return Result.success()
        }
    }
}
