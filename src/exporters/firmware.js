import { parseGlyphSet, bytesToCppArray } from '../core/assets.js';
import { valueRatio } from '../core/geometry.js';
import { m5gfxTextSize } from '../core/m5gfxText.js';
import { EVENT_TRIGGERS, safeIdentifier } from '../core/project.js';

const EVENT_ENUMS = {
  press: 'CARDPUTER_UI_EVENT_PRESS',
  longPress: 'CARDPUTER_UI_EVENT_LONG_PRESS',
  keyEnter: 'CARDPUTER_UI_EVENT_KEY_ENTER',
  keyBack: 'CARDPUTER_UI_EVENT_KEY_BACK',
  softKeyLeft: 'CARDPUTER_UI_EVENT_SOFTKEY_LEFT',
  softKeyRight: 'CARDPUTER_UI_EVENT_SOFTKEY_RIGHT'
};

export async function exportFirmwareProject(project) {
  const fontFiles = await exportFonts(project);
  const files = {
    'cardputer_ui.h': exportHeader(project),
    'cardputer_ui.cpp': exportSource(project),
    'cardputer_ui_assets.h': exportAssetsHeader(project),
    'cardputer_ui_assets.cpp': exportAssetsSource(project),
    'cardputer_ui_fonts.h': fontFiles.header,
    'cardputer_ui_fonts.cpp': fontFiles.source,
    'esp-idf/CMakeLists.txt': exportCMakeSnippet(),
    'platformio/main.cpp.example': exportPlatformIoSnippet(project)
  };
  return {
    filename: `${safeFilename(project.meta.name)}.vanilla-firmware.txt`,
    mimeType: 'text/plain',
    files,
    content: bundleFiles(files)
  };
}

function exportHeader(project) {
  const screenEnums = project.screens.map((screen, index) => `  ${screenEnum(screen)} = ${index}`).join(',\n');
  const startScreen = project.screens.find((screen) => screen.id === project.flow.startScreenId) ?? project.screens[0];
  return [
    '#pragma once',
    '',
    '#include "../cardputer_display.h"',
    '',
    'enum CardputerScreenId {',
    screenEnums,
    '};',
    `static constexpr CardputerScreenId CARDPUTER_UI_START_SCREEN = ${screenEnum(startScreen)};`,
    '',
    'enum CardputerUiEvent {',
    '  CARDPUTER_UI_EVENT_PRESS,',
    '  CARDPUTER_UI_EVENT_LONG_PRESS,',
    '  CARDPUTER_UI_EVENT_KEY_ENTER,',
    '  CARDPUTER_UI_EVENT_KEY_BACK,',
    '  CARDPUTER_UI_EVENT_SOFTKEY_LEFT,',
    '  CARDPUTER_UI_EVENT_SOFTKEY_RIGHT',
    '};',
    '',
    'void cardputer_ui_init(CardputerDisplay* display);',
    'void cardputer_ui_draw(CardputerScreenId screen);',
    'CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event);',
    'CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event);',
    ''
  ].join('\n');
}

