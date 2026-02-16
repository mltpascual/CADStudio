// ============================================================
// Extend Utils — Extend lines/arcs to nearest boundary entity
// ============================================================

import type { Point, CADEntity, LineData, ArcData } from "./cad-types";
import { distance } from "./cad-utils";

// ---- Ray intersection helpers (unbounded on one end) ----

/** Find intersections of a ray starting at `origin` going through `direction` with an entity */
function rayEntityIntersections(origin: Point, dx: number, dy: number, entity: CADEntity): Point[] {
  const d = entity.data;
  // Extend the ray far enough (10000 units)
  const farPt = { x: origin.x + dx * 10000, y: origin.y + dy * 10000 };
  
  switch (d.type) {
    case "line": return raySegIntersect(origin, farPt, d.start, d.end);
    case "circle": return rayCircleIntersect(origin, farPt, d.center, d.radius);
    case "arc": return rayArcIntersect(origin, farPt, d.center, d.radius, d.startAngle, d.endAngle);
    case "rectangle": {
      const tl = d.topLeft;
      const tr = { x: tl.x + d.width, y: tl.y };
      const br = { x: tl.x + d.width, y: tl.y + d.height };
      const bl = { x: tl.x, y: tl.y + d.height };
      return [
        ...raySegIntersect(origin, farPt, tl, tr),
        ...raySegIntersect(origin, farPt, tr, br),
        ...raySegIntersect(origin, farPt, br, bl),
        ...raySegIntersect(origin, farPt, bl, tl),
      ];
    }
    case "polyline": {
      const pts: Point[] = [];
      for (let i = 1; i < d.points.length; i++) {
        pts.push(...raySegIntersect(origin, farPt, d.points[i - 1], d.points[i]));
      }
      if (d.closed && d.points.length > 2) {
        pts.push(...raySegIntersect(origin, farPt, d.points[d.points.length - 1], d.points[0]));
      }
      return pts;
    }
    case "ellipse": return rayEllipseIntersect(origin, farPt, d.center, d.radiusX, d.radiusY);
    default: return [];
  }
}

function raySegIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Point[] {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return [];
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
  // t >= 0 (ray direction), u in [0,1] (on the segment)
  if (t >= 1e-6 && u >= -1e-10 && u <= 1 + 1e-10) {
    return [{ x: a1.x + t * dx1, y: a1.y + t * dy1 }];
  }
  return [];
}

function rayCircleIntersect(a: Point, b: Point, center: Point, radius: number): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ndx = dx / len, ndy = dy / len;
  const fx = a.x - center.x, fy = a.y - center.y;
  const A = 1; // normalized
  const B = 2 * (fx * ndx + fy * ndy);
  const C = fx * fx + fy * fy - radius * radius;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  disc = Math.sqrt(disc);
  const results: Point[] = [];
  for (const t of [(-B - disc) / 2, (-B + disc) / 2]) {
    if (t > 1e-3) { // only forward along ray
      results.push({ x: a.x + t * ndx, y: a.y + t * ndy });
    }
  }
  return results;
}

function rayArcIntersect(a: Point, b: Point, center: Point, radius: number, startAngle: number, endAngle: number): Point[] {
  const hits = rayCircleIntersect(a, b, center, radius);
  return hits.filter(p => {
    let angle = Math.atan2(p.y - center.y, p.x - center.x);
    if (angle < 0) angle += Math.PI * 2;
    let s = startAngle, e = endAngle;
    if (s < 0) s += Math.PI * 2;
    if (e < 0) e += Math.PI * 2;
    if (s <= e) return angle >= s - 0.01 && angle <= e + 0.01;
    return angle >= s - 0.01 || angle <= e + 0.01;
  });
}

