package com.andrey.jobdatepicker.widget

import org.json.JSONObject

/**
 * Снимок графика в том виде, в каком его читает виджет.
 *
 * Всё, что здесь есть, посчитано на стороне приложения: виджет не знает ни про
 * циклы, ни про правки дней, ни про праздники. Его дело — разложить готовые
 * буквы по клеткам и подсветить сегодняшний день.
 */
/** Пара цветов смены: заливка клетки и подпись поверх неё. */
data class WidgetColorPair(
  val surface: String,
  val on: String,
  /** Заливка уже отработанной смены: приглушённая, как в календаре приложения. */
  val faded: String
)

data class WidgetShift(
  val badge: String,
  val name: String,
  val work: Boolean,
  val time: String,
  /**
   * Готовые цвета для светлой и тёмной темы.
   *
   * Приходят из приложения, а не считаются здесь: палитра живёт в одном месте,
   * и повторять её на Kotlin значило бы разойтись с календарём на первой же
   * правке цвета.
   */
  val light: WidgetColorPair,
  val dark: WidgetColorPair
)

data class WidgetDay(
  val date: String,
  /** Индекс в списке смен. −1 — клетка пустая. */
  val shift: Int,
  val inMonth: Boolean
)

data class WidgetMonth(
  val title: String,
  /** «YYYY-MM». */
  val period: String,
  val days: List<WidgetDay>
)

data class WidgetSnapshot(
  /**
   * Тема из настроек приложения: «system», «light» или «dark».
   *
   * Не системная: человек, поставивший тёмную тему при светлой системе, не
   * должен получить светлый виджет рядом с тёмным приложением.
   */
  val appearance: String,
  val trackName: String,
  val shifts: List<WidgetShift>,
  val months: List<WidgetMonth>
) {
  /** Месяц, в который попал этот день, или первый из имеющихся. */
  fun monthFor(date: String): WidgetMonth? =
    months.firstOrNull { it.period == date.take(7) } ?: months.firstOrNull()

  fun shiftAt(day: WidgetDay): WidgetShift? = shifts.getOrNull(day.shift)

  companion object {
    /** Формат, который эта сборка умеет читать. Чужой снимок не разбирается. */
    const val VERSION = 1

    /**
     * Разбор снимка. null — снимка нет, он от другой версии или испорчен:
     * виджет в этом случае честно говорит «открой приложение», а не рисует
     * половину месяца.
     */
    fun parse(raw: String?): WidgetSnapshot? {
      if (raw.isNullOrEmpty()) return null

      return try {
        val json = JSONObject(raw)
        if (json.optInt("version") != VERSION) return null

        val shiftsJson = json.optJSONArray("shifts")
        val shifts = buildList {
          for (index in 0 until (shiftsJson?.length() ?: 0)) {
            val item = shiftsJson!!.getJSONObject(index)
            add(
              WidgetShift(
                badge = item.optString("badge"),
                name = item.optString("name"),
                work = item.optBoolean("work"),
                time = item.optString("time"),
                light = colorPair(item.optJSONObject("light")),
                dark = colorPair(item.optJSONObject("dark"))
              )
            )
          }
        }

        val monthsJson = json.optJSONArray("months")
        val months = buildList {
          for (index in 0 until (monthsJson?.length() ?: 0)) {
            val item = monthsJson!!.getJSONObject(index)
            val daysJson = item.optJSONArray("days")
            val days = buildList {
              for (dayIndex in 0 until (daysJson?.length() ?: 0)) {
                val day = daysJson!!.getJSONObject(dayIndex)
                add(
                  WidgetDay(
                    date = day.optString("date"),
                    shift = day.optInt("shift", -1),
                    inMonth = day.optBoolean("inMonth")
                  )
                )
              }
            }
            add(
              WidgetMonth(
                title = item.optString("title"),
                period = item.optString("period"),
                days = days
              )
            )
          }
        }

        if (months.isEmpty()) null
        else WidgetSnapshot(
          appearance = json.optString("appearance", "system"),
          trackName = json.optString("trackName"),
          shifts = shifts,
          months = months
        )
      } catch (error: Exception) {
        null
      }
    }

    /**
     * Пара цветов из снимка. Пустая строка — цвета нет: клетка останется без
     * заливки, а подпись возьмёт приглушённый цвет темы. Снимок из версии, где
     * цветов ещё не было, так и рисуется — буквами по фону.
     */
    private fun colorPair(json: JSONObject?): WidgetColorPair =
      WidgetColorPair(
        surface = json?.optString("surface").orEmpty(),
        on = json?.optString("on").orEmpty(),
        faded = json?.optString("faded").orEmpty()
      )
  }
}
