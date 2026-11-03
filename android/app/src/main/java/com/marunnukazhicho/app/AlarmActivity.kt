package com.marunnukazhicho.app

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.util.Base64
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Big full-screen alarm shown over the lock screen. */
class AlarmActivity : Activity() {
    private var key = ""
    private var date = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = Color.parseColor("#0F6B5C")
        build(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        build(intent)
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun text(s: String, sp: Float, bold: Boolean = false, color: Int = Color.WHITE) = TextView(this).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER_HORIZONTAL
    }

    private fun button(label: String, bg: Int, fg: Int, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        setTextColor(fg)
        typeface = Typeface.DEFAULT_BOLD
        background = GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(bg) }
        setPadding(dp(16), dp(18), dp(16), dp(18))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(14) }
        setOnClickListener { onClick() }
    }

    private fun build(i: Intent) {
        key = i.getStringExtra("key") ?: ""
        date = i.getStringExtra("date") ?: Scheduler.today()
        val title = i.getStringExtra("title") ?: "Marunnu Kazhicho?"
        val body = i.getStringExtra("body") ?: ""

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0F6B5C"))
            setPadding(dp(24), dp(40), dp(24), dp(28))
        }
        root.addView(text("💊", 64f))
        root.addView(text("Marunnu Kazhicho?", 30f, true))
        root.addView(text("മരുന്ന് കഴിച്ചോ?", 20f, false, Color.parseColor("#CDEBE4")))
        val sub = title.substringAfter("💊", "").trim()
        if (sub.isNotEmpty()) root.addView(text(sub, 20f, true, Color.parseColor("#FFE9A8")).apply { setPadding(0, dp(14), 0, 0) })

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(Color.WHITE) }
            setPadding(dp(18), dp(16), dp(18), dp(16))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(20) }
        }
        val due = if (key == "test") emptyList() else {
            val taken = Store.log(this).optJSONObject(date)
            Scheduler.dueFor(Store.data(this), key, date).filter { taken?.has(it.med.optString("id") + "@" + it.slot) != true }
        }
        if (due.isNotEmpty()) due.forEach { d -> card.addView(medRow(d)) }
        else body.lines().filter { it.isNotBlank() }.forEach { line ->
            val isCond = line.startsWith("   ")
            card.addView(TextView(this).apply {
                text = line.trim()
                setTextSize(TypedValue.COMPLEX_UNIT_SP, if (isCond) 17f else 22f)
                setTextColor(Color.parseColor(if (isCond) "#7B3FA8" else "#15302B"))
                if (!isCond) typeface = Typeface.DEFAULT_BOLD
                setPadding(0, if (isCond) 0 else dp(8), 0, dp(4))
            })
        }
        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            addView(card)
        }
        root.addView(scroll)

        val snoozeMin = Scheduler.snoozeMinutes(this)
        root.addView(button("✓  Kazhichu — Taken", Color.parseColor("#1E8E4F"), Color.WHITE) { act(ActionReceiver.TAKEN) })
        root.addView(button("⏰  Remind me in $snoozeMin min", Color.WHITE, Color.parseColor("#0F6B5C")) { act(ActionReceiver.SNOOZE) })
        root.addView(button("Skip this time", Color.parseColor("#0B5448"), Color.parseColor("#CDEBE4")) { act(ActionReceiver.SKIP) })
        setContentView(root)
    }

    private fun medRow(d: Due): LinearLayout {
        val m = d.med
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
        }
        val photo = m.optString("photo", "")
        if (photo.contains("base64,")) {
            try {
                val bytes = Base64.decode(photo.substringAfter("base64,"), Base64.DEFAULT)
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp != null) row.addView(ImageView(this).apply {
                    setImageBitmap(bmp)
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    clipToOutline = true
                    background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.parseColor("#EEF3F2")) }
                    layoutParams = LinearLayout.LayoutParams(dp(92), dp(92)).apply { rightMargin = dp(14) }
                })
            } catch (e: Exception) { }
        }
        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        fun line(t: String, sp: Float, color: String, bold: Boolean) = TextView(this).apply {
            text = t
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
            setTextColor(Color.parseColor(color))
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }
        val person = m.optString("person", "").trim()
        if (person.isNotEmpty()) info.addView(line(person, 15f, "#8A6200", true))
        info.addView(line(m.optString("name"), 22f, "#15302B", true))
        info.addView(line(Scheduler.qtyText(m, d.slot), 19f, "#0F6B5C", true))
        if (m.optString("intake") == "conditional" && m.optString("condition").isNotBlank())
            info.addView(line("Only if " + m.optString("condition").trim(), 16f, "#7B3FA8", false))
        row.addView(info)
        return row
    }

    private fun act(action: String) {
        ActionReceiver.handle(this, action, key, date)
        finish()
    }
}
