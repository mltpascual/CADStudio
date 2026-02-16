// ============================================================
// Trim Utils — Line/entity intersection and trimming logic
// ============================================================

import type { Point, CADEntity, EntityData, LineData, CircleData, ArcData, RectangleData, PolylineData } from "./cad-types";
import { distance, generateId } from "./cad-utils";

// ---- Intersection helpers ----

interface Intersection { point: Point; t: number; } // t = parameter along the trimmed entity

/** Find all intersections between a line segment and another entity */
function lineSegIntersections(a: Point, b: Point, entity: CADEntity): Point[] {
  const d = entity.data;
  switch (d.type) {
    case "line": return lineLineIntersect(a, b, d.start, d.end);
    case "circle": return lineCircleIntersect(a, b, d.center, d.radius);
    case "arc": return lineArcIntersect(a, b, d.center, d.radius, d.startAngle, d.endAngle);
    case "rectangle": {
      const tl = d.topLeft;
      const tr = { x: tl.x + d.width, y: tl.y };
      const br = { x: tl.x + d.width, y: tl.y + d.height };
      const bl = { x: tl.x, y: tl.y + d.height };
      return [
        ...lineLineIntersect(a, b, tl, tr),
        ...lineLineIntersect(a, b, tr, br),
        ...lineLineIntersect(a, b, br, bl),
        ...lineLineIntersect(a, b, bl, tl),
      ];
    }
    case "polyline": {
      const pts: Point[] = [];
      for (let i = 1; i < d.points.length; i++) {
        pts.push(...lineLineIntersect(a, b, d.points[i - 1], d.points[i]));
      }
      if (d.closed && d.points.length > 2) {
        pts.push(...lineLineIntersect(a, b, d.points[d.points.length - 1], d.points[0]));
      }
      return pts;
    }
    case "ellipse": return lineEllipseIntersect(a, b, d.center, d.radiusX, d.radiusY);
    default: return [];
  }
}

function lineLineIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Point[] {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return []; // parallel
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
  if (t >= -1e-10 && t <= 1 + 1e-10 && u >= -1e-10 && u <= 1 + 1e-10) {
    return [{ x: a1.x + t * dx1, y: a1.y + t * dy1 }];
  }
  return [];
}

function lineCircleIntersect(a: Point, b: Point, center: Point, radius: number): Point[] {
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

function lineArcIntersect(a: Point, b: Point, center: Point, radius: number, startAngle: number, endAngle: number): Point[] {
  const circleHits = lineCircleIntersect(a, b, center, radius);
  return circleHits.filter(p => {
    let angle = Math.atan2(p.y - center.y, p.x - center.x);
    if (angle < 0) angle += Math.PI * 2;
    let s = startAngle, e = endAngle;
    if (s < 0) s += Math.PI * 2;
    if (e < 0) e += Math.PI * 2;
    if (s <= e) return angle >= s - 0.01 && angle <= e + 0.01;
    return angle >= s - 0.01 || angle <= e + 0.01;
  });
}

function lineEllipseIntersect(a: Point, b: Point, center: Point, rx: number, ry: number): Point[] {
  // Transform to unit circle space
  const ax = (a.x - center.x) / rx, ay = (a.y - center.y) / ry;
  const bx = (b.x - center.x) / rx, by = (b.y - center.y) / ry;
  const dx = bx - ax, dy = by - ay;
  const A = dx * dx + dy * dy;
  const B = 2 * (ax * dx + ay * dy);
  const C = ax * ax + ay * ay - 1;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  disc = Math.sqrt(disc);
  const results: Point[] = [];
  for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)]) {
    if (t >= -1e-10 && t <= 1 + 1e-10) {
      results.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return results;
}

// ---- Parameter along entity ----

/** Get the parameter (0-1) of a point along a line segment */
function paramOnLine(p: Point, start: Point, end: Point): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return 0;
  return ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
}

