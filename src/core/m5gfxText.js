export function m5gfxTextSize(fontSize = 12) {
  return Math.max(1, Math.round(Number(fontSize || 12) / 8));
}

export function m5gfxTextWidth(text = '', fontSize = 12) {
  return [...String(text)].length * 6 * m5gfxTextSize(fontSize);
}

export function m5gfxTextHeight(fontSize = 12) {
  return 8 * m5gfxTextSize(fontSize);
}

export function m5gfxSvgFontSize(fontSize = 12) {
  return 8 * m5gfxTextSize(fontSize);
}
