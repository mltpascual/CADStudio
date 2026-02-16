// ============================================================
// Measurement Overlays — Distance, Area, Angle
// Non-permanent overlays that display measurements without creating entities
// ============================================================

import type { Point } from "./cad-types";

export interface MeasureResult {
  type: "distance" | "area" | "angle";
  value: number;
  unit: string;
  label: string;
  points: Point[];
}

/** Calculate distance between two points */
export function measureDistance(p1: Point, p2: Point): MeasureResult {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    type: "distance",
    value: dist,
    unit: "units",
    label: `Distance: ${dist.toFixed(4)}\nΔX: ${dx.toFixed(4)}  ΔY: ${dy.toFixed(4)}\nAngle: ${angle.toFixed(2)}°`,
    points: [p1, p2],
  };
}

/** Calculate area of a polygon defined by points */
export function measureArea(points: Point[]): MeasureResult {
  if (points.length < 3) {
    return { type: "area", value: 0, unit: "sq units", label: "Need at least 3 points", points };
  }
  // Shoelace formula
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  area = Math.abs(area) / 2;

  // Perimeter
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return {
    type: "area",
    value: area,
    unit: "sq units",
    label: `Area: ${area.toFixed(4)} sq units\nPerimeter: ${perimeter.toFixed(4)} units\nVertices: ${n}`,
    points,
  };
}

/** Calculate angle between three points (vertex at p2) */
export function measureAngle(p1: Point, p2: Point, p3: Point): MeasureResult {
  const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  let angle = (a2 - a1) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  const supplement = 360 - angle;

  return {
    type: "angle",
    value: angle,
    unit: "°",
    label: `Angle: ${angle.toFixed(2)}°\nSupplement: ${supplement.toFixed(2)}°`,
    points: [p1, p2, p3],
  };
}

/** Draw a distance measurement overlay on canvas */
export function drawDistanceOverlay(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  result: MeasureResult,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  // Line between points
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Endpoints
  ctx.beginPath(); ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2); ctx.fill();

  // Label
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  drawMultilineLabel(ctx, result.label, mx, my - 12, color);

  ctx.restore();
}

/** Draw an area measurement overlay on canvas */
export function drawAreaOverlay(
  ctx: CanvasRenderingContext2D,
  screenPoints: { x: number; y: number }[],
  result: MeasureResult,
  color: string,
) {
  if (screenPoints.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color + "15";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  // Polygon outline
  ctx.beginPath();
  ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
  for (let i = 1; i < screenPoints.length; i++) {
    ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // Vertices
  ctx.fillStyle = color;
  for (const p of screenPoints) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Centroid label
  const cx = screenPoints.reduce((s, p) => s + p.x, 0) / screenPoints.length;
  const cy = screenPoints.reduce((s, p) => s + p.y, 0) / screenPoints.length;
  drawMultilineLabel(ctx, result.label, cx, cy - 20, color);

  ctx.restore();
}

/** Draw an angle measurement overlay on canvas */
export function drawAngleOverlay(
  ctx: CanvasRenderingContext2D,
  sp1: { x: number; y: number },
  sp2: { x: number; y: number },
  sp3: { x: number; y: number },
  result: MeasureResult,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;

  // Lines from vertex to points
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(sp2.x, sp2.y); ctx.lineTo(sp1.x, sp1.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sp2.x, sp2.y); ctx.lineTo(sp3.x, sp3.y); ctx.stroke();
  ctx.setLineDash([]);

  // Arc showing angle
  const a1 = Math.atan2(sp1.y - sp2.y, sp1.x - sp2.x);
  const a2 = Math.atan2(sp3.y - sp2.y, sp3.x - sp2.x);
  const radius = 30;
  ctx.beginPath();
  ctx.arc(sp2.x, sp2.y, radius, a1, a2, false);
  ctx.stroke();

  // Points
  ctx.beginPath(); ctx.arc(sp1.x, sp1.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sp3.x, sp3.y, 4, 0, Math.PI * 2); ctx.fill();

  // Label at arc midpoint
  const midAngle = (a1 + a2) / 2;
  const lx = sp2.x + (radius + 15) * Math.cos(midAngle);
  const ly = sp2.y + (radius + 15) * Math.sin(midAngle);
  drawMultilineLabel(ctx, result.label, lx, ly, color);

  ctx.restore();
}

/** Draw multiline text label with background */
function drawMultilineLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  const lines = text.split("\n");
  const lineHeight = 14;
  const padding = 6;
  const font = "11px 'Fira Code', monospace";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Measure max width
  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }

  const totalH = lines.length * lineHeight + padding * 2;
  const totalW = maxW + padding * 2;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.beginPath();
  const r = 4;
  const bx = x - totalW / 2;
  const by = y - totalH / 2;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + totalW - r, by);
  ctx.quadraticCurveTo(bx + totalW, by, bx + totalW, by + r);
  ctx.lineTo(bx + totalW, by + totalH - r);
  ctx.quadraticCurveTo(bx + totalW, by + totalH, bx + totalW - r, by + totalH);
  ctx.lineTo(bx + r, by + totalH);
  ctx.quadraticCurveTo(bx, by + totalH, bx, by + totalH - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.fill();

  // Text
  ctx.fillStyle = color;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, by + padding + i * lineHeight);
  }
}