// ---- Main Trim Function ----

export interface TrimResult {
  removeIds: string[];
  addEntities: CADEntity[];
}

/**
 * Trim an entity at the click point.
 * Works like AutoCAD: finds all intersection points with other entities,
 * then removes the segment of the clicked entity between the two nearest
 * intersection points (or from the end to the nearest intersection).
 */
export function trimEntity(
  clickPoint: Point,
  targetEntity: CADEntity,
  allEntities: CADEntity[],
  tolerance: number
): TrimResult | null {
  const d = targetEntity.data;

  // Only trim lines, polylines, circles, arcs, rectangles for now
  switch (d.type) {
    case "line": return trimLine(clickPoint, targetEntity, allEntities, tolerance);
    case "circle": return trimCircle(clickPoint, targetEntity, allEntities, tolerance);
    case "arc": return trimArc(clickPoint, targetEntity, allEntities, tolerance);
    case "rectangle": return trimRectangle(clickPoint, targetEntity, allEntities, tolerance);
    case "polyline": return trimPolyline(clickPoint, targetEntity, allEntities, tolerance);
    default: return null;
  }
}

function trimLine(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[], tolerance: number): TrimResult | null {
  const d = entity.data as LineData;
  
  // Find all intersections with other entities
  const intersections: { point: Point; t: number }[] = [];
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    const hits = lineSegIntersections(d.start, d.end, other);
    for (const hit of hits) {
      const t = paramOnLine(hit, d.start, d.end);
      if (t > 0.001 && t < 0.999) {
        intersections.push({ point: hit, t });
      }
    }
  }

  if (intersections.length === 0) return null;

  // Sort by parameter
  intersections.sort((a, b) => a.t - b.t);

  // Find which segment the click is in
  const clickT = paramOnLine(clickPoint, d.start, d.end);

  // Build segments: [0, t1], [t1, t2], ..., [tn, 1]
  const breaks = [0, ...intersections.map(i => i.t), 1];
  let segIdx = -1;
  for (let i = 0; i < breaks.length - 1; i++) {
    if (clickT >= breaks[i] - 0.01 && clickT <= breaks[i + 1] + 0.01) {
      segIdx = i;
      break;
    }
  }

  if (segIdx === -1) return null;

  // Remove the clicked segment, keep the rest
  const newEntities: CADEntity[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    if (i === segIdx) continue; // skip the trimmed segment
    const tStart = breaks[i];
    const tEnd = breaks[i + 1];
    const start = {
      x: d.start.x + tStart * (d.end.x - d.start.x),
      y: d.start.y + tStart * (d.end.y - d.start.y),
    };
    const end = {
      x: d.start.x + tEnd * (d.end.x - d.start.x),
      y: d.start.y + tEnd * (d.end.y - d.start.y),
    };
    if (distance(start, end) > 0.01) {
      newEntities.push({
        ...entity,
        id: generateId(),
        data: { type: "line", start, end },
      });
    }
  }

  return { removeIds: [entity.id], addEntities: newEntities };
}

