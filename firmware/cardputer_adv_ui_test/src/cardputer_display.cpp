#include "cardputer_display.h"

#include "cardputer_font_5x7.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <algorithm>
#include <string.h>

static const char* TAG = "cardputer_display";

static constexpr gpio_num_t PIN_BL = GPIO_NUM_38;
static constexpr gpio_num_t PIN_RST = GPIO_NUM_33;
static constexpr gpio_num_t PIN_DC = GPIO_NUM_34;
static constexpr gpio_num_t PIN_MOSI = GPIO_NUM_35;
static constexpr gpio_num_t PIN_SCLK = GPIO_NUM_36;
static constexpr gpio_num_t PIN_CS = GPIO_NUM_37;

static constexpr int PANEL_OFFSET_X = 0;
static constexpr int PANEL_OFFSET_Y = 0;
static constexpr int PANEL_NATIVE_W = 240;
static constexpr int PANEL_NATIVE_H = 135;

static spi_device_handle_t spi = nullptr;

static uint16_t swap16(uint16_t value) {
  return static_cast<uint16_t>((value << 8) | (value >> 8));
}

bool CardputerDisplay::begin() {
  framebuffer_ = static_cast<uint16_t*>(heap_caps_malloc(WIDTH * HEIGHT * sizeof(uint16_t), MALLOC_CAP_8BIT));
  if (!framebuffer_) {
    ESP_LOGE(TAG, "framebuffer allocation failed");
    return false;
  }

  gpio_set_direction(PIN_DC, GPIO_MODE_OUTPUT);
  gpio_set_direction(PIN_RST, GPIO_MODE_OUTPUT);
  gpio_set_direction(PIN_BL, GPIO_MODE_OUTPUT);
  gpio_set_level(PIN_BL, 1);

  if (!initSpi()) return false;
  resetPanel();
  initPanel();
  setBrightness(220);
  clear(rgb565(0, 0, 0));
  flush();
  ESP_LOGI(TAG, "vanilla ST7789 initialized");
  return true;
}

bool CardputerDisplay::initSpi() {
  spi_bus_config_t bus = {};
  bus.mosi_io_num = PIN_MOSI;
  bus.miso_io_num = GPIO_NUM_NC;
  bus.sclk_io_num = PIN_SCLK;
  bus.quadwp_io_num = GPIO_NUM_NC;
  bus.quadhd_io_num = GPIO_NUM_NC;
  bus.max_transfer_sz = PANEL_NATIVE_W * 2 + 16;

  esp_err_t err = spi_bus_initialize(SPI3_HOST, &bus, SPI_DMA_CH_AUTO);
  if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
    ESP_LOGE(TAG, "spi_bus_initialize failed: %s", esp_err_to_name(err));
    return false;
  }

  spi_device_interface_config_t dev = {};
  dev.clock_speed_hz = 40000000;
  dev.mode = 0;
  dev.spics_io_num = PIN_CS;
  dev.queue_size = 1;
  dev.flags = SPI_DEVICE_HALFDUPLEX;

  err = spi_bus_add_device(SPI3_HOST, &dev, &spi);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "spi_bus_add_device failed: %s", esp_err_to_name(err));
    return false;
  }
  return true;
}

void CardputerDisplay::resetPanel() {
  gpio_set_level(PIN_RST, 0);
  vTaskDelay(pdMS_TO_TICKS(20));
  gpio_set_level(PIN_RST, 1);
  vTaskDelay(pdMS_TO_TICKS(120));
}

void CardputerDisplay::initPanel() {
  writeCommand(0x01);
  vTaskDelay(pdMS_TO_TICKS(120));
  writeCommand(0x11);
  vTaskDelay(pdMS_TO_TICKS(120));
  writeCommand(0x3A);
  writeDataByte(0x55);
  writeCommand(0x36);
  writeDataByte(0x60);
  writeCommand(0x21);
  writeCommand(0x13);
  writeCommand(0x29);
  vTaskDelay(pdMS_TO_TICKS(20));
}

void CardputerDisplay::setBrightness(uint8_t brightness) {
  static bool configured = false;
  if (!configured) {
    ledc_timer_config_t timer = {};
    timer.speed_mode = LEDC_LOW_SPEED_MODE;
    timer.timer_num = LEDC_TIMER_0;
    timer.duty_resolution = LEDC_TIMER_8_BIT;
    timer.freq_hz = 5000;
    timer.clk_cfg = LEDC_AUTO_CLK;
    ledc_timer_config(&timer);

    ledc_channel_config_t channel = {};
    channel.gpio_num = PIN_BL;
    channel.speed_mode = LEDC_LOW_SPEED_MODE;
    channel.channel = LEDC_CHANNEL_0;
    channel.timer_sel = LEDC_TIMER_0;
    channel.duty = brightness;
    channel.hpoint = 0;
    ledc_channel_config(&channel);
    configured = true;
  }
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, brightness);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

