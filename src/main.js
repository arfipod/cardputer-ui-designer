import {
  DEVICE_PRESETS,
  EVENT_TRIGGERS,
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
  getElement,
  getScreen,
  moveLayers,
  removeElements,
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
import { smartSnapMove } from './canvas/snapping/snapEngine.js';
import { renderSnapGuides } from './canvas/snapping/snapGuides.js';
import { createActionRegistry } from './app/actions/actionRegistry.js';
import { registerEditorActions } from './app/actions/editorActions.js';
import { getShortcutEntries, runKeyboardShortcut, shortcutLabel } from './app/actions/keyboardShortcuts.js';
import { createEditorStore } from './app/state/editorStore.js';
import { CAPTURE_MODE } from './app/state/history.js';
import { createProjectStore, firstElementId } from './app/state/projectStore.js';
import { activeScreen as selectActiveScreen, elementBounds, selectedElement as selectSelectedElement, selectedElementIds as selectSelectedElementIds, selectedElements as selectSelectedElements, selectedScreenExists } from './app/state/selectors.js';

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

const LEFT_PANEL_WIDTH = {
  fallback: 280,
  min: 220,
  max: 520,
  step: 16,
  handle: 8,
  minWorkspace: 360,
  rightPanel: 320
};

const projectStore = createProjectStore();
const editorStore = createEditorStore({
  selectedScreenId: projectStore.getProject().flow.startScreenId,
  smartSnapEnabled: loadEditorPreference('smartSnapEnabled', true)
});
const editorState = editorStore.getState();
let project = projectStore.getProject();
let lastBundle = null;
let lastPreviewAnimationMs = 0;
const loadedFonts = new Set();
const actions = createActionRegistry();
const commandPaletteState = {
  items: [],
  selectedIndex: 0,
  lastFocus: null
};
const dialogState = {
  lastFocus: null
};

const app = document.querySelector('#app');
if (!app) throw new Error('Missing #app');

registerEditorActions(actions, createEditorCommands());
registerUiActions();
renderBootEmptyState();
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
          <button data-action="command-palette-open">Commands</button>
          <button data-action="shortcuts-open">Shortcuts</button>
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
            <button data-action="layer-top">Top</button>
            <button data-action="layer-up">Up</button>
            <button data-action="layer-down">Down</button>
            <button data-action="layer-bottom">Bottom</button>
          </div>
          <div id="layers" class="layers"></div>
        </section>
      </aside>
      <div class="left-panel-resizer" role="separator" aria-label="Resize left panel" aria-orientation="vertical" tabindex="0"></div>

      <main class="workspace">
        <div class="canvas-toolbar">
          <label>Zoom <input id="zoom" type="range" min="1" max="6" step="0.25" /></label>
          <label>Grid <input id="grid-enabled" type="checkbox" /></label>
          <label>Snap <input id="snap-enabled" type="checkbox" /></label>
          <label>Smart <input id="smart-snap-enabled" type="checkbox" /></label>
          <label>Grid size <input id="grid-size" type="number" min="1" max="24" /></label>
          <button data-action="center-stage">Center stage</button>
          <button data-action="center">Center selected</button>
          <div class="toolbar-group">
            <button data-action="align-left">Left</button>
            <button data-action="align-hcenter">H center</button>
            <button data-action="align-right">Right</button>
            <button data-action="align-top">Top</button>
            <button data-action="align-vcenter">V center</button>
            <button data-action="align-bottom">Bottom</button>
          </div>
          <div class="toolbar-group">
            <button data-action="distribute-horizontal">Distribute H</button>
            <button data-action="distribute-vertical">Distribute V</button>
          </div>
          <div class="toolbar-group">
            <button data-action="layer-forward">Forward</button>
            <button data-action="layer-backward">Backward</button>
            <button data-action="layer-front">Front</button>
            <button data-action="layer-back">Back</button>
          </div>
          <button data-action="lock">Lock</button>
          <button data-action="unlock">Unlock</button>
          <button data-action="duplicate">Duplicate</button>
          <button data-action="delete">Delete</button>
          <button data-action="reset">New</button>
        </div>
        <div class="stage-wrap" id="stage-wrap">
          <svg id="stage" role="img" aria-label="Cardputer screen editor"></svg>
        </div>
        <div class="status-help" id="status-help" role="status" aria-live="polite"></div>
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
      <div id="command-palette" class="modal-layer" hidden>
        <div class="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
          <div class="command-palette-header">
            <h2 id="command-palette-title">Command Palette</h2>
            <button type="button" class="icon-button" data-command-palette-close aria-label="Close command palette">Close</button>
          </div>
          <input id="command-palette-input" type="search" placeholder="Search actions" autocomplete="off" aria-label="Search actions" />
          <div id="command-palette-list" class="command-palette-list" role="listbox"></div>
        </div>
      </div>
      <div id="shortcuts-dialog" class="modal-layer" hidden>
        <div class="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
          <div class="command-palette-header">
            <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
            <button type="button" class="icon-button" data-shortcuts-close aria-label="Close shortcuts">Close</button>
          </div>
          <div id="shortcuts-list" class="shortcuts-list"></div>
        </div>
      </div>
    </div>
  `;
  applyLeftPanelWidth(loadEditorPreference('leftPanelWidth', LEFT_PANEL_WIDTH.fallback));
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

  query('#smart-snap-enabled').addEventListener('change', (event) => {
    void actions.run('smart-snap-set', createActionContext({ enabled: event.target.checked }));
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
  const stageWrap = query('#stage-wrap');
  stageWrap.addEventListener('pointerdown', onPointerDown);
  stageWrap.addEventListener('pointermove', onPointerMove);
  stageWrap.addEventListener('pointerup', finishDrag);
  stageWrap.addEventListener('pointercancel', finishDrag);
  stageWrap.addEventListener('pointerleave', () => editorStore.setHoveredElement(null));
  stage.addEventListener('contextmenu', onStageContextMenu);
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (event) => {
    if (!stage.contains(event.target) && !query('#context-menu').contains(event.target)) hideContextMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && closeTopDialog()) {
      event.preventDefault();
      return;
    }
    void runKeyboardShortcut(event, actions, createActionContext());
  });
  bindLeftPanelResize();

  const palette = query('#command-palette');
  const paletteInput = query('#command-palette-input');
  const paletteList = query('#command-palette-list');
  palette.addEventListener('click', (event) => {
    if (event.target === palette || event.target.closest?.('[data-command-palette-close]')) closeCommandPalette();
  });
  paletteInput.addEventListener('input', renderCommandPaletteList);
  paletteInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveCommandPaletteSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      await runSelectedCommandPaletteAction();
    }
  });
  paletteList.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-command-id]');
    if (!button || button.disabled) return;
    commandPaletteState.selectedIndex = Number(button.dataset.commandIndex ?? 0);
    await runSelectedCommandPaletteAction();
  });
  paletteList.addEventListener('mousemove', (event) => {
    const button = event.target.closest?.('[data-command-id]');
    if (!button) return;
    commandPaletteState.selectedIndex = Number(button.dataset.commandIndex ?? 0);
    refreshCommandPaletteSelection();
  });

  const shortcutsDialog = query('#shortcuts-dialog');
  shortcutsDialog.addEventListener('click', (event) => {
    if (event.target === shortcutsDialog || event.target.closest?.('[data-shortcuts-close]')) closeShortcutsDialog();
  });
}

function bindLeftPanelResize() {
  const resizer = query('.left-panel-resizer');
  const shell = query('.shell');
  const updateFromClientX = (clientX) => {
    const left = shell.getBoundingClientRect().left;
    applyLeftPanelWidth(clientX - left, true);
  };
  const stopResize = (event) => {
    document.body.classList.remove('resizing-left-panel');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
    try {
      resizer.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released by the browser.
    }
  };
  const onMove = (event) => {
    event.preventDefault();
    updateFromClientX(event.clientX);
  };

  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    document.body.classList.add('resizing-left-panel');
    resizer.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  });
  resizer.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = currentLeftPanelWidth();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    applyLeftPanelWidth(current + direction * LEFT_PANEL_WIDTH.step, true);
  });
  window.addEventListener('resize', () => applyLeftPanelWidth(currentLeftPanelWidth()));
}

function currentLeftPanelWidth() {
  const raw = getComputedStyle(query('.shell')).getPropertyValue('--left-panel-width');
  return Number.parseFloat(raw) || LEFT_PANEL_WIDTH.fallback;
}

function applyLeftPanelWidth(width, persist = false) {
  const nextWidth = clampLeftPanelWidth(width);
  query('.shell').style.setProperty('--left-panel-width', `${nextWidth}px`);
  const resizer = document.querySelector('.left-panel-resizer');
  if (resizer) {
    resizer.setAttribute('aria-valuemin', String(LEFT_PANEL_WIDTH.min));
    resizer.setAttribute('aria-valuemax', String(maxLeftPanelWidth()));
    resizer.setAttribute('aria-valuenow', String(nextWidth));
  }
  if (persist) saveEditorPreference('leftPanelWidth', nextWidth);
  return nextWidth;
}

function clampLeftPanelWidth(width) {
  return clamp(Number(width) || LEFT_PANEL_WIDTH.fallback, LEFT_PANEL_WIDTH.min, maxLeftPanelWidth());
}

function maxLeftPanelWidth() {
  const viewportWidth = window.innerWidth || LEFT_PANEL_WIDTH.fallback;
  const rightPanelWidth = viewportWidth > 1100 ? LEFT_PANEL_WIDTH.rightPanel : 0;
  const responsiveMax = viewportWidth - rightPanelWidth - LEFT_PANEL_WIDTH.minWorkspace - LEFT_PANEL_WIDTH.handle;
  return Math.max(LEFT_PANEL_WIDTH.min, Math.min(LEFT_PANEL_WIDTH.max, responsiveMax));
}

function createEditorCommands() {
  return {
    addElement: addNewElement,
    addScreen: addNewScreen,
    addTransitionFromSelected,
    alignSelected,
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
    lockSelected: () => setSelectedLocked(true),
    moveSelectedLayer,
    nudge,
    redo,
    resetProject,
    runFirmware: runFirmwareAction,
    setDevice: setDevicePreset,
    setGridEnabled,
    setGridSize,
    setGridSnap,
    setSmartSnapEnabled,
    setStartScreen,
    setZoom,
    toggleGrid: () => setGridEnabled(!project.grid.enabled),
    toggleGridSnap: () => setGridSnap(!project.grid.snap),
    toggleSmartSnap: () => setSmartSnapEnabled(!editorState.smartSnapEnabled),
    undo,
    unlockSelected: () => setSelectedLocked(false),
    distributeSelected
  };
}

function registerUiActions() {
  actions.registerMany([
    {
      id: 'command-palette-open',
      label: 'Open command palette',
      shortcut: 'mod+k',
      capture: CAPTURE_MODE.none,
      run: openCommandPalette
    },
    {
      id: 'shortcuts-open',
      label: 'Show keyboard shortcuts',
      shortcut: '?',
      capture: CAPTURE_MODE.none,
      run: openShortcutsDialog
    }
  ]);
}

function renderBootEmptyState() {
  app.innerHTML = `
    <div class="startup-empty" role="status" aria-live="polite">
      <strong>No project loaded yet</strong>
      <span>Loading the saved editor project...</span>
    </div>
  `;
}

function createActionContext(payload) {
  return {
    payload,
    canDeleteScreen: () => project.screens.length > 1,
    canRedo: () => projectStore.canRedo(),
    canUndo: () => projectStore.canUndo(),
    hasBundle: () => Boolean(lastBundle),
    hasEditableSelection: (minimum = 1) => getEditableSelectedElements().length >= minimum,
    hasLockedSelection: () => getSelectedElements().some((element) => element.locked),
    hasSelectedAsset: () => Boolean(editorState.selectedAssetId),
    hasSelection: () => getSelectedIds().length > 0,
    hasTransition: () => Boolean(editorState.selectedTransitionId),
    hasUnlockedSelection: () => getSelectedElements().some((element) => !element.locked)
  };
}

function render() {
  void saveProject(projectStore.getPersistentProject());
  const screen = activeScreen();
  query('#project-name').value = project.meta.name;
  query('#screen-name').value = screen?.name ?? '';
  query('#screen-name').disabled = !screen;
  query('#zoom').value = String(editorState.zoom);
  query('#grid-enabled').checked = project.grid.enabled;
  query('#snap-enabled').checked = project.grid.snap;
  query('#smart-snap-enabled').checked = editorState.smartSnapEnabled;
  query('#grid-size').value = String(project.grid.size);
  query('#device-preset').value = project.device.id;
  query('#device-notes').textContent = `${project.device.width} x ${project.device.height}px. ${project.device.colorDepth}. ${project.device.notes}`;
  renderScreens();
  renderFlow();
  renderStage();
  renderLayers();
  renderInspector();
  renderFonts();
  renderStatusHelp();
  refreshActionButtons();
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
      editorStore.selectElement(screen.elements.at(-1)?.id ?? null);
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
      editorStore.selectElement(transition.elementId);
      render();
    });
    flow.append(row);
  });
}

function renderStage() {
  const stage = query('#stage');
  const screen = activeScreen();
  const stageViewportSize = `${project.device.width}x${project.device.height}@${editorState.zoom}`;
  const viewportChanged = stageViewportSize !== editorState.lastStageViewportSize;
  editorState.lastStageViewportSize = stageViewportSize;
  stage.setAttribute('viewBox', `0 0 ${project.device.width} ${project.device.height}`);
  stage.style.width = `${project.device.width * editorState.zoom}px`;
  stage.style.height = `${project.device.height * editorState.zoom}px`;
  clear(stage);
  stage.append(svg('rect', { x: 0, y: 0, width: project.device.width, height: project.device.height, fill: '#05070b' }));
  if (!screen) {
    renderStageMessage(stage, 'No screen selected', 'Choose a screen from the left panel or add a new one.');
    return;
  }
  if (project.grid.enabled) drawGrid(stage);
  for (const element of screen.elements) {
    if (element.visible) stage.append(renderElementSvg(element));
  }
  if (!screen.elements.length) renderStageMessage(stage, 'Empty screen', 'Add an element to begin laying out this screen.');
  const selected = getSelectedElements();
  if (selected.length) stage.append(renderSelection(selected));
  if (editorState.dragState?.mode === 'marquee') stage.append(renderMarqueeSelection(editorState.dragState));
  if (editorState.dragState?.guides?.length) stage.append(renderSnapGuides(editorState.dragState.guides, project.device));
  if (editorState.shouldCenterStage || viewportChanged) {
    editorState.shouldCenterStage = false;
    requestAnimationFrame(centerStageInViewport);
  }
}

function renderStageMessage(stage, title, detail) {
  const centerX = project.device.width / 2;
  const centerY = project.device.height / 2;
  const titleNode = svg('text', {
    x: centerX,
    y: centerY - 7,
    fill: '#d8e4f7',
    'font-size': 10,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle'
  });
  titleNode.textContent = title;
  const detailNode = svg('text', {
    x: centerX,
    y: centerY + 8,
    fill: '#8794a8',
    'font-size': 6,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle'
  });
  detailNode.textContent = detail;
  stage.append(titleNode, detailNode);
}

function drawGrid(stage) {
  const group = svg('g', { class: 'grid' });
  for (let x = project.grid.size; x < project.device.width; x += project.grid.size) group.append(svg('line', { x1: x, y1: 0, x2: x, y2: project.device.height }));
  for (let y = project.grid.size; y < project.device.height; y += project.grid.size) group.append(svg('line', { x1: 0, y1: y, x2: project.device.width, y2: y }));
  stage.append(group);
}

function renderElementSvg(element) {
  const group = svg('g', { class: `element element-${element.type}${element.locked ? ' locked' : ''}`, 'data-id': element.id });
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

function renderSelection(elements) {
  const bounds = elementBounds(elements);
  if (!bounds) return svg('g', { class: 'selection' });
  const group = svg('g', { class: `selection${elements.every((element) => element.locked) ? ' locked' : ''}` });
  const isMulti = elements.length > 1;
  group.append(svg('rect', { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, fill: 'transparent', stroke: '#ffffff', 'stroke-dasharray': '3 2', 'pointer-events': isMulti ? 'visibleStroke' : 'none', ...(isMulti ? { 'data-selection': 'multi' } : {}) }));
  if (elements.every((element) => element.locked)) return group;
  const handleTarget = isMulti ? bounds : elements[0];
  [
    ['resize-nw', handleTarget.x, handleTarget.y],
    ['resize-ne', handleTarget.x + handleTarget.w, handleTarget.y],
    ['resize-sw', handleTarget.x, handleTarget.y + handleTarget.h],
    ['resize-se', handleTarget.x + handleTarget.w, handleTarget.y + handleTarget.h]
  ].forEach(([mode, x, y]) => group.append(svg('rect', { x: x - 2.5, y: y - 2.5, width: 5, height: 5, class: 'handle', ...(isMulti ? { 'data-selection': 'multi' } : { 'data-id': handleTarget.id }), 'data-mode': mode })));
  return group;
}

function renderMarqueeSelection(dragState) {
  const rect = rectFromPoints(dragState.start, dragState.current ?? dragState.start);
  return svg('rect', {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    class: 'marquee-selection',
    fill: 'rgba(104, 213, 255, 0.12)',
    stroke: '#68d5ff',
    'stroke-dasharray': '3 2',
    'pointer-events': 'none'
  });
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
  const screen = activeScreen();
  if (screen && nowMs - lastPreviewAnimationMs > 40 && screen.elements.some((element) => element.visible && element.type === 'sparkline' && element.props.mode === 'wave')) {
    lastPreviewAnimationMs = nowMs;
    renderStage();
  }
  requestAnimationFrame(previewAnimationLoop);
}

function renderLayers() {
  const layers = query('#layers');
  clear(layers);
  if (!activeScreen()) {
    layers.innerHTML = '<p class="empty-note"><strong>No screen selected</strong><span>Select a screen to view its layers.</span></p>';
    return;
  }
  const selectedIds = new Set(getSelectedIds());
  const elements = visualLayerElements();
  if (!elements.length) {
    layers.innerHTML = '<p class="empty-note"><strong>No elements yet</strong><span>Add a text, button, or shape layer to this screen.</span></p>';
    return;
  }

  elements.forEach((element) => {
    const row = document.createElement('div');
    row.className = `layer-row ${selectedIds.has(element.id) ? 'active' : ''}${element.locked ? ' locked' : ''}${element.visible === false ? ' hidden-layer' : ''}`;
    row.dataset.layerId = element.id;
    row.dataset.depth = String(element.layerDepth ?? 0);
    row.style.setProperty('--layer-depth', String(element.layerDepth ?? 0));

    const summary = document.createElement('div');
    summary.className = 'layer-summary';
    summary.tabIndex = 0;
    summary.setAttribute('role', 'button');
    summary.setAttribute('aria-pressed', selectedIds.has(element.id) ? 'true' : 'false');
    summary.addEventListener('click', (event) => selectLayerFromPanel(element.id, event));
    summary.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectLayerFromPanel(element.id, event);
    });

    const nameBlock = document.createElement('span');
    nameBlock.className = 'layer-name-block';
    const nameInput = document.createElement('input');
    nameInput.className = 'layer-name-input';
    nameInput.type = 'text';
    nameInput.value = element.name ?? '';
    nameInput.placeholder = element.id;
    nameInput.setAttribute('aria-label', `Layer name for ${element.id}`);
    nameInput.addEventListener('focus', () => {
      if (!getSelectedIds().includes(element.id)) {
        editorStore.selectElement(element.id);
        editorState.selectedTransitionId = null;
        renderStage();
        renderInspector();
        refreshLayerSelectionState();
      }
    });
    nameInput.addEventListener('click', (event) => event.stopPropagation());
    nameInput.addEventListener('keydown', (event) => event.stopPropagation());
    nameInput.addEventListener('change', () => renameLayer(element.id, nameInput.value));
    const meta = document.createElement('span');
    meta.className = 'layer-meta';
    const type = document.createElement('span');
    type.className = 'layer-type';
    type.textContent = elementTypeLabel(element.type);
    const idLabel = document.createElement('em');
    idLabel.textContent = element.id;
    meta.append(type, idLabel);
    nameBlock.append(nameInput, meta);
    summary.append(nameBlock);

    const stateControls = document.createElement('div');
    stateControls.className = 'layer-state-controls';
    if (hasOwn(element, 'locked')) {
      stateControls.append(layerIconButton(element.locked ? 'lock' : 'unlock', element.locked ? 'Unlock layer' : 'Lock layer', () => {
        updateLayer(element.id, { locked: !element.locked });
      }, element.locked ? 'locked-button' : '', element.locked));
    }
    if (hasOwn(element, 'visible')) {
      stateControls.append(layerIconButton(element.visible === false ? 'eyeOff' : 'eye', element.visible === false ? 'Show layer' : 'Hide layer', () => {
        updateLayer(element.id, { visible: element.visible === false });
      }, element.visible === false ? 'muted-button' : '', element.visible !== false));
    }

    row.append(summary, stateControls);
    layers.append(row);
  });
}

function selectLayerFromPanel(elementId, event) {
  if (event.shiftKey) {
    const layerIds = visualLayerElements().map((element) => element.id);
    const selectedIds = getSelectedIds();
    const anchorId = selectedIds.at(-1) ?? elementId;
    const anchorIndex = layerIds.indexOf(anchorId);
    const targetIndex = layerIds.indexOf(elementId);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [start, end] = [anchorIndex, targetIndex].sort((a, b) => a - b);
      editorStore.selectElements(layerIds.slice(start, end + 1));
    } else {
      editorStore.selectElement(elementId);
    }
  } else if (event.ctrlKey || event.metaKey) {
    editorStore.toggleElementSelection(elementId);
  } else {
    editorStore.selectElement(elementId);
  }
  editorState.selectedTransitionId = null;
  render();
}

function layerIconButton(icon, title, onClick, className = '', pressed = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `layer-icon-button ${className}`.trim();
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.innerHTML = layerIconSvg(icon);
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await onClick(event);
    render();
  });
  return button;
}

function layerIconSvg(icon) {
  const icons = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"></path><path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.1 4.1"></path><path d="M6.6 6.7A17.5 17.5 0 0 0 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.8-.8"></path></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.4-2.1"></path></svg>'
  };
  return icons[icon] ?? '';
}

function refreshLayerSelectionState() {
  const selectedIds = new Set(getSelectedIds());
  query('#layers').querySelectorAll('.layer-row').forEach((row) => {
    const active = selectedIds.has(row.dataset.layerId);
    row.classList.toggle('active', active);
    row.querySelector('.layer-summary')?.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renameLayer(elementId, name) {
  const element = getElement(project, editorState.selectedScreenId, elementId);
  if (!element) return;
  commit(updateElement(project, editorState.selectedScreenId, elementId, { name: name.trim() || element.id }));
  editorStore.selectElement(elementId);
  render();
}

function updateLayer(elementId, patch) {
  commit(updateElement(project, editorState.selectedScreenId, elementId, patch));
  editorStore.selectElement(elementId);
}

function visualLayerElements() {
  return flattenLayerTree(activeScreen()?.elements ?? []);
}

function elementTypeLabel(type) {
  return ELEMENTS.find(([value]) => value === type)?.[1] ?? type;
}

function flattenLayerTree(elements) {
  const ids = new Set(elements.map((element) => element.id));
  const childrenByParent = new Map();
  const roots = [];
  for (const element of elements) {
    const parentId = ids.has(element.parentId) ? element.parentId : '';
    if (!parentId) roots.push(element);
    else {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(element);
    }
  }
  const ordered = [];
  const visited = new Set();
  const visit = (element, depth, seen = new Set()) => {
    if (seen.has(element.id)) return;
    visited.add(element.id);
    ordered.push({ ...element, layerDepth: depth });
    const nextSeen = new Set(seen).add(element.id);
    for (const child of [...(childrenByParent.get(element.id) ?? [])].reverse()) visit(child, depth + 1, nextSeen);
  };
  for (const root of [...roots].reverse()) visit(root, 0);
  for (const element of [...elements].reverse()) {
    if (!visited.has(element.id)) visit(element, 0);
  }
  return ordered;
}

function parentOptionsFor(element) {
  const descendants = descendantIdsFor(element.id);
  return [
    ['', 'None'],
    ...activeScreen().elements
      .filter((candidate) => candidate.id !== element.id && !descendants.has(candidate.id))
      .map((candidate) => [candidate.id, `${candidate.name} (${elementTypeLabel(candidate.type)})`])
  ];
}

function descendantIdsFor(parentId, elements = activeScreen()?.elements ?? []) {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) {
      if (element.id !== parentId && !descendants.has(element.id) && (element.parentId === parentId || descendants.has(element.parentId))) {
        descendants.add(element.id);
        changed = true;
      }
    }
  }
  return descendants;
}

function movementElementsFor(elements) {
  const screenElements = activeScreen()?.elements ?? [];
  const rootIds = new Set(elements.map((element) => element.id));
  const directRoots = elements.filter((element) => !ancestorIdsFor(element.id, screenElements).some((id) => rootIds.has(id)));
  const moveIds = new Set();
  for (const element of directRoots) {
    moveIds.add(element.id);
    descendantIdsFor(element.id, screenElements).forEach((id) => moveIds.add(id));
  }
  return screenElements.filter((element) => moveIds.has(element.id));
}

function ancestorIdsFor(elementId, elements = activeScreen()?.elements ?? []) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const ancestors = [];
  const seen = new Set([elementId]);
  let current = byId.get(elementId);
  while (current?.parentId && byId.has(current.parentId) && !seen.has(current.parentId)) {
    ancestors.push(current.parentId);
    seen.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return ancestors;
}

function setSelectionParent(elements, parentId) {
  const ids = new Set(elements.map((element) => element.id));
  const next = elements.reduce((current, element) => {
    if (element.id === parentId || descendantIdsFor(element.id).has(parentId)) return current;
    return updateElement(current, editorState.selectedScreenId, element.id, { parentId });
  }, project);
  commit(next);
  editorStore.selectElements([...ids]);
  render();
}

function nestSelectionUnderFirst(elements) {
  const [parent, ...children] = elements;
  if (!parent || !children.length) return;
  const selectedIds = elements.map((element) => element.id);
  const next = children.reduce((current, element) => {
    if (descendantIdsFor(element.id).has(parent.id)) return current;
    return updateElement(current, editorState.selectedScreenId, element.id, { parentId: parent.id });
  }, project);
  commit(next);
  editorStore.selectElements(selectedIds);
  render();
}

function renderInspector() {
  const inspector = query('#inspector');
  const selectedElements = getSelectedElements();
  clear(inspector);
  if (!project) {
    inspector.append(emptyNote('No project loaded', 'Create or import a project to start editing.'));
    return;
  }
  if (!activeScreen()) {
    inspector.append(emptyNote('No screen selected', 'Choose a screen before editing element properties.'));
    return;
  }
  if (!selectedElements.length) {
    inspector.append(emptyNote('No element selected', 'Select a layer or canvas element to edit its properties.'));
    return;
  }
  if (selectedElements.length > 1) {
    renderMultiSelectionInspector(inspector, selectedElements);
    return;
  }
  const element = selectedElements[0];
  inspector.append(
    inputField('Name', 'text', element.name, (value) => change({ name: value })),
    selectField('Parent', parentOptionsFor(element), element.parentId ?? '', (value) => change({ parentId: value })),
    inputField('X', 'number', element.x, (value) => change({ x: Number(value) }), { disabled: element.locked }),
    inputField('Y', 'number', element.y, (value) => change({ y: Number(value) }), { disabled: element.locked }),
    inputField('W', 'number', element.w, (value) => change({ w: Number(value) }), { disabled: element.locked }),
    inputField('H', 'number', element.h, (value) => change({ h: Number(value) }), { disabled: element.locked }),
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
    editorStore.selectElement(element.id);
    render();
  }
  function changeProp(key, value) {
    commit(updateElement(project, editorState.selectedScreenId, element.id, { props: { [key]: value } }));
    editorStore.selectElement(element.id);
    render();
  }
}

function renderMultiSelectionInspector(inspector, elements) {
  const summary = document.createElement('div');
  summary.className = 'empty-note compact';
  const lockedCount = elements.filter((element) => element.locked).length;
  summary.innerHTML = `<strong>Multiple elements selected</strong><span>${elements.length} elements${lockedCount ? `, ${lockedCount} locked` : ''}. Shared layout actions are available below.</span>`;

  const actions = document.createElement('div');
  actions.className = 'mini-actions';
  actions.innerHTML = `
    <button data-action="align-left">Left</button>
    <button data-action="align-hcenter">H center</button>
    <button data-action="align-right">Right</button>
    <button data-action="align-top">Top</button>
    <button data-action="align-vcenter">V center</button>
    <button data-action="align-bottom">Bottom</button>
    <button data-action="distribute-horizontal">Distribute H</button>
    <button data-action="distribute-vertical">Distribute V</button>
    <button data-action="layer-forward">Forward</button>
    <button data-action="layer-backward">Backward</button>
    <button data-action="layer-front">Front</button>
    <button data-action="layer-back">Back</button>
    <button data-action="lock">Lock</button>
    <button data-action="unlock">Unlock</button>
    <button data-action="duplicate">Duplicate</button>
    <button data-action="delete">Delete</button>
  `;
  const parentControls = document.createElement('div');
  parentControls.className = 'mini-actions';
  const makeChildrenButton = document.createElement('button');
  makeChildrenButton.type = 'button';
  makeChildrenButton.textContent = 'Nest under first';
  makeChildrenButton.disabled = elements.length < 2;
  makeChildrenButton.title = 'Make the other selected elements children of the first selected element.';
  makeChildrenButton.addEventListener('click', () => nestSelectionUnderFirst(elements));
  const detachButton = document.createElement('button');
  detachButton.type = 'button';
  detachButton.textContent = 'Detach';
  detachButton.title = 'Remove parent from selected elements.';
  detachButton.addEventListener('click', () => setSelectionParent(elements, ''));
  parentControls.append(makeChildrenButton, detachButton);
  inspector.append(summary, parentControls, actions);
}

function emptyNote(title, detail) {
  const note = document.createElement('p');
  note.className = 'empty-note';
  note.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
  return note;
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
  editorStore.selectElement(element.id);
  render();
}

function addNewElement(type) {
  commit(addElement(project, editorState.selectedScreenId, type));
  editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
  render();
}

async function importProject(file) {
  const raw = await file.text();
  const imported = file.name.endsWith('.xml') || raw.includes('<!-- ===== project.xml ===== -->')
    ? importXmlProject(raw)
    : parseDesignProject(raw);
  project = projectStore.replaceProject(imported);
  editorState.selectedScreenId = imported.flow.startScreenId;
  editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
  await registerProjectFonts(project);
  render();
}

function setZoom(value) {
  editorStore.setZoom(value);
  renderStage();
  renderStatusHelp();
}

function setGridEnabled(enabled) {
  commit(updateGrid(project, { enabled }));
  render();
}

function setGridSnap(snapEnabled) {
  commit(updateGrid(project, { snap: snapEnabled }));
  render();
}

function setSmartSnapEnabled(enabled) {
  editorStore.setSmartSnapEnabled(enabled);
  saveEditorPreference('smartSnapEnabled', enabled);
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
  editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
  render();
}

function addNewScreen() {
  commit(addScreen(project));
  editorState.selectedScreenId = project.screens.at(-1).id;
  editorStore.clearElementSelection();
  editorState.shouldCenterStage = true;
  render();
}

function duplicateActiveScreen() {
  commit(duplicateScreen(project, editorState.selectedScreenId));
  editorState.selectedScreenId = project.screens.at(-1).id;
  editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
  editorState.shouldCenterStage = true;
  render();
}

function deleteActiveScreen() {
  if (project.screens.length <= 1) return;
  commit(removeScreen(project, editorState.selectedScreenId));
  editorState.selectedScreenId = project.screens[0].id;
  editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
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

function inputField(label, type, value, onChange, options = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = String(value);
  input.disabled = Boolean(options.disabled);
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
  if (!getSelectedIds().includes(id)) editorStore.selectElement(id);
  render();
  showContextMenu(event.clientX, event.clientY, getSelectedElements());
}

function showContextMenu(clientX, clientY, elements) {
  const label = elements.length > 1 ? `${elements.length} elements selected` : escapeHtml(elements[0]?.name ?? 'Selection');
  const contextMenu = query('#context-menu');
  contextMenu.innerHTML = `
    <strong>${label}</strong>
    <button data-action="align-left">Align left</button>
    <button data-action="align-hcenter">Align H center</button>
    <button data-action="align-right">Align right</button>
    <button data-action="align-top">Align top</button>
    <button data-action="align-vcenter">Align V center</button>
    <button data-action="align-bottom">Align bottom</button>
    <button data-action="distribute-horizontal">Distribute H</button>
    <button data-action="distribute-vertical">Distribute V</button>
    <button data-action="layer-forward">Bring forward</button>
    <button data-action="layer-backward">Send backward</button>
    <button data-action="layer-front">Bring to front</button>
    <button data-action="layer-back">Send to back</button>
    <button data-action="lock">Lock</button>
    <button data-action="unlock">Unlock</button>
    <button data-action="duplicate">Duplicate</button>
    <button data-action="center">Center selected</button>
    <button data-action="delete" class="danger">Delete</button>
  `;
  contextMenu.hidden = false;
  refreshActionButtons(contextMenu);
  const { innerWidth, innerHeight } = window;
  const rect = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(clientX, innerWidth - rect.width - 8)}px`;
  contextMenu.style.top = `${Math.min(clientY, innerHeight - rect.height - 8)}px`;
}

