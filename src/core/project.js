import { clampElementToDevice } from './geometry.js';

export const DEVICE_PRESETS = [
  {
    id: 'cardputer-adv-landscape',
    name: 'M5Stack Cardputer-Adv landscape',
    width: 240,
    height: 135,
    colorDepth: 'RGB565 / ST7789V2',
    notes: 'Official Cardputer-Adv display resolution, practical firmware orientation.'
  },
  {
    id: 'cardputer-adv-portrait',
    name: 'M5Stack Cardputer-Adv portrait',
    width: 135,
    height: 240,
    colorDepth: 'RGB565 / ST7789V2',
    notes: 'Physical panel orientation for portrait UI experiments.'
  }
];

export const DEFAULT_DEVICE = DEVICE_PRESETS[0];

export const EVENT_TRIGGERS = ['press', 'longPress', 'keyEnter', 'keyBack', 'softKeyLeft', 'softKeyRight'];

const DEFAULT_GRID = { enabled: true, size: 5, snap: true };

const DEFAULTS = {
  text: base('Text', 14, 14, 92, 18, { text: 'READY', fontSize: 14, align: 'left', color: '#e7f0ff', fontId: '' }),
  button: base('Button', 72, 86, 96, 30, { text: 'OK', fontSize: 13, align: 'center', fill: '#263144', stroke: '#70d6ff', color: '#f8fbff', radius: 6, fontId: '' }),
  rect: base('Rectangle', 16, 46, 70, 34, { fill: '#1d2635', stroke: '#4f6688', radius: 0 }),
  roundRect: base('Panel', 12, 38, 216, 72, { fill: '#111827', stroke: '#39506f', radius: 8 }),
  line: base('Line', 18, 66, 110, 1, { stroke: '#70d6ff', thickness: 1 }),
  progress: base('Progress', 24, 62, 192, 14, { value: 62, min: 0, max: 100, fill: '#70d6ff', stroke: '#34445d', radius: 4, orientation: 'horizontal' }),
  gauge: base('Gauge', 86, 26, 68, 68, { value: 72, min: 0, max: 100, fill: '#f6c177', stroke: '#526179', thickness: 6 }),
  led: base('LED', 198, 18, 14, 14, { fill: '#4ade80', stroke: '#b8ffce', text: 'ON' }),
  icon: base('Icon', 18, 18, 24, 24, { icon: 'wifi', color: '#70d6ff' }),
  sparkline: base('Sparkline', 36, 82, 168, 28, {
    mode: 'wave',
    points: [0, 50, 8, 74, 16, 28, 24, 84, 32, 18, 40, 76, 48, 42, 56, 91, 64, 22, 72, 66, 80, 34, 88, 79, 100, 46],
    fill: '#0b1018',
    stroke: '#9bffb7',
    axis: '#526179',
    thickness: 2,
    showAxes: true
  }),
  image: base('Image placeholder', 148, 22, 58, 42, { imageLabel: 'bitmap', fill: '#1c2634', stroke: '#5b6f93', color: '#cbd5e1' })
};

export function createProject() {
  const now = new Date().toISOString();
  const main = createScreen('Main', 'screen-main');
  main.elements = [
    makeElement('roundRect', 'panel-1'),
    makeElement('text', 'title-1', { x: 20, y: 20, w: 150, props: { text: 'CARDPUTER ADV', fontSize: 13 } }),
    makeElement('progress', 'battery-1', { x: 20, y: 52, w: 138, h: 12, props: { value: 76 } }),
    makeElement('sparkline', 'wave-1', { x: 20, y: 70, w: 196, h: 16, props: { mode: 'wave', showAxes: true } }),
    makeElement('led', 'status-led-1', { x: 198, y: 22, props: { text: 'BT' } }),
    makeElement('button', 'softkey-1', { x: 24, y: 92, w: 72, props: { text: 'MENU' } }),
    makeElement('button', 'softkey-2', { x: 144, y: 92, w: 72, props: { text: 'RUN' } })
  ];
  return {
    version: 3,
    meta: { name: 'Cardputer UI', createdAt: now, updatedAt: now },
    device: DEFAULT_DEVICE,
    grid: structuredClone(DEFAULT_GRID),
    screens: [main],
    assets: { fonts: [] },
    styles: [],
    flow: { startScreenId: main.id, transitions: [] }
  };
}

