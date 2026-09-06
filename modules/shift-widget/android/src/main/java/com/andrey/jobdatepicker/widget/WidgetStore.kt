package com.andrey.jobdatepicker.widget

import android.content.Context

/**
 * Снимок графика на диске.
 *
 * SharedPreferences, а не MMKV: виджет рисуется процессом лаунчера, когда
 * приложения в памяти нет, и добраться до хранилища JS-слоя оттуда нечем.
 * Формат — обычная строка JSON, которую положило приложение.
 */
object WidgetStore {
  private const val PREFS = "shift-widget"
  private const val KEY = "snapshot"

  fun read(context: Context): String? =
    prefs(context).getString(KEY, null)

  fun write(context: Context, snapshot: String) {
    prefs(context).edit().putString(KEY, snapshot).apply()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
