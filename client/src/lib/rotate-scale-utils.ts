// ============================================================
// Rotate & Scale Utils — Transform entities around a base point
// ============================================================

import type { Point, CADEntity, EntityData } from "./cad-types";

// ---- Rotate ----

/** Rotate a point around a center by angle (radians) */
function rotatePoint(p: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Rotate entity data around a base point by angle (radians) */
export function rotateEntityData(data: EntityData, center: Point, angle: number): EntityData {
  switch (data.type) {
    case "line":
      return { ...data, start: rotatePoint(data.start, center, angle), end: rotatePoint(data.end, center, angle) };
    case "circle":
      return { ...data, center: rotatePoint(data.center, center, angle) };
    case "arc": {
      const newCenter = rotatePoint(data.center, center, angle);
      return { ...data, center: newCenter, startAngle: data.startAngle + angle, endAngle: data.endAngle + angle };
    }
    case "rectangle": {
      // Rotate all four corners and compute new bounding box
      const tl = data.topLeft;
      const tr = { x: tl.x + data.width, y: tl.y };
      const br = { x: tl.x + data.width, y: tl.y + data.height };
      const bl = { x: tl.x, y: tl.y + data.height };
      const corners = [tl, tr, br, bl].map(p => rotatePoint(p, center, angle));
      // Convert to polyline since rotated rectangle is no longer axis-aligned
      return { type: "polyline", points: corners, closed: true };
    }
    case "polyline":
      return { ...data, points: data.points.map(p => rotatePoint(p, center, angle)) };
    case "ellipse": {
      const newCenter = rotatePoint(data.center, center, angle);
      return { ...data, center: newCenter, rotation: data.rotation + angle };
    }
    case "text": {
      const newPos = rotatePoint(data.position, center, angle);
      return { ...data, position: newPos, rotation: data.rotation + angle };
    }
    case "dimension": {
      return { ...data, start: rotatePoint(data.start, center, angle), end: rotatePoint(data.end, center, angle) };
    }
    default:
      return data;
  }
}

// ---- Scale ----

/** Scale a point relative to a center by a factor */
function scalePoint(p: Point, center: Point, factor: number): Point {
  return {
    x: center.x + (p.x - center.x) * factor,
    y: center.y + (p.y - center.y) * factor,
  };
}

/** Scale entity data around a base point by a factor */
export function scaleEntityData(data: EntityData, center: Point, factor: number): EntityData {
  switch (data.type) {
    case "line":
      return { ...data, start: scalePoint(data.start, center, factor), end: scalePoint(data.end, center, factor) };
    case "circle": {
      const newCenter = scalePoint(data.center, center, factor);
      return { ...data, center: newCenter, radius: data.radius * Math.abs(factor) };
    }
    case "arc": {
      const newCenter = scalePoint(data.center, center, factor);
      return { ...data, center: newCenter, radius: data.radius * Math.abs(factor) };
    }
    case "rectangle": {
      const newTL = scalePoint(data.topLeft, center, factor);
      return { ...data, topLeft: newTL, width: data.width * Math.abs(factor), height: data.height * Math.abs(factor) };
    }
    case "polyline":
      return { ...data, points: data.points.map(p => scalePoint(p, center, factor)) };
    case "ellipse": {
      const newCenter = scalePoint(data.center, center, factor);
      return { ...data, center: newCenter, radiusX: data.radiusX * Math.abs(factor), radiusY: data.radiusY * Math.abs(factor) };
    }
    case "text": {
      const newPos = scalePoint(data.position, center, factor);
      return { ...data, position: newPos, fontSize: data.fontSize * Math.abs(factor) };
    }
    case "dimension": {
      return { ...data, start: scalePoint(data.start, center, factor), end: scalePoint(data.end, center, factor), offset: data.offset * Math.abs(factor) };
    }
    default:
      return data;
  }
}
