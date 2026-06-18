import {
  DEVICE_PRESETS,
  EVENT_TRIGGERS,
  addElement,
  addFont,
  addScreen,
  addTransition,
  cleanupFlow,
  createProject,
  duplicateElement,
  duplicateScreen,
  getElement,
  getScreen,
  moveLayer,
  removeElement,
  removeFont,
  removeScreen,
  removeTransition,
  setDevice,
  updateElement,
  updateFont,
  updateGrid,
  updateScreen
} from './core/project.js';
import { buildFontVariants, createFontAsset, parseFontSizes } from './core/assets.js';
import { cardputerBitmapScale, drawCardputerBitmapTextSvg } from './core/cardputerBitmapFont.js';
import { clamp, snap, svgPoint, valueRatio } from './core/geometry.js';
import { loadProject, parseDesignProject, saveProject } from './core/storage.js';
import { exportFirmware, exportJson, exportXml } from './exporters/project.js';
import { importXmlProject } from './exporters/xml.js';
import { createActionRegistry } from './app/actions/actionRegistry.js';
import { registerEditorActions } from './app/actions/editorActions.js';
import { runKeyboardShortcut } from './app/actions/keyboardShortcuts.js';
import { createEditorStore } from './app/state/editorStore.js';
import { CAPTURE_MODE } from './app/state/history.js';
import { createProjectStore, firstElementId } from './app/state/projectStore.js';
import { activeScreen as selectActiveScreen, selectedElement as selectSelectedElement, selectedScreenExists } from './app/state/selectors.js';

const ELEMENTS = [
  ['text', 'Text'],
  ['button', 'Button'],
  ['roundRect', 'Panel'],
  ['rect', 'Rect'],
  ['line', 'Line'],
  ['progress', 'Progress'],
  ['gauge', 'Gauge'],
  ['led', 'LED'],
  ['icon', 'Icon'],
  ['sparkline', 'Sparkline'],
  ['image', 'Image']
];

const projectStore = createProjectStore();
const editorStore = createEditorStore({ selectedScreenId: projectStore.getProject().flow.startScreenId });
const editorState = editorStore.getState();
let project = projectStore.getProject();
let lastBundle = null;
let lastPreviewAnimationMs = 0;
const loadedFonts = new Set();
const actions = createActionRegistry();

const app = document.querySelector('#app');
if (!app) throw new Error('Missing #app');

registerEditorActions(actions, createEditorCommands());
boot();

async function boot() {
  project = projectStore.replaceProject(await loadProject());
  editorStore.selectScreen(project.flow.startScreenId, firstElementId(project, project.flow.startScreenId));
  await registerProjectFonts(project);
  mount();
  bindEvents();
  render();
  requestAnimationFrame(previewAnimationLoop);
}

