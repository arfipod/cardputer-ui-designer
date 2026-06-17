#pragma once

#include "driver/i2c_master.h"
#include <stdint.h>

enum class CardputerKey {
  None,
  Left,
  Right,
  Enter,
  Esc,
};

class CardputerKeyboard {
 public:
  bool begin();
  CardputerKey readKey();
  bool isReady() const { return initialized_; }

 private:
  bool writeRegister(uint8_t reg, uint8_t value);
  bool readRegister(uint8_t reg, uint8_t* value);
  void scanBus();
  uint8_t available();
  uint8_t getEvent();
  void flush();
  CardputerKey decodeEvent(uint8_t event);

  bool initialized_ = false;
  bool fnPressed_ = false;
  i2c_master_bus_handle_t bus_ = nullptr;
  i2c_master_dev_handle_t device_ = nullptr;
};
