package com.andrey.jobdatepicker.alarm

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Экран будильника поверх блокировки.
 *
 * Свёрстан кодом, а не разметкой: экран из четырёх элементов, зато у модуля
 * нет своих ресурсов и тем, которые пришлось бы сливать с приложением.
 * Размеры шрифтов заданы в sp — системная настройка размера текста работает.
 */
class AlarmActivity : Activity() {
  private var alarm: StoredAlarm? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()

    alarm = AlarmScheduler.alarmFromIntent(intent)
    setContentView(buildLayout())
  }

  /** Кнопка «назад» будильник не выключает — иначе его глушат случайно. */
  @Suppress("DEPRECATION")
  override fun onBackPressed() = Unit

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildLayout(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(BACKGROUND)
      val pad = dp(24)
      setPadding(pad, pad, pad, pad)
    }

    root.addView(text(clockNow(), 56f, TEXT, bold = true))
    root.addView(text(alarm?.title.orEmpty(), 28f, TEXT, bold = true, topMargin = dp(16)))
    root.addView(text(alarm?.subtitle.orEmpty(), 18f, TEXT_MUTED, topMargin = dp(8)))

    root.addView(
      button("Отключить", ACCENT, Color.BLACK) {
        sendToService(AlarmService.ACTION_DISMISS)
      }
    )

    // Отсрочка выключена — кнопки нет вовсе. Неактивная кнопка спросонья
    // читается как «не сработало», а не как «так задумано».
    val snooze = alarm?.takeIf { it.canSnooze }?.snoozeMinutes
    if (snooze != null) {
      root.addView(
        button("Отложить на $snooze мин", SURFACE, TEXT) {
          sendToService(AlarmService.ACTION_SNOOZE)
        }
      )
    }

    return root
  }

  private fun sendToService(action: String) {
    val current = alarm ?: return finish()
    val intent = AlarmScheduler.putAlarmExtras(Intent(this, AlarmService::class.java), current)
    intent.action = action
    startService(intent)
    finish()
  }

  private fun clockNow(): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

  private fun text(
    value: String,
    sizeSp: Float,
    color: Int,
    bold: Boolean = false,
    topMargin: Int = 0
  ) = TextView(this).apply {
    text = value
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    gravity = Gravity.CENTER
    if (bold) typeface = android.graphics.Typeface.DEFAULT_BOLD
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { setMargins(0, topMargin, 0, 0) }
  }

  private fun button(label: String, fill: Int, textColor: Int, onClick: () -> Unit) =
    Button(this).apply {
      text = label
      setTextColor(textColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      isAllCaps = false
      background = GradientDrawable().apply {
        setColor(fill)
        cornerRadius = dp(14).toFloat()
      }
      // Зона нажатия заведомо больше 48 dp: спросонья не промахнёшься.
      minHeight = dp(64)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { setMargins(0, dp(16), 0, 0) }
      setOnClickListener { onClick() }
    }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density).toInt()

  companion object {
    // Те же цвета, что в тёмной теме приложения: белый на #0F1115 даёт 17:1,
    // подпись #A3ABB8 — 8.9:1, чёрный на янтарном #F2B33D — 10.9:1.
    private val BACKGROUND = 0xFF0F1115.toInt()
    private val SURFACE = 0xFF1B1F27.toInt()
    private val TEXT = 0xFFFFFFFF.toInt()
    private val TEXT_MUTED = 0xFFA3ABB8.toInt()
    private val ACCENT = 0xFFF2B33D.toInt()

    fun intentFor(context: Context, alarm: StoredAlarm): Intent =
      AlarmScheduler.putAlarmExtras(Intent(context, AlarmActivity::class.java), alarm).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
  }
}
