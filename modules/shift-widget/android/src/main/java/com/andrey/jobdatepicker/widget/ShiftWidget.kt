package com.andrey.jobdatepicker.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
// Пара «день/ночь» лежит в androidx.glance.color, а не рядом с однотонным
// ColorProvider в androidx.glance.unit — проверено по самому артефакту Glance.
// Второй нужен, когда тему задаёт приложение, а не система, и выбирать между
// днём и ночью уже не надо. Псевдоним — потому что имена совпадают.
import androidx.glance.color.ColorProvider
import androidx.glance.unit.ColorProvider as FixedColor
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import java.util.Calendar
import java.util.Locale

/**
 * Виджет на главном экране: недели от текущей, сколько поместится.
 *
 * Месяц целиком не рисуется никогда. Шесть рядов даже в полный рост дают на
 * клетку пятнадцать пунктов — в них не помещается ни число дня, ни буква
 * смены. Вместо этого виджет показывает недели начиная с текущей: её видно
 * первой строкой, а не в середине месяца, и это то, ради чего на виджет
 * смотрят.
 *
 * Сколько недель — решает высота, которую человек ему дал. Растянутый на
 * четыре ячейки лаунчера показывает четыре недели, сжатый до двух — одну.
 * Обрезать сетку по краю нельзя: обрезанная неделя выглядит поломкой, а не
 * недостатком места.
 *
 * Всё, что здесь рисуется, приложение посчитало заранее и положило в
 * SharedPreferences: виджет живёт в процессе лаунчера, где ни JS-рантайма, ни
 * доступа к хранилищу приложения нет.
 */
class ShiftWidget : GlanceAppWidget() {

  /**
   * Заранее объявленные размеры вместо замера на лету.
   *
   * SizeMode.Responsive рисует по разметке на каждый из них, и лаунчер
   * подставляет подходящую мгновенно — при растягивании виджет не моргает
   * пустотой. Точный замер (SizeMode.Exact) дал бы то же самое, но перерисовкой
   * на каждое движение пальца.
   *
   * Высоты подобраны по содержимому: заголовок в две строки — 34 пункта, ряд
   * дней недели — 12, каждая неделя — 26, плюс поля.
   */
  override val sizeMode = SizeMode.Responsive(
    setOf(
      DpSize(180.dp, 96.dp),
      DpSize(180.dp, 124.dp),
      DpSize(180.dp, 152.dp),
      DpSize(180.dp, 190.dp)
    )
  )

