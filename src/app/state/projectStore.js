import { createProject, getScreen, migrateProject } from '../../core/project.js';

export function createProjectStore(initialProject = createProject()) {
  let project = migrateProject(initialProject);
  let history = [snapshot(project)];
  let future = [];

  return {
    getProject: () => project,
    setProject(nextProject, { recordHistory = true } = {}) {
      project = migrateProject(nextProject);
      if (recordHistory) pushHistory();
      return project;
    },
    commit(nextProject) {
      project = migrateProject(nextProject);
      pushHistory();
      return project;
    },
    replaceProject(nextProject) {
      project = migrateProject(nextProject);
      history = [snapshot(project)];
      future = [];
      return project;
    },
    undo() {
      if (history.length <= 1) return project;
      const current = history.pop();
      if (current) future.push(current);
      project = parseSnapshot(history.at(-1));
      return project;
    },
    redo() {
      const next = future.pop();
      if (!next) return project;
      history.push(next);
      project = parseSnapshot(next);
      return project;
    },
    canUndo: () => history.length > 1,
    canRedo: () => future.length > 0,
    getPersistentProject: () => migrateProject(project)
  };

  function pushHistory() {
    const raw = snapshot(project);
    if (history.at(-1) !== raw) history.push(raw);
    if (history.length > 80) history = history.slice(-80);
    future = [];
  }
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
