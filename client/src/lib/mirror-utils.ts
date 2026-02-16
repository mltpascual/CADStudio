// ============================================================
// Mirror Tool — Reflect entities across an axis line
// ============================================================

import type { Point, CADEntity, EntityData } from "./cad-types";

/** Reflect a point across a line defined by two points */
function reflectPoint(p: Point, lineStart: Point, lineEnd: Point): Point {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...p };
  
  const t = ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / lenSq;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  
  return {
    x: 2 * projX - p.x,
    y: 2 * projY - p.y,
  };
}

/** Mirror entity data across an axis line */
function mirrorEntityData(data: EntityData, axisStart: Point, axisEnd: Point): EntityData | null {
  switch (data.type) {
    case "line": {
      return {
        ...data,
        start: reflectPoint(data.start, axisStart, axisEnd),
        end: reflectPoint(data.end, axisStart, axisEnd),
      };
    }
    case "circle": {
      return {
        ...data,
        center: reflectPoint(data.center, axisStart, axisEnd),
      };
    }
    case "arc": {
      const newCenter = reflectPoint(data.center, axisStart, axisEnd);
      // Mirror reverses the arc direction
      const axisAngle = Math.atan2(axisEnd.y - axisStart.y, axisEnd.x - axisStart.x);
      const newStart = 2 * axisAngle - data.endAngle;
      const newEnd = 2 * axisAngle - data.startAngle;
      return {
        ...data,
        center: newCenter,
        startAngle: newStart,
        endAngle: newEnd,
      };
    }
    case "rectangle": {
      const tl = data.topLeft;
      const br = { x: tl.x + data.width, y: tl.y + data.height };
      const newTL = reflectPoint(tl, axisStart, axisEnd);
      const newBR = reflectPoint(br, axisStart, axisEnd);
      return {
        ...data,
        topLeft: {
          x: Math.min(newTL.x, newBR.x),
          y: Math.min(newTL.y, newBR.y),
        },
        width: Math.abs(newBR.x - newTL.x),
        height: Math.abs(newBR.y - newTL.y),
      };
    }
    case "polyline": {
      return {
        ...data,
        points: data.points.map(p => reflectPoint(p, axisStart, axisEnd)),
      };
    }
    case "ellipse": {
      const newCenter = reflectPoint(data.center, axisStart, axisEnd);
      const axisAngle = Math.atan2(axisEnd.y - axisStart.y, axisEnd.x - axisStart.x);
      return {
        ...data,
        center: newCenter,
        rotation: 2 * axisAngle - data.rotation,
      };
    }
    case "text": {
      return {
        ...data,
        position: reflectPoint(data.position, axisStart, axisEnd),
      };
    }
    case "dimension": {
      return {
        ...data,
        start: reflectPoint(data.start, axisStart, axisEnd),
        end: reflectPoint(data.end, axisStart, axisEnd),
      };
    }
    default:
      return null;
  }
}

/** Mirror selected entities across an axis line, returning new mirrored entities */
export function mirrorEntities(
  entities: CADEntity[],
  selectedIds: string[],
  axisStart: Point,
  axisEnd: Point,
  keepOriginal: boolean = true,
): { newEntities: CADEntity[]; removeIds: string[] } {
  const newEntities: CADEntity[] = [];
  const removeIds: string[] = [];

  for (const entity of entities) {
    if (!selectedIds.includes(entity.id)) continue;
    const mirrored = mirrorEntityData(entity.data, axisStart, axisEnd);
    if (!mirrored) continue;

    const newEntity: CADEntity = {
      ...entity,
      id: crypto.randomUUID(),
      data: mirrored,
    };
    newEntities.push(newEntity);

    if (!keepOriginal) {
      removeIds.push(entity.id);
    }
  }

  return { newEntities, removeIds };
}
