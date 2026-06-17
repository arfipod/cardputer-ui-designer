import { parseGlyphSet } from '../core/assets.js';
import { safeIdentifier } from '../core/project.js';

export function fontExportName(font, variant) {
  return `font_${safeIdentifier(font.name)}_${safeIdentifier(String(variant.size))}_${safeIdentifier(variant.id)}`;
}

export function fontGlyphSummary(font) {
  return font.variants.map((variant) => ({
    fontId: font.id,
    variantId: variant.id,
    symbol: fontExportName(font, variant),
    size: variant.size,
    glyphs: parseGlyphSet(variant.range, variant.symbols)
  }));
}
