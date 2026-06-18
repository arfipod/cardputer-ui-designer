import { getElement, getScreen } from '../../core/project.js';

export function activeScreen(project, editorState) {
  return getScreen(project, editorState.selectedScreenId);
}

export function selectedElement(project, editorState) {
  return selectedElements(project, editorState)[0];
}

export function selectedElementIds(project, editorState) {
  const screen = activeScreen(project, editorState);
  const ids = Array.isArray(editorState.selectedElementIds)
    ? editorState.selectedElementIds
    : editorState.selectedElementId
      ? [editorState.selectedElementId]
      : [];
  return ids.filter((id) => screen?.elements.some((element) => element.id === id));
}

export function selectedElements(project, editorState) {
  return selectedElementIds(project, editorState)
    .map((id) => getElement(project, editorState.selectedScreenId, id))
    .filter(Boolean);
}

export function elementBounds(elements) {
  if (!elements.length) return null;
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.w));
  const bottom = Math.max(...elements.map((element) => element.y + element.h));
  return { id: 'selection', x: left, y: top, w: right - left, h: bottom - top };
}

export function selectedScreenExists(project, editorState) {
  return project.screens.some((screen) => screen.id === editorState.selectedScreenId);
}