function exportSource(project) {
  const usesAnimatedSparkline = project.screens.some((screen) => screen.elements.some((element) => element.type === 'sparkline' && element.props?.mode === 'wave'));
  const lines = [
    '#include "cardputer_ui.h"',
    '#include "cardputer_ui_fonts.h"',
    ...(usesAnimatedSparkline ? ['#include "esp_timer.h"', '#include <math.h>'] : []),
    '#include <string.h>',
    '',
    'static CardputerDisplay* ui_display = nullptr;',
    '',
    'struct CardputerTransition {',
    '  CardputerScreenId from;',
    '  const char* element_id;',
    '  CardputerUiEvent event;',
    '  CardputerScreenId to;',
    '};',
    '',
    'static const CardputerTransition transitions[] = {'
  ];

  project.flow.transitions.forEach((transition) => {
    const from = project.screens.find((screen) => screen.id === transition.fromScreenId);
    const to = project.screens.find((screen) => screen.id === transition.toScreenId);
    if (!from || !to) return;
    lines.push(`  { ${screenEnum(from)}, "${escapeCpp(transition.elementId)}", ${EVENT_ENUMS[transition.trigger] ?? EVENT_ENUMS.press}, ${screenEnum(to)} },`);
  });

  lines.push('};', '');

  for (const screen of project.screens) {
    lines.push(`static void draw_${safeIdentifier(screen.slug)}() {`);
    lines.push('  if (!ui_display) return;');
    lines.push('  auto& display = *ui_display;');
    lines.push('  display.clear(CardputerDisplay::rgb565(5, 7, 11));');
    lines.push('');
    for (const element of screen.elements.filter((item) => item.visible)) lines.push(...renderElement(project, element));
    lines.push('}', '');
  }

  lines.push(
    'void cardputer_ui_init(CardputerDisplay* display) {',
    '  ui_display = display;',
    '}',
    '',
    'void cardputer_ui_draw(CardputerScreenId screen) {',
    '  switch (screen) {'
  );
  project.screens.forEach((screen) => lines.push(`    case ${screenEnum(screen)}: draw_${safeIdentifier(screen.slug)}(); break;`));
  lines.push(
    '  }',
    '}',
    '',
    'CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event) {',
    '  return cardputer_ui_handle_element_event(current, nullptr, event);',
    '}',
    '',
    'CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event) {',
    '  for (const auto& transition : transitions) {',
    '    const bool element_matches = elementId == nullptr || transition.element_id == nullptr || strcmp(transition.element_id, elementId) == 0;',
    '    if (transition.from == current && transition.event == event && element_matches) return transition.to;',
    '  }',
    '  return current;',
    '}',
    ''
  );
  return lines.join('\n');
}

