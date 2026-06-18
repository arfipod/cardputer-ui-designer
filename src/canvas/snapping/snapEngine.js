const DEFAULT_THRESHOLD_PX = 6;

export function smartSnapMove({ element, x, y, device, elements = [], zoom = 1, enabled = true, thresholdPx = DEFAULT_THRESHOLD_PX }) {
  const rounded = { x: Math.round(x), y: Math.round(y) };
  if (!enabled || !element || !device) return { x: rounded.x, y: rounded.y, guides: [] };

  const threshold = thresholdPx / Math.max(zoom, 1);
  const targets = alignmentTargets(device, elements, element.id);
  const xSnap = bestAxisSnap('x', { ...element, x: rounded.x, y: rounded.y }, targets.x, threshold);
  const ySnap = bestAxisSnap('y', { ...element, x: rounded.x, y: rounded.y }, targets.y, threshold);

  const snapped = {
    x: xSnap ? Math.round(rounded.x + xSnap.delta) : rounded.x,
    y: ySnap ? Math.round(rounded.y + ySnap.delta) : rounded.y,
    guides: []
  };

  if (xSnap) snapped.guides.push({ axis: 'x', value: xSnap.target.value, source: xSnap.source.name, target: xSnap.target.name });
  if (ySnap) snapped.guides.push({ axis: 'y', value: ySnap.target.value, source: ySnap.source.name, target: ySnap.target.name });
  return snapped;
}

function alignmentTargets(device, elements, activeId) {
  const targets = {
    x: [
      { name: 'canvas-left', value: 0 },
      { name: 'canvas-center-x', value: device.width / 2 },
      { name: 'canvas-right', value: device.width }
    ],
    y: [
      { name: 'canvas-top', value: 0 },
      { name: 'canvas-center-y', value: device.height / 2 },
      { name: 'canvas-bottom', value: device.height }
    ]
  };

  for (const item of elements) {
    if (!item || item.id === activeId || item.visible === false) continue;
    targets.x.push(
      { name: 'element-left', value: item.x },
      { name: 'element-center-x', value: item.x + item.w / 2 },
      { name: 'element-right', value: item.x + item.w }
    );
    targets.y.push(
      { name: 'element-top', value: item.y },
      { name: 'element-center-y', value: item.y + item.h / 2 },
      { name: 'element-bottom', value: item.y + item.h }
    );
  }

  return targets;
}

function bestAxisSnap(axis, element, targets, threshold) {
  const sources = axis === 'x'
    ? [
        { name: 'left', value: element.x },
        { name: 'center-x', value: element.x + element.w / 2 },
        { name: 'right', value: element.x + element.w }
      ]
    : [
        { name: 'top', value: element.y },
        { name: 'center-y', value: element.y + element.h / 2 },
        { name: 'bottom', value: element.y + element.h }
      ];

  let best = null;
  for (const source of sources) {
    for (const target of targets) {
      const delta = target.value - source.value;
      const distance = Math.abs(delta);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) best = { source, target, delta, distance };
    }
  }
  return best;
}
