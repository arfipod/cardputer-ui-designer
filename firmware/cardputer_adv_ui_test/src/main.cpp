#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "cardputer_display.h"
#include "cardputer_keyboard.h"
#include "generated/cardputer_ui.h"

static const char* TAG = "cardputer_ui_runtime";

static constexpr uint32_t INPUT_POLL_MS = 20;
static constexpr uint32_t DISPLAY_FRAME_MS = 40;
static constexpr UBaseType_t INPUT_TASK_PRIORITY = 5;
static constexpr UBaseType_t DISPLAY_TASK_PRIORITY = 4;
static constexpr uint32_t INPUT_TASK_STACK = 4096;
static constexpr uint32_t DISPLAY_TASK_STACK = 8192;

struct UiInputMessage {
  CardputerUiEvent event;
};

static QueueHandle_t ui_input_queue = nullptr;

static bool send_ui_event(CardputerUiEvent event) {
  if (ui_input_queue == nullptr) return false;
  const UiInputMessage message = {event};
  return xQueueSend(ui_input_queue, &message, pdMS_TO_TICKS(10)) == pdTRUE;
}

static bool map_key_to_ui_events(const CardputerKeyEvent& keyEvent) {
  if (!keyEvent.pressed) return false;

  switch (keyEvent.key) {
    case CardputerKey::Left:
      return send_ui_event(CARDPUTER_UI_EVENT_SOFTKEY_LEFT);
    case CardputerKey::Right:
      return send_ui_event(CARDPUTER_UI_EVENT_SOFTKEY_RIGHT);
    case CardputerKey::Enter:
    case CardputerKey::Space:
      send_ui_event(CARDPUTER_UI_EVENT_KEY_ENTER);
      return send_ui_event(CARDPUTER_UI_EVENT_PRESS);
    case CardputerKey::Esc:
    case CardputerKey::Backspace:
      return send_ui_event(CARDPUTER_UI_EVENT_KEY_BACK);
    default:
      return false;
  }
}

static void input_task(void*) {
  CardputerKeyboard keyboard;
  const bool keyboardReady = keyboard.begin();

  if (!keyboardReady) {
    ESP_LOGW(TAG, "Keyboard init failed; UI will run without input");
  } else {
    ESP_LOGI(TAG, "Keyboard task ready");
  }

  for (;;) {
    if (keyboardReady) {
      CardputerKeyEvent keyEvent;
      while (keyboard.readEvent(&keyEvent)) {
        if (map_key_to_ui_events(keyEvent)) {
          ESP_LOGI(TAG, "input key=%s raw=0x%02x", keyboard.keyName(keyEvent), keyEvent.raw);
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(INPUT_POLL_MS));
  }
}

static void draw_screen(CardputerDisplay& display, CardputerScreenId screen) {
  cardputer_ui_draw(screen);
  display.flush();
}

static void display_task(void*) {
  CardputerDisplay display;
  if (!display.begin()) {
    ESP_LOGE(TAG, "Display init failed");
    vTaskDelete(nullptr);
    return;
  }

  cardputer_ui_init(&display);

  CardputerScreenId currentScreen = CARDPUTER_UI_START_SCREEN;
  draw_screen(display, currentScreen);
  ESP_LOGI(TAG, "UI runtime ready display=%dx%d start_screen=%d",
           CardputerDisplay::WIDTH,
           CardputerDisplay::HEIGHT,
           static_cast<int>(currentScreen));

  uint32_t idleTicks = 0;
  for (;;) {
    UiInputMessage message = {};
    if (xQueueReceive(ui_input_queue, &message, pdMS_TO_TICKS(DISPLAY_FRAME_MS)) == pdTRUE) {
      const CardputerScreenId nextScreen = cardputer_ui_handle_event(currentScreen, message.event);
      if (nextScreen != currentScreen) {
        ESP_LOGI(TAG, "screen transition %d -> %d event=%d",
                 static_cast<int>(currentScreen),
                 static_cast<int>(nextScreen),
                 static_cast<int>(message.event));
        currentScreen = nextScreen;
        draw_screen(display, currentScreen);
      }
      continue;
    }

    draw_screen(display, currentScreen);
    if ((++idleTicks % 125) == 0) {
      ESP_LOGI(TAG, "UI alive screen=%d", static_cast<int>(currentScreen));
    }
  }
}

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "Starting generated Cardputer UI runtime");

  ui_input_queue = xQueueCreate(12, sizeof(UiInputMessage));
  if (ui_input_queue == nullptr) {
    ESP_LOGE(TAG, "Input queue allocation failed");
    return;
  }

  xTaskCreatePinnedToCore(display_task, "ui_display", DISPLAY_TASK_STACK, nullptr, DISPLAY_TASK_PRIORITY, nullptr, 1);
  xTaskCreatePinnedToCore(input_task, "ui_input", INPUT_TASK_STACK, nullptr, INPUT_TASK_PRIORITY, nullptr, 0);
}