function mount() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <img src="./public/cardputer-icon.svg" alt="" />
          <div>
            <strong>Cardputer UI Designer</strong>
          </div>
        </div>
        <div class="actions">
          <button data-action="undo">Undo</button>
          <button data-action="redo">Redo</button>
          <button data-action="export-json">Export JSON</button>
          <button data-action="export-xml">LVGL XML</button>
          <button data-action="export-firmware">Firmware Bundle</button>
          <button data-action="firmware-build">Build Board</button>
          <button data-action="firmware-flash">Upload Board</button>
          <button data-action="export-png">Export PNG</button>
          <label class="file-button">Import <input id="import-file" type="file" accept="application/json,.json,.xml,.txt" /></label>
        </div>
      </header>

      <aside class="left-panel">
        <section>
          <h2>Screens</h2>
          <div class="mini-actions">
            <button data-action="screen-add">Add</button>
            <button data-action="screen-duplicate">Duplicate</button>
            <button data-action="screen-delete">Delete</button>
            <button data-action="screen-start">Set start</button>
          </div>
          <div id="screens" class="stack-list"></div>
        </section>
        <section>
          <h2>Elements</h2>
          <div class="tool-grid">${ELEMENTS.map(([type, label]) => `<button data-tool="${type}">${label}</button>`).join('')}</div>
        </section>
        <section>
          <h2>Device</h2>
          <label class="field">Preset
            <select id="device-preset">${DEVICE_PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join('')}</select>
          </label>
          <p class="muted" id="device-notes"></p>
        </section>
        <section>
          <h2>Flow</h2>
          <div class="mini-actions">
            <button data-action="flow-add">Add from selected</button>
            <button data-action="flow-delete">Delete transition</button>
          </div>
          <div id="flow" class="stack-list"></div>
        </section>
        <section>
          <h2>Layers</h2>
          <div class="layer-actions">
            <button data-action="layer-up">Up</button>
            <button data-action="layer-down">Down</button>
            <button data-action="layer-front">Front</button>
            <button data-action="layer-back">Back</button>
          </div>
          <div id="layers" class="layers"></div>
        </section>
      </aside>

      <main class="workspace">
        <div class="canvas-toolbar">
          <label>Zoom <input id="zoom" type="range" min="1" max="6" step="0.25" /></label>
          <label>Grid <input id="grid-enabled" type="checkbox" /></label>
          <label>Snap <input id="snap-enabled" type="checkbox" /></label>
          <label>Grid size <input id="grid-size" type="number" min="1" max="24" /></label>
          <button data-action="center-stage">Center stage</button>
          <button data-action="center">Center selected</button>
          <button data-action="duplicate">Duplicate</button>
          <button data-action="delete">Delete</button>
          <button data-action="reset">New</button>
        </div>
        <div class="stage-wrap" id="stage-wrap">
          <svg id="stage" role="img" aria-label="Cardputer screen editor"></svg>
        </div>
        <div id="context-menu" class="context-menu" hidden></div>
      </main>

      <aside class="right-panel">
        <section>
          <h2>Project</h2>
          <label class="field">Name <input id="project-name" type="text" /></label>
          <label class="field">Active screen <input id="screen-name" type="text" /></label>
        </section>
        <section>
          <h2>Inspector</h2>
          <div id="inspector" class="inspector"></div>
        </section>
        <section>
          <h2>Fonts</h2>
          <div class="font-upload">
            <label class="field">Sizes <input id="font-sizes" type="text" value="12, 16, 20" /></label>
            <label class="field">Range <input id="font-range" type="text" value="0x20-0x7F" /></label>
            <label class="field">Extra symbols <input id="font-symbols" type="text" /></label>
            <label class="file-button">Upload TTF <input id="font-file" type="file" accept=".ttf,font/ttf,font/otf,.otf" /></label>
          </div>
          <div id="fonts" class="stack-list"></div>
        </section>
        <section>
          <h2>Output</h2>
          <p class="muted firmware-status" id="firmware-status">Local board actions use the dev server and PlatformIO.</p>
          <details class="firmware-terminal" id="firmware-terminal">
            <summary>
              <span>Firmware terminal</span>
              <em id="firmware-terminal-state">Idle</em>
            </summary>
            <pre id="firmware-log" aria-live="polite">No firmware logs yet.</pre>
            <div class="output-actions">
              <button data-action="copy-terminal">Copy log</button>
              <button data-action="clear-terminal">Clear log</button>
            </div>
          </details>
          <textarea id="output" spellcheck="false" placeholder="Generated code, XML or JSON appears here"></textarea>
          <div class="output-actions">
            <button data-action="copy-output">Copy</button>
            <button data-action="download-output">Download</button>
          </div>
        </section>
      </aside>
    </div>
  `;
}

function bindEvents() {
  app.addEventListener('click', async (event) => {
    const target = event.target;
    const tool = target.closest?.('[data-tool]')?.dataset.tool;
    const action = target.closest?.('[data-action]')?.dataset.action;

    if (tool) {
      editorStore.setActiveTool(tool);
      await actions.run('element-add', createActionContext({ type: tool }));
      editorStore.setActiveTool(null);
    }

    if (action) await actions.run(action, createActionContext());
  });

  query('#project-name').addEventListener('change', (event) => {
    commit({ ...project, meta: { ...project.meta, name: event.target.value, updatedAt: new Date().toISOString() } });
    render();
  });

  query('#screen-name').addEventListener('change', (event) => {
    commit(updateScreen(project, editorState.selectedScreenId, { name: event.target.value }));
    render();
  });

  query('#zoom').addEventListener('input', (event) => {
    void actions.run('zoom-set', createActionContext({ zoom: Number(event.target.value) }));
  });

  query('#grid-enabled').addEventListener('change', (event) => {
    void actions.run('grid-enabled-set', createActionContext({ enabled: event.target.checked }));
  });

  query('#snap-enabled').addEventListener('change', (event) => {
    void actions.run('grid-snap-set', createActionContext({ snap: event.target.checked }));
  });

  query('#grid-size').addEventListener('change', (event) => {
    void actions.run('grid-size-set', createActionContext({ size: Number(event.target.value) }));
  });

  query('#device-preset').addEventListener('change', (event) => {
    void actions.run('device-set', createActionContext({ deviceId: event.target.value }));
  });

  query('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await actions.run('project-import', createActionContext({ file }));
    event.target.value = '';
  });

  query('#font-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const sizes = parseFontSizes(query('#font-sizes').value);
    const font = createFontAsset({
      name: file.name.replace(/\.[^.]+$/, ''),
      filename: file.name,
      mimeType: file.type || 'font/ttf',
      dataUrl: await readFileAsDataUrl(file),
      size: sizes[0] ?? 12,
      range: query('#font-range').value,
      symbols: query('#font-symbols').value
    });
    font.variants = buildFontVariants(font, sizes.length ? sizes : [12], query('#font-range').value, query('#font-symbols').value);
    commit(addFont(project, font));
    editorState.selectedAssetId = font.id;
    await registerProjectFonts(project);
    render();
    event.target.value = '';
  });

  const stage = query('#stage');
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', finishDrag);
  stage.addEventListener('pointercancel', finishDrag);
  stage.addEventListener('pointerout', () => editorStore.setHoveredElement(null));
  stage.addEventListener('contextmenu', onStageContextMenu);
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (event) => {
    if (!stage.contains(event.target) && !query('#context-menu').contains(event.target)) hideContextMenu();
  });

  document.addEventListener('keydown', (event) => {
    void runKeyboardShortcut(event, actions, createActionContext());
  });
}

function createEditorCommands() {
  return {
    addElement: addNewElement,
    addScreen: addNewScreen,
    addTransitionFromSelected,
    centerSelected,
    centerStage: centerStageInViewport,
    clearTerminal: clearFirmwareTerminal,
    copyOutput: () => navigator.clipboard.writeText(query('#output').value),
    copyTerminal: () => navigator.clipboard.writeText(query('#firmware-log').textContent ?? ''),
    deleteScreen: deleteActiveScreen,
    deleteSelected,
    deleteSelectedAsset,
    deleteSelectedTransition,
    downloadOutput: () => lastBundle && downloadText(lastBundle),
    duplicateScreen: duplicateActiveScreen,
    duplicateSelected,
    exportFirmware: async () => showBundle(await exportFirmware(projectStore.getPersistentProject())),
    exportJson: () => showBundle(exportJson(projectStore.getPersistentProject())),
    exportPng,
    exportXml: () => showBundle(exportXml(projectStore.getPersistentProject())),
    importProject,
    moveSelectedLayer,
    nudge,
    redo,
    resetProject,
    runFirmware: runFirmwareAction,
    setDevice: setDevicePreset,
    setGridEnabled,
    setGridSize,
    setGridSnap,
    setStartScreen,
    setZoom,
    undo
  };
}

function createActionContext(payload) {
  return {
    payload,
    canDeleteScreen: () => project.screens.length > 1,
    canRedo: () => projectStore.canRedo(),
    canUndo: () => projectStore.canUndo(),
    hasBundle: () => Boolean(lastBundle),
    hasSelectedAsset: () => Boolean(editorState.selectedAssetId),
    hasSelection: () => Boolean(editorState.selectedElementId),
    hasTransition: () => Boolean(editorState.selectedTransitionId)
  };
}

function render() {
  void saveProject(projectStore.getPersistentProject());
  query('#project-name').value = project.meta.name;
  query('#screen-name').value = activeScreen().name;
  query('#zoom').value = String(editorState.zoom);
  query('#grid-enabled').checked = project.grid.enabled;
  query('#snap-enabled').checked = project.grid.snap;
  query('#grid-size').value = String(project.grid.size);
  query('#device-preset').value = project.device.id;
  query('#device-notes').textContent = `${project.device.width} x ${project.device.height}px. ${project.device.colorDepth}. ${project.device.notes}`;
  renderScreens();
  renderFlow();
  renderStage();
  renderLayers();
  renderInspector();
  renderFonts();
}

function renderScreens() {
  const screens = query('#screens');
  clear(screens);
  project.screens.forEach((screen) => {
    const row = document.createElement('button');
    row.className = `stack-row ${screen.id === editorState.selectedScreenId ? 'active' : ''}`;
    row.innerHTML = `<strong>${escapeHtml(screen.name)}</strong><em>${screen.slug}${project.flow.startScreenId === screen.id ? ' / start' : ''}</em>`;
    row.addEventListener('click', () => {
      editorState.selectedScreenId = screen.id;
      editorState.selectedElementId = screen.elements.at(-1)?.id ?? null;
      editorState.selectedTransitionId = null;
      editorState.shouldCenterStage = true;
      render();
    });
    screens.append(row);
  });
}

function renderFlow() {
  const flow = query('#flow');
  clear(flow);
  if (!project.flow.transitions.length) {
    flow.innerHTML = '<p class="muted">No transitions yet. Select an element and add one.</p>';
    return;
  }
  project.flow.transitions.forEach((transition) => {
    const from = getScreen(project, transition.fromScreenId);
    const to = getScreen(project, transition.toScreenId);
    const element = getElement(project, transition.fromScreenId, transition.elementId);
    const row = document.createElement('button');
    row.className = `stack-row ${transition.id === editorState.selectedTransitionId ? 'active' : ''}`;
    row.innerHTML = `<strong>${escapeHtml(from?.name ?? '?')} -> ${escapeHtml(to?.name ?? '?')}</strong><em>${escapeHtml(element?.name ?? transition.elementId)} / ${transition.trigger}</em>`;
    row.addEventListener('click', () => {
      editorState.selectedTransitionId = transition.id;
      editorState.selectedScreenId = transition.fromScreenId;
      editorState.selectedElementId = transition.elementId;
      render();
    });
    flow.append(row);
  });
}

function renderStage() {
  const stage = query('#stage');
  const stageViewportSize = `${project.device.width}x${project.device.height}@${editorState.zoom}`;
  const viewportChanged = stageViewportSize !== editorState.lastStageViewportSize;
  editorState.lastStageViewportSize = stageViewportSize;
  stage.setAttribute('viewBox', `0 0 ${project.device.width} ${project.device.height}`);
  stage.style.width = `${project.device.width * editorState.zoom}px`;
  stage.style.height = `${project.device.height * editorState.zoom}px`;
  clear(stage);
  stage.append(svg('rect', { x: 0, y: 0, width: project.device.width, height: project.device.height, fill: '#05070b' }));
  if (project.grid.enabled) drawGrid(stage);
  for (const element of activeScreen().elements) {
    if (element.visible) stage.append(renderElementSvg(element));
  }
  const selected = getSelected();
  if (selected) stage.append(renderSelection(selected));
  if (editorState.shouldCenterStage || viewportChanged) {
    editorState.shouldCenterStage = false;
    requestAnimationFrame(centerStageInViewport);
  }
}

function drawGrid(stage) {
  const group = svg('g', { class: 'grid' });
  for (let x = project.grid.size; x < project.device.width; x += project.grid.size) group.append(svg('line', { x1: x, y1: 0, x2: x, y2: project.device.height }));
  for (let y = project.grid.size; y < project.device.height; y += project.grid.size) group.append(svg('line', { x1: 0, y1: y, x2: project.device.width, y2: y }));
  stage.append(group);
}

function renderElementSvg(element) {
  const group = svg('g', { class: `element element-${element.type}`, 'data-id': element.id });
  const p = element.props;

  if (element.type === 'rect') group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: p.fill, stroke: p.stroke }));
  if (element.type === 'roundRect' || element.type === 'button') {
    group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, rx: p.radius ?? 0, fill: p.fill, stroke: p.stroke }));
  }
  if (element.type === 'text' || element.type === 'button') {
    const firmwareText = !p.fontId;
    const textValue = p.text ?? '';
    if (firmwareText) {
      const scaleText = p.align === 'center'
        ? { x: Math.round(element.x + element.w / 2), y: Math.round(element.y + element.h / 2), align: 'center', firmwareCenter: true }
        : { x: textX(element), y: Math.round(element.y + element.h / 2 - (7 * cardputerBitmapScale(p.fontSize ?? 12)) / 2), align: p.align ?? 'left' };
      drawCardputerBitmapTextSvg(group, svg, {
        text: textValue,
        x: scaleText.x,
        y: scaleText.y,
        color: p.color ?? '#ffffff',
        fontSize: p.fontSize ?? 12,
        align: scaleText.align,
        firmwareCenter: scaleText.firmwareCenter
      });
    } else {
      const text = svg('text', {
        x: textX(element),
        y: element.y + element.h / 2,
        fill: p.color ?? '#ffffff',
        'font-size': p.fontSize ?? 12,
        'font-family': fontFamily(p.fontId),
        'text-anchor': anchor(p.align),
        'dominant-baseline': 'middle'
      });
      text.textContent = textValue;
      group.append(text);
    }
  }
  if (element.type === 'line') {
    group.append(svg('line', { x1: element.x, y1: element.y, x2: element.x + element.w, y2: element.y + element.h, stroke: p.stroke, 'stroke-width': p.thickness ?? 1 }));
  }
  if (element.type === 'progress') {
    const ratio = valueRatio(p.value, p.min, p.max);
    group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, rx: p.radius ?? 0, fill: 'transparent', stroke: p.stroke }));
    if (p.orientation === 'vertical') {
      const filled = Math.max(0, (element.h - 4) * ratio);
      group.append(svg('rect', { x: element.x + 2, y: element.y + element.h - 2 - filled, width: Math.max(1, element.w - 4), height: filled, rx: Math.max(0, (p.radius ?? 0) - 2), fill: p.fill }));
    } else {
      group.append(svg('rect', { x: element.x + 2, y: element.y + 2, width: Math.max(0, (element.w - 4) * ratio), height: Math.max(1, element.h - 4), rx: Math.max(0, (p.radius ?? 0) - 2), fill: p.fill }));
    }
  }
  if (element.type === 'gauge') {
    const cx = element.x + element.w / 2;
    const cy = element.y + element.h / 2;
    const r = Math.min(element.w, element.h) / 2 - 3;
    const ratio = valueRatio(p.value, p.min, p.max);
    const angle = -140 + ratio * 280;
    group.append(svg('circle', { cx, cy, r, fill: 'transparent', stroke: p.stroke, 'stroke-width': p.thickness ?? 4 }));
    group.append(svg('line', { x1: cx, y1: cy, x2: cx + Math.cos((angle * Math.PI) / 180) * (r - 5), y2: cy + Math.sin((angle * Math.PI) / 180) * (r - 5), stroke: p.fill, 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
  if (element.type === 'led') {
    const r = Math.min(element.w, element.h) / 2;
    group.append(svg('circle', { cx: element.x + r, cy: element.y + r, r, fill: p.fill, stroke: p.stroke }));
  }
  if (element.type === 'icon') {
    const text = svg('text', { x: element.x + element.w / 2, y: element.y + element.h / 2, fill: p.color, 'font-size': Math.min(element.w, element.h), 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    text.textContent = iconGlyph(p.icon ?? 'wifi');
    group.append(text);
  }
  if (element.type === 'sparkline') {
    const points = sparklinePreviewPoints(element);
    const coords = [];
    group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: p.fill ?? 'transparent' }));
    if (p.showAxes) {
      const axis = p.axis ?? '#526179';
      group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: 'transparent', stroke: axis, 'stroke-width': 1 }));
      group.append(svg('line', { x1: element.x, y1: element.y + element.h / 2, x2: element.x + element.w, y2: element.y + element.h / 2, stroke: axis, 'stroke-width': 0.75 }));
      group.append(svg('line', { x1: element.x + element.w / 2, y1: element.y, x2: element.x + element.w / 2, y2: element.y + element.h, stroke: axis, 'stroke-width': 0.75 }));
    }
    for (let index = 0; index < points.length - 1; index += 2) coords.push(`${element.x + (points[index] / 100) * element.w},${element.y + element.h - (points[index + 1] / 100) * element.h}`);
    group.append(svg('polyline', { points: coords.join(' '), fill: 'none', stroke: p.stroke, 'stroke-width': p.thickness ?? 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  if (element.type === 'image') {
    group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: p.fill, stroke: p.stroke, 'stroke-dasharray': '3 2' }));
    const text = svg('text', { x: element.x + element.w / 2, y: element.y + element.h / 2, fill: p.color, 'font-size': 8, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    text.textContent = p.imageLabel ?? 'bitmap';
    group.append(text);
  }
  return group;
}

function renderSelection(element) {
  const group = svg('g', { class: 'selection' });
  group.append(svg('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: 'transparent', stroke: '#ffffff', 'stroke-dasharray': '3 2' }));
  [
    ['resize-nw', element.x, element.y],
    ['resize-ne', element.x + element.w, element.y],
    ['resize-sw', element.x, element.y + element.h],
    ['resize-se', element.x + element.w, element.y + element.h]
  ].forEach(([mode, x, y]) => group.append(svg('rect', { x: x - 2.5, y: y - 2.5, width: 5, height: 5, class: 'handle', 'data-id': element.id, 'data-mode': mode })));
  return group;
}

function sparklinePreviewPoints(element) {
  const p = element.props;
  if (p.mode !== 'wave') return p.points ?? [];

  const now = performance.now() / 1000;
  const samples = Math.max(16, Math.min(64, Math.round(element.w / 4)));
  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const xRatio = samples <= 1 ? 0 : i / (samples - 1);
    const value = clamp(
      50 +
        Math.sin(now * 7 + xRatio * 24) * (22 + 18 * Math.sin(now * 2.1)) +
        Math.sin(now * 18 + xRatio * 53) * 16,
      0,
      100
    );
    points.push(xRatio * 100, value);
  }
  return points;
}

function previewAnimationLoop(nowMs) {
  if (nowMs - lastPreviewAnimationMs > 40 && activeScreen().elements.some((element) => element.visible && element.type === 'sparkline' && element.props.mode === 'wave')) {
    lastPreviewAnimationMs = nowMs;
    renderStage();
  }
  requestAnimationFrame(previewAnimationLoop);
}

function renderLayers() {
  const layers = query('#layers');
  clear(layers);
  [...activeScreen().elements].reverse().forEach((element) => {
    const row = document.createElement('button');
    row.className = `layer ${element.id === editorState.selectedElementId ? 'active' : ''}`;
    row.innerHTML = `<span>${element.visible ? '*' : '-'}</span><strong>${escapeHtml(element.name)}</strong><em>${element.type}</em>`;
    row.addEventListener('click', () => {
      editorState.selectedElementId = element.id;
      render();
    });
    layers.append(row);
  });
}

function renderInspector() {
  const inspector = query('#inspector');
  const element = getSelected();
  clear(inspector);
  if (!element) {
    inspector.innerHTML = '<p class="muted">Select an element to edit its properties.</p>';
    return;
  }
  inspector.append(
    inputField('Name', 'text', element.name, (value) => change({ name: value })),
    inputField('X', 'number', element.x, (value) => change({ x: Number(value) })),
    inputField('Y', 'number', element.y, (value) => change({ y: Number(value) })),
    inputField('W', 'number', element.w, (value) => change({ w: Number(value) })),
    inputField('H', 'number', element.h, (value) => change({ h: Number(value) })),
    checkboxField('Visible', element.visible, (checked) => change({ visible: checked })),
    checkboxField('Locked', element.locked, (checked) => change({ locked: checked }))
  );
  if ('text' in element.props) inspector.append(inputField('Text', 'text', element.props.text ?? '', (value) => changeProp('text', value)));
  if ('fontSize' in element.props) inspector.append(inputField('Font size', 'number', element.props.fontSize ?? 12, (value) => changeProp('fontSize', Number(value))));
  if ('fontId' in element.props) inspector.append(selectField('Font', [['', 'System'], ...project.assets.fonts.map((font) => [font.id, font.name])], element.props.fontId ?? '', (value) => changeProp('fontId', value)));
  if ('value' in element.props) inspector.append(inputField('Value', 'number', element.props.value ?? 0, (value) => changeProp('value', Number(value))));
  if ('min' in element.props) inspector.append(inputField('Min', 'number', element.props.min ?? 0, (value) => changeProp('min', Number(value))));
  if ('max' in element.props) inspector.append(inputField('Max', 'number', element.props.max ?? 100, (value) => changeProp('max', Number(value))));
  if ('radius' in element.props) inspector.append(inputField('Radius', 'number', element.props.radius ?? 0, (value) => changeProp('radius', Number(value))));
  if ('thickness' in element.props) inspector.append(inputField('Thickness', 'number', element.props.thickness ?? 1, (value) => changeProp('thickness', Number(value))));
  if ('orientation' in element.props) inspector.append(selectField('Orientation', [['horizontal', 'Horizontal'], ['vertical', 'Vertical 90deg']], element.props.orientation ?? 'horizontal', (value) => changeProp('orientation', value)));
  if ('mode' in element.props) inspector.append(selectField('Mode', [['static', 'Static points'], ['wave', 'Animated wave']], element.props.mode ?? 'static', (value) => changeProp('mode', value)));
  if ('showAxes' in element.props) inspector.append(checkboxField('Show axes', element.props.showAxes, (checked) => changeProp('showAxes', checked)));
  if ('fill' in element.props) inspector.append(colorField('Component color', element.props.fill ?? '#000000', (value) => changeProp('fill', value)));
  if ('stroke' in element.props) inspector.append(colorField('Border / line color', element.props.stroke ?? '#ffffff', (value) => changeProp('stroke', value)));
  if ('axis' in element.props) inspector.append(colorField('Axis color', element.props.axis ?? '#526179', (value) => changeProp('axis', value)));
  if ('color' in element.props) inspector.append(colorField(element.type === 'icon' ? 'Icon color' : 'Text color', element.props.color ?? '#ffffff', (value) => changeProp('color', value)));
  if ('icon' in element.props) inspector.append(selectField('Icon', ['wifi', 'sd', 'battery', 'audio', 'imu'], element.props.icon ?? 'wifi', (value) => changeProp('icon', value)));
  if ('align' in element.props) inspector.append(selectField('Align', ['left', 'center', 'right'], element.props.align ?? 'left', (value) => changeProp('align', value)));
  if ('imageLabel' in element.props) inspector.append(inputField('Image label', 'text', element.props.imageLabel ?? '', (value) => changeProp('imageLabel', value)));
  if ('points' in element.props) inspector.append(inputField('Points', 'text', (element.props.points ?? []).join(', '), (value) => changeProp('points', value.split(',').map((part) => Number(part.trim())).filter(Number.isFinite))));

  const eventsTitle = document.createElement('h2');
  eventsTitle.textContent = 'Events';
  inspector.append(eventsTitle);
  EVENT_TRIGGERS.forEach((trigger) => {
    const existing = project.flow.transitions.find((transition) => transition.fromScreenId === editorState.selectedScreenId && transition.elementId === element.id && transition.trigger === trigger);
    inspector.append(selectField(trigger, [['', 'None'], ...project.screens.filter((screen) => screen.id !== editorState.selectedScreenId).map((screen) => [screen.id, screen.name])], existing?.toScreenId ?? '', (value) => setElementEvent(element, trigger, value)));
  });

  function change(patch) {
    commit(updateElement(project, editorState.selectedScreenId, element.id, patch));
    editorState.selectedElementId = element.id;
    render();
  }
  function changeProp(key, value) {
    commit(updateElement(project, editorState.selectedScreenId, element.id, { props: { [key]: value } }));
    editorState.selectedElementId = element.id;
    render();
  }
}

function renderFonts() {
  const fonts = query('#fonts');
  clear(fonts);
  if (!project.assets.fonts.length) {
    fonts.innerHTML = '<p class="muted">Upload a TTF to preview and export bitmap font variants.</p>';
    return;
  }
  project.assets.fonts.forEach((font) => {
    const row = document.createElement('div');
    row.className = `asset-row ${font.id === editorState.selectedAssetId ? 'active' : ''}`;
    row.innerHTML = `
      <button data-font-id="${font.id}"><strong>${escapeHtml(font.name)}</strong><em>${font.variants.map((variant) => `${variant.size}px`).join(', ')}</em></button>
      <button data-action="asset-delete">Delete</button>
    `;
    row.querySelector('[data-font-id]').addEventListener('click', () => {
      editorState.selectedAssetId = font.id;
      render();
    });
    row.querySelector('[data-action="asset-delete"]').addEventListener('click', () => {
      editorState.selectedAssetId = font.id;
    });
    const firstVariant = font.variants[0];
    row.append(
      inputField('Sizes', 'text', font.variants.map((variant) => variant.size).join(', '), (value) => {
        const sizes = parseFontSizes(value);
        if (!sizes.length) return;
        commit(updateFont(project, font.id, { variants: buildFontVariants(font, sizes, firstVariant?.range ?? '0x20-0x7F', firstVariant?.symbols ?? '') }));
        render();
      }),
      inputField('Range', 'text', firstVariant?.range ?? '0x20-0x7F', (value) => {
        commit(updateFont(project, font.id, { variants: font.variants.map((variant) => ({ ...variant, range: value })) }));
        render();
      }),
      inputField('Symbols', 'text', firstVariant?.symbols ?? '', (value) => {
        commit(updateFont(project, font.id, { variants: font.variants.map((variant) => ({ ...variant, symbols: value })) }));
        render();
      })
    );
    fonts.append(row);
  });
}

function setElementEvent(element, trigger, toScreenId) {
  let next = project;
  const existing = next.flow.transitions.find((transition) => transition.fromScreenId === editorState.selectedScreenId && transition.elementId === element.id && transition.trigger === trigger);
  if (existing) next = removeTransition(next, existing.id);
  const toScreen = getScreen(next, toScreenId);
  next = updateElement(next, editorState.selectedScreenId, element.id, { events: { [trigger]: toScreen ? toScreen.slug : '' } });
  if (toScreenId) next = addTransition(next, { fromScreenId: editorState.selectedScreenId, elementId: element.id, trigger, toScreenId });
  commit(cleanupFlow(next));
  editorState.selectedElementId = element.id;
  render();
}

function addNewElement(type) {
  commit(addElement(project, editorState.selectedScreenId, type));
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  render();
}

async function importProject(file) {
  const raw = await file.text();
  const imported = file.name.endsWith('.xml') || raw.includes('<!-- ===== project.xml ===== -->')
    ? importXmlProject(raw)
    : parseDesignProject(raw);
  project = projectStore.replaceProject(imported);
  editorState.selectedScreenId = imported.flow.startScreenId;
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  await registerProjectFonts(project);
  render();
}

function setZoom(value) {
  editorStore.setZoom(value);
  renderStage();
}

function setGridEnabled(enabled) {
  commit(updateGrid(project, { enabled }));
  render();
}

function setGridSnap(snapEnabled) {
  commit(updateGrid(project, { snap: snapEnabled }));
  render();
}

function setGridSize(size) {
  commit(updateGrid(project, { size: clamp(size, 1, 24) }));
  render();
}

function setDevicePreset(deviceId) {
  commit(setDevice(project, deviceId));
  render();
}

function resetProject() {
  if (!confirm('Create a new project?')) return;
  project = projectStore.replaceProject(createProject());
  editorState.selectedScreenId = project.flow.startScreenId;
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  render();
}

function addNewScreen() {
  commit(addScreen(project));
  editorState.selectedScreenId = project.screens.at(-1).id;
  editorState.selectedElementId = null;
  editorState.shouldCenterStage = true;
  render();
}

function duplicateActiveScreen() {
  commit(duplicateScreen(project, editorState.selectedScreenId));
  editorState.selectedScreenId = project.screens.at(-1).id;
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  editorState.shouldCenterStage = true;
  render();
}

function deleteActiveScreen() {
  if (project.screens.length <= 1) return;
  commit(removeScreen(project, editorState.selectedScreenId));
  editorState.selectedScreenId = project.screens[0].id;
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  render();
}

function setStartScreen() {
  commit({ ...project, flow: { ...project.flow, startScreenId: editorState.selectedScreenId } });
  render();
}

function addTransitionFromSelected() {
  const element = getSelected();
  const target = project.screens.find((screen) => screen.id !== editorState.selectedScreenId);
  if (!element || !target) return;
  const existing = project.flow.transitions.find((transition) => transition.fromScreenId === editorState.selectedScreenId && transition.elementId === element.id && transition.trigger === 'press');
  if (existing) return;
  commit(addTransition(updateElement(project, editorState.selectedScreenId, element.id, { events: { press: target.slug } }), { fromScreenId: editorState.selectedScreenId, elementId: element.id, trigger: 'press', toScreenId: target.id }));
  render();
}

function deleteSelectedTransition() {
  if (!editorState.selectedTransitionId) return;
  commit(removeTransition(project, editorState.selectedTransitionId));
  editorState.selectedTransitionId = null;
  render();
}

function deleteSelectedAsset() {
  if (!editorState.selectedAssetId) return;
  commit(removeFont(project, editorState.selectedAssetId));
  editorState.selectedAssetId = project.assets.fonts[0]?.id ?? null;
  render();
}

function colorField(label, value, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field color-field';
  wrapper.textContent = label;
  const controls = document.createElement('span');
  controls.className = 'color-controls';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = normalizeColor(value);
  const hex = document.createElement('input');
  hex.type = 'text';
  hex.value = String(value);
  hex.pattern = '#[0-9a-fA-F]{6}';
  input.addEventListener('input', () => {
    hex.value = input.value;
    onChange(input.value);
  });
  hex.addEventListener('change', () => {
    const color = normalizeColor(hex.value);
    input.value = color;
    hex.value = color;
    onChange(color);
  });
  controls.append(input, hex);
  wrapper.append(controls);
  return wrapper;
}

function inputField(label, type, value, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = String(value);
  input.addEventListener('change', () => onChange(input.value));
  wrapper.append(input);
  return wrapper;
}

function checkboxField(label, value, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'checkbox-field';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

function selectField(label, options, value, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  wrapper.textContent = label;
  const select = document.createElement('select');
  options.forEach((option) => {
    const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
    const item = document.createElement('option');
    item.value = optionValue;
    item.textContent = optionLabel;
    select.append(item);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  wrapper.append(select);
  return wrapper;
}

function onStageContextMenu(event) {
  const elementNode = event.target.closest?.('[data-id]');
  const id = elementNode?.dataset.id;
  if (!id) return;
  event.preventDefault();
  event.stopPropagation();
  const element = activeScreen().elements.find((item) => item.id === id);
  if (!element) return;
  editorState.selectedElementId = id;
  render();
  showContextMenu(event.clientX, event.clientY, element);
}

function showContextMenu(clientX, clientY, element) {
  const contextMenu = query('#context-menu');
  contextMenu.innerHTML = `
    <strong>${escapeHtml(element.name)}</strong>
    <button data-action="context-duplicate">Duplicate</button>
    <button data-action="context-center">Center selected</button>
    <button data-action="context-delete" class="danger">Delete</button>
  `;
  contextMenu.hidden = false;
  const { innerWidth, innerHeight } = window;
  const rect = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(clientX, innerWidth - rect.width - 8)}px`;
  contextMenu.style.top = `${Math.min(clientY, innerHeight - rect.height - 8)}px`;
}

