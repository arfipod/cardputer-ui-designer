export const CAPTURE_MODE = Object.freeze({
  immediate: 'immediate',
  ephemeral: 'ephemeral',
  none: 'none'
});

export const DEFAULT_MAX_HISTORY_ENTRIES = 100;

export function createSnapshotHistory(initialValue, {
  maxEntries = DEFAULT_MAX_HISTORY_ENTRIES,
  serialize = JSON.stringify,
  parse = JSON.parse
} = {}) {
  let history = [serialize(initialValue)];
  let future = [];

  return {
    capture(value, mode = CAPTURE_MODE.immediate) {
      if (mode === CAPTURE_MODE.none || mode === CAPTURE_MODE.ephemeral) return;
      if (mode !== CAPTURE_MODE.immediate) throw new Error(`Unknown capture mode "${mode}".`);

      const raw = serialize(value);
      if (history.at(-1) !== raw) history.push(raw);
      if (history.length > maxEntries) history = history.slice(-maxEntries);
      future = [];
    },
    reset(value) {
      history = [serialize(value)];
      future = [];
    },
    undo() {
      if (history.length <= 1) return null;
      const current = history.pop();
      if (current) future.push(current);
      return parse(history.at(-1));
    },
    redo() {
      const next = future.pop();
      if (!next) return null;
      history.push(next);
      return parse(next);
    },
    canUndo: () => history.length > 1,
    canRedo: () => future.length > 0,
    size: () => history.length
  };
}
