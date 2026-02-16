// ============================================================
// XLine/Ray Utils — Construction line rendering and hit testing
// Design: Obsidian Forge — infinite reference lines for alignment
// ============================================================

import type { Point, XLineData, RayData } from "./cad-types";

/** Distance from point to infinite line through p1 in direction dir */
function distToInfiniteLine(point: Point, base: Point, dir: Point): number {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) return Math.sqrt((point.x - base.x) ** 2 + (point.y - base.y) ** 2);
  // perpendicular distance = |cross product| / |dir|
  const cross = Math.abs((point.x - base.x) * dir.y - (point.y - base.y) * dir.x);
  return cross / len;
}

/** Distance from point to ray starting at base going in direction dir */
function distToRay(point: Point, base: Point, dir: Point): number {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) return Math.sqrt((point.x - base.x) ** 2 + (point.y - base.y) ** 2);
  // Project point onto ray
  const t = ((point.x - base.x) * dir.x + (point.y - base.y) * dir.y) / (len * len);
  if (t < 0) {
    // Behind the ray origin
    return Math.sqrt((point.x - base.x) ** 2 + (point.y - base.y) ** 2);
  }
  // Perpendicular distance
  const cross = Math.abs((point.x - base.x) * dir.y - (point.y - base.y) * dir.x);
  return cross / len;
}

/** Hit test for xline (infinite line) */
export function hitTestXLine(data: XLineData, point: Point, tolerance: number): boolean {
  return distToInfiniteLine(point, data.basePoint, data.direction) < tolerance;
}

/** Hit test for ray (half-infinite line) */
export function hitTestRay(data: RayData, point: Point, tolerance: number): boolean {
  return distToRay(point, data.basePoint, data.direction) < tolerance;
}

/** 
 * Draw an xline (infinite construction line) on canvas.
 * Extends in both directions from basePoint along direction vector.
 */
export function drawXLine(
  ctx: CanvasRenderingContext2D,
  data: XLineData,
  color: string,
  lineWidth: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const bx = data.basePoint.x * zoom + offsetX;
  const by = data.basePoint.y * zoom + offsetY;
  const dx = data.direction.x;
  const dy = data.direction.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  // Normalize direction
  const nx = dx / len;
  const ny = dy / len;

  // Extend far enough to cover the entire canvas
  const maxExtent = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) * 2;

  const x1 = bx - nx * maxExtent;
  const y1 = by - ny * maxExtent;
  const x2 = bx + nx * maxExtent;
  const y2 = by + ny * maxExtent;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([8, 6]);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw base point marker
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx, by, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a ray (half-infinite construction line) on canvas.
 * Starts at basePoint and extends in direction vector.
 */
export function drawRay(
  ctx: CanvasRenderingContext2D,
  data: RayData,
  color: string,
  lineWidth: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const bx = data.basePoint.x * zoom + offsetX;
  const by = data.basePoint.y * zoom + offsetY;
  const dx = data.direction.x;
  const dy = data.direction.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  // Normalize direction
  const nx = dx / len;
  const ny = dy / len;

  // Extend far enough to cover the entire canvas
  const maxExtent = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) * 2;

  const x2 = bx + nx * maxExtent;
  const y2 = by + ny * maxExtent;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([8, 6]);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw base point marker (arrow-like)
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx, by, 3, 0, Math.PI * 2);
  ctx.fill();

  // Small direction arrow
  const arrowLen = 12;
  const arrowW = 4;
  const ax = bx + nx * 20;
  const ay = by + ny * 20;
  ctx.beginPath();
  ctx.moveTo(ax + nx * arrowLen, ay + ny * arrowLen);
  ctx.lineTo(ax - ny * arrowW, ay + nx * arrowW);
  ctx.lineTo(ax + ny * arrowW, ay - nx * arrowW);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Move xline by delta */
export function moveXLine(data: XLineData, dx: number, dy: number): XLineData {
  return {
    ...data,
    basePoint: { x: data.basePoint.x + dx, y: data.basePoint.y + dy },
  };
}

/** Move ray by delta */
export function moveRay(data: RayData, dx: number, dy: number): RayData {
  return {
    ...data,
    basePoint: { x: data.basePoint.x + dx, y: data.basePoint.y + dy },
  };
}