function hideContextMenu() {
  query('#context-menu').hidden = true;
}

function openCommandPalette() {
  hideContextMenu();
  closeShortcutsDialog({ restoreFocus: false });
  commandPaletteState.lastFocus = document.activeElement;
  const palette = query('#command-palette');
  const input = query('#command-palette-input');
  palette.hidden = false;
  input.value = '';
  commandPaletteState.selectedIndex = 0;
  renderCommandPaletteList();
  requestAnimationFrame(() => input.focus());
}

function closeCommandPalette({ restoreFocus = true } = {}) {
  const palette = query('#command-palette');
  if (palette.hidden) return false;
  palette.hidden = true;
  if (restoreFocus) restoreDialogFocus(commandPaletteState.lastFocus);
  commandPaletteState.lastFocus = null;
  return true;
}

function renderCommandPaletteList() {
  const list = query('#command-palette-list');
  const search = query('#command-palette-input').value.trim().toLowerCase();
  const ctx = createActionContext();
  commandPaletteState.items = actions
    .all()
    .filter((action) => action.palette !== false)
    .filter((action) => !search || action.label.toLowerCase().includes(search) || action.id.toLowerCase().includes(search))
    .map((action) => ({ action, available: actions.canRun(action.id, ctx) }))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.action.label.localeCompare(b.action.label));

  clear(list);
  if (!commandPaletteState.items.length) {
    list.append(emptyNote('No actions found', 'Try a different command name.'));
    return;
  }

  const firstAvailableIndex = commandPaletteState.items.findIndex((item) => item.available);
  commandPaletteState.selectedIndex = clamp(commandPaletteState.selectedIndex, 0, commandPaletteState.items.length - 1);
  if (!commandPaletteState.items[commandPaletteState.selectedIndex]?.available && firstAvailableIndex >= 0) {
    commandPaletteState.selectedIndex = firstAvailableIndex;
  }

  commandPaletteState.items.forEach(({ action, available }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-palette-item';
    button.dataset.commandId = action.id;
    button.dataset.commandIndex = String(index);
    button.disabled = !available;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === commandPaletteState.selectedIndex ? 'true' : 'false');
    button.innerHTML = `
      <span>${escapeHtml(action.label)}</span>
      <em>${action.shortcut ? escapeHtml(shortcutLabel(action.shortcut)) : available ? '' : 'Unavailable'}</em>
    `;
    list.append(button);
  });
  refreshCommandPaletteSelection();
}

