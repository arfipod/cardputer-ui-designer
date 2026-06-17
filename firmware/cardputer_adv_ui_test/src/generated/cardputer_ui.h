#pragma once

#include <M5GFX.h>

enum CardputerScreenId {
  CARDPUTER_SCREEN_MAIN = 0
};
static constexpr CardputerScreenId CARDPUTER_UI_START_SCREEN = CARDPUTER_SCREEN_MAIN;

enum CardputerUiEvent {
  CARDPUTER_UI_EVENT_PRESS,
  CARDPUTER_UI_EVENT_LONG_PRESS,
  CARDPUTER_UI_EVENT_KEY_ENTER,
  CARDPUTER_UI_EVENT_KEY_BACK,
  CARDPUTER_UI_EVENT_SOFTKEY_LEFT,
  CARDPUTER_UI_EVENT_SOFTKEY_RIGHT
};

void cardputer_ui_init(lgfx::LGFX_Device* display);
void cardputer_ui_draw(CardputerScreenId screen);
CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event);
CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event);
