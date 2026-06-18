export function createEditorStore(initialState = {}) {
  let state = {
    selectedScreenId: initialState.selectedScreenId ?? null,
    selectedElementId: initialState.selectedElementId ?? null,
    selectedTransitionId: initialState.selectedTransitionId ?? null,
    selectedAssetId: initialState.selectedAssetId ?? null,
    hoveredElementId: initialState.hoveredElementId ?? null,
    activeTool: initialState.activeTool ?? null,
    zoom: initialState.zoom ?? 3,
    dragState: initialState.dragState ?? null,
    shouldCenterStage: initialState.shouldCenterStage ?? true,
    lastStageViewportSize: initialState.lastStageViewportSize ?? ''
  };

  return {
    getState: () => state,
    update(patch) {
      Object.assign(state, patch);
      return state;
    },
    selectScreen(screenId, selectedElementId = null) {
      return this.update({
        selectedScreenId: screenId,
        selectedElementId,
        selectedTransitionId: null,
        hoveredElementId: null
      });
    },
    selectElement(selectedElementId) {
      return this.update({ selectedElementId });
    },
    clearElementSelection() {
      return this.update({ selectedElementId: null });
    },
    selectTransition(selectedTransitionId, selectedScreenId, selectedElementId) {
      return this.update({ selectedTransitionId, selectedScreenId, selectedElementId });
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
