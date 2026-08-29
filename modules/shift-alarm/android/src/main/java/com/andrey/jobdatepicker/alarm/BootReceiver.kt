package com.andrey.jobdatepicker.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Перезагрузка, перевод часов, смена пояса и обновление приложения стирают или
 * сдвигают поставленные будильники: они живут в абсолютных миллисекундах.
 * Восстанавливаем их из своего хранилища, не дожидаясь запуска JS.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> AlarmScheduler.rescheduleFromStore(context)
    }
  }
}
