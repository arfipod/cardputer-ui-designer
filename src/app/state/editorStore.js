export function createEditorStore(initialState = {}) {
  const initialSelectedElementIds = selectedElementIdsFromInitialState(initialState);
  let state = {
    selectedScreenId: initialState.selectedScreenId ?? null,
    selectedElementIds: initialSelectedElementIds,
    selectedElementId: initialSelectedElementIds[0] ?? null,
    selectedTransitionId: initialState.selectedTransitionId ?? null,
    selectedAssetId: initialState.selectedAssetId ?? null,
    hoveredElementId: initialState.hoveredElementId ?? null,
    activeTool: initialState.activeTool ?? null,
    zoom: initialState.zoom ?? 3,
    smartSnapEnabled: initialState.smartSnapEnabled ?? true,
    dragState: initialState.dragState ?? null,
    shouldCenterStage: initialState.shouldCenterStage ?? true,
    lastStageViewportSize: initialState.lastStageViewportSize ?? ''
  };

  return {
    getState: () => state,
    update(patch) {
      Object.assign(state, normalizeSelectionPatch(patch));
      return state;
    },
    selectScreen(screenId, selectedElementId = null) {
      return this.update({
        selectedScreenId: screenId,
        selectedElementIds: normalizeSelectedElementIds(selectedElementId),
        selectedTransitionId: null,
        hoveredElementId: null
      });
    },
    selectElement(selectedElementId) {
      return this.update({ selectedElementIds: normalizeSelectedElementIds(selectedElementId) });
    },
    selectElements(selectedElementIds) {
      return this.update({ selectedElementIds });
    },
    toggleElementSelection(selectedElementId) {
      const selectedElementIds = state.selectedElementIds.includes(selectedElementId)
        ? state.selectedElementIds.filter((id) => id !== selectedElementId)
        : [...state.selectedElementIds, selectedElementId];
      return this.update({ selectedElementIds });
    },
    clearElementSelection() {
      return this.update({ selectedElementIds: [] });
    },
    selectTransition(selectedTransitionId, selectedScreenId, selectedElementId) {
      return this.update({ selectedTransitionId, selectedScreenId, selectedElementIds: normalizeSelectedElementIds(selectedElementId) });
    },
    selectAsset(selectedAssetId) {
      return this.update({ selectedAssetId });
    },
    setHoveredElement(hoveredElementId) {
      return this.update({ hoveredElementId });
    },
    setActiveTool(activeTool) {
      return this.update({ activeTool });
    },
    setZoom(zoom) {
      return this.update({ zoom });
    },
    setSmartSnapEnabled(smartSnapEnabled) {
      return this.update({ smartSnapEnabled });
    },
    setDragState(dragState) {
      return this.update({ dragState });
    },
    requestStageCenter() {
      return this.update({ shouldCenterStage: true });
    },
    consumeStageCenterRequest() {
      return this.update({ shouldCenterStage: false });
    }
  };
}

function selectedElementIdsFromInitialState(initialState) {
  if (Array.isArray(initialState.selectedElementIds)) return normalizeSelectedElementIds(initialState.selectedElementIds);
  return normalizeSelectedElementIds(initialState.selectedElementId);
}

function normalizeSelectionPatch(patch) {
  if (hasOwn(patch, 'selectedElementIds')) {
    const selectedElementIds = normalizeSelectedElementIds(patch.selectedElementIds);
    return { ...patch, selectedElementIds, selectedElementId: selectedElementIds[0] ?? null };
  }
  if (hasOwn(patch, 'selectedElementId')) {
    const selectedElementIds = normalizeSelectedElementIds(patch.selectedElementId);
    return { ...patch, selectedElementIds, selectedElementId: selectedElementIds[0] ?? null };
  }
  return patch;
}

function normalizeSelectedElementIds(value) {
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(ids.filter(Boolean))];
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
