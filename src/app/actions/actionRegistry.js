import { CAPTURE_MODE } from '../state/history.js';

export { CAPTURE_MODE };

// Tiny dependency-free registry for editor commands. Actions describe metadata
// and receive the current editor context when they run.
export function createActionRegistry() {
  const actions = new Map();

  function register(action) {
    const id = action.id ?? action.name;
    if (!id) throw new Error('Action is missing an id.');
    if (typeof action.run !== 'function') throw new Error(`Action "${id}" is missing run(ctx).`);
    if (actions.has(id)) throw new Error(`Action "${id}" is already registered.`);

    actions.set(id, {
      capture: CAPTURE_MODE.none,
      label: id,
      ...action,
      id,
      name: action.name ?? id
    });
  }

  function canRun(id, ctx = {}) {
    const action = actions.get(id);
    if (!action) return false;
    return action.canRun ? Boolean(action.canRun(ctx)) : true;
  }

  async function run(id, ctx = {}) {
    const action = actions.get(id);
    if (!action || !canRun(id, ctx)) return false;
    await action.run(ctx);
    return true;
  }

  return {
    all: () => [...actions.values()],
    canRun,
    get: (id) => actions.get(id) ?? null,
    register,
    registerMany: (items) => items.forEach(register),
    run
  };
}