function renderElement(project, element) {
  const out = [`  // ${element.name} (${element.type}) id=${element.id}`];
  const p = element.props;
  const fill = color(p.fill ?? '#000000');
  const stroke = color(p.stroke ?? p.color ?? '#ffffff');
  const textColor = color(p.color ?? '#ffffff');
  const radius = Math.round(p.radius ?? 0);

  if (element.type === 'rect') {
    out.push(`  display.fillRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${fill});`);
    out.push(`  display.drawRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${stroke});`);
  }

  if (element.type === 'roundRect' || element.type === 'button') {
    out.push(`  display.fillRoundRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${radius}, ${fill});`);
    out.push(`  display.drawRoundRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${radius}, ${stroke});`);
  }

  if (element.type === 'text' || element.type === 'button') {
    const x = p.align === 'center' ? element.x + element.w / 2 : p.align === 'right' ? element.x + element.w - 3 : element.x + 3;
    const y = element.y + element.h / 2;
    const font = fontSymbolForElement(project, element);
    if (font) {
      out.push(`  drawGeneratedText(display, &${font}, "${escapeCpp(p.text ?? '')}", ${n(x)}, ${n(y)}, ${textColor}, ${alignEnum(p.align)});`);
    } else {
      const scale = m5gfxTextSize(p.fontSize ?? 12);
      const text = escapeCpp(p.text ?? '');
      if (p.align === 'center') {
        out.push(`  display.drawTextCentered("${text}", ${n(x)}, ${n(y)}, ${textColor}, ${scale});`);
      } else if (p.align === 'right') {
        out.push(`  display.drawText("${text}", ${n(x)} - display.textWidth("${text}", ${scale}), ${n(y - (7 * scale) / 2)}, ${textColor}, ${scale});`);
      } else {
        out.push(`  display.drawText("${text}", ${n(x)}, ${n(y - (7 * scale) / 2)}, ${textColor}, ${scale});`);
      }
    }
  }

  if (element.type === 'line') {
    out.push(`  display.drawLine(${n(element.x)}, ${n(element.y)}, ${n(element.x + element.w)}, ${n(element.y + element.h)}, ${stroke});`);
  }

  if (element.type === 'progress') {
    const ratio = valueRatio(p.value, p.min, p.max);
    const vertical = p.orientation === 'vertical';
    const filled = Math.max(0, Math.round(((vertical ? element.h : element.w) - 4) * ratio));
    out.push(`  display.drawRoundRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${radius}, ${stroke});`);
    if (vertical) {
      out.push(`  display.fillRoundRect(${n(element.x + 2)}, ${n(element.y + element.h - 2 - filled)}, ${n(element.w - 4)}, ${filled}, ${Math.max(0, radius - 2)}, ${fill});`);
    } else {
      out.push(`  display.fillRoundRect(${n(element.x + 2)}, ${n(element.y + 2)}, ${filled}, ${n(element.h - 4)}, ${Math.max(0, radius - 2)}, ${fill});`);
    }
  }

  if (element.type === 'gauge') {
    const cx = element.x + element.w / 2;
    const cy = element.y + element.h / 2;
    const r = Math.min(element.w, element.h) / 2 - 2;
    const ratio = valueRatio(p.value, p.min, p.max);
    const angle = -140 + ratio * 280;
    const x2 = cx + Math.cos((angle * Math.PI) / 180) * (r - 5);
    const y2 = cy + Math.sin((angle * Math.PI) / 180) * (r - 5);
    out.push(`  display.drawCircle(${n(cx)}, ${n(cy)}, ${n(r)}, ${stroke});`);
    out.push(`  display.drawLine(${n(cx)}, ${n(cy)}, ${n(x2)}, ${n(y2)}, ${fill});`);
  }

  if (element.type === 'led') {
    const r = Math.min(element.w, element.h) / 2;
    out.push(`  display.fillCircle(${n(element.x + r)}, ${n(element.y + r)}, ${n(r)}, ${fill});`);
    out.push(`  display.drawCircle(${n(element.x + r)}, ${n(element.y + r)}, ${n(r)}, ${stroke});`);
  }

  if (element.type === 'icon') {
    out.push(`  display.drawText("${escapeCpp(symbolForIcon(p.icon ?? 'wifi'))}", ${n(element.x)}, ${n(element.y)}, ${textColor}, 1);`);
  }

  if (element.type === 'sparkline') {
    out.push(...renderSparklineElement(element, p, stroke, fill));
    if (p.mode === 'wave') {
      const id = safeIdentifier(element.id);
      out.push(`  const int spark_samples_${id} = ${Math.max(16, Math.min(64, Math.round(element.w / 4)))};`);
      out.push(`  const float spark_t_${id} = esp_timer_get_time() / 1000000.0f;`);
      out.push(`  int spark_prev_x_${id} = ${n(element.x)};`);
      out.push(`  int spark_prev_y_${id} = ${n(element.y + element.h / 2)};`);
      out.push(`  for (int i = 0; i < spark_samples_${id}; ++i) {`);
      out.push(`    const float x_ratio = spark_samples_${id} <= 1 ? 0.0f : (float)i / (float)(spark_samples_${id} - 1);`);
      out.push(`    const float sample = fminf(100.0f, fmaxf(0.0f, 50.0f + sinf(spark_t_${id} * 7.0f + x_ratio * 24.0f) * (22.0f + 18.0f * sinf(spark_t_${id} * 2.1f)) + sinf(spark_t_${id} * 18.0f + x_ratio * 53.0f) * 16.0f));`);
      out.push(`    const int x = ${n(element.x)} + (int)(x_ratio * ${n(element.w - 1)});`);
      out.push(`    const int y = ${n(element.y + element.h - 1)} - (int)((sample / 100.0f) * ${n(element.h - 1)});`);
      out.push(`    if (i > 0) display.drawLine(spark_prev_x_${id}, spark_prev_y_${id}, x, y, ${stroke});`);
      out.push(`    spark_prev_x_${id} = x;`);
      out.push(`    spark_prev_y_${id} = y;`);
      out.push('  }');
    } else {
      const points = p.points ?? [];
      for (let index = 0; index < points.length - 3; index += 2) {
        const x1 = element.x + (points[index] / 100) * element.w;
        const y1 = element.y + element.h - (points[index + 1] / 100) * element.h;
        const x2 = element.x + (points[index + 2] / 100) * element.w;
        const y2 = element.y + element.h - (points[index + 3] / 100) * element.h;
        out.push(`  display.drawLine(${n(x1)}, ${n(y1)}, ${n(x2)}, ${n(y2)}, ${stroke});`);
      }
    }
  }

  if (element.type === 'image') {
    out.push(`  display.drawRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${stroke});`);
    out.push(`  // TODO: draw bitmap asset "${escapeCpp(p.imageLabel ?? 'bitmap')}" here.`);
  }

  out.push('');
  return out;
}

