import { createProject, migrateProject } from './project.js';

const DB_NAME = 'cardputer-ui-designer';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'autosave';
const LEGACY_STORAGE_KEY = 'cardputer-ui-designer:v2';
const FALLBACK_STORAGE_KEY = 'cardputer-ui-designer:v3';

export async function saveProject(project) {
  const raw = serializeProject(project);
  try {
    const db = await openDb();
    await requestToPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(raw, PROJECT_KEY));
    return;
  } catch {
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, raw);
    } catch {
      // Autosave is best effort. Export JSON remains the reliable manual backup.
    }
  }
}

export async function loadProject() {
  try {
    const db = await openDb();
    const raw = await requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(PROJECT_KEY));
    if (raw) return parseDesignProject(raw);
  } catch {
    // Fall through to localStorage fallback.
  }

  for (const key of [FALLBACK_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      return parseDesignProject(raw);
    } catch {
      // Ignore corrupt autosaves and keep looking.
    }
  }

  return createProject();
}

export function parseDesignProject(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return migrateProject(parsed);
}

export function serializeProject(project) {
  return JSON.stringify(migrateProject(project), null, 2);
}

function openDb() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Compatibility exports for older imports.
export const saveDocument = saveProject;
export const loadDocument = loadProject;
export const parseDesignDocument = parseDesignProject;
