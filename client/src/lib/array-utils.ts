// ============================================================
// Array Utils — Rectangular and Polar array operations
// ============================================================

import type { Point, CADEntity, EntityData } from "./cad-types";
import { generateId } from "./cad-utils";

// ── Rectangular Array ──────────────────────────────────────

export interface RectArrayParams {
  rows: number;        // number of rows (Y direction)
  columns: number;     // number of columns (X direction)
  rowSpacing: number;  // distance between rows
  colSpacing: number;  // distance between columns
  angle: number;       // rotation angle of the array grid in degrees (0 = standard X/Y)
}

/**
 * Create a rectangular array of entities.
 * The original entities occupy position [0,0] in the grid.
 * Copies are placed at each [col, row] offset.
 * Returns only the NEW copies (not the originals).
 */
export function createRectangularArray(
  entities: CADEntity[],
  params: RectArrayParams
): CADEntity[] {
  const { rows, columns, rowSpacing, colSpacing, angle } = params;
  const rad = (angle * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const results: CADEntity[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      // Skip the original position [0,0]
      if (r === 0 && c === 0) continue;

      // Calculate displacement in rotated grid
      const rawDx = c * colSpacing;
      const rawDy = r * rowSpacing;
      const dx = rawDx * cosA - rawDy * sinA;
      const dy = rawDx * sinA + rawDy * cosA;

      for (const entity of entities) {
        const newData = displaceEntityData(entity.data, dx, dy);
        results.push({
          ...entity,
          id: generateId(),
          data: newData,
          selected: false,
        });
      }
    }
  }

  return results;
}

// ── Polar Array ────────────────────────────────────────────

export interface PolarArrayParams {
  center: Point;       // center of rotation
  count: number;       // total number of items (including original)
  totalAngle: number;  // total angle to fill in degrees (360 = full circle)
  rotateItems: boolean; // whether to rotate each copy around the center
}

/**
 * Create a polar (circular) array of entities.
 * Entities are arrayed around a center point.
 * Returns only the NEW copies (not the originals).
 */
export function createPolarArray(
  entities: CADEntity[],
  params: PolarArrayParams
): CADEntity[] {
  const { center, count, totalAngle, rotateItems } = params;
  if (count < 2) return [];

  const angleStep = (totalAngle / count) * (Math.PI / 180);
  const results: CADEntity[] = [];

  for (let i = 1; i < count; i++) {
    const angle = angleStep * i;

    for (const entity of entities) {
      const newData = rotateEntityDataAroundPoint(entity.data, center, angle, rotateItems);
      results.push({
        ...entity,
        id: generateId(),
        data: newData,
        selected: false,
      });
    }
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────

function displaceEntityData(data: EntityData, dx: number, dy: number): EntityData {
  const mp = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (data.type) {
    case "line": return { ...data, start: mp(data.start), end: mp(data.end) };
    case "circle": return { ...data, center: mp(data.center) };
    case "arc": return { ...data, center: mp(data.center) };
    case "rectangle": return { ...data, topLeft: mp(data.topLeft) };
    case "polyline": return { ...data, points: data.points.map(mp) };
    case "ellipse": return { ...data, center: mp(data.center) };
    case "text": return { ...data, position: mp(data.position) };
    case "dimension": return { ...data, start: mp(data.start), end: mp(data.end) };
    case "hatch": return { ...data, boundary: data.boundary.map(mp) };
    case "blockref": return { ...data, insertPoint: mp(data.insertPoint) };
    default: return data;
  }
}

function rotatePoint(p: Point, center: Point, angle: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function rotateEntityDataAroundPoint(
  data: EntityData,
  center: Point,
  angle: number,
  rotateItems: boolean
): EntityData {
  const rp = (p: Point) => rotatePoint(p, center, angle);

  switch (data.type) {
    case "line":
      return { ...data, start: rp(data.start), end: rp(data.end) };
    case "circle":
      return { ...data, center: rp(data.center) };
    case "arc": {
      const newCenter = rp(data.center);
      if (rotateItems) {
        return {
          ...data,
          center: newCenter,
          startAngle: data.startAngle + angle,
          endAngle: data.endAngle + angle,
        };
      }
      return { ...data, center: newCenter };
    }
    case "rectangle": {
      // For rectangles, rotate the top-left corner
      // If rotateItems is true, we'd need to convert to polyline — for simplicity, just translate
      const newTL = rp(data.topLeft);
      const newBR = rp({ x: data.topLeft.x + data.width, y: data.topLeft.y + data.height });
      if (rotateItems) {
        // Convert to a rotated rectangle by rotating all four corners
        // Since we can't truly rotate a rect entity, move the topLeft
        return { ...data, topLeft: newTL };
      }
      return { ...data, topLeft: newTL };
    }
    case "polyline":
      return { ...data, points: data.points.map(rp) };
    case "ellipse": {
      const newCenter = rp(data.center);
      return {
        ...data,
        center: newCenter,
        rotation: rotateItems ? data.rotation + angle : data.rotation,
      };
    }
    case "text": {
      const newPos = rp(data.position);
      return {
        ...data,
        position: newPos,
        rotation: rotateItems ? data.rotation + (angle * 180) / Math.PI : data.rotation,
      };
    }
    case "dimension":
      return { ...data, start: rp(data.start), end: rp(data.end) };
    case "hatch":
      return { ...data, boundary: data.boundary.map(rp) };
    case "blockref": {
      const newInsert = rp(data.insertPoint);
      return {
        ...data,
        insertPoint: newInsert,
        rotation: rotateItems ? data.rotation + (angle * 180) / Math.PI : data.rotation,
      };
    }
    default:
      return data;
  }
}

/**
 * Calculate the centroid of selected entities to use as default polar center.
 */
export function getEntitiesCentroid(entities: CADEntity[]): Point {
  let sumX = 0, sumY = 0, count = 0;
  for (const e of entities) {
    const pts = getRepresentativePoints(e);
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
      count++;
    }
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
}

function getRepresentativePoints(entity: CADEntity): Point[] {
  const d = entity.data;
  switch (d.type) {
    case "line": return [d.start, d.end];
    case "circle": return [d.center];
    case "arc": return [d.center];
    case "rectangle": return [d.topLeft, { x: d.topLeft.x + d.width, y: d.topLeft.y + d.height }];
    case "polyline": return d.points;
    case "ellipse": return [d.center];
    case "text": return [d.position];
    case "dimension": return [d.start, d.end];
    case "hatch": return d.boundary.length > 0 ? [d.boundary[0]] : [];
    case "blockref": return [d.insertPoint];
    default: return [];
  }
}