function trimCircle(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[], tolerance: number): TrimResult | null {
  const d = entity.data as CircleData;
  
  // Find all intersection angles
  const angles: number[] = [];
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    // Sample the circle as segments and check intersections
    const hits = getCircleIntersections(d.center, d.radius, other);
    for (const hit of hits) {
      let angle = Math.atan2(hit.y - d.center.y, hit.x - d.center.x);
      if (angle < 0) angle += Math.PI * 2;
      angles.push(angle);
    }
  }

  if (angles.length < 2) return null;

  // Sort angles
  angles.sort((a, b) => a - b);

  // Find which arc segment the click is in
  let clickAngle = Math.atan2(clickPoint.y - d.center.y, clickPoint.x - d.center.x);
  if (clickAngle < 0) clickAngle += Math.PI * 2;

  // Find the two bounding angles
  let segIdx = -1;
  for (let i = 0; i < angles.length; i++) {
    const start = angles[i];
    const end = angles[(i + 1) % angles.length];
    if (start < end) {
      if (clickAngle >= start && clickAngle <= end) { segIdx = i; break; }
    } else {
      if (clickAngle >= start || clickAngle <= end) { segIdx = i; break; }
    }
  }

  if (segIdx === -1) return null;

  // Create arcs for all segments except the clicked one
  const newEntities: CADEntity[] = [];
  for (let i = 0; i < angles.length; i++) {
    if (i === segIdx) continue;
    const startAngle = angles[i];
    const endAngle = angles[(i + 1) % angles.length];
    newEntities.push({
      ...entity,
      id: generateId(),
      type: "arc",
      data: { type: "arc", center: d.center, radius: d.radius, startAngle, endAngle },
    });
  }

  return { removeIds: [entity.id], addEntities: newEntities };
}

function trimArc(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[], tolerance: number): TrimResult | null {
  const d = entity.data as ArcData;
  
  const angles: number[] = [];
  for (const other of allEntities) {
    if (other.id === entity.id) continue;
    if (!other.visible) continue;
    const hits = getCircleIntersections(d.center, d.radius, other);
    for (const hit of hits) {
      let angle = Math.atan2(hit.y - d.center.y, hit.x - d.center.x);
      if (angle < 0) angle += Math.PI * 2;
      // Check if the intersection is on the arc
      let s = d.startAngle, e = d.endAngle;
      if (s < 0) s += Math.PI * 2;
      if (e < 0) e += Math.PI * 2;
      const onArc = s <= e ? (angle >= s - 0.01 && angle <= e + 0.01) : (angle >= s - 0.01 || angle <= e + 0.01);
      if (onArc) angles.push(angle);
    }
  }

  if (angles.length === 0) return null;

  let s = d.startAngle; if (s < 0) s += Math.PI * 2;
  let e = d.endAngle; if (e < 0) e += Math.PI * 2;

  // Add arc endpoints
  const allAngles = [s, ...angles, e].sort((a, b) => a - b);
  // Deduplicate
  const unique = allAngles.filter((v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]) > 0.001);

  let clickAngle = Math.atan2(clickPoint.y - d.center.y, clickPoint.x - d.center.x);
  if (clickAngle < 0) clickAngle += Math.PI * 2;

  let segIdx = -1;
  for (let i = 0; i < unique.length - 1; i++) {
    if (clickAngle >= unique[i] - 0.01 && clickAngle <= unique[i + 1] + 0.01) {
      segIdx = i; break;
    }
  }

  if (segIdx === -1) return null;

  const newEntities: CADEntity[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    if (i === segIdx) continue;
    newEntities.push({
      ...entity,
      id: generateId(),
      data: { type: "arc", center: d.center, radius: d.radius, startAngle: unique[i], endAngle: unique[i + 1] },
    });
  }

  return { removeIds: [entity.id], addEntities: newEntities };
}

function trimRectangle(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[], tolerance: number): TrimResult | null {
  // Convert rectangle to 4 lines, trim the clicked line
  const d = entity.data as RectangleData;
  const tl = d.topLeft;
  const tr = { x: tl.x + d.width, y: tl.y };
  const br = { x: tl.x + d.width, y: tl.y + d.height };
  const bl = { x: tl.x, y: tl.y + d.height };
  const edges: [Point, Point][] = [[tl, tr], [tr, br], [br, bl], [bl, tl]];

  // Find which edge was clicked
  let clickedEdge = -1;
  let minDist = tolerance;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((clickPoint.x - a.x) * dx + (clickPoint.y - a.y) * dy) / lenSq));
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    const dist = distance(clickPoint, proj);
    if (dist < minDist) { minDist = dist; clickedEdge = i; }
  }

  if (clickedEdge === -1) return null;

  // Explode rectangle into 4 lines, then trim the clicked one
  const lineEntities: CADEntity[] = edges.map(([start, end], i) => ({
    ...entity,
    id: generateId(),
    type: "line" as const,
    data: { type: "line" as const, start, end },
  }));

  // Try to trim the clicked line
  const trimResult = trimLine(clickPoint, lineEntities[clickedEdge], allEntities, tolerance);
  
  if (trimResult) {
    // Replace rectangle with the remaining lines
    const remaining = lineEntities.filter((_, i) => i !== clickedEdge);
    return {
      removeIds: [entity.id],
      addEntities: [...remaining, ...trimResult.addEntities],
    };
  } else {
    // If no trim possible, just explode and remove the clicked edge
    const remaining = lineEntities.filter((_, i) => i !== clickedEdge);
    return { removeIds: [entity.id], addEntities: remaining };
  }
}