export function migrateProject(value) {
  if (!value || typeof value !== 'object') throw new Error('Unsupported Cardputer UI project');
  if (value.version === 3) return normalizeProject(value);
  if (value.version === 2 && Array.isArray(value.elements) && value.device) return migrateV2Document(value);
  throw new Error('Unsupported Cardputer UI project');
}

export function createScreen(name = 'Screen', id = cryptoId('screen')) {
  return {
    id,
    name,
    slug: uniqueSlug(name),
    permanent: false,
    elements: []
  };
}

export function makeElement(type, id = cryptoId(type), patch = {}) {
  const defaults = structuredClone(DEFAULTS[type]);
  if (!defaults) throw new Error(`Unknown element type: ${type}`);
  return {
    id,
    type,
    ...defaults,
    ...patch,
    events: normalizeEvents(patch.events ?? defaults.events),
    props: { ...defaults.props, ...(patch.props ?? {}) }
  };
}

export function getScreen(project, screenId) {
  return project.screens.find((screen) => screen.id === screenId) ?? project.screens[0];
}

export function getStartScreen(project) {
  return getScreen(project, project.flow.startScreenId);
}

export function getElement(project, screenId, elementId) {
  return getScreen(project, screenId)?.elements.find((element) => element.id === elementId);
}

export function addElement(project, screenId, type) {
  return updateScreenElements(project, screenId, (elements) => [...elements, clampElementToDevice(makeElement(type), project.device)]);
}

export function updateElement(project, screenId, id, patch) {
  return updateScreenElements(project, screenId, (elements) =>
    elements.map((element) =>
      element.id === id
        ? clampElementToDevice({
            ...element,
            ...patch,
            props: { ...element.props, ...(patch.props ?? {}) },
            events: normalizeEvents({ ...(element.events ?? {}), ...(patch.events ?? {}) })
          }, project.device)
        : element
    )
  );
}

export function removeElement(project, screenId, id) {
  const next = updateScreenElements(project, screenId, (elements) => elements.filter((element) => element.id !== id));
  return cleanupFlow({ ...next, flow: { ...next.flow, transitions: next.flow.transitions.filter((transition) => transition.elementId !== id) } });
}

export function removeElements(project, screenId, ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return project;
  const next = updateScreenElements(project, screenId, (elements) => elements.filter((element) => !idSet.has(element.id)));
  return cleanupFlow({ ...next, flow: { ...next.flow, transitions: next.flow.transitions.filter((transition) => !idSet.has(transition.elementId)) } });
}

export function duplicateElement(project, screenId, id) {
  const source = getElement(project, screenId, id);
  if (!source) return project;
  const clone = structuredClone(source);
  clone.id = cryptoId(source.type);
  clone.name = `${source.name} copy`;
  clone.x += project.grid.size;
  clone.y += project.grid.size;
  return updateScreenElements(project, screenId, (elements) => [...elements, clampElementToDevice(clone, project.device)]);
}

export function duplicateElements(project, screenId, ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return project;
  return updateScreenElements(project, screenId, (elements) => {
    const clones = elements
      .filter((element) => idSet.has(element.id))
      .map((source) => {
        const clone = structuredClone(source);
        clone.id = cryptoId(source.type);
        clone.name = `${source.name} copy`;
        clone.x += project.grid.size;
        clone.y += project.grid.size;
        return clampElementToDevice(clone, project.device);
      });
    return [...elements, ...clones];
  });
}

export function alignElements(project, screenId, ids, alignment) {
  const idSet = new Set(ids);
  const screen = getScreen(project, screenId);
  const targets = screen.elements.filter((element) => idSet.has(element.id));
  if (targets.length < 2) return project;

  const bounds = elementBounds(targets);
  return updateScreenElements(project, screenId, (elements) =>
    elements.map((element) => {
      if (!idSet.has(element.id)) return element;
      if (alignment === 'left') return clampElementToDevice({ ...element, x: bounds.left }, project.device);
      if (alignment === 'hcenter') return clampElementToDevice({ ...element, x: Math.round(bounds.left + bounds.w / 2 - element.w / 2) }, project.device);
      if (alignment === 'right') return clampElementToDevice({ ...element, x: bounds.right - element.w }, project.device);
      if (alignment === 'top') return clampElementToDevice({ ...element, y: bounds.top }, project.device);
      if (alignment === 'vcenter') return clampElementToDevice({ ...element, y: Math.round(bounds.top + bounds.h / 2 - element.h / 2) }, project.device);
      if (alignment === 'bottom') return clampElementToDevice({ ...element, y: bounds.bottom - element.h }, project.device);
      return element;
    })
  );
}

