package com.andrey.jobdatepicker.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Мост к виджету на главном экране.
 *
 * Модуль намеренно глупый, как и будильник: он не знает ни про графики, ни про
 * смены. Что рисовать, считает доменный слой на JS, сюда приходит готовая
 * строка снимка.
 */
class ShiftWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext
      ?: throw CodedException("ERR_SHIFT_WIDGET_CONTEXT", "Контекст приложения недоступен", null)

  override fun definition() = ModuleDefinition {
    Name("ShiftWidget")

    /**
     * Записать снимок и перерисовать виджеты.
     *
     * Двумя шагами, и первый обязателен. Снимок лежит в обычном файле, а файл
     * состоянием Compose не является: пока виджет на экране, сессия Glance жива,
     * и один updateAll заставит её только перекомпоноваться — теми же данными,
     * что прочитались при первом показе. Поэтому сначала в состояние каждого
     * виджета кладётся новая метка времени, и уже она поднимает композицию,
     * которая перечитывает файл.
     *
     * В фоне: JS ждать нечего, результат никому не возвращается.
     */
    Function("write") { snapshot: String ->
      WidgetStore.write(context, snapshot)

      CoroutineScope(Dispatchers.Default).launch {
        val stamp = System.currentTimeMillis()
        for (id in GlanceAppWidgetManager(context).getGlanceIds(ShiftWidget::class.java)) {
          updateAppWidgetState(context, id) { it[ShiftWidget.SNAPSHOT_STAMP] = stamp }
        }
        ShiftWidget().updateAll(context)
      }
    }
  }
}