function trimPolyline(clickPoint: Point, entity: CADEntity, allEntities: CADEntity[], tolerance: number): TrimResult | null {
  const d = entity.data as PolylineData;
  if (d.points.length < 2) return null;

  // Find which segment was clicked
  let clickedSeg = -1;
  let minDist = tolerance;
  for (let i = 1; i < d.points.length; i++) {
    const a = d.points[i - 1], b = d.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((clickPoint.x - a.x) * dx + (clickPoint.y - a.y) * dy) / lenSq));
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    const dist = distance(clickPoint, proj);
    if (dist < minDist) { minDist = dist; clickedSeg = i - 1; }
  }

  if (clickedSeg === -1) return null;

  // Create a line entity for the clicked segment and trim it
  const segStart = d.points[clickedSeg];
  const segEnd = d.points[clickedSeg + 1];
  const segEntity: CADEntity = {
    ...entity,
    id: "temp-seg",
    type: "line",
    data: { type: "line", start: segStart, end: segEnd },
  };

  const trimResult = trimLine(clickPoint, segEntity, allEntities, tolerance);

  if (!trimResult) return null;

  // Build result: split polyline at the trimmed segment
  const newEntities: CADEntity[] = [];

  // Before the trimmed segment
  if (clickedSeg > 0) {
    const beforePoints = d.points.slice(0, clickedSeg + 1);
    if (beforePoints.length >= 2) {
      newEntities.push({
        ...entity,
        id: generateId(),
        data: { type: "polyline", points: beforePoints, closed: false },
      });
    }
  }

  // After the trimmed segment
  if (clickedSeg + 1 < d.points.length - 1) {
    const afterPoints = d.points.slice(clickedSeg + 1);
    if (afterPoints.length >= 2) {
      newEntities.push({
        ...entity,
        id: generateId(),
        data: { type: "polyline", points: afterPoints, closed: false },
      });
    }
  }

  // Add the trimmed line segments
  newEntities.push(...trimResult.addEntities.map(e => ({ ...e, id: generateId() })));

  return { removeIds: [entity.id], addEntities: newEntities };
}

// ---- Circle intersection with entities ----

function getCircleIntersections(center: Point, radius: number, entity: CADEntity): Point[] {
  const d = entity.data;
  switch (d.type) {
    case "line": return lineCircleIntersect(d.start, d.end, center, radius);
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
        ...lineCircleIntersect(tl, tr, center, radius),
        ...lineCircleIntersect(tr, br, center, radius),
        ...lineCircleIntersect(br, bl, center, radius),
        ...lineCircleIntersect(bl, tl, center, radius),
      ];
    }
    case "polyline": {
      const pts: Point[] = [];
      for (let i = 1; i < d.points.length; i++) {
        pts.push(...lineCircleIntersect(d.points[i - 1], d.points[i], center, radius));
      }
      if (d.closed && d.points.length > 2) {
        pts.push(...lineCircleIntersect(d.points[d.points.length - 1], d.points[0], center, radius));
      }
      return pts;
    }
    default: return [];
  }
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
