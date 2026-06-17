#pragma once

#include <stdint.h>

class CardputerDisplay {
 public:
  static constexpr int WIDTH = 240;
  static constexpr int HEIGHT = 135;

  bool begin();
  void setBrightness(uint8_t brightness);
  void clear(uint16_t color);
  void flush();

  void drawPixel(int x, int y, uint16_t color);
  void drawLine(int x0, int y0, int x1, int y1, uint16_t color);
  void drawRect(int x, int y, int w, int h, uint16_t color);
  void fillRect(int x, int y, int w, int h, uint16_t color);
  void drawRoundRect(int x, int y, int w, int h, int r, uint16_t color);
  void fillRoundRect(int x, int y, int w, int h, int r, uint16_t color);
  void drawCircle(int cx, int cy, int r, uint16_t color);
  void fillCircle(int cx, int cy, int r, uint16_t color);
  void drawText(const char* text, int x, int y, uint16_t color, int scale = 1);
  void drawTextCentered(const char* text, int cx, int cy, uint16_t color, int scale = 1);
  int textWidth(const char* text, int scale = 1) const;

  static uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b);

 private:
  bool initSpi();
  void resetPanel();
  void initPanel();
  void writeCommand(uint8_t cmd);
  void writeData(const uint8_t* data, int len);
  void writeDataByte(uint8_t data);
  void setAddressWindowNative(int x, int y, int w, int h);
  void drawChar(char ch, int x, int y, uint16_t color, int scale);

  uint16_t* framebuffer_ = nullptr;
};
