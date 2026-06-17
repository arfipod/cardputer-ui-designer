#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "cardputer_adv_display.h"
#include "generated/cardputer_ui.h"

static const char* TAG = "cardputer_ui_smoke";
static CardputerAdvDisplay display;
static CardputerScreenId current_screen = CARDPUTER_UI_START_SCREEN;

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "Starting Cardputer UI smoke test");

  display.init();
  display.setRotation(1);
  display.setBrightness(180);
  display.fillScreen(TFT_BLACK);

  cardputer_ui_init(&display);
  cardputer_ui_draw(current_screen);

  uint32_t ticks = 0;
  for (;;) {
    if ((ticks++ % 10) == 0) {
      ESP_LOGI(TAG, "UI alive on screen=%d", static_cast<int>(current_screen));
    }
    vTaskDelay(pdMS_TO_TICKS(500));
  }
}
