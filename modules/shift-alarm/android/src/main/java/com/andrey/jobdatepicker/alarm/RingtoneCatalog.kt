package com.andrey.jobdatepicker.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.Looper

/**
 * Системные мелодии будильника: список для выбора и короткое прослушивание.
 *
 * Список отдаётся в JS, а не показывается системным диалогом
 * RingtoneManager.ACTION_RINGTONE_PICKER: свой экран подчиняется теме
 * приложения, размеру шрифта и читается скринридером так же, как остальные
 * списки, а системный диалог — сам по себе.
 */
object RingtoneCatalog {
  private const val KEY_URI = "uri"
  private const val KEY_TITLE = "title"

  /** Прослушивание глушится само: иначе забытый предпросмотр играет вечно. */
  private const val PREVIEW_LIMIT_MILLIS = 10_000L

  private val handler = Handler(Looper.getMainLooper())
  private val stopPreviewTask = Runnable { stopPreview() }
  private var preview: Ringtone? = null

  private val alarmAttributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  /** Сигнал по умолчанию: сначала будильник, потом звонок — на случай урезанной прошивки. */
  fun defaultUri(): Uri? =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  fun list(context: Context): List<Map<String, String>> {
    val alarms = collect(context, RingtoneManager.TYPE_ALARM)
    // На части прошивок раздел будильников пуст — тогда берём рингтоны.
    return alarms.ifEmpty { collect(context, RingtoneManager.TYPE_RINGTONE) }
  }

  fun preview(context: Context, uri: String?) {
    stopPreview()
    val target = uri?.let { Uri.parse(it) } ?: defaultUri() ?: return
    runCatching {
      preview = RingtoneManager.getRingtone(context, target)?.apply {
        audioAttributes = alarmAttributes
        play()
      }
    }
    handler.postDelayed(stopPreviewTask, PREVIEW_LIMIT_MILLIS)
  }

  fun stopPreview() {
    handler.removeCallbacks(stopPreviewTask)
    runCatching { preview?.stop() }
    preview = null
  }

  fun titleOf(context: Context, uri: String?): String? {
    val target = uri ?: return null
    return runCatching {
      RingtoneManager.getRingtone(context, Uri.parse(target))?.getTitle(context)
    }.getOrNull()
  }

  private fun collect(context: Context, type: Int): List<Map<String, String>> = runCatching {
    val manager = RingtoneManager(context).apply { setType(type) }
    val cursor = manager.cursor
    val items = mutableListOf<Map<String, String>>()
    cursor.moveToPosition(-1)
    while (cursor.moveToNext()) {
      val position = cursor.position
      val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: continue
      val uri = manager.getRingtoneUri(position)?.toString() ?: continue
      items += mapOf(KEY_URI to uri, KEY_TITLE to title)
    }
    items.toList()
  }.getOrDefault(emptyList())
}
