#pragma once

#include "driver/i2c_master.h"
#include <stdint.h>

enum class CardputerKey {
  None,
  Character,
  Left,
  Right,
  Up,
  Down,
  Enter,
  Esc,
  Backspace,
  Tab,
  Space,
  Fn,
  Shift,
  Ctrl,
  Alt,
  Opt,
};

struct CardputerKeyEvent {
  CardputerKey key = CardputerKey::None;
  char character = '\0';
  bool pressed = false;
  bool fn = false;
  bool shift = false;
  bool ctrl = false;
  bool alt = false;
  bool opt = false;
  uint8_t row = 0;
  uint8_t col = 0;
  uint8_t raw = 0;
};

class CardputerKeyboard {
 public:
  bool begin();
  bool readEvent(CardputerKeyEvent* event);
  CardputerKey readKey();
  bool isReady() const { return initialized_; }
  const char* keyName(const CardputerKeyEvent& event) const;

 private:
  struct KeyPosition {
    uint8_t row;
    uint8_t col;
  };

  bool writeRegister(uint8_t reg, uint8_t value);
  bool readRegister(uint8_t reg, uint8_t* value);
  void scanBus();
  uint8_t available();
  uint8_t getEvent();
  void flush();
  bool decodeEvent(uint8_t rawEvent, CardputerKeyEvent* event);
  bool eventToPosition(uint8_t rawEvent, bool* pressed, KeyPosition* position) const;
  void updatePressedState(KeyPosition position, bool pressed);
  void applyModifiers(CardputerKeyEvent* event) const;
  CardputerKey mapKey(KeyPosition position, char* character) const;
  CardputerKey mapFnKey(KeyPosition position) const;
  uint8_t keyValue(KeyPosition position, bool shifted) const;
  bool isPositionPressed(uint8_t row, uint8_t col) const;

  bool initialized_ = false;
  bool pressed_[4][14] = {};
  i2c_master_bus_handle_t bus_ = nullptr;
  i2c_master_dev_handle_t device_ = nullptr;
};