export function distributeElements(project, screenId, ids, axis) {
  const idSet = new Set(ids);
  const screen = getScreen(project, screenId);
  const targets = screen.elements.filter((element) => idSet.has(element.id));
  if (targets.length < 3) return project;

  const horizontal = axis === 'horizontal';
  const sorted = [...targets].sort((a, b) => horizontal ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x);
  const bounds = elementBounds(sorted);
  const totalSize = sorted.reduce((sum, element) => sum + (horizontal ? element.w : element.h), 0);
  const gap = ((horizontal ? bounds.w : bounds.h) - totalSize) / (sorted.length - 1);
  const positions = new Map();
  let cursor = horizontal ? bounds.left : bounds.top;

  sorted.forEach((element) => {
    positions.set(element.id, Math.round(cursor));
    cursor += (horizontal ? element.w : element.h) + gap;
  });

  return updateScreenElements(project, screenId, (elements) =>
    elements.map((element) => {
      if (!positions.has(element.id)) return element;
      const position = positions.get(element.id);
      return clampElementToDevice(horizontal ? { ...element, x: position } : { ...element, y: position }, project.device);
    })
  );
}

export function moveLayer(project, screenId, id, direction) {
  return updateScreenElements(project, screenId, (source) => {
    const elements = [...source];
    const index = elements.findIndex((element) => element.id === id);
    if (index < 0) return elements;
    const [element] = elements.splice(index, 1);
    if (direction === 'front' || direction === 'top') elements.push(element);
    if (direction === 'back' || direction === 'bottom') elements.unshift(element);
    if (direction === 'up') elements.splice(Math.min(index + 1, elements.length), 0, element);
    if (direction === 'down') elements.splice(Math.max(index - 1, 0), 0, element);
    return elements;
  });
}

