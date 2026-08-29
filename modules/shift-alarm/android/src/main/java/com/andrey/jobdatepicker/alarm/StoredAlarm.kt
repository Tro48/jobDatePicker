package com.andrey.jobdatepicker.alarm

import org.json.JSONArray
import org.json.JSONObject

/**
 * Один будильник в том виде, в каком он живёт между JS, AlarmManager и
 * хранилищем. Ничего не знает ни про смены, ни про график: расписание считает
 * доменный слой на JS, сюда приходят готовые метки времени.
 */
data class StoredAlarm(
  val id: String,
  val triggerAtMillis: Long,
  val title: String,
  val subtitle: String,
  val snoozeMinutes: Int,
  /** URI выбранной мелодии. null — сигнал будильника по умолчанию. */
  val soundUri: String?,
  val vibrate: Boolean
) {
  /** Стабильный код запроса для PendingIntent: один будильник — один код. */
  val requestCode: Int get() = id.hashCode()

  /**
   * Отложенный звонок. Такие живут только в нативном хранилище: JS про кнопку
   * «Отложить» не знает и, пересчитывая расписание, снёс бы его.
   */
  val isSnooze: Boolean get() = id.contains(SNOOZE_MARK)

  fun toJson(): JSONObject = JSONObject()
    .put(KEY_ID, id)
    .put(KEY_TRIGGER, triggerAtMillis)
    .put(KEY_TITLE, title)
    .put(KEY_SUBTITLE, subtitle)
    .put(KEY_SNOOZE, snoozeMinutes)
    .put(KEY_SOUND, soundUri ?: JSONObject.NULL)
    .put(KEY_VIBRATE, vibrate)

  companion object {
    const val KEY_ID = "id"
    const val KEY_TRIGGER = "triggerAtMillis"
    const val KEY_TITLE = "title"
    const val KEY_SUBTITLE = "subtitle"
    const val KEY_SNOOZE = "snoozeMinutes"
    const val KEY_SOUND = "soundUri"
    const val KEY_VIBRATE = "vibrate"

    /** Метка в id отложенного звонка. */
    const val SNOOZE_MARK = ":snooze:"

    fun fromJson(json: JSONObject) = StoredAlarm(
      id = json.getString(KEY_ID),
      triggerAtMillis = json.getLong(KEY_TRIGGER),
      title = json.optString(KEY_TITLE),
      subtitle = json.optString(KEY_SUBTITLE),
      snoozeMinutes = json.optInt(KEY_SNOOZE, 10),
      soundUri = if (json.isNull(KEY_SOUND)) null else json.optString(KEY_SOUND).ifEmpty { null },
      vibrate = json.optBoolean(KEY_VIBRATE, true)
    )

    fun listToJson(alarms: List<StoredAlarm>): String {
      val array = JSONArray()
      alarms.forEach { array.put(it.toJson()) }
      return array.toString()
    }

    fun listFromJson(raw: String?): List<StoredAlarm> {
      if (raw.isNullOrEmpty()) return emptyList()
      return runCatching {
        val array = JSONArray(raw)
        (0 until array.length()).map { fromJson(array.getJSONObject(it)) }
      }.getOrDefault(emptyList())
    }
  }
}