function moveCommandPaletteSelection(direction) {
  const items = commandPaletteState.items;
  if (!items.length) return;
  let next = commandPaletteState.selectedIndex;
  for (let offset = 0; offset < items.length; offset += 1) {
    next = (next + direction + items.length) % items.length;
    if (items[next].available) break;
  }
  commandPaletteState.selectedIndex = next;
  refreshCommandPaletteSelection();
}

function refreshCommandPaletteSelection() {
  query('#command-palette-list').querySelectorAll('[data-command-id]').forEach((button, index) => {
    const selected = index === commandPaletteState.selectedIndex;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) button.scrollIntoView({ block: 'nearest' });
  });
}

async function runSelectedCommandPaletteAction() {
  const item = commandPaletteState.items[commandPaletteState.selectedIndex];
  if (!item?.available) return;
  const actionId = item.action.id;
  closeCommandPalette({ restoreFocus: false });
  await actions.run(actionId, createActionContext());
}

function openShortcutsDialog() {
  hideContextMenu();
  closeCommandPalette({ restoreFocus: false });
  dialogState.lastFocus = document.activeElement;
  const dialog = query('#shortcuts-dialog');
  const list = query('#shortcuts-list');
  clear(list);
  const shortcuts = getShortcutEntries(actions);
  if (!shortcuts.length) {
    list.append(emptyNote('No shortcuts registered', 'Actions without shortcuts still appear in the command palette.'));
  } else {
    shortcuts.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.innerHTML = `<span>${escapeHtml(entry.label)}</span><kbd>${escapeHtml(shortcutLabel(entry.shortcut))}</kbd>`;
      list.append(row);
    });
  }
  dialog.hidden = false;
  requestAnimationFrame(() => query('[data-shortcuts-close]').focus());
}

