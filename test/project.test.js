import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addElement,
  addFont,
  addScreen,
  addTransition,
  alignElements,
  cleanupFlow,
  createProject,
  distributeElements,
  duplicateElements,
  duplicateScreen,
  moveLayers,
  removeElements,
  removeScreen,
  updateElement
} from '../src/core/project.js';
import { createDocument } from '../src/core/document.js';
import { parseGlyphSet } from '../src/core/assets.js';
import { cardputerBitmapGlyph, cardputerBitmapScale, cardputerBitmapTextWidth } from '../src/core/cardputerBitmapFont.js';
import { m5gfxTextSize, m5gfxTextWidth } from '../src/core/m5gfxText.js';
import { parseDesignProject, serializeProject } from '../src/core/storage.js';
import { exportFirmwareProject } from '../src/exporters/firmware.js';
import { exportJson } from '../src/exporters/project.js';
import { exportXmlProject } from '../src/exporters/xml.js';
import { smartSnapMove } from '../src/canvas/snapping/snapEngine.js';
import { CAPTURE_MODE, createActionRegistry } from '../src/app/actions/actionRegistry.js';
import { registerEditorActions } from '../src/app/actions/editorActions.js';
import { createEditorStore } from '../src/app/state/editorStore.js';
import { createProjectStore } from '../src/app/state/projectStore.js';

test('creates a Cardputer project with a start screen', () => {
  const project = createProject();
  assert.equal(project.version, 3);
  assert.equal(project.device.width, 240);
  assert.equal(project.device.height, 135);
  assert.equal(project.screens.length, 1);
  assert.equal(project.flow.startScreenId, project.screens[0].id);
  assert.ok(project.screens[0].elements.length >= 4);
});

test('registers and runs dependency-free editor actions', async () => {
  const registry = createActionRegistry();
  const calls = [];
  registry.register({
    id: 'demo-action',
    label: 'Demo action',
    shortcut: 'mod+d',
    capture: CAPTURE_MODE.immediate,
    canRun: (ctx) => ctx.enabled,
    run: (ctx) => calls.push(ctx.payload.value)
  });

  assert.equal(registry.canRun('demo-action', { enabled: false }), false);
  assert.equal(await registry.run('demo-action', { enabled: false, payload: { value: 1 } }), false);
  assert.equal(await registry.run('demo-action', { enabled: true, payload: { value: 2 } }), true);
  assert.deepEqual(calls, [2]);
  assert.equal(registry.get('demo-action').shortcut, 'mod+d');
});

test('registers core layout and layer actions', () => {
  const registry = createActionRegistry();
  registerEditorActions(registry, {
    alignSelected() {},
    centerSelected() {},
    deleteSelected() {},
    distributeSelected() {},
    duplicateSelected() {},
    moveSelectedLayer() {},
    nudge() {},
    lockSelected() {},
    unlockSelected() {}
  });

  [
    'align-left',
    'align-hcenter',
    'align-right',
    'align-top',
    'align-vcenter',
    'align-bottom',
    'distribute-horizontal',
    'distribute-vertical',
    'layer-forward',
    'layer-backward',
    'layer-front',
    'layer-back',
    'lock',
    'unlock'
  ].forEach((id) => assert.ok(registry.get(id), `${id} should be registered`));
});

test('keeps project and editor state stores separate', () => {
  const project = createProject();
  const projectStore = createProjectStore({
    ...project,
    selectedElementId: 'local-selection',
    zoom: 4,
    hoveredElementId: 'local-hover'
  });
  const editorStore = createEditorStore({
    selectedScreenId: project.flow.startScreenId,
    selectedElementId: project.screens[0].elements[0].id,
    hoveredElementId: 'hovered',
    activeTool: 'button',
    zoom: 2,
    smartSnapEnabled: false
  });

  let current = projectStore.getProject();
  current = addScreen(current, 'Settings');
  projectStore.commit(current);
  assert.equal(projectStore.canUndo(), true);
  assert.equal(projectStore.undo().screens.length, 1);
  assert.equal(editorStore.getState().selectedElementId, project.screens[0].elements[0].id);
  assert.deepEqual(editorStore.getState().selectedElementIds, [project.screens[0].elements[0].id]);

  editorStore.selectElements([project.screens[0].elements[0].id, project.screens[0].elements[1].id]);
  assert.equal(editorStore.getState().selectedElementId, project.screens[0].elements[0].id);
  assert.deepEqual(editorStore.getState().selectedElementIds, [project.screens[0].elements[0].id, project.screens[0].elements[1].id]);
  editorStore.toggleElementSelection(project.screens[0].elements[0].id);
  assert.deepEqual(editorStore.getState().selectedElementIds, [project.screens[0].elements[1].id]);
  assert.equal(editorStore.getState().selectedElementId, project.screens[0].elements[1].id);

  const persisted = JSON.parse(serializeProject(projectStore.getPersistentProject()));
  assert.equal(persisted.selectedElementId, undefined);
  assert.equal(persisted.hoveredElementId, undefined);
  assert.equal(persisted.zoom, undefined);
  assert.equal(persisted.smartSnapEnabled, undefined);
  assert.equal(persisted.flow.startScreenId, project.flow.startScreenId);

  const exported = JSON.parse(exportJson(projectStore.getPersistentProject()).content);
  assert.equal(exported.activeTool, undefined);
  assert.equal(exported.selectedScreenId, undefined);
  assert.equal(editorStore.getState().smartSnapEnabled, false);
});

