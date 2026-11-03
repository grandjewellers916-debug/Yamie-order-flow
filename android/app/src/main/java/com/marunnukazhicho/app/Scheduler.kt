package com.marunnukazhicho.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Everything is kept in one SharedPreferences file, shared with the web screens. */
object Store {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("mk", Context.MODE_PRIVATE)

    fun getData(ctx: Context): String = prefs(ctx).getString("data", "") ?: ""
    fun saveData(ctx: Context, s: String) { prefs(ctx).edit().putString("data", s).apply() }
    fun getLog(ctx: Context): String = prefs(ctx).getString("log", "") ?: ""
    fun saveLog(ctx: Context, s: String) { prefs(ctx).edit().putString("log", s).commit() }

    fun data(ctx: Context): JSONObject =
        try { JSONObject(getData(ctx).ifEmpty { "{}" }) } catch (e: Exception) { JSONObject() }

    fun log(ctx: Context): JSONObject =
        try { JSONObject(getLog(ctx).ifEmpty { "{}" }) } catch (e: Exception) { JSONObject() }

    @Synchronized
    fun markTaken(ctx: Context, date: String, entries: List<String>) {
        val log = log(ctx)
        val day = log.optJSONObject(date) ?: JSONObject()
        val now = SimpleDateFormat("HH:mm", Locale.US).format(Date())
        for (e in entries) if (!day.has(e)) day.put(e, now)
        log.put(date, day)
        saveLog(ctx, log.toString())
    }
}

/** One reminder for a slot (morning/noon/evening/night) + food (before/after). */
data class Due(val med: JSONObject, val slot: String)

object Scheduler {
    val SLOTS = listOf("morning", "noon", "evening", "night")
    val SLOT_LABEL = mapOf("morning" to "Morning", "noon" to "Noon", "evening" to "Evening", "night" to "Night")
    val KEYS: List<String> = SLOTS.flatMap { listOf("$it-b", "$it-a") }
    private val DEFAULT_TIMES = mapOf("morning" to "08:00", "noon" to "13:00", "evening" to "18:00", "night" to "21:00")

    private val dayFmt get() = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    fun ymd(c: Calendar): String = dayFmt.format(c.time)
    fun today(): String = ymd(Calendar.getInstance())

    fun addDays(date: String, n: Int): String {
        val c = Calendar.getInstance()
        try { c.time = dayFmt.parse(date)!! } catch (e: Exception) { return date }
        c.add(Calendar.DAY_OF_MONTH, n)
        return ymd(c)
    }

    fun slotOf(key: String) = key.substringBefore("-")
    fun foodOf(key: String) = if (key.endsWith("-b")) "before" else "after"

    /** Minutes after midnight when this key's alarm rings. */
    fun minutesFor(data: JSONObject, key: String): Int {
        val st = data.optJSONObject("settings") ?: JSONObject()
        val times = st.optJSONObject("times") ?: JSONObject()
        val slot = slotOf(key)
        val t = times.optString(slot, DEFAULT_TIMES[slot] ?: "08:00")
        val parts = t.split(":")
        var m = (parts.getOrNull(0)?.toIntOrNull() ?: 8) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
        if (foodOf(key) == "before") m -= st.optInt("beforeMins", 30)
        return ((m % 1440) + 1440) % 1440
    }

    fun timeText(mins: Int): String {
        val h = mins / 60
        val m = mins % 60
        val h12 = if (h % 12 == 0) 12 else h % 12
        return String.format(Locale.US, "%d:%02d %s", h12, m, if (h < 12) "AM" else "PM")
    }

    private fun isActiveOn(m: JSONObject, date: String): Boolean {
        if (m.optBoolean("paused", false)) return false
        val start = m.optString("start", "")
        if (start.isNotEmpty() && date < start) return false
        val days = m.optString("days", "").trim().toIntOrNull() ?: 0
        if (days > 0 && date >= addDays(if (start.isEmpty()) date else start, days)) return false
        return true
    }

