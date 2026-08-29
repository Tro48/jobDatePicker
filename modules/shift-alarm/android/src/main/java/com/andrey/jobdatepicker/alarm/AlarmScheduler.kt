package com.andrey.jobdatepicker.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Постановка будильников в AlarmManager.
 *
 * Используется setAlarmClock, а не setExactAndAllowWhileIdle: это единственный
 * API, который система считает настоящим будильником — он игнорирует Doze и
 * режим экономии, показывает иконку в статус-баре и звонит в «Не беспокоить».
 */
object AlarmScheduler {
  const val EXTRA_ALARM_ID = "alarm_id"
  private const val ACTION_FIRE = "com.andrey.jobdatepicker.alarm.FIRE"

  fun canScheduleExact(context: Context): Boolean {
    val manager = alarmManager(context)
    // До Android 12 разрешение не спрашивают, оно есть всегда.
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.canScheduleExactAlarms() else true
  }

  /** Ставит новый набор целиком, снимая предыдущий. */
  fun replaceAll(context: Context, alarms: List<StoredAlarm>) {
    cancelAll(context)
    AlarmStore.write(context, alarms)
    alarms.forEach { set(context, it) }
  }

  fun cancelAll(context: Context) {
    AlarmStore.read(context).forEach { cancel(context, it) }
    AlarmStore.write(context, emptyList())
  }

  fun set(context: Context, alarm: StoredAlarm) {
    val manager = alarmManager(context)
    val info = AlarmManager.AlarmClockInfo(alarm.triggerAtMillis, showIntent(context))
    manager.setAlarmClock(info, firePendingIntent(context, alarm))
  }

  fun cancel(context: Context, alarm: StoredAlarm) {
    alarmManager(context).cancel(firePendingIntent(context, alarm))
  }

  /**
   * Восстановление после перезагрузки, перевода часов и смены пояса.
   * Прошедшие будильники выбрасываются: поставить их заново — разбудить сейчас.
   */
  fun rescheduleFromStore(context: Context) {
    val future = AlarmStore.read(context).filter { it.triggerAtMillis > System.currentTimeMillis() }
    AlarmStore.write(context, future)
    if (canScheduleExact(context)) future.forEach { set(context, it) }
  }

  /** Отложить: тот же будильник через заданное число минут. */
  fun snooze(context: Context, alarm: StoredAlarm) {
    val next = alarm.copy(
      id = "${alarm.id}:snooze:${System.currentTimeMillis()}",
      triggerAtMillis = System.currentTimeMillis() + alarm.snoozeMinutes * 60_000L
    )
    AlarmStore.put(context, next)
    if (canScheduleExact(context)) set(context, next)
  }

  /** Кладёт будильник в интент: так он ездит между ресивером, сервисом и экраном. */
  fun putAlarmExtras(intent: Intent, alarm: StoredAlarm): Intent = intent.apply {
    putExtra(EXTRA_ALARM_ID, alarm.id)
    putExtra(StoredAlarm.KEY_TRIGGER, alarm.triggerAtMillis)
    putExtra(StoredAlarm.KEY_TITLE, alarm.title)
    putExtra(StoredAlarm.KEY_SUBTITLE, alarm.subtitle)
    putExtra(StoredAlarm.KEY_SNOOZE, alarm.snoozeMinutes)
  }

  fun firePendingIntent(context: Context, alarm: StoredAlarm): PendingIntent {
    val intent = putAlarmExtras(Intent(context, AlarmReceiver::class.java), alarm).apply {
      // Действие уникально по будильнику: иначе PendingIntent'ы схлопнутся в один.
      action = "$ACTION_FIRE:${alarm.id}"
    }
    return PendingIntent.getBroadcast(
      context,
      alarm.requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun alarmFromIntent(intent: Intent): StoredAlarm? {
    val id = intent.getStringExtra(EXTRA_ALARM_ID) ?: return null
    return StoredAlarm(
      id = id,
      triggerAtMillis = intent.getLongExtra(StoredAlarm.KEY_TRIGGER, 0L),
      title = intent.getStringExtra(StoredAlarm.KEY_TITLE).orEmpty(),
      subtitle = intent.getStringExtra(StoredAlarm.KEY_SUBTITLE).orEmpty(),
      snoozeMinutes = intent.getIntExtra(StoredAlarm.KEY_SNOOZE, 10)
    )
  }

  /** Куда ведёт нажатие на иконку будильника в статус-баре — в само приложение. */
  private fun showIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN)
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
}