  /**
   * Своё состояние виджету нужно ровно ради одной метки — времени последней
   * выкладки снимка. Сам снимок в него не кладётся: он общий для всех виджетов
   * на экране, а состояние Glance заводится на каждый отдельно.
   */
  override val stateDefinition = PreferencesGlanceStateDefinition

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent {
      // Метка читается первой и только за этим: она подписывает композицию на
      // изменения. Снимок лежит в обычном файле, а файл состоянием Compose не
      // является — без подписки виджет, пока он на экране, рисовал бы то, что
      // прочиталось при самом первом показе, и никакие updateAll этого не
      // меняли бы: сессия жива, перечитывать снимок в ней нечему.
      currentState<Preferences>()[SNAPSHOT_STAMP]
      Body(context, WidgetSnapshot.parse(WidgetStore.read(context)))
    }
  }

  /**
   * Цвет с учётом темы, выбранной в приложении.
   *
   * «system» отдаёт пару «день/ночь», и тему выбирает Android. Явная тема
   * отдаёт один цвет: иначе виджет следовал бы системе, а приложение рядом —
   * настройке, и на одном экране они выглядели бы по-разному.
   */
  private fun themed(light: Color, dark: Color, appearance: String): FixedColor = when (appearance) {
    "light" -> FixedColor(light)
    "dark" -> FixedColor(dark)
    else -> ColorProvider(day = light, night = dark)
  }

  /** Приглушённый цвет подписей в теме снимка. */
  private fun muted(appearance: String): FixedColor =
    themed(MUTED_LIGHT, MUTED_DARK, appearance)

  @Composable
  private fun Body(context: Context, snapshot: WidgetSnapshot?) {
    // Открывает приложение по нажатию в любое место виджета. Intent берётся у
    // системы, а не собирается по имени класса: имя активности задаёт Expo, и
    // зашивать его сюда значит сломать виджет при первом же переименовании.
    val theme = snapshot?.appearance ?: "system"
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val root = GlanceModifier
      .fillMaxSize()
      .background(themed(SURFACE_LIGHT, SURFACE_DARK, theme))
      .cornerRadius(16.dp)
      .padding(10.dp)
      .let { if (open != null) it.clickable(actionStartActivity(open)) else it }

    if (snapshot == null) {
      Column(
        modifier = root,
        verticalAlignment = Alignment.Vertical.CenterVertically,
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally
      ) {
        Text(
          text = "Открой приложение",
          style = TextStyle(color = muted(theme), fontSize = 13.sp, textAlign = TextAlign.Center)
        )
        Text(
          text = "График ещё не выложен на главный экран",
          style = TextStyle(color = muted(theme), fontSize = 11.sp, textAlign = TextAlign.Center)
        )
      }
      return
    }

    // Calendar, а не java.time: LocalDate требует API 26 или сахара в сборке,
    // а виджет обязан работать на всех телефонах, где работает приложение.
    val todayIso = isoOf(Calendar.getInstance())
    val weeks = weeksFrom(snapshot, weeksFitting(LocalSize.current.height))
    val todayShift = weeks.flatten().firstOrNull { it.date == todayIso }?.let(snapshot::shiftAt)

    Column(modifier = root) {
      Header(snapshot, todayIso, todayShift)
      WeekdayRow(theme)
      for (week in weeks) {
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
          for (day in week) {
            // Вес и высота считаются здесь, а не в самой клетке: defaultWeight
            // живёт в области видимости Row, и внутри отдельной функции его нет.
            // fillMaxHeight обязателен — без него клетка сжимается по тексту, и
            // между неделями зияют пустые полосы вместо ровной сетки.
            DayCell(
              GlanceModifier.defaultWeight().fillMaxHeight(),
              day,
              snapshot.shiftAt(day),
              isToday = day.date == todayIso,
              // Смена уже позади — заливка приглушается ровно так же, как в
              // календаре приложения. Сегодняшняя считается отработанной: там
              // это устроено так же, приложение не знает, кончилась ли она.
              isWorked = day.date <= todayIso,
              appearance = theme
            )
          }
        }
      }
    }
  }

  @Composable
  private fun Header(snapshot: WidgetSnapshot, todayIso: String, shift: WidgetShift?) {
    val theme = snapshot.appearance
    val month = snapshot.monthFor(todayIso)?.title ?: ""
    val name = when {
      shift == null -> "График не выбран"
      shift.time.isEmpty() -> shift.name
      else -> "${shift.name} · ${shift.time}"
    }

    Row(
      modifier = GlanceModifier.fillMaxWidth().padding(bottom = 6.dp),
      verticalAlignment = Alignment.Vertical.CenterVertically
    ) {
      Column(modifier = GlanceModifier.defaultWeight()) {
        Text(
          text = if (snapshot.trackName.isEmpty()) month else "$month · ${snapshot.trackName}",
          style = TextStyle(
            color = themed(TEXT_LIGHT, TEXT_DARK, theme),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
          ),
          maxLines = 1
        )
        Text(
          text = name,
          style = TextStyle(color = muted(theme), fontSize = 11.sp),
          maxLines = 1
        )
      }
    }
  }

  /** Подписи дней недели. Колонки всегда от понедельника, как в приложении. */
  @Composable
  private fun WeekdayRow(appearance: String) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
      for (name in listOf("пн", "вт", "ср", "чт", "пт", "сб", "вс")) {
        Text(
          text = name,
          modifier = GlanceModifier.defaultWeight(),
          style = TextStyle(
            color = muted(appearance),
            fontSize = 9.sp,
            textAlign = TextAlign.Center
          ),
          maxLines = 1
        )
      }
    }
  }

  /**
   * Клетка дня: число и буква смены.
   *
   * Буква стоит рядом с числом всегда, а не только при цвете: смысл дня не
   * должен держаться на одной заливке — ни при дальтонизме, ни в чёрно-белом
   * лаунчере. Сегодняшний день отличается жирным начертанием и рамкой, а не
   * только цветом.
   */
  @Composable
  private fun DayCell(
    modifier: GlanceModifier,
    day: WidgetDay,
    shift: WidgetShift?,
    isToday: Boolean,
    isWorked: Boolean,
    appearance: String
  ) {
    // Отработанная рабочая смена гаснет так же, как в календаре приложения:
    // приглушается заливка, подпись остаётся прежней. Выходные не гаснут —
    // гасить в них нечего.
    val faded = isWorked && shift != null && shift.work
    val lightFill = if (faded) shift?.light?.faded.orEmpty() else shift?.light?.surface.orEmpty()
    val darkFill = if (faded) shift?.dark?.faded.orEmpty() else shift?.dark?.surface.orEmpty()

    // Снимок мог прийти без цветов — тогда клетка остаётся без заливки, а
    // буква берёт приглушённый цвет темы. Смысл дня держится на самой букве,
    // так что читаться клетка не перестанет.
    val fill = when {
      !day.inMonth || shift == null -> null
      lightFill.isEmpty() -> null
      else -> themed(parse(lightFill), parse(darkFill), appearance)
    }
    val ink = when {
      !day.inMonth || shift == null -> muted(appearance)
      shift.light.on.isEmpty() -> themed(TEXT_LIGHT, TEXT_DARK, appearance)
      else -> themed(parse(shift.light.on), parse(shift.dark.on), appearance)
    }

    // Заливка живёт во вложенном элементе, а не на самой клетке.
    //
    // В Glance порядок модификаторов ничего не решает, в отличие от Compose:
    // padding и background на одном элементе дают заливку во всю его площадь,
    // и соседние дни одного цвета слипаются в сплошное пятно. Внешний Box
    // держит отступ, внутренний — цвет; между заливками остаётся зазор.
    var painted = GlanceModifier.fillMaxSize()
    if (fill != null) painted = painted.background(fill).cornerRadius(8.dp)

    Box(modifier = modifier.padding(CELL_GAP)) {
      Column(
        modifier = painted,
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
        verticalAlignment = Alignment.Vertical.CenterVertically
      ) {
        Text(
          text = day.date.takeLast(2).trimStart('0'),
          style = TextStyle(
            color = ink,
            fontSize = 11.sp,
            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
            textAlign = TextAlign.Center
          ),
          maxLines = 1
        )
        Text(
          // Буква стоит и у дней соседнего месяца: в календаре приложения они
          // тоже показывают свою смену, просто приглушённо. Пустая клетка на
          // месте настоящей смены читается как «данных нет».
          text = shift?.badge.orEmpty(),
          style = TextStyle(
            color = ink,
            fontSize = 9.sp,
            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
            textAlign = TextAlign.Center
          ),
          maxLines = 1
        )
      }
    }
  }

  /**
   * Четыре недели начиная с той, в которую попал сегодняшний день.
   *
   * Дни берутся из снимка по датам, а не по положению в сетке: сетки соседних
   * месяцев перекрываются хвостами, и одна и та же дата лежит в двух из них.
   */
  private fun weeksFrom(snapshot: WidgetSnapshot, count: Int): List<List<WidgetDay>> {
    val byDate = HashMap<String, WidgetDay>()
    for (month in snapshot.months) {
      for (day in month.days) {
        // Клетка своего месяца всегда важнее хвоста соседнего: у неё есть
        // и смена, и признак inMonth.
        val existing = byDate[day.date]
        if (existing == null || (!existing.inMonth && day.inMonth)) byDate[day.date] = day
      }
    }

    // Понедельник текущей недели. DAY_OF_WEEK в Calendar считает с
    // воскресенья, поэтому номер приводится к ISO, где понедельник первый.
    val cursor = Calendar.getInstance()
    val isoWeekday = (cursor.get(Calendar.DAY_OF_WEEK) + 5) % 7
    cursor.add(Calendar.DAY_OF_MONTH, -isoWeekday)

    return (0 until count).map {
      (0 until 7).map {
        val iso = isoOf(cursor)
        cursor.add(Calendar.DAY_OF_MONTH, 1)
        byDate[iso] ?: WidgetDay(iso, -1, inMonth = false)
      }
    }
  }

  companion object {
    /**
     * Когда снимок последний раз выложили. Значение само по себе не нужно —
     * нужна его смена: она и заставляет виджет перечитать файл.
     */
    val SNAPSHOT_STAMP = longPreferencesKey("snapshotStamp")

    /** Больше четырёх недель не показываем даже в полный рост: клетки мельчают. */
    const val MAX_WEEKS = 4

    /** Поле вокруг клетки. Между соседними получается вдвое больше. */
    val CELL_GAP = 4.dp

    /**
     * Сколько недель влезает в такую высоту.
     *
     * Пороги те же, что в объявленных размерах: лаунчер отдаёт ближайший снизу,
     * и границы обязаны совпадать — иначе виджет отрисуется под одну высоту, а
     * покажется в другой.
     */
    fun weeksFitting(height: Dp): Int = when {
      height >= 190.dp -> MAX_WEEKS
      height >= 152.dp -> 3
      height >= 124.dp -> 2
      else -> 1
    }

    // Цвета темы приложения. Хранятся парами «светлая, тёмная»: какую взять,
    // решает themed по настройке из снимка.
    val SURFACE_LIGHT = Color(0xFFF4F5F7)
    val SURFACE_DARK = Color(0xFF171A20)
    val TEXT_LIGHT = Color(0xFF14161A)
    val TEXT_DARK = Color(0xFFE8EAED)
    val MUTED_LIGHT = Color(0xFF5A6270)
    val MUTED_DARK = Color(0xFFA0A8B4)

    /** «YYYY-MM-DD» из календаря — тот же формат, что в снимке. */
    fun isoOf(calendar: Calendar): String = String.format(
      Locale.US,
      "%04d-%02d-%02d",
      calendar.get(Calendar.YEAR),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.DAY_OF_MONTH)
    )

    /** «#RRGGBB» из снимка в цвет Compose. */
    fun parse(hex: String): Color =
      try {
        Color(android.graphics.Color.parseColor(hex))
      } catch (error: IllegalArgumentException) {
        Color.Transparent
      }
  }
}