function closeShortcutsDialog({ restoreFocus = true } = {}) {
  const dialog = query('#shortcuts-dialog');
  if (dialog.hidden) return false;
  dialog.hidden = true;
  if (restoreFocus) restoreDialogFocus(dialogState.lastFocus);
  dialogState.lastFocus = null;
  return true;
}

function closeTopDialog() {
  if (closeCommandPalette()) return true;
  if (closeShortcutsDialog()) return true;
  return false;
}

function restoreDialogFocus(target) {
  if (target && typeof target.focus === 'function' && document.contains(target)) target.focus();
}

function renderStatusHelp() {
  const status = query('#status-help');
  const screen = activeScreen();
  if (!project) {
    status.innerHTML = '<span>No project loaded</span>';
    return;
  }

  const selected = screen ? getSelectedElements() : [];
  const selectionText = !screen
    ? 'No screen selected'
    : selected.length === 0
      ? 'No selection'
      : selected.length === 1
        ? '1 selected'
        : `${selected.length} selected`;
  const hint = !screen
    ? 'Choose a screen or add one from the Screens panel.'
    : selected.length
      ? 'Arrow keys nudge selection. Shift+arrows nudge 5px.'
      : 'Select an element, or press Ctrl/Cmd+K to run a command.';

  status.innerHTML = `
    <div class="status-chips">
      <span>${escapeHtml(selectionText)}</span>
      <span>Canvas ${project.device.width} x ${project.device.height}</span>
      <span>Zoom ${formatZoom(editorState.zoom)}</span>
      <span>${project.grid.enabled ? `Grid ${project.grid.size}px` : 'Grid off'}</span>
      <span>${project.grid.snap ? 'Snap on' : 'Snap off'}</span>
      <span>${editorState.smartSnapEnabled ? 'Smart snap on' : 'Smart snap off'}</span>
    </div>
    <p>${escapeHtml(hint)}</p>
  `;
}

