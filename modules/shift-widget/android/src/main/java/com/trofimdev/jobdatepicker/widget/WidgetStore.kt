package com.trofimdev.jobdatepicker.widget

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
    // commit, а не apply: сразу после записи приложение просит систему поднять
    // провайдер виджета, и тот обязан прочитать уже новый снимок. Запись редкая
    // — только когда график и правда изменился, — так что ждать диска не жалко.
    prefs(context).edit().putString(KEY, snapshot).commit()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