function rayEllipseIntersect(a: Point, b: Point, center: Point, rx: number, ry: number): Point[] {
  const ax2 = (a.x - center.x) / rx, ay2 = (a.y - center.y) / ry;
  const bx2 = (b.x - center.x) / rx, by2 = (b.y - center.y) / ry;
  const dx = bx2 - ax2, dy = by2 - ay2;
  const A = dx * dx + dy * dy;
  const B = 2 * (ax2 * dx + ay2 * dy);
  const C = ax2 * ax2 + ay2 * ay2 - 1;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  disc = Math.sqrt(disc);
  const results: Point[] = [];
  for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)]) {
    if (t > 1e-6) {
      results.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return results;
}

// ---- Main Extend Function ----

export interface ExtendResult {
  entityId: string;
  newData: CADEntity["data"];
}

/**
 * Extend an entity toward the nearest boundary.
 * Click near one end of a line/arc — it extends that end to the nearest intersection.
 */
export function extendEntity(
  clickPoint: Point,
  targetEntity: CADEntity,
  allEntities: CADEntity[],
  tolerance: number
): ExtendResult | null {
  const d = targetEntity.data;

  switch (d.type) {
    case "line": return extendLine(clickPoint, targetEntity, allEntities);
    case "arc": return extendArc(clickPoint, targetEntity, allEntities);
    case "polyline": return extendPolyline(clickPoint, targetEntity, allEntities);
    default: return null; // circles, rectangles, ellipses can't be extended
  }
}

function extendLine(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[]): ExtendResult | null {
  const d = entity.data as LineData;
  
  // Determine which end to extend (the one closer to the click)
  const distToStart = distance(clickPoint, d.start);
  const distToEnd = distance(clickPoint, d.end);
  const extendFromEnd = distToEnd < distToStart; // extend the closer end
  
  // Direction of extension
  const dx = d.end.x - d.start.x;
  const dy = d.end.y - d.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return null;
  
  let rayOrigin: Point;
  let rayDx: number, rayDy: number;
  
  if (extendFromEnd) {
    // Extend from end point, in the direction start->end
    rayOrigin = d.end;
    rayDx = dx / len;
    rayDy = dy / len;
  } else {
    // Extend from start point, in the direction end->start
    rayOrigin = d.start;
    rayDx = -dx / len;
    rayDy = -dy / len;
  }
  
  // Find nearest intersection along the ray
  let bestDist = Infinity;
  let bestPoint: Point | null = null;
  
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    const hits = rayEntityIntersections(rayOrigin, rayDx, rayDy, other);
    for (const hit of hits) {
      const dist = distance(rayOrigin, hit);
      if (dist > 0.01 && dist < bestDist) {
        bestDist = dist;
        bestPoint = hit;
      }
    }
  }
  
  if (!bestPoint) return null;
  
  // Create new line data with extended endpoint
  const newData: LineData = extendFromEnd
    ? { type: "line", start: d.start, end: bestPoint }
    : { type: "line", start: bestPoint, end: d.end };
  
  return { entityId: entity.id, newData };
}

function extendArc(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[]): ExtendResult | null {
  const d = entity.data as ArcData;
  
  // Determine which end to extend
  const startPt = { x: d.center.x + d.radius * Math.cos(d.startAngle), y: d.center.y + d.radius * Math.sin(d.startAngle) };
  const endPt = { x: d.center.x + d.radius * Math.cos(d.endAngle), y: d.center.y + d.radius * Math.sin(d.endAngle) };
  
  const distToStart = distance(clickPoint, startPt);
  const distToEnd = distance(clickPoint, endPt);
  const extendFromEnd = distToEnd < distToStart;
  
  // For arcs, we extend the angle
  // Find intersections of the full circle with boundary entities
  const intersectionAngles: { angle: number; dist: number }[] = [];
  
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    const hits = getCircleEntityIntersections(d.center, d.radius, other);
    for (const hit of hits) {
      let angle = Math.atan2(hit.y - d.center.y, hit.x - d.center.x);
      if (angle < 0) angle += Math.PI * 2;
      
      // Check if this angle is outside the current arc (in the extension direction)
      let s = d.startAngle, e = d.endAngle;
      if (s < 0) s += Math.PI * 2;
      if (e < 0) e += Math.PI * 2;
      
      const onArc = s <= e ? (angle >= s - 0.01 && angle <= e + 0.01) : (angle >= s - 0.01 || angle <= e + 0.01);
      if (!onArc) {
        // This is a valid extension target
        if (extendFromEnd) {
          // Angular distance from end angle going forward
          let angDist = angle - e;
          if (angDist < 0) angDist += Math.PI * 2;
          intersectionAngles.push({ angle, dist: angDist });
        } else {
          // Angular distance from start angle going backward
          let angDist = s - angle;
          if (angDist < 0) angDist += Math.PI * 2;
          intersectionAngles.push({ angle, dist: angDist });
        }
      }
    }
  }
  
  if (intersectionAngles.length === 0) return null;
  
  // Find nearest angular intersection
  intersectionAngles.sort((a, b) => a.dist - b.dist);
  const target = intersectionAngles[0];
  
  const newData: ArcData = extendFromEnd
    ? { type: "arc", center: d.center, radius: d.radius, startAngle: d.startAngle, endAngle: target.angle }
    : { type: "arc", center: d.center, radius: d.radius, startAngle: target.angle, endAngle: d.endAngle };
  
  return { entityId: entity.id, newData };
}