function hideContextMenu() {
  query('#context-menu').hidden = true;
}

function centerStageInViewport() {
  const stageWrap = query('#stage-wrap');
  const left = Math.max(0, (stageWrap.scrollWidth - stageWrap.clientWidth) / 2);
  const top = Math.max(0, (stageWrap.scrollHeight - stageWrap.clientHeight) / 2);
  stageWrap.scrollTo({ left, top, behavior: 'auto' });
}

function normalizeColor(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffffff';
}

function onPointerDown(event) {
  hideContextMenu();
  const target = event.target;
  const handle = target.closest?.('[data-mode]');
  const elementNode = target.closest?.('[data-id]');
  const id = handle?.dataset.id ?? elementNode?.dataset.id;
  if (!id) {
    editorState.selectedElementId = null;
    render();
    return;
  }
  const element = activeScreen().elements.find((item) => item.id === id);
  if (!element || element.locked) return;
  editorState.selectedElementId = id;
  editorState.dragState = { mode: handle?.dataset.mode ?? 'move', id, start: svgPoint(query('#stage'), event.clientX, event.clientY), original: structuredClone(element) };
  query('#stage').setPointerCapture(event.pointerId);
  render();
}

function onPointerMove(event) {
  if (!editorState.dragState) {
    const id = event.target.closest?.('[data-id]')?.dataset.id ?? null;
    if (id !== editorState.hoveredElementId) editorStore.setHoveredElement(id);
    return;
  }
  const point = svgPoint(query('#stage'), event.clientX, event.clientY);
  const dx = point.x - editorState.dragState.start.x;
  const dy = point.y - editorState.dragState.start.y;
  const o = editorState.dragState.original;
  const patch = {};
  if (editorState.dragState.mode === 'move') {
    patch.x = snap(o.x + dx, project.grid.size, project.grid.snap);
    patch.y = snap(o.y + dy, project.grid.size, project.grid.snap);
  } else {
    const right = o.x + o.w;
    const bottom = o.y + o.h;
    if (editorState.dragState.mode.includes('w')) {
      patch.x = snap(o.x + dx, project.grid.size, project.grid.snap);
      patch.w = right - patch.x;
    }
    if (editorState.dragState.mode.includes('n')) {
      patch.y = snap(o.y + dy, project.grid.size, project.grid.snap);
      patch.h = bottom - patch.y;
    }
    if (editorState.dragState.mode.includes('e')) patch.w = snap(o.w + dx, project.grid.size, project.grid.snap);
    if (editorState.dragState.mode.includes('s')) patch.h = snap(o.h + dy, project.grid.size, project.grid.snap);
  }
  project = projectStore.setProject(updateElement(project, editorState.selectedScreenId, editorState.dragState.id, patch), { capture: CAPTURE_MODE.ephemeral });
  renderStage();
  renderInspector();
}

