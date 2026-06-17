#include "cardputer_ui_widgets.h"

#include <algorithm>
#include <cmath>
#include <string.h>

static float clampf(float value, float min, float max) {
  return std::max(min, std::min(max, value));
}

CardputerWidget::CardputerWidget(CardputerRect bounds) : bounds_(bounds) {}

void CardputerWidget::setVisible(bool visible) {
  if (visible_ == visible) return;
  visible_ = visible;
  invalidate();
}

CardputerPanel::CardputerPanel(CardputerRect bounds, uint16_t fill, uint16_t stroke, int radius)
    : CardputerWidget(bounds), fill_(fill), stroke_(stroke), radius_(radius) {}

void CardputerPanel::draw(CardputerDisplay& display) {
  display.fillRoundRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, radius_, fill_);
  display.drawRoundRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, radius_, stroke_);
}

CardputerLabel::CardputerLabel(CardputerRect bounds, const char* text, uint16_t color, int scale, CardputerTextAlign align)
    : CardputerWidget(bounds), text_(text), color_(color), scale_(scale), align_(align) {}

void CardputerLabel::setText(const char* text) {
  if (text_ == text || (text_ && text && strcmp(text_, text) == 0)) return;
  text_ = text;
  invalidate();
}

void CardputerLabel::draw(CardputerDisplay& display) {
  const int cy = bounds_.y + bounds_.h / 2;
  if (align_ == CardputerTextAlign::Center) {
    display.drawTextCentered(text_, bounds_.x + bounds_.w / 2, cy, color_, scale_);
  } else if (align_ == CardputerTextAlign::Right) {
    display.drawText(text_, bounds_.x + bounds_.w - display.textWidth(text_, scale_), cy - (7 * scale_) / 2, color_, scale_);
  } else {
    display.drawText(text_, bounds_.x, cy - (7 * scale_) / 2, color_, scale_);
  }
}

CardputerButton::CardputerButton(CardputerRect bounds, const char* text, uint16_t fill, uint16_t stroke, uint16_t color, int radius, int scale)
    : CardputerWidget({bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4}),
      text_(text),
      fill_(fill),
      stroke_(stroke),
      color_(color),
      radius_(radius),
      scale_(scale) {}

void CardputerButton::setSelected(bool selected) {
  if (selected_ == selected) return;
  selected_ = selected;
  invalidate();
}

void CardputerButton::setActive(bool active) {
  if (active_ == active) return;
  active_ = active;
  invalidate();
}

void CardputerButton::draw(CardputerDisplay& display) {
  const int x = bounds_.x + 2;
  const int y = bounds_.y + 2;
  const int w = bounds_.w - 4;
  const int h = bounds_.h - 4;

  display.fillRoundRect(x, y, w, h, radius_, fill_);
  display.drawRoundRect(x, y, w, h, radius_, stroke_);
  display.drawTextCentered(text_, x + w / 2, y + h / 2, color_, scale_);

  if (selected_) {
    const uint16_t accent = active_
        ? CardputerDisplay::rgb565(0x4a, 0xde, 0x80)
        : CardputerDisplay::rgb565(0xf6, 0xc1, 0x77);
    display.drawRoundRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, radius_ + 2, accent);
    display.drawRoundRect(bounds_.x + 1, bounds_.y + 1, bounds_.w - 2, bounds_.h - 2, radius_ + 1, accent);
  }
}

CardputerProgressBar::CardputerProgressBar(CardputerRect bounds, float value, float min, float max, uint16_t fill, uint16_t stroke, uint16_t background, int radius)
    : CardputerWidget(bounds), value_(value), min_(min), max_(max), fill_(fill), stroke_(stroke), background_(background), radius_(radius) {}

void CardputerProgressBar::setValue(float value) {
  value = clampf(value, min_, max_);
  if (std::fabs(value_ - value) < 0.5f) return;
  value_ = value;
  invalidate();
}

float CardputerProgressBar::ratio() const {
  if (max_ == min_) return 0.0f;
  return clampf((value_ - min_) / (max_ - min_), 0.0f, 1.0f);
}

void CardputerProgressBar::draw(CardputerDisplay& display) {
  const int inner = std::max(0, static_cast<int>((bounds_.w - 4) * ratio()));
  display.fillRoundRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, radius_, background_);
  display.drawRoundRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, radius_, stroke_);
  display.fillRoundRect(bounds_.x + 2, bounds_.y + 2, inner, bounds_.h - 4, std::max(0, radius_ - 2), fill_);
}

