#include "cardputer_ui.h"
#include "cardputer_ui_fonts.h"
#include <string.h>

static lgfx::LGFX_Device* ui_display = nullptr;

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
  display.fillScreen(TFT_BLACK);

  // Panel (roundRect) id=panel-1
  display.fillRoundRect(12, 38, 216, 72, 8, display.color565(17, 24, 39));
  display.drawRoundRect(12, 38, 216, 72, 8, display.color565(57, 80, 111));

  // Text (text) id=title-1
  display.setTextColor(display.color565(231, 240, 255));
  display.setTextSize(2);
  display.setTextDatum(lgfx::textdatum_t::middle_left);
  display.drawString("CARDPUTER ADV", 23, 29);

  // Progress (progress) id=battery-1
  display.drawRoundRect(20, 52, 138, 12, 4, display.color565(52, 68, 93));
  display.fillRoundRect(22, 54, 102, 8, 2, display.color565(112, 214, 255));

  // LED (led) id=status-led-1
  display.fillCircle(205, 29, 7, display.color565(74, 222, 128));
  display.drawCircle(205, 29, 7, display.color565(184, 255, 206));

  // Button (button) id=softkey-1
  display.fillRoundRect(24, 92, 72, 30, 6, display.color565(38, 49, 68));
  display.drawRoundRect(24, 92, 72, 30, 6, display.color565(112, 214, 255));
  display.setTextColor(display.color565(248, 251, 255));
  display.setTextSize(2);
  display.setTextDatum(lgfx::textdatum_t::middle_center);
  display.drawString("MENU", 60, 107);

  // Button (button) id=softkey-2
  display.fillRoundRect(144, 92, 72, 30, 6, display.color565(38, 49, 68));
  display.drawRoundRect(144, 92, 72, 30, 6, display.color565(112, 214, 255));
  display.setTextColor(display.color565(248, 251, 255));
  display.setTextSize(2);
  display.setTextDatum(lgfx::textdatum_t::middle_center);
  display.drawString("RUN", 180, 107);

}

void cardputer_ui_init(lgfx::LGFX_Device* display) {
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
