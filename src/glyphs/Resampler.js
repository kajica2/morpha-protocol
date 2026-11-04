export function resampleSVGPath(pathString, pointCount = 256) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  path.setAttribute("d", pathString);
  svg.appendChild(path);
  // Append to body temporarily to allow getTotalLength and getPointAtLength to work
  document.body.appendChild(svg);

  const length = path.getTotalLength();
  let points = [];

  for (let i = 0; i < pointCount; i++) {
    const p = path.getPointAtLength((i / pointCount) * length);
    points.push({ x: p.x, y: p.y });
  }

  document.body.removeChild(svg);

  // Ensure consistent starting point for morphing
  points = rotateToLowestPoint(points);

  return normalizePoints(points);
}

export function normalizePoints(points) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Scale to fit within a -1 to 1 range, preserving aspect ratio
  const scale = Math.max(maxX - minX, maxY - minY);
  // Add a small epsilon to avoid division by zero if scale is 0
  const safeScale = scale === 0 ? 1 : scale;

  const out = new Float32Array(points.length * 2);

  // Scale to the -0.5..0.5 range, matching the shipped First Ritual demo.
  // Scaling to the full -1..1 range makes glyphs sit flush against the
  // viewport edge with no breathing room.
  points.forEach((p, i) => {
    out[i * 2]     = ((p.x - cx) / safeScale); // Scale to -0.5 to 0.5 range
    out[i * 2 + 1] = -((p.y - cy) / safeScale); // Flip y: SVG y grows downward
  });

  return out;
}

export function rotateToLowestPoint(points) {
  if (points.length === 0) return [];

  let idx = 0;
  points.forEach((p, i) => {
    // Find the lowest point, then the leftmost among lowest points
    if (p.y < points[idx].y || (p.y === points[idx].y && p.x < points[idx].x)) {
      idx = i;
    }
  });
  // Rotate the array so the lowest-leftmost point is first
  return points.slice(idx).concat(points.slice(0, idx));
}
