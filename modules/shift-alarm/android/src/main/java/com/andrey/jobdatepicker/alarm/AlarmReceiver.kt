package com.andrey.jobdatepicker.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Срабатывание будильника. Здесь нельзя делать ничего долгого: бродкаст живёт
 * секунды. Задача одна — поднять foreground-сервис, который звонит.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarm = AlarmScheduler.alarmFromIntent(intent) ?: return

    // Отзвонивший будильник больше не наш: иначе перезагрузка воскресит прошлое.
    AlarmStore.remove(context, alarm.id)

    val serviceIntent = Intent(context, AlarmService::class.java).apply {
      action = AlarmService.ACTION_START
      putExtras(intent)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }
}
