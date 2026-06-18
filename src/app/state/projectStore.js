import { createProject, getScreen, migrateProject } from '../../core/project.js';
import { CAPTURE_MODE, createSnapshotHistory } from './history.js';

export function createProjectStore(initialProject = createProject()) {
  let project = migrateProject(initialProject);
  const history = createSnapshotHistory(project, {
    serialize: snapshot,
    parse: parseSnapshot
  });

  return {
    getProject: () => project,
    setProject(nextProject, options = {}) {
      project = migrateProject(nextProject);
      history.capture(project, captureMode(options));
      return project;
    },
    commit(nextProject, options = {}) {
      project = migrateProject(nextProject);
      history.capture(project, captureMode({ capture: CAPTURE_MODE.immediate, ...options }));
      return project;
    },
    replaceProject(nextProject) {
      project = migrateProject(nextProject);
      history.reset(project);
      return project;
    },
    undo() {
      project = history.undo() ?? project;
      return project;
    },
    redo() {
      project = history.redo() ?? project;
      return project;
    },
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    getPersistentProject: () => migrateProject(project)
  };
}

export function firstElementId(project, screenId) {
  return getScreen(project, screenId)?.elements.at(-1)?.id ?? null;
}

function snapshot(project) {
  return JSON.stringify(migrateProject(project));
}

function parseSnapshot(raw) {
  return migrateProject(raw ? JSON.parse(raw) : createProject());
}

function captureMode({ capture, recordHistory } = {}) {
  if (capture) return capture;
  if (recordHistory === false) return CAPTURE_MODE.ephemeral;
  return CAPTURE_MODE.immediate;
}
