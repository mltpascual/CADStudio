// ============================================================
// Offset Utils — Create parallel copies at a specified distance
// ============================================================

import type { Point, CADEntity, EntityData, LineData, CircleData, ArcData, RectangleData, PolylineData, EllipseData } from "./cad-types";
import { distance, generateId } from "./cad-utils";

/**
 * Offset an entity by a given distance toward the side of the click point.
 * Like AutoCAD: specify distance, then click which side to offset toward.
 */
export function offsetEntity(
  entity: CADEntity,
  offsetDistance: number,
  sidePoint: Point
): CADEntity | null {
  const d = entity.data;

  switch (d.type) {
    case "line": return offsetLine(entity, d, offsetDistance, sidePoint);
    case "circle": return offsetCircle(entity, d, offsetDistance, sidePoint);
    case "arc": return offsetArc(entity, d, offsetDistance, sidePoint);
    case "rectangle": return offsetRectangle(entity, d, offsetDistance, sidePoint);
    case "polyline": return offsetPolyline(entity, d, offsetDistance, sidePoint);
    case "ellipse": return offsetEllipse(entity, d, offsetDistance, sidePoint);
    default: return null;
  }
}

function offsetLine(entity: CADEntity, d: LineData, dist: number, sidePoint: Point): CADEntity {
  // Normal to the line
  const dx = d.end.x - d.start.x;
  const dy = d.end.y - d.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return { ...entity, id: generateId() };

  // Two possible normals
  const nx1 = -dy / len, ny1 = dx / len;
  const nx2 = dy / len, ny2 = -dx / len;

  // Determine which side the click is on
  const mid = { x: (d.start.x + d.end.x) / 2, y: (d.start.y + d.end.y) / 2 };
  const side1 = { x: mid.x + nx1, y: mid.y + ny1 };
  const side2 = { x: mid.x + nx2, y: mid.y + ny2 };
  const useSide1 = distance(sidePoint, side1) < distance(sidePoint, side2);
  const nx = useSide1 ? nx1 : nx2;
  const ny = useSide1 ? ny1 : ny2;

  const newData: LineData = {
    type: "line",
    start: { x: d.start.x + nx * dist, y: d.start.y + ny * dist },
    end: { x: d.end.x + nx * dist, y: d.end.y + ny * dist },
  };

  return { ...entity, id: generateId(), data: newData, selected: false };
}

function offsetCircle(entity: CADEntity, d: CircleData, dist: number, sidePoint: Point): CADEntity {
  // Inside or outside?
  const distToCenter = distance(sidePoint, d.center);
  const inside = distToCenter < d.radius;
  const newRadius = inside ? Math.max(0.1, d.radius - dist) : d.radius + dist;

  const newData: CircleData = { type: "circle", center: d.center, radius: newRadius };
  return { ...entity, id: generateId(), data: newData, selected: false };
}

function offsetArc(entity: CADEntity, d: ArcData, dist: number, sidePoint: Point): CADEntity {
  const distToCenter = distance(sidePoint, d.center);
  const inside = distToCenter < d.radius;
  const newRadius = inside ? Math.max(0.1, d.radius - dist) : d.radius + dist;

  const newData: ArcData = { type: "arc", center: d.center, radius: newRadius, startAngle: d.startAngle, endAngle: d.endAngle };
  return { ...entity, id: generateId(), data: newData, selected: false };
}

function offsetRectangle(entity: CADEntity, d: RectangleData, dist: number, sidePoint: Point): CADEntity {
  // Determine if offset inward or outward
  const cx = d.topLeft.x + d.width / 2;
  const cy = d.topLeft.y + d.height / 2;
  const center = { x: cx, y: cy };
  const inside = sidePoint.x > d.topLeft.x && sidePoint.x < d.topLeft.x + d.width &&
                 sidePoint.y > d.topLeft.y && sidePoint.y < d.topLeft.y + d.height;

  const sign = inside ? -1 : 1;
  const newW = d.width + sign * dist * 2;
  const newH = d.height + sign * dist * 2;

  if (newW <= 0.1 || newH <= 0.1) return { ...entity, id: generateId(), selected: false };

  const newData: RectangleData = {
    type: "rectangle",
    topLeft: { x: cx - newW / 2, y: cy - newH / 2 },
    width: newW,
    height: newH,
  };

  return { ...entity, id: generateId(), data: newData, selected: false };
}

function offsetPolyline(entity: CADEntity, d: PolylineData, dist: number, sidePoint: Point): CADEntity {
  if (d.points.length < 2) return { ...entity, id: generateId(), selected: false };

  // Determine offset direction using the winding/side test
  // For each segment, compute the offset normal, then check which side the click is on
  const normals = computeSegmentNormals(d.points, d.closed);
  
  // Test which side using the first segment's midpoint
  const mid0 = {
    x: (d.points[0].x + d.points[1].x) / 2,
    y: (d.points[0].y + d.points[1].y) / 2,
  };
  const testPt1 = { x: mid0.x + normals[0].x, y: mid0.y + normals[0].y };
  const testPt2 = { x: mid0.x - normals[0].x, y: mid0.y - normals[0].y };
  const sign = distance(sidePoint, testPt1) < distance(sidePoint, testPt2) ? 1 : -1;

  // Offset each point by averaging the normals of adjacent segments
  const newPoints: Point[] = [];
  const n = d.points.length;

  for (let i = 0; i < n; i++) {
    let avgNx = 0, avgNy = 0, count = 0;

    // Normal from segment before this point
    if (i > 0 || d.closed) {
      const idx = i > 0 ? i - 1 : normals.length - 1;
      if (idx < normals.length) {
        avgNx += normals[idx].x;
        avgNy += normals[idx].y;
        count++;
      }
    }

    // Normal from segment after this point
    if (i < n - 1 || d.closed) {
      const idx = i < normals.length ? i : 0;
      if (idx < normals.length) {
        avgNx += normals[idx].x;
        avgNy += normals[idx].y;
        count++;
      }
    }

    if (count > 0) {
      avgNx /= count;
      avgNy /= count;
      const len = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
      if (len > 1e-10) {
        avgNx /= len;
        avgNy /= len;
      }
    }

    newPoints.push({
      x: d.points[i].x + sign * avgNx * dist,
      y: d.points[i].y + sign * avgNy * dist,
    });
  }

  const newData: PolylineData = { type: "polyline", points: newPoints, closed: d.closed };
  return { ...entity, id: generateId(), data: newData, selected: false };
}

function offsetEllipse(entity: CADEntity, d: EllipseData, dist: number, sidePoint: Point): CADEntity {
  const distToCenter = distance(sidePoint, d.center);
  const avgRadius = (d.radiusX + d.radiusY) / 2;
  const inside = distToCenter < avgRadius;
  const sign = inside ? -1 : 1;

  const newData: EllipseData = {
    type: "ellipse",
    center: d.center,
    radiusX: Math.max(0.1, d.radiusX + sign * dist),
    radiusY: Math.max(0.1, d.radiusY + sign * dist),
    rotation: d.rotation,
  };

  return { ...entity, id: generateId(), data: newData, selected: false };
}

function computeSegmentNormals(points: Point[], closed: boolean): Point[] {
  const normals: Point[] = [];
  const n = points.length;
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) {
      normals.push({ x: 0, y: 0 });
    } else {
      normals.push({ x: -dy / len, y: dx / len });
    }
  }

  return normals;
}
