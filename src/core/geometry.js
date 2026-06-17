export function snap(value, gridSize, enabled) {
  if (!enabled || gridSize <= 1) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function clampElementToDevice(element, device) {
  const w = clamp(Math.round(element.w), 1, device.width);
  const h = clamp(Math.round(element.h), 1, device.height);
  return {
    ...element,
    w,
    h,
    x: clamp(Math.round(element.x), 0, device.width - w),
    y: clamp(Math.round(element.y), 0, device.height - h)
  };
}

export function valueRatio(value = 0, min = 0, max = 100) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

export function svgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}