export function moveLayers(project, screenId, ids, direction) {
  const idSet = new Set(ids);
  if (!idSet.size) return project;
  return updateScreenElements(project, screenId, (source) => {
    const elements = [...source];
    if (direction === 'front' || direction === 'top') return [...elements.filter((element) => !idSet.has(element.id)), ...elements.filter((element) => idSet.has(element.id))];
    if (direction === 'back' || direction === 'bottom') return [...elements.filter((element) => idSet.has(element.id)), ...elements.filter((element) => !idSet.has(element.id))];
    if (direction === 'forward' || direction === 'up') {
      for (let index = elements.length - 2; index >= 0; index -= 1) {
        if (idSet.has(elements[index].id) && !idSet.has(elements[index + 1].id)) {
          [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
        }
      }
    }
    if (direction === 'backward' || direction === 'down') {
      for (let index = 1; index < elements.length; index += 1) {
        if (idSet.has(elements[index].id) && !idSet.has(elements[index - 1].id)) {
          [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
        }
      }
    }
    return elements;
  });
}

export function setDevice(project, deviceId) {
  const device = DEVICE_PRESETS.find((preset) => preset.id === deviceId) ?? DEFAULT_DEVICE;
  return touch({
    ...project,
    device,
    screens: project.screens.map((screen) => ({
      ...screen,
      elements: screen.elements.map((element) => clampElementToDevice(element, device))
    }))
  });
}

export function addScreen(project, name = `Screen ${project.screens.length + 1}`) {
  const screen = createScreen(name);
  screen.slug = makeUniqueScreenSlug(project.screens, name);
  return touch({ ...project, screens: [...project.screens, screen] });
}

export function duplicateScreen(project, screenId) {
  const source = getScreen(project, screenId);
  if (!source) return project;
  const clone = structuredClone(source);
  clone.id = cryptoId('screen');
  clone.name = `${source.name} copy`;
  clone.slug = makeUniqueScreenSlug(project.screens, clone.name);
  clone.elements = clone.elements.map((element) => ({ ...structuredClone(element), id: cryptoId(element.type) }));
  return touch({ ...project, screens: [...project.screens, clone] });
}

export function updateScreen(project, screenId, patch) {
  return touch({
    ...project,
    screens: project.screens.map((screen) =>
      screen.id === screenId
        ? { ...screen, ...patch, slug: patch.name && !patch.slug ? makeUniqueScreenSlug(project.screens.filter((item) => item.id !== screenId), patch.name) : patch.slug ?? screen.slug }
        : screen
    )
  });
}

export function removeScreen(project, screenId) {
  if (project.screens.length <= 1) return project;
  const screens = project.screens.filter((screen) => screen.id !== screenId);
  const startScreenId = project.flow.startScreenId === screenId ? screens[0].id : project.flow.startScreenId;
  return cleanupFlow(touch({
    ...project,
    screens,
    flow: {
      ...project.flow,
      startScreenId,
      transitions: project.flow.transitions.filter((transition) => transition.fromScreenId !== screenId && transition.toScreenId !== screenId)
    }
  }));
}

export function addTransition(project, transition) {
  const next = {
    id: cryptoId('transition'),
    fromScreenId: transition.fromScreenId,
    elementId: transition.elementId,
    trigger: EVENT_TRIGGERS.includes(transition.trigger) ? transition.trigger : 'press',
    toScreenId: transition.toScreenId,
    animation: transition.animation ?? 'none'
  };
  return cleanupFlow(touch({ ...project, flow: { ...project.flow, transitions: [...project.flow.transitions, next] } }));
}

export function updateTransition(project, transitionId, patch) {
  return cleanupFlow(touch({
    ...project,
    flow: {
      ...project.flow,
      transitions: project.flow.transitions.map((transition) =>
        transition.id === transitionId
          ? { ...transition, ...patch, trigger: patch.trigger && EVENT_TRIGGERS.includes(patch.trigger) ? patch.trigger : transition.trigger }
          : transition
      )
    }
  }));
}

export function removeTransition(project, transitionId) {
  return touch({ ...project, flow: { ...project.flow, transitions: project.flow.transitions.filter((transition) => transition.id !== transitionId) } });
}

export function updateGrid(project, patch) {
  return touch({ ...project, grid: { ...project.grid, ...patch } });
}

export function addFont(project, font) {
  return touch({
    ...project,
    assets: { ...project.assets, fonts: [...project.assets.fonts, font] }
  });
}

export function updateFont(project, fontId, patch) {
  return touch({
    ...project,
    assets: {
      ...project.assets,
      fonts: project.assets.fonts.map((font) => font.id === fontId ? { ...font, ...patch } : font)
    }
  });
}

export function removeFont(project, fontId) {
  return touch({
    ...project,
    assets: { ...project.assets, fonts: project.assets.fonts.filter((font) => font.id !== fontId) },
    screens: project.screens.map((screen) => ({
      ...screen,
      elements: screen.elements.map((element) => ({
        ...element,
        props: element.props.fontId === fontId ? { ...element.props, fontId: '' } : element.props
      }))
    }))
  });
}

export function cleanupFlow(project) {
  const screenIds = new Set(project.screens.map((screen) => screen.id));
  const elementIdsByScreen = new Map(project.screens.map((screen) => [screen.id, new Set(screen.elements.map((element) => element.id))]));
  const transitions = project.flow.transitions.filter((transition) =>
    screenIds.has(transition.fromScreenId) &&
    screenIds.has(transition.toScreenId) &&
    elementIdsByScreen.get(transition.fromScreenId)?.has(transition.elementId)
  );
  return { ...project, flow: { ...project.flow, transitions } };
}

export function safeIdentifier(value, fallback = 'item') {
  const clean = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function updateScreenElements(project, screenId, mapper) {
  return touch({
    ...project,
    screens: project.screens.map((screen) => screen.id === screenId ? { ...screen, elements: mapper(screen.elements) } : screen)
  });
}

function migrateV2Document(doc) {
  const screen = createScreen('Main', 'screen-main');
  screen.elements = doc.elements.map((element) => normalizeElement(element));
  return normalizeProject({
    version: 3,
    meta: doc.meta ?? { name: 'Cardputer UI', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    device: doc.device ?? DEFAULT_DEVICE,
    grid: doc.grid ?? structuredClone(DEFAULT_GRID),
    screens: [screen],
    assets: { fonts: [] },
    styles: [],
    flow: { startScreenId: screen.id, transitions: [] }
  });
}

function normalizeProject(project) {
  const screens = Array.isArray(project.screens) && project.screens.length
    ? project.screens.map((screen, index) => ({
        id: screen.id || cryptoId('screen'),
        name: screen.name || `Screen ${index + 1}`,
        slug: screen.slug || makeUniqueScreenSlug(project.screens.slice(0, index), screen.name || `Screen ${index + 1}`),
        permanent: Boolean(screen.permanent),
        elements: Array.isArray(screen.elements) ? screen.elements.map((element) => normalizeElement(element)) : []
      }))
    : [createScreen('Main', 'screen-main')];
  const startScreenId = screens.some((screen) => screen.id === project.flow?.startScreenId) ? project.flow.startScreenId : screens[0].id;
  return cleanupFlow({
    version: 3,
    meta: {
      name: project.meta?.name || 'Cardputer UI',
      createdAt: project.meta?.createdAt || new Date().toISOString(),
      updatedAt: project.meta?.updatedAt || new Date().toISOString()
    },
    device: project.device ?? DEFAULT_DEVICE,
    grid: { ...structuredClone(DEFAULT_GRID), ...(project.grid ?? {}) },
    screens,
    assets: { fonts: Array.isArray(project.assets?.fonts) ? project.assets.fonts.map(normalizeFont) : [] },
    styles: Array.isArray(project.styles) ? project.styles : [],
    flow: { startScreenId, transitions: Array.isArray(project.flow?.transitions) ? project.flow.transitions : [] }
  });
}

function normalizeElement(element) {
  return {
    ...element,
    id: element.id || cryptoId(element.type || 'element'),
    type: element.type || 'rect',
    name: element.name || element.type || 'Element',
    visible: element.visible !== false,
    locked: Boolean(element.locked),
    events: normalizeEvents(element.events),
    props: { ...(element.props ?? {}) }
  };
}

function elementBounds(elements) {
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.w));
  const bottom = Math.max(...elements.map((element) => element.y + element.h));
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

function normalizeEvents(events) {
  const value = events && typeof events === 'object' ? events : {};
  return EVENT_TRIGGERS.reduce((acc, trigger) => {
    acc[trigger] = value[trigger] ?? '';
    return acc;
  }, {});
}

function normalizeFont(font) {
  return {
    id: font.id || cryptoId('font'),
    name: font.name || 'Font',
    family: font.family || safeIdentifier(font.name || 'font'),
    filename: font.filename || 'font.ttf',
    mimeType: font.mimeType || 'font/ttf',
    dataUrl: font.dataUrl || '',
    variants: Array.isArray(font.variants) && font.variants.length
      ? font.variants.map((variant) => ({
          id: variant.id || cryptoId('font_variant'),
          name: variant.name || `${font.name || 'font'} ${variant.size || 12}`,
          size: Number(variant.size || 12),
          range: variant.range || '0x20-0x7F',
          symbols: variant.symbols || '',
          bpp: Number(variant.bpp || 1)
        }))
      : [{ id: cryptoId('font_variant'), name: 'Regular 12', size: 12, range: '0x20-0x7F', symbols: '', bpp: 1 }]
  };
}

function makeUniqueScreenSlug(screens, name) {
  const baseSlug = uniqueSlug(name);
  const used = new Set(screens.map((screen) => screen.slug));
  if (!used.has(baseSlug)) return baseSlug;
  let index = 2;
  while (used.has(`${baseSlug}-${index}`)) index += 1;
  return `${baseSlug}-${index}`;
}

function uniqueSlug(value) {
  return String(value ?? 'screen').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'screen';
}

function touch(project) {
  return { ...project, meta: { ...project.meta, updatedAt: new Date().toISOString() } };
}

function base(name, x, y, w, h, props) {
  return { name, x, y, w, h, visible: true, locked: false, events: {}, props };
}

function cryptoId(prefix = 'id') {
  const suffix = 'crypto' in globalThis && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${suffix}`;
}
