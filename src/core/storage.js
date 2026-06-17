import { createDocument } from './document.js';

const STORAGE_KEY = 'cardputer-ui-designer:v2';

export function saveDocument(doc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function loadDocument() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDocument();
  try {
    return parseDesignDocument(raw);
  } catch {
    return createDocument();
  }
}

export function parseDesignDocument(raw) {
  const parsed = JSON.parse(raw);
  if (parsed.version !== 2 || !Array.isArray(parsed.elements) || !parsed.device) {
    throw new Error('Unsupported Cardputer UI document');
  }
  return parsed;
}
