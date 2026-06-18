import { getElement, getScreen } from '../../core/project.js';

export function activeScreen(project, editorState) {
  return getScreen(project, editorState.selectedScreenId);
}

export function selectedElement(project, editorState) {
  return getElement(project, editorState.selectedScreenId, editorState.selectedElementId);
}

export function selectedScreenExists(project, editorState) {
  return project.screens.some((screen) => screen.id === editorState.selectedScreenId);
}