test('smart snapping aligns moved elements to canvas and element guides', () => {
  const moving = { id: 'moving', x: 0, y: 0, w: 20, h: 10, visible: true };
  const neighbor = { id: 'neighbor', x: 80, y: 40, w: 30, h: 20, visible: true };
  const device = { width: 240, height: 135 };

  const center = smartSnapMove({
    element: moving,
    x: 108,
    y: 20,
    device,
    elements: [moving, neighbor],
    zoom: 3
  });
  assert.equal(center.x, 110);
  assert.equal(center.y, 20);
  assert.deepEqual(center.guides.map((guide) => guide.axis), ['x']);

  const edge = smartSnapMove({
    element: moving,
    x: 58,
    y: 40,
    device,
    elements: [moving, neighbor],
    zoom: 3
  });
  assert.equal(edge.x, 60);
  assert.equal(edge.y, 40);
  assert.ok(edge.guides.some((guide) => guide.axis === 'x' && guide.value === 80));

  const elementCenter = smartSnapMove({
    element: moving,
    x: 84,
    y: 44,
    device,
    elements: [moving, neighbor],
    zoom: 3
  });
  assert.equal(elementCenter.x, 85);
  assert.equal(elementCenter.y, 45);
  assert.deepEqual(elementCenter.guides.map((guide) => guide.axis).sort(), ['x', 'y']);
});

test('smart snapping can be disabled and uses zoom-scaled distance', () => {
  const moving = { id: 'moving', x: 0, y: 0, w: 20, h: 10, visible: true };
  const device = { width: 240, height: 135 };

  assert.deepEqual(
    smartSnapMove({ element: moving, x: 108, y: 63, device, zoom: 3, enabled: false }),
    { x: 108, y: 63, guides: [] }
  );

  const lowZoom = smartSnapMove({ element: moving, x: 105, y: 0, device, zoom: 1 });
  const highZoom = smartSnapMove({ element: moving, x: 105, y: 0, device, zoom: 6 });
  assert.equal(lowZoom.x, 110);
  assert.equal(highZoom.x, 105);
});

test('captures project history by explicit mode', () => {
  const initial = createProject();
  const screenId = initial.flow.startScreenId;
  const elementId = initial.screens[0].elements[0].id;
  const originalX = initial.screens[0].elements[0].x;
  const projectStore = createProjectStore(initial);

  let current = updateElement(projectStore.getProject(), screenId, elementId, { x: originalX + 10 });
  projectStore.setProject(current, { capture: CAPTURE_MODE.ephemeral });
  current = updateElement(projectStore.getProject(), screenId, elementId, { x: originalX + 20 });
  projectStore.setProject(current, { capture: CAPTURE_MODE.ephemeral });
  const finalX = projectStore.getProject().screens[0].elements[0].x;
  assert.equal(projectStore.canUndo(), false);

  projectStore.commit(projectStore.getProject(), { capture: CAPTURE_MODE.immediate });
  assert.equal(projectStore.canUndo(), true);
  assert.equal(projectStore.undo().screens[0].elements[0].x, originalX);
  assert.equal(projectStore.redo().screens[0].elements[0].x, finalX);

  current = updateElement(projectStore.getProject(), screenId, elementId, { x: originalX + 30 });
  projectStore.replaceProject(current);
  assert.equal(projectStore.canUndo(), false);
});

