// ============================================================
// Fillet Utils — Round or bevel corners between intersecting lines
// ============================================================

import type { Point, CADEntity, EntityData, LineData, ArcData } from "./cad-types";
import { distance, generateId } from "./cad-utils";

export type FilletMode = "fillet" | "chamfer";

export interface FilletResult {
  removeIds: string[];
  addEntities: CADEntity[];
}

/**
 * Fillet or chamfer the corner between two line entities.
 * - Fillet: creates an arc of given radius tangent to both lines
 * - Chamfer: creates a straight line cutting the corner at given distances
 */
export function filletEntities(
  entity1: CADEntity,
  entity2: CADEntity,
  radius: number,
  mode: FilletMode,
  allEntities: CADEntity[]
): FilletResult | null {
  if (entity1.data.type !== "line" || entity2.data.type !== "line") return null;

  const l1 = entity1.data as LineData;
  const l2 = entity2.data as LineData;

  // Find intersection of the two lines (extended)
  const intersection = lineLineIntersectUnbounded(l1.start, l1.end, l2.start, l2.end);
  if (!intersection) return null; // parallel lines

  if (radius <= 0) {
    // Zero radius: just trim both lines to the intersection point
    const newL1 = trimLineToIntersection(l1, intersection);
    const newL2 = trimLineToIntersection(l2, intersection);
    return {
      removeIds: [entity1.id, entity2.id],
      addEntities: [
        { ...entity1, id: generateId(), data: newL1 },
        { ...entity2, id: generateId(), data: newL2 },
      ],
    };
  }

  if (mode === "fillet") {
    return createFillet(entity1, entity2, l1, l2, intersection, radius);
  } else {
    return createChamfer(entity1, entity2, l1, l2, intersection, radius);
  }
}

function createFillet(
  entity1: CADEntity, entity2: CADEntity,
  l1: LineData, l2: LineData,
  intersection: Point, radius: number
): FilletResult | null {
  // Direction vectors of each line away from intersection
  const dir1 = getDirectionAway(l1, intersection);
  const dir2 = getDirectionAway(l2, intersection);
  if (!dir1 || !dir2) return null;

  // Normal vectors (pointing inward toward the fillet center)
  // Try both normals for each line and pick the pair that converge
  const n1a = { x: -dir1.y, y: dir1.x };
  const n1b = { x: dir1.y, y: -dir1.x };
  const n2a = { x: -dir2.y, y: dir2.x };
  const n2b = { x: dir2.y, y: -dir2.x };

  // Find the fillet center: offset each line by radius along normal
  // The center is at intersection + radius * n1 and intersection + radius * n2
  // We need the normals that point toward the same side
  let bestCenter: Point | null = null;
  let bestN1 = n1a, bestN2 = n2a;

  for (const n1 of [n1a, n1b]) {
    for (const n2 of [n2a, n2b]) {
      // Offset lines
      const p1 = { x: intersection.x + n1.x * radius, y: intersection.y + n1.y * radius };
      const p2 = { x: intersection.x + n2.x * radius, y: intersection.y + n2.y * radius };
      
      // The center should be equidistant from both lines at 'radius'
      // Check if these offset lines intersect near the expected center
      const c = lineLineIntersectUnbounded(
        { x: p1.x, y: p1.y },
        { x: p1.x + dir1.x, y: p1.y + dir1.y },
        { x: p2.x, y: p2.y },
        { x: p2.x + dir2.x, y: p2.y + dir2.y }
      );
      
      if (c) {
        // Verify the center is on the correct side (away from the lines' far ends)
        const d1 = distancePointToLine(c, l1.start, l1.end);
        const d2 = distancePointToLine(c, l2.start, l2.end);
        if (Math.abs(d1 - radius) < 0.5 && Math.abs(d2 - radius) < 0.5) {
          if (!bestCenter || distance(c, intersection) < distance(bestCenter, intersection)) {
            bestCenter = c;
            bestN1 = n1;
            bestN2 = n2;
          }
        }
      }
    }
  }

  if (!bestCenter) return null;

  // Find tangent points on each line
  const tangent1 = closestPointOnLine(bestCenter, l1.start, l1.end);
  const tangent2 = closestPointOnLine(bestCenter, l2.start, l2.end);

  // Compute arc angles
  const startAngle = Math.atan2(tangent1.y - bestCenter.y, tangent1.x - bestCenter.x);
  const endAngle = Math.atan2(tangent2.y - bestCenter.y, tangent2.x - bestCenter.x);

  // Trim lines to tangent points
  const newL1 = trimLineToTangent(l1, tangent1, intersection);
  const newL2 = trimLineToTangent(l2, tangent2, intersection);

  // Create the arc entity
  const arcData: ArcData = {
    type: "arc",
    center: bestCenter,
    radius,
    startAngle: startAngle,
    endAngle: endAngle,
  };

  // Determine correct arc direction (should be the shorter arc)
  let angleDiff = endAngle - startAngle;
  if (angleDiff < 0) angleDiff += Math.PI * 2;
  if (angleDiff > Math.PI) {
    // Swap to get the shorter arc
    arcData.startAngle = endAngle;
    arcData.endAngle = startAngle;
  }

  const arcEntity: CADEntity = {
    id: generateId(),
    type: "arc",
    data: arcData,
    layerId: entity1.layerId,
    color: entity1.color,
    lineWidth: entity1.lineWidth,
    lineStyle: entity1.lineStyle,
    visible: true,
    locked: false,
    selected: false,
  };

  return {
    removeIds: [entity1.id, entity2.id],
    addEntities: [
      { ...entity1, id: generateId(), data: newL1 },
      { ...entity2, id: generateId(), data: newL2 },
      arcEntity,
    ],
  };
}

