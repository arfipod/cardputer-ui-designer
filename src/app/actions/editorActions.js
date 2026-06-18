import { CAPTURE_MODE } from './actionRegistry.js';

// Central catalog of editor actions. Implementations stay in main.js for now,
// which keeps this refactor incremental while making dispatch consistent.
export function registerEditorActions(registry, commands) {
  registry.registerMany([
    {
      id: 'undo',
      label: 'Undo',
      shortcut: 'mod+z',
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => ctx.canUndo(),
      run: () => commands.undo()
    },
    {
      id: 'redo',
      label: 'Redo',
      shortcut: 'mod+y',
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => ctx.canRedo(),
      run: () => commands.redo()
    },
    {
      id: 'element-add',
      label: 'Add element',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => Boolean(ctx.payload?.type),
      run: (ctx) => commands.addElement(ctx.payload.type)
    },
    {
      id: 'project-import',
      label: 'Import project',
      palette: false,
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => Boolean(ctx.payload?.file),
      run: (ctx) => commands.importProject(ctx.payload.file)
    },
    {
      id: 'zoom-set',
      label: 'Set zoom',
      palette: false,
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => Number.isFinite(ctx.payload?.zoom),
      run: (ctx) => commands.setZoom(ctx.payload.zoom)
    },
    {
      id: 'grid-enabled-set',
      label: 'Set grid visibility',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => typeof ctx.payload?.enabled === 'boolean',
      run: (ctx) => commands.setGridEnabled(Boolean(ctx.payload?.enabled))
    },
    {
      id: 'grid-toggle',
      label: 'Toggle grid',
      capture: CAPTURE_MODE.immediate,
      run: () => commands.toggleGrid()
    },
    {
      id: 'grid-snap-set',
      label: 'Set grid snap',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => typeof ctx.payload?.snap === 'boolean',
      run: (ctx) => commands.setGridSnap(Boolean(ctx.payload?.snap))
    },
    {
      id: 'grid-snap-toggle',
      label: 'Toggle snap',
      capture: CAPTURE_MODE.immediate,
      run: () => commands.toggleGridSnap()
    },
    {
      id: 'smart-snap-set',
      label: 'Set smart snap',
      palette: false,
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => typeof ctx.payload?.enabled === 'boolean',
      run: (ctx) => commands.setSmartSnapEnabled(Boolean(ctx.payload?.enabled))
    },
    {
      id: 'smart-snap-toggle',
      label: 'Toggle smart snap',
      capture: CAPTURE_MODE.none,
      run: () => commands.toggleSmartSnap()
    },
    {
      id: 'grid-size-set',
      label: 'Set grid size',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => Number.isFinite(ctx.payload?.size),
      run: (ctx) => commands.setGridSize(ctx.payload.size)
    },
    {
      id: 'device-set',
      label: 'Set device',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => Boolean(ctx.payload?.deviceId),
      run: (ctx) => commands.setDevice(ctx.payload.deviceId)
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: 'mod+d',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.duplicateSelected()
    },
    {
      id: 'delete',
      label: 'Delete',
      shortcut: 'delete/backspace',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(),
      run: () => commands.deleteSelected()
    },
    {
      id: 'center',
      label: 'Center selected',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(),
      run: () => commands.centerSelected()
    },
    ...[
      ['left', 'Align left'],
      ['hcenter', 'Align horizontal center'],
      ['right', 'Align right'],
      ['top', 'Align top'],
      ['vcenter', 'Align vertical center'],
      ['bottom', 'Align bottom']
    ].map(([alignment, label]) => ({
      id: `align-${alignment}`,
      label,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(2),
      run: () => commands.alignSelected(alignment)
    })),
    ...[
      ['horizontal', 'Distribute horizontally'],
      ['vertical', 'Distribute vertically']
    ].map(([axis, label]) => ({
      id: `distribute-${axis}`,
      label,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(3),
      run: () => commands.distributeSelected(axis)
    })),
    {
      id: 'lock',
      label: 'Lock selected',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasUnlockedSelection(),
      run: () => commands.lockSelected()
    },
    {
      id: 'unlock',
      label: 'Unlock selected',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasLockedSelection(),
      run: () => commands.unlockSelected()
    },
    {
      id: 'center-stage',
      label: 'Center stage',
      capture: CAPTURE_MODE.none,
      run: () => commands.centerStage()
    },
    {
      id: 'reset',
      label: 'New',
      capture: CAPTURE_MODE.none,
      run: () => commands.resetProject()
    },
    {
      id: 'screen-add',
      label: 'Add screen',
      capture: CAPTURE_MODE.immediate,
      run: () => commands.addScreen()
    },
    {
      id: 'screen-duplicate',
      label: 'Duplicate screen',
      capture: CAPTURE_MODE.immediate,
      run: () => commands.duplicateScreen()
    },
    {
      id: 'screen-delete',
      label: 'Delete screen',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.canDeleteScreen(),
      run: () => commands.deleteScreen()
    },
    {
      id: 'screen-start',
      label: 'Set start screen',
      capture: CAPTURE_MODE.immediate,
      run: () => commands.setStartScreen()
    },
    {
      id: 'flow-add',
      label: 'Add transition',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.addTransitionFromSelected()
    },
    {
      id: 'flow-delete',
      label: 'Delete transition',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasTransition(),
      run: () => commands.deleteSelectedTransition()
    },
    ...[
      ['forward', 'Bring forward'],
      ['backward', 'Send backward'],
      ['front', 'Bring to front'],
      ['back', 'Send to back'],
      ['top', 'Move to top'],
      ['bottom', 'Move to bottom'],
      ['up', 'Bring forward'],
      ['down', 'Send backward']
    ].map(([direction, label]) => ({
      id: `layer-${direction}`,
      label,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(),
      run: () => commands.moveSelectedLayer(direction)
    })),
    {
      id: 'nudge',
      label: 'Nudge selected',
      shortcut: 'arrow keys',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection() && Boolean(ctx.payload?.key),
      run: (ctx) => commands.nudge(ctx.payload.key, ctx.payload.amount)
    },
    {
      id: 'export-json',
      label: 'Export JSON',
      capture: CAPTURE_MODE.none,
      run: () => commands.exportJson()
    },
    {
      id: 'export-xml',
      label: 'LVGL XML',
      capture: CAPTURE_MODE.none,
      run: () => commands.exportXml()
    },
    {
      id: 'export-firmware',
      label: 'Firmware Bundle',
      capture: CAPTURE_MODE.none,
      run: () => commands.exportFirmware()
    },
    {
      id: 'firmware-build',
      label: 'Build Board',
      capture: CAPTURE_MODE.none,
      run: () => commands.runFirmware('build')
    },
    {
      id: 'firmware-flash',
      label: 'Upload Board',
      capture: CAPTURE_MODE.none,
      run: () => commands.runFirmware('flash')
    },
    {
      id: 'export-png',
      label: 'Export PNG',
      capture: CAPTURE_MODE.none,
      run: () => commands.exportPng()
    },
    {
      id: 'copy-output',
      label: 'Copy output',
      capture: CAPTURE_MODE.none,
      run: () => commands.copyOutput()
    },
    {
      id: 'copy-terminal',
      label: 'Copy terminal',
      capture: CAPTURE_MODE.none,
      run: () => commands.copyTerminal()
    },
    {
      id: 'clear-terminal',
      label: 'Clear terminal',
      capture: CAPTURE_MODE.none,
      run: () => commands.clearTerminal()
    },
    {
      id: 'download-output',
      label: 'Download output',
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => ctx.hasBundle(),
      run: () => commands.downloadOutput()
    },
    {
      id: 'asset-delete',
      label: 'Delete asset',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelectedAsset(),
      run: () => commands.deleteSelectedAsset()
    },
    {
      id: 'context-duplicate',
      label: 'Duplicate',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.duplicateSelected()
    },
    {
      id: 'context-center',
      label: 'Center selected',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(),
      run: () => commands.centerSelected()
    },
    {
      id: 'context-delete',
      label: 'Delete',
      palette: false,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasEditableSelection(),
      run: () => commands.deleteSelected()
    }
  ]);
}