function refreshActionButtons(root = document) {
  const ctx = createActionContext();
  root.querySelectorAll('button[data-action]').forEach((button) => {
    const action = actions.get(button.dataset.action);
    if (!action) return;
    const available = actions.canRun(action.id, ctx);
    button.disabled = !available;
    button.title = action.shortcut ? `${action.label} (${shortcutLabel(action.shortcut)})` : action.label;
  });
}

function formatZoom(value) {
  return `${Number(value).toFixed(Number.isInteger(value) ? 0 : 2)}x`;
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
  const handle = target.closest?.('.handle[data-mode]');
  if (handle) {
    startSelectionDrag(event, handle.dataset.mode, handle.dataset.id ?? null);
    return;
  }
  const selectionNode = target.closest?.('[data-selection]');
  if (selectionNode) {
    startSelectionDrag(event);
    return;
  }
  const elementNode = target.closest?.('[data-id]');
  const id = elementNode?.dataset.id;
  if (!id) {
    startMarqueeSelection(event);
    return;
  }
  const element = activeScreen().elements.find((item) => item.id === id);
  if (!element) return;
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    editorStore.toggleElementSelection(id);
    render();
    return;
  }
  if (!getSelectedIds().includes(id)) editorStore.selectElement(id);
  if (element.locked) {
    render();
    return;
  }
  startSelectionDrag(event, 'move', id);
}

