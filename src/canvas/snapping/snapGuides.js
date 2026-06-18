const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderSnapGuides(guides, device) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'snap-guides');

  for (const guide of guides ?? []) {
    const line = document.createElementNS(SVG_NS, 'line');
    if (guide.axis === 'x') {
      line.setAttribute('x1', guide.value);
      line.setAttribute('y1', 0);
      line.setAttribute('x2', guide.value);
      line.setAttribute('y2', device.height);
    } else {
      line.setAttribute('x1', 0);
      line.setAttribute('y1', guide.value);
      line.setAttribute('x2', device.width);
      line.setAttribute('y2', guide.value);
    }
    group.append(line);
  }

  return group;
}