function finishDrag() {
  if (!editorState.dragState) return;
  editorStore.setDragState(null);
  commit(project, { capture: CAPTURE_MODE.immediate });
  render();
}

function getSelected() {
  return selectSelectedElement(project, editorState);
}

function activeScreen() {
  return selectActiveScreen(project, editorState);
}

function reconcileEditorSelection({ resetElement = false } = {}) {
  if (!selectedScreenExists(project, editorState)) {
    editorStore.selectScreen(project.flow.startScreenId, firstElementId(project, project.flow.startScreenId));
    return;
  }

  if (resetElement || !getSelected()) {
    editorStore.selectElement(firstElementId(project, editorState.selectedScreenId));
  }
}

function deleteSelected() {
  if (!editorState.selectedElementId) return;
  commit(removeElement(project, editorState.selectedScreenId, editorState.selectedElementId));
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? null;
  render();
}

function duplicateSelected() {
  if (!editorState.selectedElementId) return;
  commit(duplicateElement(project, editorState.selectedScreenId, editorState.selectedElementId));
  editorState.selectedElementId = activeScreen().elements.at(-1)?.id ?? editorState.selectedElementId;
  render();
}

function centerSelected() {
  const element = getSelected();
  if (!element) return;
  commit(updateElement(project, editorState.selectedScreenId, element.id, { x: Math.round((project.device.width - element.w) / 2), y: Math.round((project.device.height - element.h) / 2) }));
  render();
}

