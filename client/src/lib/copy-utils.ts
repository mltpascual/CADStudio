// ============================================================
// Copy Utils — Duplicate entities with displacement
// ============================================================

import type { Point, CADEntity, EntityData } from "./cad-types";
import { generateId } from "./cad-utils";

/**
 * Create a deep copy of an entity displaced by (dx, dy).
 * Returns a new entity with a fresh ID.
 */
export function copyEntity(entity: CADEntity, dx: number, dy: number): CADEntity {
  const newData = displaceEntityData(entity.data, dx, dy);
  return {
    ...entity,
    id: generateId(),
    data: newData,
    selected: false,
  };
}

/**
 * Copy multiple entities with displacement.
 */
export function copyEntities(entities: CADEntity[], dx: number, dy: number): CADEntity[] {
  return entities.map(e => copyEntity(e, dx, dy));
}

function displaceEntityData(data: EntityData, dx: number, dy: number): EntityData {
  switch (data.type) {
    case "line":
      return { ...data, start: movePoint(data.start, dx, dy), end: movePoint(data.end, dx, dy) };
    case "circle":
      return { ...data, center: movePoint(data.center, dx, dy) };
    case "arc":
      return { ...data, center: movePoint(data.center, dx, dy) };
    case "rectangle":
      return { ...data, topLeft: movePoint(data.topLeft, dx, dy) };
    case "polyline":
      return { ...data, points: data.points.map(p => movePoint(p, dx, dy)) };
    case "ellipse":
      return { ...data, center: movePoint(data.center, dx, dy) };
    case "text":
      return { ...data, position: movePoint(data.position, dx, dy) };
    case "dimension":
      return { ...data, start: movePoint(data.start, dx, dy), end: movePoint(data.end, dx, dy) };
    default:
      return data;
  }
}

function movePoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}