void CardputerDisplay::writeCommand(uint8_t cmd) {
  gpio_set_level(PIN_DC, 0);
  spi_transaction_t t = {};
  t.length = 8;
  t.tx_buffer = &cmd;
  spi_device_polling_transmit(spi, &t);
}

void CardputerDisplay::writeData(const uint8_t* data, int len) {
  if (len <= 0) return;
  gpio_set_level(PIN_DC, 1);
  spi_transaction_t t = {};
  t.length = len * 8;
  t.tx_buffer = data;
  spi_device_polling_transmit(spi, &t);
}

void CardputerDisplay::writeDataByte(uint8_t data) {
  writeData(&data, 1);
}

void CardputerDisplay::setAddressWindowNative(int x, int y, int w, int h) {
  const uint16_t x0 = x;
  const uint16_t x1 = x + w - 1;
  const uint16_t y0 = y;
  const uint16_t y1 = y + h - 1;
  const uint8_t col[] = {static_cast<uint8_t>(x0 >> 8), static_cast<uint8_t>(x0), static_cast<uint8_t>(x1 >> 8), static_cast<uint8_t>(x1)};
  const uint8_t row[] = {static_cast<uint8_t>(y0 >> 8), static_cast<uint8_t>(y0), static_cast<uint8_t>(y1 >> 8), static_cast<uint8_t>(y1)};
  writeCommand(0x2A);
  writeData(col, sizeof(col));
  writeCommand(0x2B);
  writeData(row, sizeof(row));
  writeCommand(0x2C);
}

void CardputerDisplay::flush() {
  uint16_t line[PANEL_NATIVE_W];
  setAddressWindowNative(PANEL_OFFSET_X, PANEL_OFFSET_Y, PANEL_NATIVE_W, PANEL_NATIVE_H);
  for (int y = 0; y < HEIGHT; ++y) {
    for (int x = 0; x < WIDTH; ++x) {
      line[x] = swap16(framebuffer_[y * WIDTH + x]);
    }
    writeData(reinterpret_cast<const uint8_t*>(line), WIDTH * sizeof(uint16_t));
  }
}

CardputerRect CardputerDisplay::clipRect(CardputerRect rect) const {
  const int x0 = std::max(0, rect.x);
  const int y0 = std::max(0, rect.y);
  const int x1 = std::min(WIDTH, rect.x + rect.w);
  const int y1 = std::min(HEIGHT, rect.y + rect.h);
  return {x0, y0, x1 - x0, y1 - y0};
}

void CardputerDisplay::flushRect(CardputerRect rect) {
  rect = clipRect(rect);
  if (rect.empty()) return;

  const int nativeX = PANEL_OFFSET_X + rect.x;
  const int nativeY = PANEL_OFFSET_Y + rect.y;
  const int nativeW = rect.w;
  const int nativeH = rect.h;

  uint16_t line[PANEL_NATIVE_W];
  setAddressWindowNative(nativeX, nativeY, nativeW, nativeH);
  for (int row = 0; row < rect.h; ++row) {
    const int y = rect.y + row;
    for (int col = 0; col < rect.w; ++col) {
      const int x = rect.x + col;
      line[col] = swap16(framebuffer_[y * WIDTH + x]);
    }
    writeData(reinterpret_cast<const uint8_t*>(line), rect.w * sizeof(uint16_t));
  }
}

void CardputerDisplay::clear(uint16_t color) {
  std::fill(framebuffer_, framebuffer_ + WIDTH * HEIGHT, color);
}

void CardputerDisplay::drawPixel(int x, int y, uint16_t color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  framebuffer_[y * WIDTH + x] = color;
}

