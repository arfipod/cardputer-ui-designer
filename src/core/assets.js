import { safeIdentifier } from './project.js';

export function createFontAsset({ name, filename, mimeType, dataUrl, size = 12, range = '0x20-0x7F', symbols = '' }) {
  const family = `cu_${safeIdentifier(name || filename || 'font')}_${shortId()}`;
  return {
    id: `font-${shortId()}`,
    name: name || filename?.replace(/\.[^.]+$/, '') || 'Font',
    family,
    filename: filename || 'font.ttf',
    mimeType: mimeType || 'font/ttf',
    dataUrl,
    variants: [
      {
        id: `font_variant-${shortId()}`,
        name: `${size}px`,
        size: Number(size) || 12,
        range: range || '0x20-0x7F',
        symbols: symbols || '',
        bpp: 1
      }
    ]
  };
}

export function parseFontSizes(value) {
  return String(value || '12')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((size) => Number.isFinite(size) && size > 0 && size <= 96);
}

export function buildFontVariants(font, sizes, range, symbols) {
  return sizes.map((size) => ({
    id: `font_variant-${shortId()}`,
    name: `${size}px`,
    size,
    range: range || '0x20-0x7F',
    symbols: symbols || '',
    bpp: 1
  }));
}

export function parseGlyphSet(range = '0x20-0x7F', symbols = '') {
  const codes = new Set();
  String(range || '')
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [startRaw, endRaw] = part.split('-');
      const start = parseCodePoint(startRaw);
      const end = parseCodePoint(endRaw ?? startRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let code = Math.min(start, end); code <= Math.max(start, end) && code <= 0x10ffff; code += 1) codes.add(code);
    });
  for (const char of String(symbols || '')) codes.add(char.codePointAt(0));
  return [...codes].sort((a, b) => a - b);
}

export function dataUrlToBytes(dataUrl) {
  const [, payload = ''] = String(dataUrl).split(',');
  if (!payload) return new Uint8Array();
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToCppArray(bytes, columns = 12) {
  const values = [...bytes].map((byte) => `0x${byte.toString(16).padStart(2, '0')}`);
  const rows = [];
  for (let index = 0; index < values.length; index += columns) rows.push(`  ${values.slice(index, index + columns).join(', ')}`);
  return rows.join(',\n');
}

function parseCodePoint(value) {
  const clean = String(value || '').trim();
  if (!clean) return NaN;
  return clean.toLowerCase().startsWith('0x') ? parseInt(clean, 16) : parseInt(clean, 10);
}

function shortId() {
  if ('crypto' in globalThis && 'randomUUID' in globalThis.crypto) return globalThis.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
