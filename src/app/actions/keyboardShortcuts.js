const EDITABLE_SELECTOR = 'input, textarea, select';
const GLOBAL_SHORTCUT_ACTIONS = new Set(['command-palette-open']);

// Keyboard mapping is separate from action implementations so shortcuts can
// grow without adding more command branching to main.js.
export async function runKeyboardShortcut(event, registry, ctx) {
  const shortcut = matchShortcut(event, registry);
  if (!shortcut) return false;

  if (event.target?.closest?.(EDITABLE_SELECTOR) && !GLOBAL_SHORTCUT_ACTIONS.has(shortcut.id)) return false;
  const actionContext = { ...ctx, payload: shortcut.payload };
  if (!registry.canRun(shortcut.id, actionContext)) return false;

  event.preventDefault();
  await registry.run(shortcut.id, actionContext);
  return true;
}

export function getShortcutEntries(registry) {
  return registry
    .all()
    .filter((action) => action.shortcut)
    .map((action) => ({
      id: action.id,
      label: action.label,
      shortcut: action.shortcut
    }));
}

export function shortcutLabel(shortcut) {
  return String(shortcut)
    .split('/')
    .map((part) => formatShortcutPart(part.trim()))
    .join(' / ');
}

function matchShortcut(event, registry) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return registry.get('nudge')?.shortcut
      ? { id: 'nudge', payload: { key: event.key, amount: event.shiftKey ? 5 : 1 } }
      : null;
  }

  for (const action of registry.all()) {
    if (!action.shortcut) continue;
    const shortcuts = String(action.shortcut).split('/').map((shortcut) => shortcut.trim());
    if (shortcuts.some((shortcut) => shortcutMatches(event, shortcut))) return { id: action.id };
  }
  return null;
}

function shortcutMatches(event, shortcut) {
  const parts = shortcut.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;

  const expectsMod = parts.includes('mod');
  const expectsShift = parts.includes('shift');
  const expectsAlt = parts.includes('alt');
  const expectsCtrl = parts.includes('ctrl');
  const expectsMeta = parts.includes('meta') || parts.includes('cmd');
  const expectedKey = parts.find((part) => !['mod', 'shift', 'alt', 'ctrl', 'meta', 'cmd'].includes(part));

  if (expectsMod && !(event.ctrlKey || event.metaKey)) return false;
  if (!expectsMod && !expectsCtrl && !expectsMeta && (event.ctrlKey || event.metaKey)) return false;
  if (expectsShift !== event.shiftKey && expectedKey !== '?') return false;
  if (expectsAlt !== event.altKey) return false;
  if (expectsCtrl && !event.ctrlKey) return false;
  if (expectsMeta && !event.metaKey) return false;
  if (!expectedKey) return false;

  return normalizedEventKey(event) === normalizedShortcutKey(expectedKey);
}

function normalizedEventKey(event) {
  if (event.key === ' ') return 'space';
  return event.key.toLowerCase();
}

function normalizedShortcutKey(key) {
  if (key === 'esc') return 'escape';
  if (key === 'del') return 'delete';
  return key;
}

function formatShortcutPart(shortcut) {
  if (shortcut === 'arrow keys') return 'Arrow keys';
  return shortcut
    .split('+')
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === 'mod') return 'Ctrl/Cmd';
      if (normalized === 'cmd' || normalized === 'meta') return 'Cmd';
      if (normalized === 'ctrl') return 'Ctrl';
      if (normalized === 'alt') return 'Alt';
      if (normalized === 'shift') return 'Shift';
      if (normalized === 'delete') return 'Delete';
      if (normalized === 'backspace') return 'Backspace';
      if (normalized === 'escape') return 'Esc';
      if (normalized.length === 1) return normalized.toUpperCase();
      return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
    })
    .join('+');
}
