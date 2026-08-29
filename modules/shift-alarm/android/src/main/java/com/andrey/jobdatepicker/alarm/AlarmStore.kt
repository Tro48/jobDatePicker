package com.andrey.jobdatepicker.alarm

import android.content.Context

/**
 * Список поставленных будильников на диске.
 *
 * Нужен по одной причине: после перезагрузки телефона Android стирает все
 * будильники, и восстанавливать их надо, не дожидаясь запуска JS.
 */
object AlarmStore {
  private const val PREFS = "shift-alarm"
  private const val KEY = "scheduled"

  fun read(context: Context): List<StoredAlarm> =
    StoredAlarm.listFromJson(prefs(context).getString(KEY, null))

  fun write(context: Context, alarms: List<StoredAlarm>) {
    prefs(context).edit().putString(KEY, StoredAlarm.listToJson(alarms)).apply()
  }

  fun remove(context: Context, id: String) {
    write(context, read(context).filterNot { it.id == id })
  }

  fun put(context: Context, alarm: StoredAlarm) {
    write(context, read(context).filterNot { it.id == alarm.id } + alarm)
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
