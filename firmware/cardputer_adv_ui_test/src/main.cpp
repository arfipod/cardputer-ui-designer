#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <cmath>

#include "cardputer_display.h"
#include "cardputer_keyboard.h"
#include "cardputer_ui_widgets.h"

static const char* TAG = "cardputer_ui_smoke";

static CardputerDisplay display;
static CardputerKeyboard keyboard;
static CardputerScreen screen;

static const uint16_t COLOR_PANEL = CardputerDisplay::rgb565(0x11, 0x18, 0x27);

static CardputerPanel panel(
    {0, 0, 240, 135},
    COLOR_PANEL,
    CardputerDisplay::rgb565(0x39, 0x50, 0x6f),
    8);

static CardputerLabel title(
    {20, 20, 210, 20},
    "pocketsynth v_0.1",
    CardputerDisplay::rgb565(0xe7, 0xf0, 0xff),
    2,
    CardputerTextAlign::Left);

static CardputerProgressBar progress(
    {20, 55, 138, 12},
    97,
    0,
    100,
    CardputerDisplay::rgb565(0x70, 0xd6, 0xff),
    CardputerDisplay::rgb565(0x34, 0x44, 0x5d),
    COLOR_PANEL,
    5);

static CardputerLed led(
    {220, 5, 14, 14},
    true,
    CardputerDisplay::rgb565(0x4a, 0xde, 0x80),
    CardputerDisplay::rgb565(0x16, 0x3a, 0x25),
    CardputerDisplay::rgb565(0xb8, 0xff, 0xce),
    CardputerDisplay::rgb565(0x39, 0x50, 0x6f));

static CardputerButton menuButton(
    {20, 85, 55, 30},
    "MENU",
    CardputerDisplay::rgb565(0x26, 0x31, 0x44),
    CardputerDisplay::rgb565(0x70, 0xd6, 0xff),
    CardputerDisplay::rgb565(0xf8, 0xfb, 0xff),
    6,
    2);

static CardputerButton runButton(
    {85, 85, 45, 30},
    "RUN",
    CardputerDisplay::rgb565(0x26, 0x31, 0x44),
    CardputerDisplay::rgb565(0x70, 0xd6, 0xff),
    CardputerDisplay::rgb565(0xf8, 0xfb, 0xff),
    6,
    2);

static CardputerGauge gauge(
    {185, 80, 45, 45},
    72,
    0,
    100,
    CardputerDisplay::rgb565(0xf6, 0xc1, 0x77),
    CardputerDisplay::rgb565(0x52, 0x61, 0x79),
    COLOR_PANEL);

enum class SelectedControl {
  Menu,
  Run,
};

static SelectedControl selected_control = SelectedControl::Menu;
static bool run_animation = false;
static bool keyboard_available = false;

static void set_selection(SelectedControl selected) {
  selected_control = selected;
  menuButton.setSelected(selected_control == SelectedControl::Menu);
  runButton.setSelected(selected_control == SelectedControl::Run);
}

static void set_run_animation(bool enabled) {
  run_animation = enabled;
  menuButton.setActive(run_animation);
  runButton.setActive(run_animation);
}

static void setup_screen() {
  screen.add(&panel);
  screen.add(&title);
  screen.add(&progress);
  screen.add(&led);
  screen.add(&menuButton);
  screen.add(&runButton);
  screen.add(&gauge);
  set_selection(SelectedControl::Menu);
  set_run_animation(false);
  screen.begin();
}