function renderSparklineElement(element, props, stroke, fill) {
  const out = [];
  if (props.fill) out.push(`  display.fillRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${fill});`);
  if (props.showAxes) {
    const axis = color(props.axis ?? '#526179');
    out.push(`  display.drawRect(${n(element.x)}, ${n(element.y)}, ${n(element.w)}, ${n(element.h)}, ${axis});`);
    out.push(`  display.drawLine(${n(element.x)}, ${n(element.y + element.h / 2)}, ${n(element.x + element.w - 1)}, ${n(element.y + element.h / 2)}, ${axis});`);
    out.push(`  display.drawLine(${n(element.x + element.w / 2)}, ${n(element.y)}, ${n(element.x + element.w / 2)}, ${n(element.y + element.h - 1)}, ${axis});`);
  }
  return out;
}

async function exportFonts(project) {
  const fonts = [];
  for (const font of project.assets.fonts) {
    for (const variant of font.variants) {
      fonts.push(await renderFontVariant(font, variant));
    }
  }
  return {
    header: exportFontsHeader(fonts),
    source: exportFontsSource(fonts)
  };
}

function exportFontsHeader(fonts) {
  return [
    '#pragma once',
    '',
    '#include "../cardputer_display.h"',
    '#include <stdint.h>',
    '',
    'enum CardputerTextAlign { CARDPUTER_ALIGN_LEFT, CARDPUTER_ALIGN_CENTER, CARDPUTER_ALIGN_RIGHT };',
    '',
    'struct CardputerGeneratedGlyph { uint32_t codepoint; uint16_t offset; uint8_t width; uint8_t height; int8_t x_offset; int8_t y_offset; uint8_t x_advance; };',
    'struct CardputerGeneratedFont { const char* name; uint8_t size; const uint8_t* bitmap; uint16_t bitmap_size; const CardputerGeneratedGlyph* glyphs; uint16_t glyph_count; };',
    '',
    ...fonts.map((font) => `extern const CardputerGeneratedFont ${font.symbol};`),
    '',
    'void drawGeneratedText(CardputerDisplay& display, const CardputerGeneratedFont* font, const char* text, int x, int y, uint16_t color, CardputerTextAlign align);',
    ''
  ].join('\n');
}