test('multi-element project operations capture as one undoable change', () => {
  const initial = createProject();
  const screenId = initial.flow.startScreenId;
  const [first, second] = initial.screens[0].elements;
  const projectStore = createProjectStore(initial);

  let moved = [first, second].reduce(
    (current, element) => updateElement(current, screenId, element.id, { x: element.x + 7, y: element.y + 3 }),
    projectStore.getProject()
  );
  projectStore.commit(moved);
  assert.equal(projectStore.getProject().screens[0].elements[0].x, first.x + 7);
  assert.equal(projectStore.getProject().screens[0].elements[1].y, second.y + 3);
  assert.equal(projectStore.undo().screens[0].elements[0].x, first.x);
  assert.equal(projectStore.redo().screens[0].elements[1].y, second.y + 3);

  const beforeDuplicateCount = projectStore.getProject().screens[0].elements.length;
  projectStore.commit(duplicateElements(projectStore.getProject(), screenId, [first.id, second.id]));
  assert.equal(projectStore.getProject().screens[0].elements.length, beforeDuplicateCount + 2);
  assert.deepEqual(projectStore.getProject().screens[0].elements.slice(-2).map((element) => element.name), [`${first.name} copy`, `${second.name} copy`]);
  assert.equal(projectStore.undo().screens[0].elements.length, beforeDuplicateCount);
  projectStore.redo();

  projectStore.commit(removeElements(projectStore.getProject(), screenId, [first.id, second.id]));
  assert.equal(projectStore.getProject().screens[0].elements.some((element) => element.id === first.id), false);
  assert.equal(projectStore.getProject().screens[0].elements.some((element) => element.id === second.id), false);
  assert.equal(projectStore.undo().screens[0].elements.some((element) => element.id === first.id), true);
});

test('aligns and distributes selected elements', () => {
  let project = createProject();
  const screenId = project.flow.startScreenId;
  project = {
    ...project,
    screens: project.screens.map((screen) => screen.id === screenId
      ? {
          ...screen,
          elements: [
            { id: 'a', type: 'rect', name: 'A', x: 10, y: 10, w: 10, h: 10, visible: true, locked: false, events: {}, props: {} },
            { id: 'b', type: 'rect', name: 'B', x: 50, y: 20, w: 20, h: 20, visible: true, locked: false, events: {}, props: {} },
            { id: 'c', type: 'rect', name: 'C', x: 110, y: 30, w: 10, h: 10, visible: true, locked: false, events: {}, props: {} }
          ]
        }
      : screen)
  };

  project = alignElements(project, screenId, ['a', 'b'], 'right');
  assert.equal(project.screens[0].elements[0].x, 60);
  assert.equal(project.screens[0].elements[1].x, 50);

  project = distributeElements(project, screenId, ['a', 'b', 'c'], 'horizontal');
  assert.deepEqual(project.screens[0].elements.map((element) => element.x), [85, 50, 110]);
});

test('moves multiple layers while preserving selected order', () => {
  let project = createProject();
  const screenId = project.flow.startScreenId;
  const elements = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'rect', name: id, x: 0, y: 0, w: 1, h: 1, visible: true, locked: false, events: {}, props: {} }));
  project = {
    ...project,
    screens: project.screens.map((screen) => screen.id === screenId ? { ...screen, elements } : screen)
  };

  project = moveLayers(project, screenId, ['b', 'c'], 'forward');
  assert.deepEqual(project.screens[0].elements.map((element) => element.id), ['a', 'd', 'b', 'c']);

  project = moveLayers(project, screenId, ['b', 'c'], 'backward');
  assert.deepEqual(project.screens[0].elements.map((element) => element.id), ['a', 'b', 'c', 'd']);

  project = moveLayers(project, screenId, ['b', 'c'], 'front');
  assert.deepEqual(project.screens[0].elements.map((element) => element.id), ['a', 'd', 'b', 'c']);

  project = moveLayers(project, screenId, ['b', 'c'], 'back');
  assert.deepEqual(project.screens[0].elements.map((element) => element.id), ['b', 'c', 'a', 'd']);
});

test('normalizes missing locked flags for backward-compatible projects', () => {
  const project = createProject();
  const raw = structuredClone(project);
  delete raw.screens[0].elements[0].locked;

  const parsed = parseDesignProject(JSON.stringify(raw));
  assert.equal(parsed.screens[0].elements[0].locked, false);
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
