package com.andrey.jobdatepicker.widget

import android.content.Context
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
     * Перерисовка идёт в фоне: Glance обновляет виджеты через корутину, а
     * держать из-за этого поток JS незачем — результат никого не ждёт.
     */
    Function("write") { snapshot: String ->
      WidgetStore.write(context, snapshot)
      CoroutineScope(Dispatchers.Default).launch {
        ShiftWidget().updateAll(context)
      }
    }
  }
}
