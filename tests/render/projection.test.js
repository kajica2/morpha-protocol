// The particle field's projection onto the viewport.
//
// This module owns the arithmetic that maps the simulation's field units
// onto the camera's NDC. It is separate from Renderer.js because the
// renderer imports the GLSL with Vite's `?raw` suffix and therefore cannot
// be imported under plain `node --test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFieldProjection,
  projectFieldPoint,
} from '../../src/render/Projection.js';

test('the field corners map onto the visible range', () => {
  // A 2x2 field on a square viewport.
  const projection = createFieldProjection({ width: 2, height: 2 }, 1);

  const topLeft = projectFieldPoint(0, 0, projection);
  const bottomRight = projectFieldPoint(2, 2, projection);

  assert.ok(Math.abs(topLeft.x + 1) < 1e-9, 'x must start at -1');
  assert.ok(Math.abs(topLeft.y + 1) < 1e-9, 'y must start at -1');
  assert.ok(Math.abs(bottomRight.x - 1) < 1e-9, 'x must end at 1');
  assert.ok(Math.abs(bottomRight.y - 1) < 1e-9, 'y must end at 1');
});

test('the field fills a wide viewport', () => {
  // The shader multiplies y by the aspect ratio, so the visible y range
  // is -1/aspect .. 1/aspect. A projection that ignored this would leave
  // the field short of the top and bottom of a wide screen.
  const aspect = 2;
  const projection = createFieldProjection({ width: 2, height: 2 }, aspect);

  const bottom = projectFieldPoint(0, 0, projection);
  const top = projectFieldPoint(0, 2, projection);

  // After the shader's y * aspect, these must reach -1 and 1.
  assert.ok(
    Math.abs(bottom.y * aspect + 1) < 1e-9,
    `the bottom must reach the viewport edge, got ${bottom.y * aspect}`,
  );
  assert.ok(
    Math.abs(top.y * aspect - 1) < 1e-9,
    `the top must reach the viewport edge, got ${top.y * aspect}`,
  );
});

test('a tall viewport is handled the same way', () => {
  const aspect = 0.5;
  const projection = createFieldProjection({ width: 2, height: 2 }, aspect);
  const bottom = projectFieldPoint(0, 0, projection);
  const top = projectFieldPoint(0, 2, projection);

  assert.ok(Math.abs(bottom.y * aspect + 1) < 1e-9);
  assert.ok(Math.abs(top.y * aspect - 1) < 1e-9);
});

test('the x range is unaffected by the aspect', () => {
  for (const aspect of [0.5, 1, 1.78, 3]) {
    const projection = createFieldProjection({ width: 2, height: 2 }, aspect);
    const left = projectFieldPoint(0, 0, projection);
    const right = projectFieldPoint(2, 0, projection);
    assert.ok(Math.abs(left.x + 1) < 1e-9, `aspect ${aspect}: left edge`);
    assert.ok(Math.abs(right.x - 1) < 1e-9, `aspect ${aspect}: right edge`);
  }
});

test('a degenerate field does not produce NaN', () => {
  for (const bounds of [
    { width: 0, height: 0 },
    { width: -5, height: -5 },
    { width: NaN, height: NaN },
    {},
  ]) {
    const projection = createFieldProjection(bounds, 1);
    const point = projectFieldPoint(0.5, 0.5, projection);
    assert.ok(Number.isFinite(point.x), 'x must be finite');
    assert.ok(Number.isFinite(point.y), 'y must be finite');
  }
});

test('a degenerate aspect does not produce NaN', () => {
  for (const aspect of [0, -1, NaN, undefined]) {
    const projection = createFieldProjection({ width: 2, height: 2 }, aspect);
    const point = projectFieldPoint(0.5, 0.5, projection);
    assert.ok(Number.isFinite(point.x), 'x must be finite');
    assert.ok(Number.isFinite(point.y), 'y must be finite');
  }
});

test('the mapping is monotonic', () => {
  // A particle moving right must project further right.
  const projection = createFieldProjection({ width: 2, height: 2 }, 1.6);
  const a = projectFieldPoint(0.2, 1, projection);
  const b = projectFieldPoint(1.8, 1, projection);
  assert.ok(b.x > a.x);
});
