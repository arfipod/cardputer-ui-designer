#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <cmath>

#include "cardputer_display.h"
#include "cardputer_keyboard.h"
#include "generated/cardputer_ui.h"

static const char* TAG = "cardputer_ui_smoke";
static CardputerDisplay display;
static CardputerKeyboard keyboard;
static CardputerScreenId current_screen = CARDPUTER_UI_START_SCREEN;

enum class SelectedControl {
  Menu,
  Run,
};

static SelectedControl selected_control = SelectedControl::Menu;
static bool run_animation = false;

static uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return CardputerDisplay::rgb565(r, g, b);
}

static void draw_static_ui() {
  cardputer_ui_draw(current_screen);
}

static void draw_progress(float value) {
  const int x = 20;
  const int y = 55;
  const int w = 138;
  const int h = 12;
  const int radius = 5;
  const int inner = static_cast<int>((w - 4) * value / 100.0f);

  display.fillRoundRect(x, y, w, h, radius, rgb(0x11, 0x18, 0x27));
  display.drawRoundRect(x, y, w, h, radius, rgb(0x34, 0x44, 0x5d));
  display.fillRoundRect(x + 2, y + 2, inner, h - 4, radius - 2, rgb(0x70, 0xd6, 0xff));
}

static void draw_led(bool on) {
  const uint16_t fill = on ? rgb(0x4a, 0xde, 0x80) : rgb(0x16, 0x3a, 0x25);
  const uint16_t stroke = on ? rgb(0xb8, 0xff, 0xce) : rgb(0x39, 0x50, 0x6f);

  display.fillCircle(227, 12, 7, fill);
  display.drawCircle(227, 12, 7, stroke);
}

static void draw_gauge(float value) {
  const int cx = 208;
  const int cy = 103;
  const int radius = 21;
  const float ratio = value / 100.0f;
  const float angle = (-140.0f + ratio * 280.0f) * 3.14159265f / 180.0f;
  const int nx = cx + static_cast<int>(std::cos(angle) * (radius - 7));
  const int ny = cy + static_cast<int>(std::sin(angle) * (radius - 7));

  display.fillRect(184, 79, 48, 48, rgb(0x11, 0x18, 0x27));
  display.drawCircle(cx, cy, radius, rgb(0x52, 0x61, 0x79));
  display.drawCircle(cx, cy, radius - 6, rgb(0x52, 0x61, 0x79));
  display.drawLine(cx, cy, nx, ny, rgb(0xf6, 0xc1, 0x77));
  display.fillCircle(cx, cy, 2, rgb(0xf6, 0xc1, 0x77));
}

static void draw_selection() {
  const uint16_t color = run_animation ? rgb(0x4a, 0xde, 0x80) : rgb(0xf6, 0xc1, 0x77);
  if (selected_control == SelectedControl::Menu) {
    display.drawRoundRect(18, 83, 59, 34, 8, color);
    display.drawRoundRect(19, 84, 57, 32, 7, color);
  } else {
    display.drawRoundRect(83, 83, 49, 34, 8, color);
    display.drawRoundRect(84, 84, 47, 32, 7, color);
  }
}

static void draw_demo_state() {
  const int64_t now_us = esp_timer_get_time();
  const float t = now_us / 1000000.0f;
  const float progress = run_animation ? (50.0f + std::sin(t * 2.6f) * 47.0f) : 97.0f;
  const float gauge = run_animation ? (50.0f + std::sin(t * 1.7f + 1.2f) * 50.0f) : 72.0f;
  const bool led = run_animation ? ((now_us / 250000) % 2 == 0) : true;

  draw_static_ui();
  draw_progress(progress);
  draw_led(led);
  draw_gauge(gauge);
  draw_selection();
  display.flush();
}

static void handle_key(CardputerKey key) {
  if (key == CardputerKey::Left) {
    selected_control = SelectedControl::Menu;
    ESP_LOGI(TAG, "selection=MENU");
  } else if (key == CardputerKey::Right) {
    selected_control = SelectedControl::Run;
    ESP_LOGI(TAG, "selection=RUN");
  } else if (key == CardputerKey::Enter) {
    if (selected_control == SelectedControl::Run) {
      run_animation = !run_animation;
      ESP_LOGI(TAG, "run animation=%s", run_animation ? "on" : "off");
    } else {
      run_animation = false;
      ESP_LOGI(TAG, "menu selected, animation stopped");
    }
  } else if (key == CardputerKey::Esc) {
    run_animation = false;
    selected_control = SelectedControl::Menu;
    ESP_LOGI(TAG, "esc pressed, reset to MENU");
  }
}

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "Starting vanilla Cardputer UI smoke test");

  if (!display.begin()) {
    ESP_LOGE(TAG, "Display init failed");
    return;
  }

  if (!keyboard.begin()) {
    ESP_LOGW(TAG, "Keyboard init failed; animation demo will run without input");
  }
  cardputer_ui_init(&display);

  uint32_t ticks = 0;
  for (;;) {
    CardputerKey key = keyboard.readKey();
    if (key != CardputerKey::None) {
      handle_key(key);
    }

    draw_demo_state();

    if ((ticks++ % 125) == 0) {
      if (!keyboard.isReady()) {
        keyboard.begin();
      }
      ESP_LOGI(TAG, "UI alive display=%dx%d keyboard=%s",
               CardputerDisplay::WIDTH,
               CardputerDisplay::HEIGHT,
               keyboard.isReady() ? "ready" : "offline");
    }
    vTaskDelay(pdMS_TO_TICKS(40));
  }
}
