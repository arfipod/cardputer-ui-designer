const EDITABLE_SELECTOR = 'input, textarea, select';

// Keyboard mapping is separate from action implementations so shortcuts can
// grow without adding more command branching to main.js.
export async function runKeyboardShortcut(event, registry, ctx) {
  if (event.target?.closest?.(EDITABLE_SELECTOR)) return false;

  const shortcut = matchShortcut(event);
  if (!shortcut) return false;

  event.preventDefault();
  await registry.run(shortcut.id, { ...ctx, payload: shortcut.payload });
  return true;
}

function matchShortcut(event) {
  const key = event.key.toLowerCase();
  const isMod = event.ctrlKey || event.metaKey;

  if (isMod && key === 'z') return { id: 'undo' };
  if (isMod && key === 'y') return { id: 'redo' };
  if (isMod && key === 'd') return { id: 'duplicate' };
  if (event.key === 'Delete' || event.key === 'Backspace') return { id: 'delete' };
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return { id: 'nudge', payload: { key: event.key, amount: event.shiftKey ? 5 : 1 } };
  }

  return null;
}
