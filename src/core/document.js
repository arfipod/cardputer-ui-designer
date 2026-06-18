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

const DEFAULTS = {
  text: base('Text', 14, 14, 92, 18, { text: 'READY', fontSize: 14, align: 'left', color: '#e7f0ff' }),
  button: base('Button', 72, 86, 96, 30, { text: 'OK', fontSize: 13, align: 'center', fill: '#263144', stroke: '#70d6ff', color: '#f8fbff', radius: 6 }),
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

export function createDocument() {
  const now = new Date().toISOString();
  return {
    version: 2,
    meta: { name: 'Cardputer UI', createdAt: now, updatedAt: now },
    device: DEFAULT_DEVICE,
    grid: { enabled: true, size: 5, snap: true },
    elements: [
      makeElement('roundRect', 'panel-1'),
    makeElement('text', 'title-1', { x: 20, y: 20, w: 150, props: { text: 'CARDPUTER ADV', fontSize: 13 } }),
    makeElement('progress', 'battery-1', { x: 20, y: 52, w: 138, h: 12, props: { value: 76 } }),
    makeElement('sparkline', 'wave-1', { x: 20, y: 70, w: 196, h: 16, props: { mode: 'wave', showAxes: true } }),
    makeElement('led', 'status-led-1', { x: 198, y: 22, props: { text: 'BT' } }),
      makeElement('button', 'softkey-1', { x: 24, y: 92, w: 72, props: { text: 'MENU' } }),
      makeElement('button', 'softkey-2', { x: 144, y: 92, w: 72, props: { text: 'RUN' } })
    ]
  };
}

export function makeElement(type, id = cryptoId(), patch = {}) {
  const defaults = structuredClone(DEFAULTS[type]);
  return {
    id,
    type,
    ...defaults,
    ...patch,
    props: { ...defaults.props, ...(patch.props ?? {}) }
  };
}

export function addElement(doc, type) {
  return touch({ ...doc, elements: [...doc.elements, clampElementToDevice(makeElement(type), doc.device)] });
}

export function updateElement(doc, id, patch) {
  return touch({
    ...doc,
    elements: doc.elements.map((element) =>
      element.id === id ? clampElementToDevice({ ...element, ...patch, props: { ...element.props, ...(patch.props ?? {}) } }, doc.device) : element
    )
  });
}

export function removeElement(doc, id) {
  return touch({ ...doc, elements: doc.elements.filter((element) => element.id !== id) });
}

export function duplicateElement(doc, id) {
  const source = doc.elements.find((element) => element.id === id);
  if (!source) return doc;
  const clone = structuredClone(source);
  clone.id = cryptoId();
  clone.name = `${source.name} copy`;
  clone.x += doc.grid.size;
  clone.y += doc.grid.size;
  return touch({ ...doc, elements: [...doc.elements, clampElementToDevice(clone, doc.device)] });
}

export function moveLayer(doc, id, direction) {
  const elements = [...doc.elements];
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return doc;
  const [element] = elements.splice(index, 1);
  if (direction === 'front') elements.push(element);
  if (direction === 'back') elements.unshift(element);
  if (direction === 'up') elements.splice(Math.min(index + 1, elements.length), 0, element);
  if (direction === 'down') elements.splice(Math.max(index - 1, 0), 0, element);
  return touch({ ...doc, elements });
}

export function setDevice(doc, deviceId) {
  const device = DEVICE_PRESETS.find((preset) => preset.id === deviceId) ?? DEFAULT_DEVICE;
  return touch({ ...doc, device, elements: doc.elements.map((element) => clampElementToDevice(element, device)) });
}

function touch(doc) {
  return { ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } };
}

function base(name, x, y, w, h, props) {
  return { name, x, y, w, h, visible: true, locked: false, props };
}

function cryptoId() {
  if ('crypto' in globalThis && 'randomUUID' in globalThis.crypto) return globalThis.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
