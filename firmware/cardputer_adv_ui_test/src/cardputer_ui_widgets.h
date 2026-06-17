#pragma once

#include "cardputer_display.h"
#include <stddef.h>
#include <stdint.h>

enum class CardputerTextAlign {
  Left,
  Center,
  Right,
};

class CardputerWidget {
 public:
  explicit CardputerWidget(CardputerRect bounds);
  virtual ~CardputerWidget() = default;

  virtual void begin() {}
  virtual void update(uint32_t nowMs) { (void)nowMs; }
  virtual void draw(CardputerDisplay& display) = 0;

  CardputerRect bounds() const { return bounds_; }
  bool dirty() const { return dirty_; }
  bool visible() const { return visible_; }
  void setVisible(bool visible);
  void invalidate() { dirty_ = true; }
  void markClean() { dirty_ = false; }

 protected:
  CardputerRect bounds_;
  bool visible_ = true;
  bool dirty_ = true;
};

class CardputerPanel : public CardputerWidget {
 public:
  CardputerPanel(CardputerRect bounds, uint16_t fill, uint16_t stroke, int radius);
  void draw(CardputerDisplay& display) override;

 private:
  uint16_t fill_;
  uint16_t stroke_;
  int radius_;
};

class CardputerLabel : public CardputerWidget {
 public:
  CardputerLabel(CardputerRect bounds, const char* text, uint16_t color, int scale, CardputerTextAlign align);
  void setText(const char* text);
  void draw(CardputerDisplay& display) override;

 private:
  const char* text_;
  uint16_t color_;
  int scale_;
  CardputerTextAlign align_;
};

class CardputerButton : public CardputerWidget {
 public:
  CardputerButton(CardputerRect bounds, const char* text, uint16_t fill, uint16_t stroke, uint16_t color, int radius, int scale);
  void setSelected(bool selected);
  void setActive(bool active);
  void draw(CardputerDisplay& display) override;

 private:
  const char* text_;
  uint16_t fill_;
  uint16_t stroke_;
  uint16_t color_;
  int radius_;
  int scale_;
  bool selected_ = false;
  bool active_ = false;
};

class CardputerProgressBar : public CardputerWidget {
 public:
  CardputerProgressBar(CardputerRect bounds, float value, float min, float max, uint16_t fill, uint16_t stroke, uint16_t background, int radius);
  void setValue(float value);
  void draw(CardputerDisplay& display) override;

 private:
  float ratio() const;

  float value_;
  float min_;
  float max_;
  uint16_t fill_;
  uint16_t stroke_;
  uint16_t background_;
  int radius_;
};

class CardputerLed : public CardputerWidget {
 public:
  CardputerLed(CardputerRect bounds, bool on, uint16_t onFill, uint16_t offFill, uint16_t onStroke, uint16_t offStroke);
  void setOn(bool on);
  void draw(CardputerDisplay& display) override;

 private:
  bool on_;
  uint16_t onFill_;
  uint16_t offFill_;
  uint16_t onStroke_;
  uint16_t offStroke_;
};

class CardputerGauge : public CardputerWidget {
 public:
  CardputerGauge(CardputerRect bounds, float value, float min, float max, uint16_t fill, uint16_t stroke, uint16_t background);
  void setValue(float value);
  void draw(CardputerDisplay& display) override;

 private:
  float ratio() const;

  float value_;
  float min_;
  float max_;
  uint16_t fill_;
  uint16_t stroke_;
  uint16_t background_;
};

class CardputerScreen {
 public:
  void add(CardputerWidget* widget);
  void begin();
  void update(uint32_t nowMs);
  void drawAll(CardputerDisplay& display);
  void flushAll(CardputerDisplay& display);
  void flushDirty(CardputerDisplay& display);

 private:
  static constexpr size_t MAX_WIDGETS = 24;

  bool intersects(CardputerRect a, CardputerRect b) const;
  CardputerRect padded(CardputerRect rect, int amount) const;
  void drawIntersecting(CardputerDisplay& display, CardputerRect rect);

  CardputerWidget* widgets_[MAX_WIDGETS] = {};
  size_t count_ = 0;
};
