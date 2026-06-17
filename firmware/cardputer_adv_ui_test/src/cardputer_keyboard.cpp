#include "cardputer_keyboard.h"

#include "freertos/FreeRTOS.h"
#include "esp_err.h"
#include "esp_log.h"

static const char* TAG = "cardputer_keyboard";

static constexpr i2c_port_num_t I2C_PORT = I2C_NUM_0;
static constexpr gpio_num_t I2C_SDA = GPIO_NUM_8;
static constexpr gpio_num_t I2C_SCL = GPIO_NUM_9;
static constexpr uint8_t TCA8418_ADDR = 0x34;

static constexpr uint8_t REG_CFG = 0x01;
static constexpr uint8_t REG_INT_STAT = 0x02;
static constexpr uint8_t REG_KEY_LCK_EC = 0x03;
static constexpr uint8_t REG_KEY_EVENT_A = 0x04;
static constexpr uint8_t REG_KP_GPIO_1 = 0x1D;
static constexpr uint8_t REG_KP_GPIO_2 = 0x1E;
static constexpr uint8_t REG_KP_GPIO_3 = 0x1F;

static constexpr uint8_t CFG_KE_IEN = 0x01;
static constexpr uint8_t INT_STAT_KEY = 0x01;

bool CardputerKeyboard::begin() {
  if (initialized_) return true;

  i2c_master_bus_config_t busConfig = {};
  busConfig.i2c_port = I2C_PORT;
  busConfig.sda_io_num = I2C_SDA;
  busConfig.scl_io_num = I2C_SCL;
  busConfig.clk_source = I2C_CLK_SRC_DEFAULT;
  busConfig.glitch_ignore_cnt = 7;
  busConfig.flags.enable_internal_pullup = true;

  if (bus_ == nullptr) {
    esp_err_t err = i2c_new_master_bus(&busConfig, &bus_);
    if (err == ESP_ERR_INVALID_STATE) {
      err = i2c_master_get_bus_handle(I2C_PORT, &bus_);
    }
    if (err != ESP_OK) {
      ESP_LOGE(TAG, "i2c bus setup failed: %s", esp_err_to_name(err));
      return false;
    }
  }

  if (device_ == nullptr) {
    i2c_device_config_t deviceConfig = {};
    deviceConfig.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    deviceConfig.device_address = TCA8418_ADDR;
    deviceConfig.scl_speed_hz = 400000;

    esp_err_t err = i2c_master_bus_add_device(bus_, &deviceConfig, &device_);
    if (err != ESP_OK) {
      ESP_LOGE(TAG, "i2c device setup failed: %s", esp_err_to_name(err));
      scanBus();
      return false;
    }
  }

  uint8_t cfg = 0;
  if (!readRegister(REG_CFG, &cfg)) {
    ESP_LOGE(TAG, "TCA8418 not found at 0x%02x", TCA8418_ADDR);
    scanBus();
    return false;
  }

  // Cardputer Adv keyboard matrix: rows 0..6, columns 0..7.
  if (!writeRegister(REG_KP_GPIO_1, 0x7F) ||
      !writeRegister(REG_KP_GPIO_2, 0xFF) ||
      !writeRegister(REG_KP_GPIO_3, 0x00) ||
      !writeRegister(REG_CFG, cfg | CFG_KE_IEN)) {
    ESP_LOGE(TAG, "TCA8418 matrix setup failed");
    return false;
  }

  flush();
  initialized_ = true;
  ESP_LOGI(TAG, "keyboard initialized");
  return true;
}

CardputerKey CardputerKeyboard::readKey() {
  if (!initialized_) return CardputerKey::None;

  const uint8_t count = available();
  for (uint8_t i = 0; i < count; ++i) {
    CardputerKey key = decodeEvent(getEvent());
    writeRegister(REG_INT_STAT, INT_STAT_KEY);
    if (key != CardputerKey::None) return key;
  }
  return CardputerKey::None;
}

bool CardputerKeyboard::writeRegister(uint8_t reg, uint8_t value) {
  const uint8_t data[2] = {reg, value};
  return i2c_master_transmit(device_, data, sizeof(data), pdMS_TO_TICKS(50)) == ESP_OK;
}

bool CardputerKeyboard::readRegister(uint8_t reg, uint8_t* value) {
  return i2c_master_transmit_receive(device_, &reg, 1, value, 1, pdMS_TO_TICKS(50)) == ESP_OK;
}

void CardputerKeyboard::scanBus() {
  if (bus_ == nullptr) return;

  bool found = false;
  for (uint8_t addr = 0x08; addr < 0x78; ++addr) {
    if (i2c_master_probe(bus_, addr, pdMS_TO_TICKS(20)) == ESP_OK) {
      ESP_LOGI(TAG, "i2c device found at 0x%02x", addr);
      found = true;
    }
  }
  if (!found) {
    ESP_LOGW(TAG, "i2c scan found no devices on GPIO%d/GPIO%d", I2C_SDA, I2C_SCL);
  }
}

uint8_t CardputerKeyboard::available() {
  uint8_t value = 0;
  if (!readRegister(REG_KEY_LCK_EC, &value)) return 0;
  return value & 0x0F;
}

uint8_t CardputerKeyboard::getEvent() {
  uint8_t value = 0;
  readRegister(REG_KEY_EVENT_A, &value);
  return value;
}

void CardputerKeyboard::flush() {
  while (getEvent() != 0) {
  }
  writeRegister(REG_INT_STAT, INT_STAT_KEY);
}

CardputerKey CardputerKeyboard::decodeEvent(uint8_t event) {
  if (event == 0) return CardputerKey::None;

  const bool pressed = (event & 0x80) != 0;
  uint8_t raw = (event & 0x7F);
  if (raw == 0) return CardputerKey::None;
  raw -= 1;

  uint8_t row = raw / 10;
  uint8_t col = raw % 10;

  const uint8_t mappedCol = row * 2 + (col > 3 ? 1 : 0);
  const uint8_t mappedRow = (col + 4) % 4;
  row = mappedRow;
  col = mappedCol;

  ESP_LOGI(TAG, "event=0x%02x pressed=%d row=%u col=%u fn=%d", event, pressed ? 1 : 0, row, col, fnPressed_ ? 1 : 0);

  if (row == 2 && col == 0) {
    fnPressed_ = pressed;
    return CardputerKey::None;
  }

  if (!pressed) return CardputerKey::None;
  if (row == 2 && col == 13) return CardputerKey::Enter;
  if (fnPressed_ && row == 0 && col == 0) return CardputerKey::Esc;
  if (fnPressed_ && row == 3 && col == 10) return CardputerKey::Left;
  if (fnPressed_ && row == 3 && col == 12) return CardputerKey::Right;

  return CardputerKey::None;
}