function startMarqueeSelection(event) {
  const point = svgPoint(query('#stage'), event.clientX, event.clientY);
  const keepExistingSelection = event.shiftKey || event.ctrlKey || event.metaKey;
  editorState.dragState = {
    mode: 'marquee',
    start: point,
    current: point,
    ids: [],
    originalSelectionIds: keepExistingSelection ? getSelectedIds() : [],
    guides: []
  };
  query('#stage-wrap').setPointerCapture(event.pointerId);
  if (!keepExistingSelection) editorStore.clearElementSelection();
  render();
}

function startSelectionDrag(event, mode = 'move', focusId = null) {
  const selected = getSelectedElements();
  const selectedIds = new Set(selected.map((element) => element.id));
  const dragSelection = mode === 'move' && (!focusId || selectedIds.has(focusId));
  const sourceElements = dragSelection ? selected : selected.filter((element) => element.id === focusId);
  const editableSourceElements = sourceElements.filter((element) => !element.locked);
  const dragElements = mode === 'move' ? movementElementsFor(editableSourceElements) : editableSourceElements;
  if (!dragElements.length) {
    render();
    return;
  }
  const bounds = elementBounds(dragElements);
  editorState.dragState = {
    mode,
    id: focusId ?? dragElements[0].id,
    ids: dragElements.map((element) => element.id),
    start: svgPoint(query('#stage'), event.clientX, event.clientY),
    original: structuredClone(mode === 'move' || !focusId ? bounds : dragElements.find((element) => element.id === focusId) ?? dragElements[0]),
    originals: dragElements.map((element) => structuredClone(element)),
    bounds,
    guides: []
  };
  query('#stage-wrap').setPointerCapture(event.pointerId);
  render();
}