function nudge(key, amount) {
  const element = getSelected();
  if (!element || element.locked) return;
  commit(updateElement(project, editorState.selectedScreenId, element.id, {
    x: element.x + (key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0),
    y: element.y + (key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0)
  }));
  render();
}

function moveSelectedLayer(direction) {
  if (!editorState.selectedElementId) return;
  commit(moveLayer(project, editorState.selectedScreenId, editorState.selectedElementId, direction));
  render();
}

function commit(next, options) {
  project = projectStore.commit(next, options);
  reconcileEditorSelection();
}

function undo() {
  if (!projectStore.canUndo()) return;
  project = projectStore.undo();
  reconcileEditorSelection({ resetElement: true });
  render();
}

function redo() {
  if (!projectStore.canRedo()) return;
  project = projectStore.redo();
  reconcileEditorSelection({ resetElement: true });
  render();
}

function showBundle(bundle) {
  lastBundle = bundle;
  query('#output').value = bundle.content;
}

async function runFirmwareAction(command) {
  const status = query('#firmware-status');
  const label = command === 'flash' ? 'Uploading' : 'Building';
  status.textContent = `${label} current UI...`;
  openFirmwareTerminal();
  setFirmwareTerminalState('Running');
  setFirmwareLog(`[${new Date().toLocaleTimeString()}] ${label} current UI...\n`);
  appendFirmwareLog('Generating firmware sources from the current designer state...\n');
  await nextFrame();

  try {
    const bundle = await exportFirmware(project);
    appendFirmwareLog('Running PlatformIO on the local dev server...\n\n');
    await nextFrame();
    const response = await fetch('/api/firmware/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, project, files: bundle.files })
    });
    if (!response.ok) {
      throw new Error(`Firmware ${command} failed with HTTP ${response.status}.`);
    }
    const output = await readFirmwareLogStream(response);
    if (output.includes('[cardputer-ui] ERROR:')) {
      throw new Error(output.split('[cardputer-ui] ERROR:').at(-1).trim() || `Firmware ${command} failed.`);
    }
    setFirmwareTerminalState('Done');
    status.textContent = command === 'flash'
      ? 'Uploaded current UI.'
      : 'Build completed for current UI.';
    lastBundle = {
      filename: `${project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'cardputer-ui'}-${command}.log`,
      mimeType: 'text/plain',
      content: output
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = 'Board action failed.';
    setFirmwareTerminalState('Failed');
    const help = 'Run npm run dev locally, install PlatformIO CLI, and connect the Cardputer Adv over USB.';
    const currentLog = query('#firmware-log').textContent ?? '';
    appendFirmwareLog(`${currentLog.includes(message) ? '' : `${message}\n\n`}${help}`);
  }
}

