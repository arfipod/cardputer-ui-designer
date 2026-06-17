import { serializeProject } from '../core/storage.js';
import { exportFirmwareProject } from './firmware.js';
import { exportXmlProject } from './xml.js';

export function exportJson(project) {
  return {
    filename: `${safeFilename(project.meta.name)}.cardputer-ui.json`,
    mimeType: 'application/json',
    content: serializeProject(project)
  };
}

export async function exportFirmware(project) {
  return exportFirmwareProject(project);
}

export function exportXml(project) {
  return exportXmlProject(project);
}

function safeFilename(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cardputer-ui';
}