static void show_display_self_test() {
  const uint16_t colors[] = {
      CardputerDisplay::rgb565(0xff, 0x00, 0x00),
      CardputerDisplay::rgb565(0x00, 0xff, 0x00),
      CardputerDisplay::rgb565(0x00, 0x00, 0xff),
      CardputerDisplay::rgb565(0xff, 0xff, 0xff),
  };

  for (uint16_t color : colors) {
    display.clear(color);
    display.flush();
    vTaskDelay(pdMS_TO_TICKS(600));
  }

  display.clear(CardputerDisplay::rgb565(0x00, 0x00, 0x00));
  display.fillRect(0, 0, 60, CardputerDisplay::HEIGHT, CardputerDisplay::rgb565(0xff, 0x00, 0x00));
  display.fillRect(60, 0, 60, CardputerDisplay::HEIGHT, CardputerDisplay::rgb565(0x00, 0xff, 0x00));
  display.fillRect(120, 0, 60, CardputerDisplay::HEIGHT, CardputerDisplay::rgb565(0x00, 0x00, 0xff));
  display.fillRect(180, 0, 60, CardputerDisplay::HEIGHT, CardputerDisplay::rgb565(0xff, 0xff, 0xff));
  display.flush();
  vTaskDelay(pdMS_TO_TICKS(1200));

  display.clear(CardputerDisplay::rgb565(0x00, 0x00, 0x00));
  display.drawText("DISPLAY TEST", 24, 32, CardputerDisplay::rgb565(0xff, 0xff, 0xff), 2);
  display.drawRect(0, 0, CardputerDisplay::WIDTH, CardputerDisplay::HEIGHT, CardputerDisplay::rgb565(0xff, 0xff, 0x00));
  display.drawLine(0, 0, CardputerDisplay::WIDTH - 1, CardputerDisplay::HEIGHT - 1, CardputerDisplay::rgb565(0x00, 0xff, 0xff));
  display.drawLine(CardputerDisplay::WIDTH - 1, 0, 0, CardputerDisplay::HEIGHT - 1, CardputerDisplay::rgb565(0xff, 0x00, 0xff));
  display.flush();
  vTaskDelay(pdMS_TO_TICKS(2000));
}

static void update_animation() {
  if (!run_animation) {
    progress.setValue(97);
    gauge.setValue(72);
    led.setOn(true);
    return;
  }

  const int64_t now_us = esp_timer_get_time();
  const float t = now_us / 1000000.0f;
  progress.setValue(50.0f + std::sin(t * 2.6f) * 47.0f);
  gauge.setValue(50.0f + std::sin(t * 1.7f + 1.2f) * 50.0f);
  led.setOn(((now_us / 250000) % 2) == 0);
}

static void handle_key(CardputerKey key) {
  if (key == CardputerKey::Left) {
    set_selection(SelectedControl::Menu);
    ESP_LOGI(TAG, "selection=MENU");
  } else if (key == CardputerKey::Right) {
    set_selection(SelectedControl::Run);
    ESP_LOGI(TAG, "selection=RUN");
  } else if (key == CardputerKey::Enter) {
    if (selected_control == SelectedControl::Run) {
      set_run_animation(!run_animation);
      ESP_LOGI(TAG, "run animation=%s", run_animation ? "on" : "off");
    } else {
      set_run_animation(false);
      ESP_LOGI(TAG, "menu selected, animation stopped");
    }
  } else if (key == CardputerKey::Esc) {
    set_run_animation(false);
    set_selection(SelectedControl::Menu);
    ESP_LOGI(TAG, "esc pressed, reset to MENU");
  }
}

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "Starting reusable vanilla Cardputer UI smoke test");

  if (!display.begin()) {
    ESP_LOGE(TAG, "Display init failed");
    return;
  }
  ESP_LOGI(TAG, "Display init OK, running self-test pattern");
  show_display_self_test();

  keyboard_available = keyboard.begin();
  if (!keyboard_available) {
    ESP_LOGW(TAG, "Keyboard init failed; animation demo will run without input");
  }

  setup_screen();
  screen.flushAll(display);

  uint32_t ticks = 0;
  for (;;) {
    const uint32_t nowMs = static_cast<uint32_t>(esp_timer_get_time() / 1000);
    screen.update(nowMs);

    if (keyboard_available) {
      CardputerKey key = keyboard.readKey();
      if (key != CardputerKey::None) {
        handle_key(key);
      }
    }

    update_animation();
    screen.flushDirty(display);

    if ((ticks++ % 125) == 0) {
      ESP_LOGI(TAG, "UI alive display=%dx%d keyboard=%s",
               CardputerDisplay::WIDTH,
               CardputerDisplay::HEIGHT,
               keyboard_available ? "ready" : "offline");
    }
    vTaskDelay(pdMS_TO_TICKS(40));
  }
}