function createChamfer(
  entity1: CADEntity, entity2: CADEntity,
  l1: LineData, l2: LineData,
  intersection: Point, chamferDist: number
): FilletResult | null {
  // Find points on each line at chamferDist from intersection
  const dir1 = getDirectionAway(l1, intersection);
  const dir2 = getDirectionAway(l2, intersection);
  if (!dir1 || !dir2) return null;

  const chamferPt1 = { x: intersection.x + dir1.x * chamferDist, y: intersection.y + dir1.y * chamferDist };
  const chamferPt2 = { x: intersection.x + dir2.x * chamferDist, y: intersection.y + dir2.y * chamferDist };

  // Trim lines to chamfer points
  const newL1 = trimLineToTangent(l1, chamferPt1, intersection);
  const newL2 = trimLineToTangent(l2, chamferPt2, intersection);

  // Create the chamfer line
  const chamferLine: LineData = { type: "line", start: chamferPt1, end: chamferPt2 };
  const chamferEntity: CADEntity = {
    id: generateId(),
    type: "line",
    data: chamferLine,
    layerId: entity1.layerId,
    color: entity1.color,
    lineWidth: entity1.lineWidth,
    lineStyle: entity1.lineStyle,
    visible: true,
    locked: false,
    selected: false,
  };

  return {
    removeIds: [entity1.id, entity2.id],
    addEntities: [
      { ...entity1, id: generateId(), data: newL1 },
      { ...entity2, id: generateId(), data: newL2 },
      chamferEntity,
    ],
  };
}

// ---- Geometry helpers ----

function lineLineIntersectUnbounded(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

function getDirectionAway(line: LineData, intersection: Point): Point | null {
  // Return unit vector pointing away from intersection along the line
  const d1 = distance(line.start, intersection);
  const d2 = distance(line.end, intersection);
  
  let away: Point;
  if (d1 > d2) {
    away = line.start;
  } else {
    away = line.end;
  }
  
  const dx = away.x - intersection.x;
  const dy = away.y - intersection.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return null;
  return { x: dx / len, y: dy / len };
}

function distancePointToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return distance(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function closestPointOnLine(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return a;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function trimLineToIntersection(line: LineData, intersection: Point): LineData {
  const d1 = distance(line.start, intersection);
  const d2 = distance(line.end, intersection);
  if (d1 < d2) {
    return { type: "line", start: intersection, end: line.end };
  }
  return { type: "line", start: line.start, end: intersection };
}

function trimLineToTangent(line: LineData, tangent: Point, intersection: Point): LineData {
  // Keep the part of the line away from the intersection
  const d1 = distance(line.start, intersection);
  const d2 = distance(line.end, intersection);
  if (d1 > d2) {
    // start is far, end is near intersection → trim end to tangent
    return { type: "line", start: line.start, end: tangent };
  }
  // end is far, start is near intersection → trim start to tangent
  return { type: "line", start: tangent, end: line.end };
}
