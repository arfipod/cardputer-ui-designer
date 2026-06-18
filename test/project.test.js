import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addElement,
  addFont,
  addScreen,
  addTransition,
  cleanupFlow,
  createProject,
  duplicateScreen,
  removeScreen,
  updateElement
} from '../src/core/project.js';
import { createDocument } from '../src/core/document.js';
import { parseGlyphSet } from '../src/core/assets.js';
import { cardputerBitmapGlyph, cardputerBitmapScale, cardputerBitmapTextWidth } from '../src/core/cardputerBitmapFont.js';
import { m5gfxTextSize, m5gfxTextWidth } from '../src/core/m5gfxText.js';
import { parseDesignProject, serializeProject } from '../src/core/storage.js';
import { exportFirmwareProject } from '../src/exporters/firmware.js';
import { exportXmlProject } from '../src/exporters/xml.js';

test('creates a Cardputer project with a start screen', () => {
  const project = createProject();
  assert.equal(project.version, 3);
  assert.equal(project.device.width, 240);
  assert.equal(project.device.height, 135);
  assert.equal(project.screens.length, 1);
  assert.equal(project.flow.startScreenId, project.screens[0].id);
  assert.ok(project.screens[0].elements.length >= 4);
});

test('migrates version 2 documents without losing elements', () => {
  const legacy = createDocument();
  const project = parseDesignProject(JSON.stringify(legacy));
  assert.equal(project.version, 3);
  assert.equal(project.screens.length, 1);
  assert.equal(project.screens[0].elements.length, legacy.elements.length);
});

test('adds, duplicates and protects screens', () => {
  let project = createProject();
  project = addScreen(project, 'Settings');
  assert.equal(project.screens.length, 2);
  project = duplicateScreen(project, project.screens[1].id);
  assert.equal(project.screens.length, 3);
  project = removeScreen(project, project.screens[0].id);
  project = removeScreen(project, project.screens[0].id);
  project = removeScreen(project, project.screens[0].id);
  assert.equal(project.screens.length, 1);
});

test('creates transitions and cleans invalid flow references', () => {
  let project = createProject();
  const from = project.screens[0].id;
  project = addScreen(project, 'Menu');
  const to = project.screens[1].id;
  project = addElement(project, from, 'button');
  const button = project.screens[0].elements.at(-1);
  project = addTransition(project, { fromScreenId: from, elementId: button.id, trigger: 'press', toScreenId: to });
  assert.equal(project.flow.transitions.length, 1);
  project = updateElement(project, from, button.id, { events: { press: 'menu' } });
  assert.equal(project.screens[0].elements.at(-1).events.press, 'menu');
  project = removeScreen(project, to);
  project = cleanupFlow(project);
  assert.equal(project.flow.transitions.length, 0);
});

test('serializes self-contained projects with font assets', () => {
  let project = createProject();
  project = addFont(project, {
    id: 'font-demo',
    name: 'Demo',
    family: 'demo',
    filename: 'demo.ttf',
    mimeType: 'font/ttf',
    dataUrl: 'data:font/ttf;base64,AA==',
    variants: [{ id: 'font_variant-demo', name: '12px', size: 12, range: '0x20-0x21', symbols: 'A', bpp: 1 }]
  });
  const parsed = parseDesignProject(serializeProject(project));
  assert.equal(parsed.assets.fonts[0].dataUrl, 'data:font/ttf;base64,AA==');
  assert.equal(parsed.assets.fonts[0].variants[0].range, '0x20-0x21');
});

test('parses glyph ranges and symbols', () => {
  assert.deepEqual(parseGlyphSet('0x20-0x22', 'A'), [0x20, 0x21, 0x22, 0x41]);
});

test('matches firmware bitmap text sizing', () => {
  assert.equal(cardputerBitmapScale(13), 2);
  assert.equal(cardputerBitmapTextWidth('MENU', 13), 48);
  assert.equal(cardputerBitmapTextWidth('pocketsynth v_0.1', 13), 204);
  assert.deepEqual(cardputerBitmapGlyph('A'), [0x7e, 0x11, 0x11, 0x11, 0x7e]);
  assert.equal(m5gfxTextSize(13), cardputerBitmapScale(13));
  assert.equal(m5gfxTextWidth('MENU', 13), cardputerBitmapTextWidth('MENU', 13));
});

test('exports multi-screen vanilla firmware and LVGL-style XML', async () => {
  let project = createProject();
  project = addScreen(project, 'Settings');
  project = addTransition(project, {
    fromScreenId: project.screens[0].id,
    elementId: project.screens[0].elements.at(-1).id,
    trigger: 'press',
    toScreenId: project.screens[1].id
  });
  const firmware = await exportFirmwareProject(project);
  const xml = exportXmlProject(project);
  assert.match(firmware.files['cardputer_ui.h'], /enum CardputerScreenId/);
  assert.doesNotMatch(firmware.files['cardputer_ui.h'], /M5GFX|LGFX/);
  assert.match(firmware.files['cardputer_ui.cpp'], /CardputerTransition/);
  assert.match(firmware.files['cardputer_ui.cpp'], /esp_timer_get_time/);
  assert.match(firmware.files['cardputer_ui.cpp'], /display\.clear\(CardputerDisplay::rgb565\(5, 7, 11\)\)/);
  assert.match(firmware.files['cardputer_ui.cpp'], /drawRect\(20, 70, 196, 16/);
  assert.match(xml.files['project.xml'], /cu:flow/);
  assert.ok(xml.files['screens/main.xml']);
});

test('exports rotated progress bars as vertical fill', async () => {
  let project = createProject();
  project = updateElement(project, project.screens[0].id, 'battery-1', { w: 14, h: 72, props: { orientation: 'vertical', value: 50 } });
  const firmware = await exportFirmwareProject(project);
  assert.match(firmware.files['cardputer_ui.cpp'], /fillRoundRect\(22, 88, 10, 34/);
});
