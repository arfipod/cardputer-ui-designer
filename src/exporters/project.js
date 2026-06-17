import { exportM5GfxCpp } from './cpp.js';
import { exportLvglC } from './lvgl.js';

export function exportJson(doc) {
  return {
    filename: `${safeFilename(doc.meta.name)}.cardputer-ui.json`,
    mimeType: 'application/json',
    content: JSON.stringify(doc, null, 2)
  };
}

export function exportCpp(doc) {
  return {
    filename: `${safeFilename(doc.meta.name)}.generated.cpp`,
    mimeType: 'text/x-c++src',
    content: exportM5GfxCpp(doc)
  };
}

export function exportLvgl(doc) {
  return {
    filename: `${safeFilename(doc.meta.name)}.generated.lvgl.c`,
    mimeType: 'text/x-csrc',
    content: exportLvglC(doc)
  };
}

function safeFilename(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cardputer-ui';
}
