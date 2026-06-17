import {
  cardputerBitmapScale,
  cardputerBitmapTextHeight,
  cardputerBitmapTextWidth
} from './cardputerBitmapFont.js';

export function m5gfxTextSize(fontSize = 12) {
  return cardputerBitmapScale(fontSize);
}

export function m5gfxTextWidth(text = '', fontSize = 12) {
  return cardputerBitmapTextWidth(text, fontSize);
}

export function m5gfxTextHeight(fontSize = 12) {
  return cardputerBitmapTextHeight(fontSize);
}

export function m5gfxSvgFontSize(fontSize = 12) {
  return cardputerBitmapTextHeight(fontSize);
}
