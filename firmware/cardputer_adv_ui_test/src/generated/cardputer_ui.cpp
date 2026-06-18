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
  display.fillRoundRect(12, 38, 216, 72, 8, CardputerDisplay::rgb565(17, 24, 39));
  display.drawRoundRect(12, 38, 216, 72, 8, CardputerDisplay::rgb565(57, 80, 111));

  // Text (text) id=title-1
  display.drawText("CARDPUTER ADV", 23, 22, CardputerDisplay::rgb565(231, 240, 255), 2);

  // Progress (progress) id=battery-1
  display.drawRoundRect(20, 52, 138, 12, 4, CardputerDisplay::rgb565(52, 68, 93));
  display.fillRoundRect(22, 54, 102, 8, 2, CardputerDisplay::rgb565(112, 214, 255));

  // Sparkline (sparkline) id=wave-1
  display.fillRect(20, 70, 196, 16, CardputerDisplay::rgb565(11, 16, 24));
  display.drawRect(20, 70, 196, 16, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(20, 78, 215, 78, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(118, 70, 118, 85, CardputerDisplay::rgb565(82, 97, 121));
  const int spark_samples_wave_1 = 49;
  const float spark_t_wave_1 = esp_timer_get_time() / 1000000.0f;
  int spark_prev_x_wave_1 = 20;
  int spark_prev_y_wave_1 = 78;
  for (int i = 0; i < spark_samples_wave_1; ++i) {
    const float x_ratio = spark_samples_wave_1 <= 1 ? 0.0f : (float)i / (float)(spark_samples_wave_1 - 1);
    const float sample = fminf(100.0f, fmaxf(0.0f, 50.0f + sinf(spark_t_wave_1 * 7.0f + x_ratio * 24.0f) * (22.0f + 18.0f * sinf(spark_t_wave_1 * 2.1f)) + sinf(spark_t_wave_1 * 18.0f + x_ratio * 53.0f) * 16.0f));
    const int x = 20 + (int)(x_ratio * 195);
    const int y = 85 - (int)((sample / 100.0f) * 15);
    if (i > 0) display.drawLine(spark_prev_x_wave_1, spark_prev_y_wave_1, x, y, CardputerDisplay::rgb565(155, 255, 183));
    spark_prev_x_wave_1 = x;
    spark_prev_y_wave_1 = y;
  }

  // LED (led) id=status-led-1
  display.fillCircle(205, 29, 7, CardputerDisplay::rgb565(74, 222, 128));
  display.drawCircle(205, 29, 7, CardputerDisplay::rgb565(184, 255, 206));

  // Button (button) id=softkey-1
  display.fillRoundRect(24, 92, 72, 30, 6, CardputerDisplay::rgb565(38, 49, 68));
  display.drawRoundRect(24, 92, 72, 30, 6, CardputerDisplay::rgb565(112, 214, 255));
  display.drawTextCentered("MENU", 60, 107, CardputerDisplay::rgb565(248, 251, 255), 2);

  // Button (button) id=softkey-2
  display.fillRoundRect(144, 92, 72, 30, 6, CardputerDisplay::rgb565(38, 49, 68));
  display.drawRoundRect(144, 92, 72, 30, 6, CardputerDisplay::rgb565(112, 214, 255));
  display.drawTextCentered("RUN", 180, 107, CardputerDisplay::rgb565(248, 251, 255), 2);

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
