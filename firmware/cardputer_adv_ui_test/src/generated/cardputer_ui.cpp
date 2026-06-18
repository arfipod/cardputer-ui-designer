#include "cardputer_ui.h"
#include "cardputer_ui_fonts.h"
#include "esp_timer.h"
#include <math.h>
#include <string.h>

static CardputerDisplay* ui_display = nullptr;

struct CardputerTransition {
  CardputerScreenId from;
  const char* element_id;
  CardputerUiEvent event;
  CardputerScreenId to;
};

static const CardputerTransition transitions[] = {
};

static void draw_main() {
  if (!ui_display) return;
  auto& display = *ui_display;
  display.clear(CardputerDisplay::rgb565(5, 7, 11));

  // Panel (roundRect) id=panel-1
  display.fillRoundRect(0, 0, 240, 135, 8, CardputerDisplay::rgb565(17, 24, 39));
  display.drawRoundRect(0, 0, 240, 135, 8, CardputerDisplay::rgb565(57, 80, 111));

  // lblPocketSynth (text) id=title-1
  display.drawText("pocketsynth v_0.1", 23, 23, CardputerDisplay::rgb565(231, 240, 255), 2);

  // Progress (progress) id=battery-1
  display.drawRoundRect(20, 55, 138, 12, 5, CardputerDisplay::rgb565(52, 68, 93));
  display.fillRoundRect(22, 57, 130, 8, 3, CardputerDisplay::rgb565(112, 214, 255));

  // LED (led) id=status-led-1
  display.fillCircle(227, 12, 7, CardputerDisplay::rgb565(74, 222, 128));
  display.drawCircle(227, 12, 7, CardputerDisplay::rgb565(184, 255, 206));

  // Button (button) id=softkey-1
  display.fillRoundRect(20, 85, 55, 30, 6, CardputerDisplay::rgb565(38, 49, 68));
  display.drawRoundRect(20, 85, 55, 30, 6, CardputerDisplay::rgb565(112, 214, 255));
  display.drawTextCentered("MENU", 48, 100, CardputerDisplay::rgb565(248, 251, 255), 2);

  // Button (button) id=softkey-2
  display.fillRoundRect(80, 85, 45, 30, 6, CardputerDisplay::rgb565(38, 49, 68));
  display.drawRoundRect(80, 85, 45, 30, 6, CardputerDisplay::rgb565(112, 214, 255));
  display.drawTextCentered("RUN", 103, 100, CardputerDisplay::rgb565(248, 251, 255), 2);

  // Gauge (gauge) id=gauge-63d54a82
  display.drawCircle(208, 98, 21, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(208, 98, 215, 111, CardputerDisplay::rgb565(246, 193, 119));

  // Sparkline (sparkline) id=sparkline-4cc0c74e
  display.fillRect(175, 50, 45, 19, CardputerDisplay::rgb565(11, 16, 24));
  display.drawRect(175, 50, 45, 19, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(175, 60, 219, 60, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(198, 50, 198, 68, CardputerDisplay::rgb565(82, 97, 121));
  const int spark_samples_sparkline_4cc0c74e = 16;
  const float spark_t_sparkline_4cc0c74e = esp_timer_get_time() / 1000000.0f;
  int spark_prev_x_sparkline_4cc0c74e = 175;
  int spark_prev_y_sparkline_4cc0c74e = 60;
  for (int i = 0; i < spark_samples_sparkline_4cc0c74e; ++i) {
    const float x_ratio = spark_samples_sparkline_4cc0c74e <= 1 ? 0.0f : (float)i / (float)(spark_samples_sparkline_4cc0c74e - 1);
    const float sample = fminf(100.0f, fmaxf(0.0f, 50.0f + sinf(spark_t_sparkline_4cc0c74e * 7.0f + x_ratio * 24.0f) * (22.0f + 18.0f * sinf(spark_t_sparkline_4cc0c74e * 2.1f)) + sinf(spark_t_sparkline_4cc0c74e * 18.0f + x_ratio * 53.0f) * 16.0f));
    const int x = 175 + (int)(x_ratio * 44);
    const int y = 68 - (int)((sample / 100.0f) * 18);
    if (i > 0) display.drawLine(spark_prev_x_sparkline_4cc0c74e, spark_prev_y_sparkline_4cc0c74e, x, y, CardputerDisplay::rgb565(155, 255, 183));
    spark_prev_x_sparkline_4cc0c74e = x;
    spark_prev_y_sparkline_4cc0c74e = y;
  }

  // Button copy (button) id=button-e3e47688
  display.fillRoundRect(130, 85, 50, 30, 6, CardputerDisplay::rgb565(193, 187, 26));
  display.drawRoundRect(130, 85, 50, 30, 6, CardputerDisplay::rgb565(255, 112, 148));
  display.drawTextCentered("RUN1", 155, 100, CardputerDisplay::rgb565(88, 131, 187), 2);

}

void cardputer_ui_init(CardputerDisplay* display) {
  ui_display = display;
}

void cardputer_ui_draw(CardputerScreenId screen) {
  switch (screen) {
    case CARDPUTER_SCREEN_MAIN: draw_main(); break;
  }
}

CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event) {
  return cardputer_ui_handle_element_event(current, nullptr, event);
}

CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event) {
  for (const auto& transition : transitions) {
    const bool element_matches = elementId == nullptr || transition.element_id == nullptr || strcmp(transition.element_id, elementId) == 0;
    if (transition.from == current && transition.event == event && element_matches) return transition.to;
  }
  return current;
}
