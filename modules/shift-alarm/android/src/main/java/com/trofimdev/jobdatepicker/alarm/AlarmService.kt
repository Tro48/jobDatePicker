package com.trofimdev.jobdatepicker.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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

  /** Что звонит сейчас. Нужен, чтобы вернуть экран после блокировки. */
  private var ringing: StoredAlarm? = null

  /**
   * Номер уведомления. Меняется на каждом показе экрана: полноэкранный intent
   * система поднимает только для нового уведомления, а не для обновления уже
   * показанного.
   */
  private var notificationId = NOTIFICATION_ID

  /**
   * Блокировка экрана во время звонка.
   *
   * Полноэкранный intent одноразовый: если человек свернул экран будильника,
   * при следующей блокировке он сам не вернётся. Поэтому на каждое выключение
   * экрана уведомление выкладывается заново — и система снова поднимает экран
   * будильника. Уже видимый экран не трогаем: его возвращать не нужно.
   */
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != Intent.ACTION_SCREEN_OFF) return
      val alarm = ringing ?: return
      if (AlarmActivity.isShowing) return
      showFullScreen(alarm)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val alarm = intent?.let { AlarmScheduler.alarmFromIntent(it) }

    when (intent?.action) {
      ACTION_DISMISS -> {
        stopEverything()
        return START_NOT_STICKY
      }
      ACTION_SNOOZE -> {
        alarm?.takeIf { it.canSnooze }?.let { AlarmScheduler.snooze(this, it) }
        stopEverything()
        return START_NOT_STICKY
      }
    }

    if (alarm == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    // Второй будильник на ту же минуту приходит сюда, пока звонит первый:
    // AlarmManager честно выстреливает оба. Без остановки прежнего его плеер
    // остаётся играть без единой ссылки на себя, и «Отключить» до него уже не
    // дотянется. Заодно снимается прошлый автостоп — иначе он оборвал бы
    // новый звонок по таймеру предыдущего.
    handler.removeCallbacks(autoStop)
    stopRinging()

    ringing = alarm
    showFullScreen(alarm)
    registerScreenUpdates()
    acquireWakeLock()
    startRinging(alarm)
    // Звонить вечно нельзя: разряженный телефон хуже пропущенной смены.
    handler.postDelayed(autoStop, MAX_RING_MILLIS)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
    unregisterScreenUpdates()
    // Сигнал снят (или служба остановлена) — окно будильника, если оно ещё
    // живо, закрывается само. Иначе после кнопки в шторке на экране остался бы
    // висеть старый звонок.
    sendBroadcast(Intent(ACTION_STOPPED).setPackage(packageName))
    ringing = null
    stopRinging()
    releaseWakeLock()
    super.onDestroy()
  }

  /**
   * Показать экран будильника.
   *
   * Каждый показ — новое уведомление со своим номером: полноэкранный intent
   * система поднимает только для нового уведомления. Обновление уже
   * показанного экран не поднимает.
   */
  private fun showFullScreen(alarm: StoredAlarm) {
    notificationId += 1
    val notification = buildNotification(alarm)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(notificationId, notification)
    }
  }

  private fun registerScreenUpdates() {
    // Повторная регистрация того же приёмника запрещена, а в работающую службу
    // может прийти второй будильник — снимаем прежнюю регистрацию.
    unregisterScreenUpdates()
    val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
  }

  private fun unregisterScreenUpdates() {
    runCatching { unregisterReceiver(screenReceiver) }
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(alarm: StoredAlarm): Notification {
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

    builder
      .setContentTitle(alarm.title)
      .setContentText(alarm.subtitle)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      // Каналов на Android 7 ещё нет, а без максимального приоритета
      // уведомление не всплывает поверх экрана.
      .setPriority(Notification.PRIORITY_MAX)
      .setContentIntent(fullScreen)
      // Полноэкранный intent — то, ради чего всё затевалось: экран будильника
      // поверх блокировки, а не строчка в шторке.
      .setFullScreenIntent(fullScreen, true)
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Отключить",
        servicePendingIntent(alarm, ACTION_DISMISS)
      )

    // Отсрочка выключена — второй кнопки в уведомлении просто нет.
    if (alarm.canSnooze) {
      builder.addAction(
        android.R.drawable.ic_menu_recent_history,
        "Отложить на ${alarm.snoozeMinutes} мин",
        servicePendingIntent(alarm, ACTION_SNOOZE)
      )
    }

    return builder.build()
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

    val channel = NotificationChannel(CHANNEL_ID, "Будильник на смену", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Звонок перед началом смены"
      // Звук проигрывается сервисом, каналу он не нужен — иначе будет два.
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }

    // Канал не только создаётся, но и обновляется: доступ к «Не беспокоить»
    // могли выдать уже после первого звонка, и без повторного вызова запрос на
    // обход DND так и остался бы отклонённым.
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
    // Прежний захват отпускается явно: иначе он висел бы до своего таймаута.
    releaseWakeLock()
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
    const val ACTION_START = "com.trofimdev.jobdatepicker.alarm.START"
    const val ACTION_DISMISS = "com.trofimdev.jobdatepicker.alarm.DISMISS"
    const val ACTION_SNOOZE = "com.trofimdev.jobdatepicker.alarm.SNOOZE"

    /** Сигнал снят: экран будильника должен закрыться. */
    const val ACTION_STOPPED = "com.trofimdev.jobdatepicker.alarm.STOPPED"

    private const val CHANNEL_ID = "shift-alarm"
    private const val NOTIFICATION_ID = 4201
    private const val MAX_RING_MILLIS = 5 * 60 * 1000L
    private val VIBRATION_PATTERN = longArrayOf(0, 800, 700)
  }
}