function openFirmwareTerminal() {
  query('#firmware-terminal').open = true;
}

function setFirmwareTerminalState(state) {
  query('#firmware-terminal-state').textContent = state;
}

function setFirmwareLog(value) {
  const log = query('#firmware-log');
  log.textContent = value;
  log.scrollTop = log.scrollHeight;
}

function appendFirmwareLog(value) {
  const log = query('#firmware-log');
  const prefix = log.textContent === 'No firmware logs yet.' ? '' : log.textContent;
  log.textContent = `${prefix}${value}`;
  log.scrollTop = log.scrollHeight;
}

async function readFirmwareLogStream(response) {
  if (!response.body) {
    const text = await response.text();
    appendFirmwareLog(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    output += chunk;
    appendFirmwareLog(chunk);
  }

  const tail = decoder.decode();
  if (tail) {
    output += tail;
    appendFirmwareLog(tail);
  }
  return output;
}

function clearFirmwareTerminal() {
  setFirmwareTerminalState('Idle');
  setFirmwareLog('No firmware logs yet.');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function downloadText(bundle) {
  const blob = new Blob([bundle.content], { type: bundle.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = bundle.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPng() {
  const stage = query('#stage');
  const clone = stage.cloneNode(true);
  clone.querySelectorAll('.selection').forEach((node) => node.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = project.device.width;
    canvas.height = project.device.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${activeScreen().slug}.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    }, 'image/png');
  };
  image.src = url;
}

async function registerProjectFonts(nextProject) {
  if (!('FontFace' in globalThis) || !document.fonts) return;
  for (const font of nextProject.assets.fonts) {
    if (!font.dataUrl || loadedFonts.has(font.id)) continue;
    try {
      const face = new FontFace(font.family, `url(${font.dataUrl})`);
      await face.load();
      document.fonts.add(face);
      loadedFonts.add(font.id);
    } catch {
      // Bad fonts are ignored in preview but still preserved in the project file.
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fontFamily(fontId) {
  const font = project.assets.fonts.find((item) => item.id === fontId);
  return font ? `"${font.family}", sans-serif` : '"Courier New", Consolas, monospace';
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined) node.setAttribute(key, String(value));
  });
  return node;
}

function clear(element) {
  element.replaceChildren();
}

function query(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);
  return element;
}

function textX(element) {
  if (element.props.align === 'center') return element.x + element.w / 2;
  if (element.props.align === 'right') return element.x + element.w - 3;
  return element.x + 3;
}

function anchor(align = 'left') {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function iconGlyph(icon) {
  return { wifi: 'WiFi', sd: 'SD', battery: 'BAT', audio: 'AUD', imu: 'IMU' }[icon] ?? '?';
}

function escapeHtml(value) {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}
