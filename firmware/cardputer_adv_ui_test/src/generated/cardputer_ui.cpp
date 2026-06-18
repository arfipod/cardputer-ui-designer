#include "cardputer_ui.h"
#include "cardputer_ui_fonts.h"
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
  CardputerDisplay& display = *ui_display;
  display.clear(CardputerDisplay::rgb565(0, 0, 0));

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
  display.fillRoundRect(85, 85, 45, 30, 6, CardputerDisplay::rgb565(38, 49, 68));
  display.drawRoundRect(85, 85, 45, 30, 6, CardputerDisplay::rgb565(112, 214, 255));
  display.drawTextCentered("RUN", 108, 100, CardputerDisplay::rgb565(248, 251, 255), 2);

  // Gauge (gauge) id=gauge-63d54a82
  display.drawCircle(208, 103, 21, CardputerDisplay::rgb565(82, 97, 121));
  display.drawLine(208, 103, 215, 116, CardputerDisplay::rgb565(246, 193, 119));

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
  for (const CardputerTransition& transition : transitions) {
    const bool element_matches = elementId == nullptr || transition.element_id == nullptr || strcmp(transition.element_id, elementId) == 0;
    if (transition.from == current && transition.event == event && element_matches) return transition.to;
  }
  return current;
}