function exportFontsSource(fonts) {
  const lines = [
    '#include "cardputer_ui_fonts.h"',
    '',
    'static const CardputerGeneratedGlyph* find_glyph(const CardputerGeneratedFont* font, uint32_t codepoint) {',
    '  if (!font) return nullptr;',
    '  for (uint16_t i = 0; i < font->glyph_count; ++i) if (font->glyphs[i].codepoint == codepoint) return &font->glyphs[i];',
    '  return nullptr;',
    '}',
    '',
    'static uint32_t read_utf8_codepoint(const unsigned char*& p) {',
    '  uint32_t c = *p++;',
    '  if ((c & 0x80) == 0) return c;',
    '  if ((c & 0xE0) == 0xC0 && *p) return ((c & 0x1F) << 6) | (*p++ & 0x3F);',
    '  if ((c & 0xF0) == 0xE0 && p[0] && p[1]) { uint32_t c1 = *p++; uint32_t c2 = *p++; return ((c & 0x0F) << 12) | ((c1 & 0x3F) << 6) | (c2 & 0x3F); }',
    '  if ((c & 0xF8) == 0xF0 && p[0] && p[1] && p[2]) { uint32_t c1 = *p++; uint32_t c2 = *p++; uint32_t c3 = *p++; return ((c & 0x07) << 18) | ((c1 & 0x3F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F); }',
    '  return c;',
    '}',
    '',
    'static int measure_text(const CardputerGeneratedFont* font, const char* text) {',
    '  int width = 0;',
    '  const unsigned char* p = reinterpret_cast<const unsigned char*>(text);',
    '  while (*p) {',
    '    const CardputerGeneratedGlyph* glyph = find_glyph(font, read_utf8_codepoint(p));',
    '    width += glyph ? glyph->x_advance : font->size / 2;',
    '  }',
    '  return width;',
    '}',
    '',
    'void drawGeneratedText(CardputerDisplay& display, const CardputerGeneratedFont* font, const char* text, int x, int y, uint16_t color, CardputerTextAlign align) {',
    '  if (!font || !text) return;',
    '  int cursor = x;',
    '  const int total = measure_text(font, text);',
    '  if (align == CARDPUTER_ALIGN_CENTER) cursor -= total / 2;',
    '  if (align == CARDPUTER_ALIGN_RIGHT) cursor -= total;',
    '  const int baseline = y + font->size / 3;',
    '  const unsigned char* p = reinterpret_cast<const unsigned char*>(text);',
    '  while (*p) {',
    '    const CardputerGeneratedGlyph* glyph = find_glyph(font, read_utf8_codepoint(p));',
    '    if (!glyph) { cursor += font->size / 2; continue; }',
    '    for (uint8_t gy = 0; gy < glyph->height; ++gy) {',
    '      for (uint8_t gx = 0; gx < glyph->width; ++gx) {',
    '        const uint16_t bit = gy * glyph->width + gx;',
    '        const uint8_t mask = 0x80 >> (bit & 7);',
    '        if (font->bitmap[glyph->offset + (bit >> 3)] & mask) display.drawPixel(cursor + glyph->x_offset + gx, baseline + glyph->y_offset + gy, color);',
    '      }',
    '    }',
    '    cursor += glyph->x_advance;',
    '  }',
    '}',
    ''
  ];

  fonts.forEach((font) => {
    lines.push(`static const uint8_t ${font.symbol}_bitmap[] = {`);
    lines.push(font.bitmap.length ? bytesToCppArray(font.bitmap) : '  0x00');
    lines.push('};');
    lines.push(`static const CardputerGeneratedGlyph ${font.symbol}_glyphs[] = {`);
    font.glyphs.forEach((glyph) => {
      lines.push(`  { ${glyph.codepoint}, ${glyph.offset}, ${glyph.width}, ${glyph.height}, ${glyph.xOffset}, ${glyph.yOffset}, ${glyph.xAdvance} },`);
    });
    if (!font.glyphs.length) lines.push('  { 32, 0, 0, 0, 0, 0, 4 },');
    lines.push('};');
    lines.push(`const CardputerGeneratedFont ${font.symbol} = { "${escapeCpp(font.name)}", ${font.size}, ${font.symbol}_bitmap, ${font.bitmap.length || 1}, ${font.symbol}_glyphs, ${Math.max(1, font.glyphs.length)} };`);
    lines.push('');
  });

  return lines.join('\n');
}

async function renderFontVariant(font, variant) {
  const symbol = fontSymbol(font, variant);
  const glyphs = parseGlyphSet(variant.range, variant.symbols);
  if (!('document' in globalThis) || !font.dataUrl) {
    return fallbackFont(symbol, font, variant, glyphs);
  }

  try {
    const family = `${font.family}_${variant.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const face = new FontFace(family, `url(${font.dataUrl})`);
    await face.load();
    document.fonts.add(face);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackFont(symbol, font, variant, glyphs);
    ctx.font = `${variant.size}px "${family}"`;
    ctx.textBaseline = 'alphabetic';
    const bitmap = [];
    const descriptors = [];
    for (const codepoint of glyphs) {
      const char = String.fromCodePoint(codepoint);
      const metrics = ctx.measureText(char);
      const width = Math.max(1, Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight || metrics.width || variant.size / 2));
      const height = Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || variant.size));
      canvas.width = width + 2;
      canvas.height = height + 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${variant.size}px "${family}"`;
      ctx.fillStyle = '#ffffff';
      const x = Math.ceil(metrics.actualBoundingBoxLeft || 0) + 1;
      const y = Math.ceil(metrics.actualBoundingBoxAscent || variant.size) + 1;
      ctx.fillText(char, x, y);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const offset = bitmap.length;
      let byte = 0;
      let bitCount = 0;
      for (let py = 0; py < canvas.height; py += 1) {
        for (let px = 0; px < canvas.width; px += 1) {
          const alpha = image[(py * canvas.width + px) * 4 + 3];
          if (alpha > 96) byte |= 0x80 >> bitCount;
          bitCount += 1;
          if (bitCount === 8) {
            bitmap.push(byte);
            byte = 0;
            bitCount = 0;
          }
        }
      }
      if (bitCount) bitmap.push(byte);
      descriptors.push({
        codepoint,
        offset,
        width: canvas.width,
        height: canvas.height,
        xOffset: -1,
        yOffset: -Math.ceil(metrics.actualBoundingBoxAscent || variant.size),
        xAdvance: Math.max(1, Math.ceil(metrics.width || width))
      });
    }
    return { symbol, name: `${font.name} ${variant.name}`, size: variant.size, bitmap: new Uint8Array(bitmap), glyphs: descriptors };
  } catch {
    return fallbackFont(symbol, font, variant, glyphs);
  }
}