function extendPolyline(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[]): ExtendResult | null {
  const d = entity.data as import("./cad-types").PolylineData;
  if (d.points.length < 2 || d.closed) return null;
  
  // Determine which end to extend
  const first = d.points[0];
  const last = d.points[d.points.length - 1];
  const distToFirst = distance(clickPoint, first);
  const distToLast = distance(clickPoint, last);
  const extendLast = distToLast < distToFirst;
  
  let rayOrigin: Point;
  let dx: number, dy: number;
  
  if (extendLast) {
    const prev = d.points[d.points.length - 2];
    dx = last.x - prev.x;
    dy = last.y - prev.y;
    rayOrigin = last;
  } else {
    const next = d.points[1];
    dx = first.x - next.x;
    dy = first.y - next.y;
    rayOrigin = first;
  }
  
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return null;
  dx /= len; dy /= len;
  
  let bestDist = Infinity;
  let bestPoint: Point | null = null;
  
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    const hits = rayEntityIntersections(rayOrigin, dx, dy, other);
    for (const hit of hits) {
      const dist = distance(rayOrigin, hit);
      if (dist > 0.01 && dist < bestDist) {
        bestDist = dist;
        bestPoint = hit;
      }
    }
  }
  
  if (!bestPoint) return null;
  
  const newPoints = [...d.points];
  if (extendLast) {
    newPoints[newPoints.length - 1] = bestPoint;
  } else {
    newPoints[0] = bestPoint;
  }
  
  return { entityId: entity.id, newData: { type: "polyline", points: newPoints, closed: d.closed } };
}

// ---- Circle-entity intersection (reused from trim-utils pattern) ----

function getCircleEntityIntersections(center: Point, radius: number, entity: CADEntity): Point[] {
  const d = entity.data;
  switch (d.type) {
    case "line": return lineCircleIntersectBounded(d.start, d.end, center, radius);
    case "circle": return circleCircleIntersect(center, radius, d.center, d.radius);
    case "arc": {
      const hits = circleCircleIntersect(center, radius, d.center, d.radius);
      return hits.filter(p => {
        let angle = Math.atan2(p.y - d.center.y, p.x - d.center.x);
        if (angle < 0) angle += Math.PI * 2;
        let s = d.startAngle, e = d.endAngle;
        if (s < 0) s += Math.PI * 2;
        if (e < 0) e += Math.PI * 2;
        if (s <= e) return angle >= s - 0.01 && angle <= e + 0.01;
        return angle >= s - 0.01 || angle <= e + 0.01;
      });
    }
    case "rectangle": {
      const tl = d.topLeft;
      const tr = { x: tl.x + d.width, y: tl.y };
      const br = { x: tl.x + d.width, y: tl.y + d.height };
      const bl = { x: tl.x, y: tl.y + d.height };
      return [
        ...lineCircleIntersectBounded(tl, tr, center, radius),
        ...lineCircleIntersectBounded(tr, br, center, radius),
        ...lineCircleIntersectBounded(br, bl, center, radius),
        ...lineCircleIntersectBounded(bl, tl, center, radius),
      ];
    }
    case "polyline": {
      const pts: Point[] = [];
      for (let i = 1; i < d.points.length; i++) {
        pts.push(...lineCircleIntersectBounded(d.points[i - 1], d.points[i], center, radius));
      }
      if (d.closed && d.points.length > 2) {
        pts.push(...lineCircleIntersectBounded(d.points[d.points.length - 1], d.points[0], center, radius));
      }
      return pts;
    }
    default: return [];
  }
}

function lineCircleIntersectBounded(a: Point, b: Point, center: Point, radius: number): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - center.x, fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  disc = Math.sqrt(disc);
  const results: Point[] = [];
  for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)]) {
    if (t >= -1e-10 && t <= 1 + 1e-10) {
      results.push({ x: a.x + t * dx, y: a.y + t * dy });
    }
  }
  return results;
}

function circleCircleIntersect(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const d = distance(c1, c2);
  if (d > r1 + r2 + 0.001 || d < Math.abs(r1 - r2) - 0.001 || d < 0.001) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < 0) return [];
  const h = Math.sqrt(h2);
  const mx = c1.x + a * (c2.x - c1.x) / d;
  const my = c1.y + a * (c2.y - c1.y) / d;
  const px = h * (c2.y - c1.y) / d;
  const py = h * (c2.x - c1.x) / d;
  if (Math.abs(h) < 0.001) return [{ x: mx, y: my }];
  return [{ x: mx + px, y: my - py }, { x: mx - px, y: my + py }];
}