    /** Medicines that this reminder covers on the given day. */
    fun dueFor(data: JSONObject, key: String, date: String): List<Due> {
        val meds = data.optJSONArray("meds") ?: return emptyList()
        val slot = slotOf(key)
        val food = foodOf(key)
        val out = ArrayList<Due>()
        for (i in 0 until meds.length()) {
            val m = meds.optJSONObject(i) ?: continue
            if (m.optString("intake") == "ifneeded") continue
            val mFood = if (m.optString("food") == "before") "before" else "after"
            if (mFood != food) continue
            val doses = m.optJSONObject("doses") ?: continue
            if (doses.optString(slot, "").isEmpty()) continue
            if (!isActiveOn(m, date)) continue
            out.add(Due(m, slot))
        }
        return out
    }

    fun qtyText(m: JSONObject, slot: String): String {
        val q = m.optJSONObject("doses")?.optString(slot, "1") ?: "1"
        val (one, many) = when (m.optString("form", "tablet")) {
            "capsule" -> "capsule" to "capsules"
            "syrup" -> "spoon" to "spoons"
            "drops" -> "drop" to "drops"
            "injection" -> "injection" to "injections"
            "other" -> "dose" to "doses"
            else -> "tablet" to "tablets"
        }
        return when (q) {
            "half" -> "½ $one"
            "1" -> "1 $one"
            else -> "$q $many"
        }
    }

    fun describe(d: Due): String {
        val m = d.med
        val sb = StringBuilder()
        val person = m.optString("person", "").trim()
        if (person.isNotEmpty()) sb.append(person).append(": ")
        sb.append(m.optString("name")).append(" — ").append(qtyText(m, d.slot))
        if (m.optString("intake") == "conditional" && m.optString("condition").isNotBlank())
            sb.append("\n   only if ").append(m.optString("condition").trim())
        return sb.toString()
    }

    private fun alarmIntent(ctx: Context, key: String, date: String, code: Int): PendingIntent {
        val i = Intent(ctx, AlarmReceiver::class.java)
            .setAction("mk.ALARM.$code")
            .putExtra("key", key)
            .putExtra("date", date)
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun setExact(ctx: Context, at: Long, pi: PendingIntent) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        try {
            if (canExact) {
                val show = PendingIntent.getActivity(
                    ctx, 0, Intent(ctx, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    /** Sets the next alarm for each of the 8 possible reminders; cancels unused ones. */
    fun rescheduleAll(ctx: Context) {
        val data = Store.data(ctx)
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()
        KEYS.forEachIndexed { idx, key ->
            val mins = minutesFor(data, key)
            var found: Pair<Long, String>? = null
            for (offset in 0..90) {
                val c = Calendar.getInstance()
                c.add(Calendar.DAY_OF_MONTH, offset)
                c.set(Calendar.HOUR_OF_DAY, mins / 60)
                c.set(Calendar.MINUTE, mins % 60)
                c.set(Calendar.SECOND, 0)
                c.set(Calendar.MILLISECOND, 0)
                if (c.timeInMillis <= now + 30_000) continue
                val date = ymd(c)
                if (dueFor(data, key, date).isNotEmpty()) { found = c.timeInMillis to date; break }
            }
            val pi = alarmIntent(ctx, key, "", idx)
            am.cancel(pi)
            found?.let { (at, date) -> setExact(ctx, at, alarmIntent(ctx, key, date, idx)) }
        }
    }

    fun snooze(ctx: Context, key: String, date: String) {
        val mins = Store.data(ctx).optJSONObject("settings")?.optInt("snoozeMins", 10) ?: 10
        val idx = KEYS.indexOf(key).coerceAtLeast(0)
        setExact(ctx, System.currentTimeMillis() + mins * 60_000L, alarmIntent(ctx, key, date, 100 + idx))
    }

    fun snoozeMinutes(ctx: Context): Int =
        Store.data(ctx).optJSONObject("settings")?.optInt("snoozeMins", 10) ?: 10

    fun testAlarm(ctx: Context) {
        setExact(ctx, System.currentTimeMillis() + 10_000L, alarmIntent(ctx, "test", today(), 999))
    }
}
