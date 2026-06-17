import test from 'node:test';
import assert from 'node:assert/strict';
import { addElement, createDocument, duplicateElement, setDevice, updateElement } from '../src/core/document.js';
import { clampElementToDevice, valueRatio } from '../src/core/geometry.js';
import { exportM5GfxCpp } from '../src/exporters/cpp.js';
import { exportLvglC } from '../src/exporters/lvgl.js';

test('creates a Cardputer-Adv landscape document', () => {
  const doc = createDocument();
  assert.equal(doc.version, 2);
  assert.equal(doc.device.width, 240);
  assert.equal(doc.device.height, 135);
  assert.ok(doc.elements.length >= 4);
});

test('adds and duplicates elements', () => {
  let doc = createDocument();
  doc = addElement(doc, 'gauge');
  const gauge = doc.elements.at(-1);
  assert.equal(gauge.type, 'gauge');
  doc = duplicateElement(doc, gauge.id);
  assert.equal(doc.elements.at(-1).type, 'gauge');
  assert.notEqual(doc.elements.at(-1).id, gauge.id);
});

test('clamps elements to device bounds', () => {
  const doc = createDocument();
  const clamped = clampElementToDevice({ ...doc.elements[0], x: 999, y: 999, w: 999, h: 999 }, doc.device);
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 0);
  assert.equal(clamped.w, 240);
  assert.equal(clamped.h, 135);
});

test('supports portrait preset', () => {
  let doc = createDocument();
  doc = setDevice(doc, 'cardputer-adv-portrait');
  assert.equal(doc.device.width, 135);
  assert.equal(doc.device.height, 240);
});

test('calculates normalized values safely', () => {
  assert.equal(valueRatio(50, 0, 100), 0.5);
  assert.equal(valueRatio(200, 0, 100), 1);
  assert.equal(valueRatio(20, 100, 100), 0);
});

test('generates M5GFX and LVGL code', () => {
  let doc = createDocument();
  doc = updateElement(doc, 'title-1', { props: { text: 'HELLO' } });
  const cpp = exportM5GfxCpp(doc);
  const lvgl = exportLvglC(doc);
  assert.match(cpp, /drawGeneratedUi/);
  assert.match(cpp, /HELLO/);
  assert.match(lvgl, /build_generated_screen/);
});