CardputerLed::CardputerLed(CardputerRect bounds, bool on, uint16_t onFill, uint16_t offFill, uint16_t onStroke, uint16_t offStroke)
    : CardputerWidget(bounds), on_(on), onFill_(onFill), offFill_(offFill), onStroke_(onStroke), offStroke_(offStroke) {}

void CardputerLed::setOn(bool on) {
  if (on_ == on) return;
  on_ = on;
  invalidate();
}

void CardputerLed::draw(CardputerDisplay& display) {
  const int r = std::min(bounds_.w, bounds_.h) / 2;
  const int cx = bounds_.x + r;
  const int cy = bounds_.y + r;
  display.fillCircle(cx, cy, r, on_ ? onFill_ : offFill_);
  display.drawCircle(cx, cy, r, on_ ? onStroke_ : offStroke_);
}

CardputerGauge::CardputerGauge(CardputerRect bounds, float value, float min, float max, uint16_t fill, uint16_t stroke, uint16_t background)
    : CardputerWidget(bounds), value_(value), min_(min), max_(max), fill_(fill), stroke_(stroke), background_(background) {}

void CardputerGauge::setValue(float value) {
  value = clampf(value, min_, max_);
  if (std::fabs(value_ - value) < 0.5f) return;
  value_ = value;
  invalidate();
}

float CardputerGauge::ratio() const {
  if (max_ == min_) return 0.0f;
  return clampf((value_ - min_) / (max_ - min_), 0.0f, 1.0f);
}

void CardputerGauge::draw(CardputerDisplay& display) {
  const int cx = bounds_.x + bounds_.w / 2;
  const int cy = bounds_.y + bounds_.h / 2;
  const int radius = std::min(bounds_.w, bounds_.h) / 2 - 2;
  const float angle = (-140.0f + ratio() * 280.0f) * 3.14159265f / 180.0f;
  const int nx = cx + static_cast<int>(std::cos(angle) * (radius - 7));
  const int ny = cy + static_cast<int>(std::sin(angle) * (radius - 7));

  display.fillRect(bounds_.x - 1, bounds_.y - 1, bounds_.w + 2, bounds_.h + 2, background_);
  display.drawCircle(cx, cy, radius, stroke_);
  display.drawCircle(cx, cy, radius - 6, stroke_);
  display.drawLine(cx, cy, nx, ny, fill_);
  display.fillCircle(cx, cy, 2, fill_);
}

void CardputerScreen::add(CardputerWidget* widget) {
  if (count_ >= MAX_WIDGETS || widget == nullptr) return;
  widgets_[count_++] = widget;
}

void CardputerScreen::begin() {
  for (size_t i = 0; i < count_; ++i) widgets_[i]->begin();
}

void CardputerScreen::update(uint32_t nowMs) {
  for (size_t i = 0; i < count_; ++i) widgets_[i]->update(nowMs);
}

void CardputerScreen::drawAll(CardputerDisplay& display) {
  for (size_t i = 0; i < count_; ++i) {
    if (widgets_[i]->visible()) widgets_[i]->draw(display);
    widgets_[i]->markClean();
  }
}

void CardputerScreen::flushAll(CardputerDisplay& display) {
  drawAll(display);
  display.flush();
}

void CardputerScreen::flushDirty(CardputerDisplay& display) {
  CardputerRect dirtyRects[MAX_WIDGETS] = {};
  size_t dirtyCount = 0;

  for (size_t i = 0; i < count_; ++i) {
    if (!widgets_[i]->dirty()) continue;
    dirtyRects[dirtyCount++] = padded(widgets_[i]->bounds(), 2);
  }

  for (size_t i = 0; i < dirtyCount; ++i) {
    drawIntersecting(display, dirtyRects[i]);
    display.flushRect(dirtyRects[i]);
  }

  for (size_t i = 0; i < count_; ++i) widgets_[i]->markClean();
}

bool CardputerScreen::intersects(CardputerRect a, CardputerRect b) const {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

CardputerRect CardputerScreen::padded(CardputerRect rect, int amount) const {
  return {rect.x - amount, rect.y - amount, rect.w + amount * 2, rect.h + amount * 2};
}

void CardputerScreen::drawIntersecting(CardputerDisplay& display, CardputerRect rect) {
  for (size_t i = 0; i < count_; ++i) {
    if (widgets_[i]->visible() && intersects(widgets_[i]->bounds(), rect)) {
      widgets_[i]->draw(display);
    }
  }
}