function fallbackFont(symbol, font, variant, glyphs) {
  return {
    symbol,
    name: `${font.name} ${variant.name}`,
    size: variant.size,
    bitmap: new Uint8Array([0]),
    glyphs: glyphs.map((codepoint) => ({ codepoint, offset: 0, width: 0, height: 0, xOffset: 0, yOffset: 0, xAdvance: Math.max(1, Math.round(variant.size / 2)) }))
  };
}

function exportAssetsHeader() {
  return ['#pragma once', '', '// Bitmap/image assets generated by Cardputer UI Designer can be declared here.', ''].join('\n');
}

function exportAssetsSource() {
  return ['#include "cardputer_ui_assets.h"', '', '// No image assets are generated yet.', ''].join('\n');
}

function exportCMakeSnippet() {
  return [
    'idf_component_register(',
    '  SRCS "cardputer_ui.cpp" "cardputer_ui_assets.cpp" "cardputer_ui_fonts.cpp"',
    '  INCLUDE_DIRS "."',
    '  REQUIRES driver esp_driver_spi esp_driver_gpio esp_driver_ledc esp_driver_i2c',
    ')',
    ''
  ].join('\n');
}

function exportPlatformIoSnippet(project) {
  return [
    '#include "cardputer_display.h"',
    '#include "cardputer_ui.h"',
    '',
    `static CardputerScreenId currentScreen = ${screenEnum(project.screens.find((screen) => screen.id === project.flow.startScreenId) ?? project.screens[0])};`,
    '',
    'void setup() {',
    '  static CardputerDisplay display;',
    '  display.begin();',
    '  cardputer_ui_init(&display);',
    '  cardputer_ui_draw(currentScreen);',
    '}',
    '',
    'void loop() {',
    '  cardputer_ui_draw(currentScreen);',
    '}',
    ''
  ].join('\n');
}

function fontSymbolForElement(project, element) {
  const font = project.assets.fonts.find((item) => item.id === element.props.fontId);
  if (!font) return '';
  const variant = [...font.variants].sort((a, b) => Math.abs(a.size - (element.props.fontSize ?? a.size)) - Math.abs(b.size - (element.props.fontSize ?? b.size)))[0];
  return variant ? fontSymbol(font, variant) : '';
}

function fontSymbol(font, variant) {
  return `font_${safeIdentifier(font.name)}_${safeIdentifier(String(variant.size))}_${safeIdentifier(variant.id)}`;
}

function screenEnum(screen) {
  return `CARDPUTER_SCREEN_${safeIdentifier(screen.slug || screen.name, 'screen').toUpperCase()}`;
}

function color(hex) {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return 'CardputerDisplay::rgb565(255, 255, 255)';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `CardputerDisplay::rgb565(${r}, ${g}, ${b})`;
}

function alignEnum(align = 'left') {
  if (align === 'center') return 'CARDPUTER_ALIGN_CENTER';
  if (align === 'right') return 'CARDPUTER_ALIGN_RIGHT';
  return 'CARDPUTER_ALIGN_LEFT';
}

function bundleFiles(files) {
  return Object.entries(files).map(([name, content]) => `// ===== ${name} =====\n${content}`).join('\n');
}

function escapeCpp(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function n(value) {
  return Math.round(value);
}

function symbolForIcon(icon) {
  const map = { wifi: 'WiFi', sd: 'SD', battery: 'BAT', audio: 'AUD', imu: 'IMU' };
  return map[icon] ?? String(icon).toUpperCase();
}

function safeFilename(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cardputer-ui';
}
