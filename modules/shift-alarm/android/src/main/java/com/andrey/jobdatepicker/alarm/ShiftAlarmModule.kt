package com.andrey.jobdatepicker.alarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Будильник в том виде, в каком его присылает JS. */
class AlarmRecord : Record {
  @Field var id: String = ""

  /** Миллисекунды эпохи. Double, а не Int: в 32 бита они не помещаются. */
  @Field var triggerAtMillis: Double = 0.0

  @Field var title: String = ""

  @Field var subtitle: String = ""

  @Field var snoozeMinutes: Int = 10

  @Field var soundUri: String? = null

  @Field var vibrate: Boolean = true

  fun toStored() = StoredAlarm(
    id = id,
    triggerAtMillis = triggerAtMillis.toLong(),
    title = title,
    subtitle = subtitle,
    snoozeMinutes = snoozeMinutes,
    soundUri = soundUri,
    vibrate = vibrate
  )
}

/**
 * Мост к AlarmManager.
 *
 * Модуль намеренно глупый: он не знает ни про графики, ни про смены. Что и
 * когда звонит, считает доменный слой на JS, сюда приходит готовый список.
 * schedule заменяет набор целиком — инкрементального API нет, потому что
 * пересчитать расписание дешевле, чем поддерживать его в согласованном виде.
 */
class ShiftAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext
      ?: throw CodedException("ERR_SHIFT_ALARM_CONTEXT", "Контекст приложения недоступен", null)

  override fun definition() = ModuleDefinition {
    Name("ShiftAlarm")

    Function("canScheduleExactAlarms") {
      AlarmScheduler.canScheduleExact(context)
    }

    /**
     * С Android 14 полноэкранный intent выдаётся не всем. Без него будильник
     * покажется шторкой поверх экрана блокировки, а не своим экраном.
     */
    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        notificationManager().canUseFullScreenIntent()
      }
    }

    Function("areNotificationsEnabled") {
      notificationManager().areNotificationsEnabled()
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        startSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, withPackage = true)
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, withPackage = true)
      }
    }

    Function("openNotificationSettings") {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("schedule") { alarms: List<AlarmRecord> ->
      // Молча деградировать до неточного будильника нельзя: проспать смену
      // хуже, чем увидеть предупреждение и выдать разрешение руками.
      if (!AlarmScheduler.canScheduleExact(context)) {
        throw CodedException(
          "ERR_EXACT_ALARM_PERMISSION",
          "Нет разрешения на точные будильники",
          null
        )
      }
      val stored = alarms.map { it.toStored() }
      AlarmScheduler.replaceAll(context, stored)
      stored.size
    }

    AsyncFunction("cancelAll") {
      AlarmScheduler.cancelAll(context)
    }

    /** Мелодии показывает свой экран, поэтому наружу отдаётся список, а не диалог. */
    AsyncFunction("listRingtones") {
      RingtoneCatalog.list(context)
    }

    /** Прослушивание при выборе: без него мелодию узнаёшь только в шесть утра. */
    AsyncFunction("previewRingtone") { uri: String? ->
      RingtoneCatalog.preview(context, uri)
    }

    AsyncFunction("stopRingtonePreview") {
      RingtoneCatalog.stopPreview()
    }

    OnDestroy {
      RingtoneCatalog.stopPreview()
    }
  }

  private fun notificationManager() =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun startSettings(action: String, withPackage: Boolean) {
    val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (withPackage) intent.data = Uri.parse("package:${context.packageName}")
    context.startActivity(intent)
  }
}
