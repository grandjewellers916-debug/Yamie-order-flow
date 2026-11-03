package com.marunnukazhicho.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object Notifier {
    const val CHANNEL = "mk_alarm_v1"

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        val ch = NotificationChannel(CHANNEL, "Medicine alarms", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "Rings when it's time to take medicine"
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        ch.setSound(
            sound,
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        ch.enableVibration(true)
        ch.vibrationPattern = longArrayOf(0, 800, 600, 800, 600, 800)
        ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        ch.setBypassDnd(true)
        nm.createNotificationChannel(ch)
    }

    fun notifId(key: String) = if (key == "test") 1999 else 1000 + Scheduler.KEYS.indexOf(key)

    fun show(ctx: Context, key: String, date: String, title: String, body: String) {
        ensureChannel(ctx)
        val id = notifId(key)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val full = Intent(ctx, AlarmActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            .putExtra("key", key).putExtra("date", date)
            .putExtra("title", title).putExtra("body", body)
        val fullPi = PendingIntent.getActivity(ctx, id, full, flags)

        fun action(a: String) = PendingIntent.getBroadcast(
            ctx, id * 10 + a.length,
            Intent(ctx, ActionReceiver::class.java).setAction(a).putExtra("key", key).putExtra("date", date),
            flags
        )

        val b = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pill)
            .setColor(0xFF0F6B5C.toInt())
            .setContentTitle(title)
            .setContentText(body.lineSequence().firstOrNull() ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            .setVibrate(longArrayOf(0, 800, 600, 800, 600, 800))
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullPi)
            .setFullScreenIntent(fullPi, true)
            .addAction(0, "✓ Taken", action(ActionReceiver.TAKEN))
            .addAction(0, "Later (${Scheduler.snoozeMinutes(ctx)} min)", action(ActionReceiver.SNOOZE))
            .addAction(0, "Skip", action(ActionReceiver.SKIP))

        val n = b.build()
        n.flags = n.flags or Notification.FLAG_INSISTENT // keep ringing until answered
        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (e: SecurityException) {
            // notifications not allowed — nothing more we can do here
        }
    }

    fun cancel(ctx: Context, key: String) {
        NotificationManagerCompat.from(ctx).cancel(notifId(key))
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val key = intent.getStringExtra("key") ?: return
        val date = intent.getStringExtra("date").let { if (it.isNullOrEmpty()) Scheduler.today() else it }

        if (key == "test") {
            Notifier.show(
                ctx, key, date, "Marunnu Kazhicho? 💊",
                "Test alarm — reminders are working.\nTap Taken or Skip to stop the sound."
            )
            return
        }

        val data = Store.data(ctx)
        val taken = Store.log(ctx).optJSONObject(date)
        val due = Scheduler.dueFor(data, key, date).filter { d ->
            taken?.has(d.med.optString("id") + "@" + d.slot) != true
        }
        if (due.isNotEmpty()) {
            val slot = Scheduler.slotOf(key)
            val food = if (Scheduler.foodOf(key) == "before") "Before food" else "After food"
            val title = "Marunnu Kazhicho? 💊 ${Scheduler.SLOT_LABEL[slot]} · $food"
            val body = due.joinToString("\n") { Scheduler.describe(it) }
            Notifier.show(ctx, key, date, title, body)
        }
        Scheduler.rescheduleAll(ctx)
    }
}

class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val TAKEN = "mk.TAKEN"
        const val SNOOZE = "mk.SNOOZE"
        const val SKIP = "mk.SKIP"

        fun handle(ctx: Context, action: String, key: String, date: String) {
            Notifier.cancel(ctx, key)
            when (action) {
                TAKEN -> if (key != "test") {
                    val due = Scheduler.dueFor(Store.data(ctx), key, date)
                    Store.markTaken(ctx, date, due.map { it.med.optString("id") + "@" + it.slot })
                }
                SNOOZE -> Scheduler.snooze(ctx, key, date)
            }
        }
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        val key = intent.getStringExtra("key") ?: return
        val date = intent.getStringExtra("date") ?: Scheduler.today()
        handle(ctx, intent.action ?: return, key, date)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        try { Scheduler.rescheduleAll(ctx) } catch (e: Exception) { }
    }
}
