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
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => Boolean(ctx.payload?.type),
      run: (ctx) => commands.addElement(ctx.payload.type)
    },
    {
      id: 'project-import',
      label: 'Import project',
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => Boolean(ctx.payload?.file),
      run: (ctx) => commands.importProject(ctx.payload.file)
    },
    {
      id: 'zoom-set',
      label: 'Set zoom',
      capture: CAPTURE_MODE.none,
      canRun: (ctx) => Number.isFinite(ctx.payload?.zoom),
      run: (ctx) => commands.setZoom(ctx.payload.zoom)
    },
    {
      id: 'grid-enabled-set',
      label: 'Toggle grid',
      capture: CAPTURE_MODE.immediate,
      run: (ctx) => commands.setGridEnabled(Boolean(ctx.payload?.enabled))
    },
    {
      id: 'grid-snap-set',
      label: 'Toggle snap',
      capture: CAPTURE_MODE.immediate,
      run: (ctx) => commands.setGridSnap(Boolean(ctx.payload?.snap))
    },
    {
      id: 'grid-size-set',
      label: 'Set grid size',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => Number.isFinite(ctx.payload?.size),
      run: (ctx) => commands.setGridSize(ctx.payload.size)
    },
    {
      id: 'device-set',
      label: 'Set device',
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
      shortcut: 'delete',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.deleteSelected()
    },
    {
      id: 'center',
      label: 'Center selected',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.centerSelected()
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
    ...['up', 'down', 'front', 'back'].map((direction) => ({
      id: `layer-${direction}`,
      label: `Layer ${direction}`,
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.moveSelectedLayer(direction)
    })),
    {
      id: 'nudge',
      label: 'Nudge selected',
      shortcut: 'arrow keys',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection() && Boolean(ctx.payload?.key),
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
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.duplicateSelected()
    },
    {
      id: 'context-center',
      label: 'Center selected',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.centerSelected()
    },
    {
      id: 'context-delete',
      label: 'Delete',
      capture: CAPTURE_MODE.immediate,
      canRun: (ctx) => ctx.hasSelection(),
      run: () => commands.deleteSelected()
    }
  ]);
}
