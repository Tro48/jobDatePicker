package com.andrey.jobdatepicker.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Звонок будильника.
 *
 * Foreground-сервис, а не просто уведомление: с Android 8 из бродкаста обычный
 * сервис не поднять, а звук должен играть, пока человек не встал. Full-screen
 * intent открывает экран будильника поверх блокировки.
 */
class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopEverything() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val alarm = intent?.let { AlarmScheduler.alarmFromIntent(it) }

    when (intent?.action) {
      ACTION_DISMISS -> {
        stopEverything()
        return START_NOT_STICKY
      }
      ACTION_SNOOZE -> {
        alarm?.let { AlarmScheduler.snooze(this, it) }
        stopEverything()
        return START_NOT_STICKY
      }
    }

    if (alarm == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForegroundWith(alarm)
    acquireWakeLock()
    startRinging(alarm)
    // Звонить вечно нельзя: разряженный телефон хуже пропущенной смены.
    handler.postDelayed(autoStop, MAX_RING_MILLIS)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
    stopRinging()
    releaseWakeLock()
    super.onDestroy()
  }

  @Suppress("DEPRECATION")
  private fun startForegroundWith(alarm: StoredAlarm) {
    createChannel()

    val fullScreen = PendingIntent.getActivity(
      this,
      alarm.requestCode,
      AlarmActivity.intentFor(this, alarm),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val notification = builder
      .setContentTitle(alarm.title)
      .setContentText(alarm.subtitle)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(fullScreen)
      // Полноэкранный intent — то, ради чего всё затевалось: экран будильника
      // поверх блокировки, а не строчка в шторке.
      .setFullScreenIntent(fullScreen, true)
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Отключить",
        servicePendingIntent(alarm, ACTION_DISMISS)
      )
      .addAction(
        android.R.drawable.ic_menu_recent_history,
        "Отложить на ${alarm.snoozeMinutes} мин",
        servicePendingIntent(alarm, ACTION_SNOOZE)
      )
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun servicePendingIntent(alarm: StoredAlarm, action: String): PendingIntent {
    val intent = AlarmScheduler.putAlarmExtras(Intent(this, AlarmService::class.java), alarm)
    intent.action = action
    return PendingIntent.getService(
      this,
      alarm.requestCode + action.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(CHANNEL_ID, "Будильник на смену", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Звонок перед началом смены"
      // Звук проигрывается сервисом, каналу он не нужен — иначе будет два.
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }
    manager.createNotificationChannel(channel)
  }

  private fun startRinging(alarm: StoredAlarm) {
    val chosen = alarm.soundUri?.let { Uri.parse(it) }
    val fallback = RingtoneCatalog.defaultUri()

    // Выбранная мелодия могла уехать вместе с картой памяти или удалённым
    // приложением. Тогда звонит сигнал по умолчанию, а не тишина.
    val started = chosen != null && play(chosen)
    if (!started && fallback != null && fallback != chosen) play(fallback)

    // Падение плеера не должно уносить с собой вибрацию и экран будильника.
    if (alarm.vibrate) runCatching { startVibration() }
  }

  /** true, если плеер действительно завёлся. */
  private fun play(uri: Uri): Boolean = runCatching {
    player = MediaPlayer().apply {
      setDataSource(this@AlarmService, uri)
      setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      isLooping = true
      prepare()
      start()
    }
    true
  }.getOrElse {
    runCatching { player?.release() }
    player = null
    false
  }

  private fun startVibration() {
    val service = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      service.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0), attributes)
    } else {
      @Suppress("DEPRECATION")
      service.vibrate(VIBRATION_PATTERN, 0, attributes)
    }
    vibrator = service
  }

  private fun stopRinging() {
    runCatching {
      player?.stop()
      player?.release()
    }
    player = null
    runCatching { vibrator?.cancel() }
    vibrator = null
  }

  private fun acquireWakeLock() {
    val manager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shift-alarm:ring").apply {
      setReferenceCounted(false)
      acquire(MAX_RING_MILLIS)
    }
  }

  private fun releaseWakeLock() {
    runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
    wakeLock = null
  }

  private fun stopEverything() {
    stopRinging()
    releaseWakeLock()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  companion object {
    const val ACTION_START = "com.andrey.jobdatepicker.alarm.START"
    const val ACTION_DISMISS = "com.andrey.jobdatepicker.alarm.DISMISS"
    const val ACTION_SNOOZE = "com.andrey.jobdatepicker.alarm.SNOOZE"

    private const val CHANNEL_ID = "shift-alarm"
    private const val NOTIFICATION_ID = 4201
    private const val MAX_RING_MILLIS = 5 * 60 * 1000L
    private val VIBRATION_PATTERN = longArrayOf(0, 800, 700)
  }
}
