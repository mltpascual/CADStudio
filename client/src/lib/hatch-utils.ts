// ============================================================
// Hatch/Fill Utilities — Pattern rendering for closed regions
// ============================================================

import type { Point, HatchPattern, CADEntity, HatchData } from "./cad-types";
import { generateId } from "./cad-utils";

/** Get bounding box of a set of points */
function getBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Check if a point is inside a polygon using ray casting */
function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Extract boundary points from a closed entity */
export function getEntityBoundary(entity: CADEntity): Point[] | null {
  const d = entity.data;
  if (d.type === "rectangle") {
    return [
      { x: d.topLeft.x, y: d.topLeft.y },
      { x: d.topLeft.x + d.width, y: d.topLeft.y },
      { x: d.topLeft.x + d.width, y: d.topLeft.y + d.height },
      { x: d.topLeft.x, y: d.topLeft.y + d.height },
    ];
  }
  if (d.type === "polyline" && d.closed && d.points.length >= 3) {
    return [...d.points];
  }
  if (d.type === "circle") {
    const pts: Point[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: d.center.x + d.radius * Math.cos(a), y: d.center.y + d.radius * Math.sin(a) });
    }
    return pts;
  }
  if (d.type === "ellipse") {
    const pts: Point[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: d.center.x + d.radiusX * Math.cos(a), y: d.center.y + d.radiusY * Math.sin(a) });
    }
    return pts;
  }
  return null;
}

/** Draw hatch pattern on a canvas context */
export function drawHatchPattern(
  ctx: CanvasRenderingContext2D,
  boundary: Point[],
  pattern: HatchPattern,
  scale: number,
  angle: number,
  color: string,
  opacity: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number
) {
  if (boundary.length < 3) return;

  ctx.save();

  // Transform boundary to screen coords
  const screenPts = boundary.map(p => ({
    x: p.x * zoom + panX + canvasW / 2,
    y: p.y * zoom + panY + canvasH / 2,
  }));

  // Create clip path
  ctx.beginPath();
  ctx.moveTo(screenPts[0].x, screenPts[0].y);
  for (let i = 1; i < screenPts.length; i++) {
    ctx.lineTo(screenPts[i].x, screenPts[i].y);
  }
  ctx.closePath();
  ctx.clip();

  ctx.globalAlpha = opacity;

  const bounds = getBounds(screenPts);
  const pad = 20;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const maxX = bounds.maxX + pad;
  const maxY = bounds.maxY + pad;

  const spacing = Math.max(4, 10 * scale * zoom);
  const rad = (angle * Math.PI) / 180;

  switch (pattern) {
    case "solid": {
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case "crosshatch": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
      // Diagonal lines one direction
      drawParallelLines(ctx, minX, minY, maxX, maxY, spacing, rad + Math.PI / 4);
      // Diagonal lines other direction
      drawParallelLines(ctx, minX, minY, maxX, maxY, spacing, rad - Math.PI / 4);
      break;
    }
    case "diagonal": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
      drawParallelLines(ctx, minX, minY, maxX, maxY, spacing, rad + Math.PI / 4);
      break;
    }
    case "horizontal": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
      drawParallelLines(ctx, minX, minY, maxX, maxY, spacing, rad);
      break;
    }
    case "vertical": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
      drawParallelLines(ctx, minX, minY, maxX, maxY, spacing, rad + Math.PI / 2);
      break;
    }
    case "dots": {
      ctx.fillStyle = color;
      const dotR = Math.max(1, 1.5 * zoom);
      for (let y = minY; y <= maxY; y += spacing) {
        for (let x = minX; x <= maxX; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "brick": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
      const brickH = spacing;
      const brickW = spacing * 2;
      let row = 0;
      for (let y = minY; y <= maxY; y += brickH) {
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();
        // Vertical lines (offset every other row)
        const offset = row % 2 === 0 ? 0 : brickW / 2;
        for (let x = minX + offset; x <= maxX; x += brickW) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + brickH);
          ctx.stroke();
        }
        row++;
      }
      break;
    }
  }

  ctx.restore();
}

/** Draw parallel lines across a rectangular region at a given angle */
function drawParallelLines(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  spacing: number, angle: number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const count = Math.ceil(diag / spacing) + 2;

  for (let i = -count; i <= count; i++) {
    const offset = i * spacing;
    const px = cx + offset * cos;
    const py = cy + offset * sin;
    const dx = diag * (-sin);
    const dy = diag * cos;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
  }
}

/** Create a hatch entity from a boundary */
export function createHatchEntity(
  boundary: Point[],
  pattern: HatchPattern,
  scale: number,
  angle: number,
  color: string,
  layerId: string
): CADEntity {
  return {
    id: generateId(),
    type: "hatch",
    data: {
      type: "hatch",
      boundary,
      pattern,
      patternScale: scale,
      patternAngle: angle,
      fillColor: color,
      fillOpacity: 0.4,
    } as HatchData,
    layerId,
    color,
    lineWidth: 1,
    lineStyle: "solid",
    visible: true,
    locked: false,
    selected: false,
  };
}
