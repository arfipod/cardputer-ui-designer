#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "esp_log.h"
#include <stdio.h>
#include <string.h>

#include "cardputer_display.h"
#include "cardputer_keyboard.h"
#include "generated/cardputer_ui.h"
#include "widgets/widget_gallery.h"

static const char* TAG = "cardputer_ui_runtime";

static constexpr uint32_t INPUT_POLL_MS = 20;
static constexpr uint32_t DISPLAY_FRAME_MS = 40;
static constexpr UBaseType_t INPUT_TASK_PRIORITY = 5;
static constexpr UBaseType_t DISPLAY_TASK_PRIORITY = 4;
static constexpr UBaseType_t SERIAL_DEBUG_TASK_PRIORITY = 3;
static constexpr uint32_t INPUT_TASK_STACK = 4096;
static constexpr uint32_t DISPLAY_TASK_STACK = 8192;
static constexpr uint32_t SERIAL_DEBUG_TASK_STACK = 4096;

enum class UiMessageType {
  Event,
  DumpFramebuffer,
  ShowGeneratedUi,
  ShowWidgetGallery,
};

enum class DisplayMode {
  GeneratedUi,
  WidgetGallery,
};

struct UiInputMessage {
  UiMessageType type;
  CardputerUiEvent event;
  CardputerFramebufferDumpOrder dumpOrder;
};

static QueueHandle_t ui_input_queue = nullptr;

static bool send_ui_event(CardputerUiEvent event) {
  if (ui_input_queue == nullptr) return false;
  const UiInputMessage message = {UiMessageType::Event, event, CardputerFramebufferDumpOrder::NativePanel};
  return xQueueSend(ui_input_queue, &message, pdMS_TO_TICKS(10)) == pdTRUE;
}

static bool request_framebuffer_dump(CardputerFramebufferDumpOrder order) {
  if (ui_input_queue == nullptr) return false;
  const UiInputMessage message = {UiMessageType::DumpFramebuffer, CARDPUTER_UI_EVENT_PRESS, order};
  return xQueueSend(ui_input_queue, &message, pdMS_TO_TICKS(10)) == pdTRUE;
}

static bool request_display_mode(DisplayMode mode) {
  if (ui_input_queue == nullptr) return false;
  const UiInputMessage message = {
      mode == DisplayMode::WidgetGallery ? UiMessageType::ShowWidgetGallery : UiMessageType::ShowGeneratedUi,
      CARDPUTER_UI_EVENT_PRESS,
      CardputerFramebufferDumpOrder::NativePanel};
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

static void serial_debug_task(void*) {
  usb_serial_jtag_driver_config_t serialConfig = {};
  serialConfig.tx_buffer_size = 512;
  serialConfig.rx_buffer_size = 256;
  const esp_err_t serialErr = usb_serial_jtag_driver_install(&serialConfig);
  if (serialErr != ESP_OK && serialErr != ESP_ERR_INVALID_STATE) {
    ESP_LOGW(TAG, "USB Serial/JTAG RX setup failed: %s", esp_err_to_name(serialErr));
  }

  ESP_LOGI(TAG, "Serial debug ready. Commands: fb, fb logical, widgets, ui");

  char command[32] = {};
  size_t length = 0;

  for (;;) {
    uint8_t byte = 0;
    const int read = usb_serial_jtag_read_bytes(&byte, 1, pdMS_TO_TICKS(100));
    if (read <= 0) {
      continue;
    }
    const char ch = static_cast<char>(byte);

    if (ch == '\r' || ch == '\n') {
      command[length] = '\0';
      if (strcmp(command, "fb") == 0 || strcmp(command, "dump") == 0) {
        puts("[cardputer-ui] framebuffer dump requested: native_panel");
        request_framebuffer_dump(CardputerFramebufferDumpOrder::NativePanel);
      } else if (strcmp(command, "fb logical") == 0 || strcmp(command, "dump logical") == 0) {
        puts("[cardputer-ui] framebuffer dump requested: logical");
        request_framebuffer_dump(CardputerFramebufferDumpOrder::Logical);
      } else if (strcmp(command, "widgets") == 0 || strcmp(command, "gallery") == 0) {
        puts("[cardputer-ui] switching to widget gallery");
        request_display_mode(DisplayMode::WidgetGallery);
      } else if (strcmp(command, "ui") == 0 || strcmp(command, "generated") == 0) {
        puts("[cardputer-ui] switching to generated UI");
        request_display_mode(DisplayMode::GeneratedUi);
      } else if (length > 0) {
        puts("[cardputer-ui] commands: fb, fb logical, widgets, ui");
      }
      length = 0;
      command[0] = '\0';
      continue;
    }

    if (length < sizeof(command) - 1) {
      command[length++] = ch;
    }
  }
}

static void draw_screen(CardputerDisplay& display, CardputerScreenId screen) {
  cardputer_ui_draw(screen);
  display.flush();
}

static void draw_mode(CardputerDisplay& display, DisplayMode mode, CardputerScreenId screen) {
  if (mode == DisplayMode::WidgetGallery) {
    cardputer_draw_widget_gallery(display, static_cast<uint32_t>(xTaskGetTickCount() * portTICK_PERIOD_MS));
    display.flush();
  } else {
    draw_screen(display, screen);
  }
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
  DisplayMode displayMode = DisplayMode::GeneratedUi;
  draw_mode(display, displayMode, currentScreen);
  ESP_LOGI(TAG, "UI runtime ready display=%dx%d start_screen=%d",
           CardputerDisplay::WIDTH,
           CardputerDisplay::HEIGHT,
           static_cast<int>(currentScreen));

  uint32_t idleTicks = 0;
  for (;;) {
    UiInputMessage message = {};
    if (xQueueReceive(ui_input_queue, &message, pdMS_TO_TICKS(DISPLAY_FRAME_MS)) == pdTRUE) {
      if (message.type == UiMessageType::DumpFramebuffer) {
        draw_mode(display, displayMode, currentScreen);
        ESP_LOGI(TAG, "Dumping framebuffer order=%s", message.dumpOrder == CardputerFramebufferDumpOrder::NativePanel ? "native_panel" : "logical");
        display.dumpFramebuffer(stdout, message.dumpOrder);
        continue;
      }

      if (message.type == UiMessageType::ShowWidgetGallery) {
        displayMode = DisplayMode::WidgetGallery;
        ESP_LOGI(TAG, "display mode=widget gallery");
        draw_mode(display, displayMode, currentScreen);
        continue;
      }

      if (message.type == UiMessageType::ShowGeneratedUi) {
        displayMode = DisplayMode::GeneratedUi;
        ESP_LOGI(TAG, "display mode=generated UI");
        draw_mode(display, displayMode, currentScreen);
        continue;
      }

      const CardputerScreenId nextScreen = cardputer_ui_handle_event(currentScreen, message.event);
      if (nextScreen != currentScreen) {
        ESP_LOGI(TAG, "screen transition %d -> %d event=%d",
                 static_cast<int>(currentScreen),
                 static_cast<int>(nextScreen),
                 static_cast<int>(message.event));
        currentScreen = nextScreen;
        draw_mode(display, displayMode, currentScreen);
      }
      continue;
    }

    draw_mode(display, displayMode, currentScreen);
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
  xTaskCreatePinnedToCore(serial_debug_task, "serial_debug", SERIAL_DEBUG_TASK_STACK, nullptr, SERIAL_DEBUG_TASK_PRIORITY, nullptr, 0);
}