function onPointerMove(event) {
  if (!editorState.dragState) {
    const id = event.target.closest?.('[data-id]')?.dataset.id ?? null;
    if (id !== editorState.hoveredElementId) editorStore.setHoveredElement(id);
    return;
  }
  const point = svgPoint(query('#stage'), event.clientX, event.clientY);
  if (editorState.dragState.mode === 'marquee') {
    editorState.dragState.current = point;
    updateMarqueeSelection();
    renderStage();
    renderLayers();
    renderInspector();
    renderStatusHelp();
    return;
  }
  const dx = point.x - editorState.dragState.start.x;
  const dy = point.y - editorState.dragState.start.y;
  const o = editorState.dragState.original;
  let nextProject = project;
  const patch = {};
  if (editorState.dragState.mode === 'move') {
    const bounds = editorState.dragState.bounds ?? o;
    const gridX = snap(bounds.x + dx, project.grid.size, project.grid.snap);
    const gridY = snap(bounds.y + dy, project.grid.size, project.grid.snap);
    const smart = smartSnapMove({
      element: bounds,
      x: gridX,
      y: gridY,
      device: project.device,
      elements: activeScreen().elements.filter((element) => !editorState.dragState.ids.includes(element.id)),
      zoom: editorState.zoom,
      enabled: editorState.smartSnapEnabled
    });
    const moveX = smart.x - bounds.x;
    const moveY = smart.y - bounds.y;
    editorState.dragState.guides = smart.guides;
    nextProject = updateElementsFromOriginals(editorState.dragState.originals, (element) => ({
      x: element.x + moveX,
      y: element.y + moveY
    }));
  } else {
    editorState.dragState.guides = [];
    if (editorState.dragState.ids.length > 1) {
      const nextBounds = resizeBoundsFromDrag(o, dx, dy, editorState.dragState.mode);
      nextProject = updateElementsFromOriginals(editorState.dragState.originals, (element) => resizeElementWithinBounds(element, o, nextBounds));
    } else {
      const nextBounds = resizeBoundsFromDrag(o, dx, dy, editorState.dragState.mode);
      patch.x = nextBounds.x;
      patch.y = nextBounds.y;
      patch.w = nextBounds.w;
      patch.h = nextBounds.h;
      nextProject = updateElement(project, editorState.selectedScreenId, editorState.dragState.id, patch);
    }
  }
  project = projectStore.setProject(nextProject, { capture: CAPTURE_MODE.ephemeral });
  renderStage();
  renderInspector();
}

function finishDrag() {
  if (!editorState.dragState) return;
  if (editorState.dragState.mode === 'marquee') {
    updateMarqueeSelection();
    editorStore.setDragState(null);
    render();
    return;
  }
  editorStore.setDragState(null);
  commit(project, { capture: CAPTURE_MODE.immediate });
  render();
}