void CardputerDisplay::drawLine(int x0, int y0, int x1, int y1, uint16_t color) {
  int dx = std::abs(x1 - x0);
  int sx = x0 < x1 ? 1 : -1;
  int dy = -std::abs(y1 - y0);
  int sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (;;) {
    drawPixel(x0, y0, color);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

void CardputerDisplay::drawRect(int x, int y, int w, int h, uint16_t color) {
  drawLine(x, y, x + w - 1, y, color);
  drawLine(x, y + h - 1, x + w - 1, y + h - 1, color);
  drawLine(x, y, x, y + h - 1, color);
  drawLine(x + w - 1, y, x + w - 1, y + h - 1, color);
}

void CardputerDisplay::fillRect(int x, int y, int w, int h, uint16_t color) {
  const int x0 = std::max(0, x);
  const int y0 = std::max(0, y);
  const int x1 = std::min(WIDTH, x + w);
  const int y1 = std::min(HEIGHT, y + h);
  for (int yy = y0; yy < y1; ++yy) {
    std::fill(framebuffer_ + yy * WIDTH + x0, framebuffer_ + yy * WIDTH + x1, color);
  }
}

void CardputerDisplay::drawCircle(int cx, int cy, int r, uint16_t color) {
  int x = -r;
  int y = 0;
  int err = 2 - 2 * r;
  do {
    drawPixel(cx - x, cy + y, color);
    drawPixel(cx - y, cy - x, color);
    drawPixel(cx + x, cy - y, color);
    drawPixel(cx + y, cy + x, color);
    int e2 = err;
    if (e2 <= y) err += ++y * 2 + 1;
    if (e2 > x || err > y) err += ++x * 2 + 1;
  } while (x < 0);
}

void CardputerDisplay::fillCircle(int cx, int cy, int r, uint16_t color) {
  for (int y = -r; y <= r; ++y) {
    for (int x = -r; x <= r; ++x) {
      if (x * x + y * y <= r * r) drawPixel(cx + x, cy + y, color);
    }
  }
}

void CardputerDisplay::drawRoundRect(int x, int y, int w, int h, int r, uint16_t color) {
  drawLine(x + r, y, x + w - r - 1, y, color);
  drawLine(x + r, y + h - 1, x + w - r - 1, y + h - 1, color);
  drawLine(x, y + r, x, y + h - r - 1, color);
  drawLine(x + w - 1, y + r, x + w - 1, y + h - r - 1, color);
  for (int yy = 0; yy <= r; ++yy) {
    for (int xx = 0; xx <= r; ++xx) {
      if (xx * xx + yy * yy >= (r - 1) * (r - 1) && xx * xx + yy * yy <= r * r) {
        drawPixel(x + r - xx, y + r - yy, color);
        drawPixel(x + w - r - 1 + xx, y + r - yy, color);
        drawPixel(x + r - xx, y + h - r - 1 + yy, color);
        drawPixel(x + w - r - 1 + xx, y + h - r - 1 + yy, color);
      }
    }
  }
}

void CardputerDisplay::fillRoundRect(int x, int y, int w, int h, int r, uint16_t color) {
  fillRect(x + r, y, w - 2 * r, h, color);
  fillRect(x, y + r, w, h - 2 * r, color);
  fillCircle(x + r, y + r, r, color);
  fillCircle(x + w - r - 1, y + r, r, color);
  fillCircle(x + r, y + h - r - 1, r, color);
  fillCircle(x + w - r - 1, y + h - r - 1, r, color);
}

void CardputerDisplay::drawChar(char ch, int x, int y, uint16_t color, int scale) {
  const uint8_t* glyph = cardputerFont5x7Glyph(ch);
  for (int col = 0; col < CARDPUTER_FONT_5X7.glyphWidth; ++col) {
    uint8_t bits = glyph[col];
    for (int row = 0; row < CARDPUTER_FONT_5X7.glyphHeight; ++row) {
      if (bits & (1 << row)) {
        fillRect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

void CardputerDisplay::drawText(const char* text, int x, int y, uint16_t color, int scale) {
  if (!text) return;
  for (int i = 0; text[i]; ++i) {
    drawChar(text[i], x + i * CARDPUTER_FONT_5X7.glyphAdvance * scale, y, color, scale);
  }
}

void CardputerDisplay::drawTextCentered(const char* text, int cx, int cy, uint16_t color, int scale) {
  const int w = textWidth(text, scale);
  drawText(text, cx - w / 2, cy - (CARDPUTER_FONT_5X7.glyphHeight * scale) / 2, color, scale);
}

int CardputerDisplay::textWidth(const char* text, int scale) const {
  return text ? static_cast<int>(strlen(text)) * CARDPUTER_FONT_5X7.glyphAdvance * scale : 0;
}

uint16_t CardputerDisplay::rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return static_cast<uint16_t>(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
