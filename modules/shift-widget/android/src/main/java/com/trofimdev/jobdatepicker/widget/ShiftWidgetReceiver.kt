package com.trofimdev.jobdatepicker.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * Точка входа для системы: через неё лаунчер просит нарисовать виджет.
 *
 * Ничего своего не делает и не должна: чем меньше кода между системой и
 * отрисовкой, тем меньше поводов виджету однажды стать чёрным квадратом — а
 * это самая частая жалоба на виджеты у конкурентов.
 */
class ShiftWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = ShiftWidget()
}