function loadEditorPreference(key, fallback) {
  try {
    const raw = localStorage.getItem(`cardputer-ui-designer:editor:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveEditorPreference(key, value) {
  try {
    localStorage.setItem(`cardputer-ui-designer:editor:${key}`, JSON.stringify(value));
  } catch {
    // Editor preferences are convenience-only; project export remains unaffected.
  }
}

function getSelected() {
  return selectSelectedElement(project, editorState);
}

function getSelectedIds() {
  return selectSelectedElementIds(project, editorState);
}

function getSelectedElements() {
  return selectSelectedElements(project, editorState);
}

function getEditableSelectedElements() {
  return getSelectedElements().filter((element) => !element.locked);
}

function activeScreen() {
  return selectActiveScreen(project, editorState);
}

function updateElementsFromOriginals(originals, patchForElement) {
  return originals.reduce(
    (nextProject, element) => updateElement(nextProject, editorState.selectedScreenId, element.id, patchForElement(element)),
    project
  );
}

function updateMarqueeSelection() {
  const dragState = editorState.dragState;
  if (!dragState || dragState.mode !== 'marquee') return;
  const rect = rectFromPoints(dragState.start, dragState.current ?? dragState.start);
  const baseIds = dragState.originalSelectionIds ?? [];
  const baseIdSet = new Set(baseIds);
  const selectedIds = activeScreen().elements
    .filter((element) => element.visible !== false && rectContainsElement(rect, element))
    .map((element) => element.id);
  editorStore.selectElements([...baseIds, ...selectedIds.filter((id) => !baseIdSet.has(id))]);
}

function rectFromPoints(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y)
  };
}

function rectContainsElement(rect, element) {
  return (
    element.x >= rect.x &&
    element.y >= rect.y &&
    element.x + element.w <= rect.x + rect.w &&
    element.y + element.h <= rect.y + rect.h
  );
}

function resizeBoundsFromDrag(bounds, dx, dy, mode) {
  const direction = resizeDirection(mode);
  const minSize = 1;
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  let left = bounds.x;
  let top = bounds.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (direction.includes('w')) left = Math.min(right - minSize, snap(bounds.x + dx, project.grid.size, project.grid.snap));
  if (direction.includes('n')) top = Math.min(bottom - minSize, snap(bounds.y + dy, project.grid.size, project.grid.snap));
  if (direction.includes('e')) nextRight = Math.max(left + minSize, snap(right + dx, project.grid.size, project.grid.snap));
  if (direction.includes('s')) nextBottom = Math.max(top + minSize, snap(bottom + dy, project.grid.size, project.grid.snap));

  return {
    x: left,
    y: top,
    w: nextRight - left,
    h: nextBottom - top
  };
}

function resizeDirection(mode) {
  return mode.startsWith('resize-') ? mode.slice('resize-'.length) : mode;
}

function resizeElementWithinBounds(element, sourceBounds, targetBounds) {
  const scaleX = sourceBounds.w ? targetBounds.w / sourceBounds.w : 1;
  const scaleY = sourceBounds.h ? targetBounds.h / sourceBounds.h : 1;
  return {
    x: snap(targetBounds.x + (element.x - sourceBounds.x) * scaleX, project.grid.size, project.grid.snap),
    y: snap(targetBounds.y + (element.y - sourceBounds.y) * scaleY, project.grid.size, project.grid.snap),
    w: Math.max(1, snap(element.w * scaleX, project.grid.size, project.grid.snap)),
    h: Math.max(1, snap(element.h * scaleY, project.grid.size, project.grid.snap))
  };
}

function reconcileEditorSelection({ resetElement = false } = {}) {
  if (!selectedScreenExists(project, editorState)) {
    editorStore.selectScreen(project.flow.startScreenId, firstElementId(project, project.flow.startScreenId));
    return;
  }

  const selectedIds = getSelectedIds();
  if (resetElement || !selectedIds.length) {
    editorStore.selectElement(firstElementId(project, editorState.selectedScreenId));
    return;
  }
  editorStore.selectElements(selectedIds);
}

function deleteSelected() {
  const selected = getSelectedElements();
  const deletableIds = selected.filter((element) => !element.locked).map((element) => element.id);
  if (!deletableIds.length) return;
  const lockedIds = selected.filter((element) => element.locked).map((element) => element.id);
  commit(removeElements(project, editorState.selectedScreenId, deletableIds));
  const remainingLockedIds = lockedIds.filter((id) => activeScreen().elements.some((element) => element.id === id));
  if (remainingLockedIds.length) editorStore.selectElements(remainingLockedIds);
  else editorStore.selectElement(activeScreen().elements.at(-1)?.id ?? null);
  render();
}

function duplicateSelected() {
  const selectedIds = getEditableSelectedElements().map((element) => element.id);
  if (!selectedIds.length) return;
  const beforeCount = activeScreen().elements.length;
  commit(duplicateElements(project, editorState.selectedScreenId, selectedIds));
  const duplicatedIds = activeScreen().elements.slice(beforeCount).map((element) => element.id);
  editorStore.selectElements(duplicatedIds.length ? duplicatedIds : selectedIds);
  render();
}

function centerSelected() {
  const selected = movementElementsFor(getEditableSelectedElements());
  const bounds = elementBounds(selected);
  if (!bounds) return;
  const moveX = Math.round((project.device.width - bounds.w) / 2) - bounds.x;
  const moveY = Math.round((project.device.height - bounds.h) / 2) - bounds.y;
  commit(updateElementsFromOriginals(selected, (element) => ({ x: element.x + moveX, y: element.y + moveY })));
  render();
}

function alignSelected(alignment) {
  const selected = getEditableSelectedElements();
  if (selected.length < 2) return;
  commit(alignElements(project, editorState.selectedScreenId, selected.map((element) => element.id), alignment));
  render();
}

function distributeSelected(axis) {
  const selected = getEditableSelectedElements();
  if (selected.length < 3) return;
  commit(distributeElements(project, editorState.selectedScreenId, selected.map((element) => element.id), axis));
  render();
}

function nudge(key, amount) {
  const selected = movementElementsFor(getEditableSelectedElements());
  if (!selected.length) return;
  commit(updateElementsFromOriginals(selected, (element) => ({
    x: element.x + (key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0),
    y: element.y + (key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0)
  })));
  render();
}

function moveSelectedLayer(direction) {
  const normalizedDirection = direction === 'top' ? 'front' : direction === 'bottom' ? 'back' : direction;
  const selectedIds = getEditableSelectedElements().map((element) => element.id);
  if (!selectedIds.length) return;
  commit(moveLayers(project, editorState.selectedScreenId, selectedIds, normalizedDirection));
  editorStore.selectElements(getSelectedIds());
  render();
}

function setSelectedLocked(locked) {
  const selected = getSelectedElements().filter((element) => element.locked !== locked);
  if (!selected.length) return;
  const selectedIds = getSelectedIds();
  commit(updateElementsFromOriginals(selected, () => ({ locked })));
  editorStore.selectElements(selectedIds);
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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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
