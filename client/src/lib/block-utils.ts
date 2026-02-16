// ============================================================
// Block/Group Utilities — Group entities into reusable blocks
// ============================================================

import type { Point, CADEntity, BlockDefinition, BlockRefData } from "./cad-types";
import { generateId } from "./cad-utils";

/** Calculate the centroid of a set of entities to use as base point */
export function calculateBasePoint(entities: CADEntity[]): Point {
  let sumX = 0, sumY = 0, count = 0;
  for (const e of entities) {
    const pts = getEntityPoints(e);
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
      count++;
    }
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
}

/** Get representative points from an entity */
function getEntityPoints(entity: CADEntity): Point[] {
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
    case "hatch": return d.boundary;
    case "blockref": return [d.insertPoint];
    default: return [];
  }
}

/** Create a block definition from selected entities */
export function createBlockDefinition(
  name: string,
  entities: CADEntity[],
  basePoint?: Point
): BlockDefinition {
  const bp = basePoint || calculateBasePoint(entities);
  // Store entities with coordinates relative to base point
  const relativeEntities = entities.map(e => ({
    ...e,
    id: generateId(), // new IDs for the definition
  }));

  return {
    id: `block-${generateId()}`,
    name,
    entities: relativeEntities,
    basePoint: bp,
  };
}

/** Create a block reference entity (an instance of a block) */
export function createBlockRefEntity(
  blockId: string,
  insertPoint: Point,
  scaleX: number,
  scaleY: number,
  rotation: number,
  layerId: string,
  color: string
): CADEntity {
  return {
    id: generateId(),
    type: "blockref",
    data: {
      type: "blockref",
      blockId,
      insertPoint,
      scaleX,
      scaleY,
      rotation,
    } as BlockRefData,
    layerId,
    color,
    lineWidth: 1,
    lineStyle: "solid",
    visible: true,
    locked: false,
    selected: false,
  };
}

/** Transform a point relative to block base for rendering */
function transformPoint(
  p: Point,
  basePoint: Point,
  insertPoint: Point,
  scaleX: number,
  scaleY: number,
  rotation: number
): Point {
  // Translate to origin (relative to base)
  let x = p.x - basePoint.x;
  let y = p.y - basePoint.y;
  // Scale
  x *= scaleX;
  y *= scaleY;
  // Rotate
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  // Translate to insert point
  return { x: rx + insertPoint.x, y: ry + insertPoint.y };
}

/** Get the transformed entities of a block reference for rendering */
export function getBlockRefEntities(
  blockDef: BlockDefinition,
  refData: BlockRefData
): CADEntity[] {
  return blockDef.entities.map(entity => {
    const transformed = transformEntityData(
      entity,
      blockDef.basePoint,
      refData.insertPoint,
      refData.scaleX,
      refData.scaleY,
      refData.rotation
    );
    return {
      ...entity,
      ...transformed,
      id: `${entity.id}-ref-${refData.insertPoint.x.toFixed(0)}-${refData.insertPoint.y.toFixed(0)}`,
    };
  });
}

/** Transform entity data based on block reference parameters */
function transformEntityData(
  entity: CADEntity,
  basePoint: Point,
  insertPoint: Point,
  scaleX: number,
  scaleY: number,
  rotation: number
): Partial<CADEntity> {
  const tp = (p: Point) => transformPoint(p, basePoint, insertPoint, scaleX, scaleY, rotation);
  const d = entity.data;

  switch (d.type) {
    case "line":
      return { data: { ...d, start: tp(d.start), end: tp(d.end) } };
    case "circle": {
      const c = tp(d.center);
      return { data: { ...d, center: c, radius: d.radius * Math.abs(scaleX) } };
    }
    case "arc": {
      const c = tp(d.center);
      const rad = (rotation * Math.PI) / 180;
      return {
        data: {
          ...d,
          center: c,
          radius: d.radius * Math.abs(scaleX),
          startAngle: d.startAngle + rad,
          endAngle: d.endAngle + rad,
        },
      };
    }
    case "rectangle": {
      const tl = tp(d.topLeft);
      return { data: { ...d, topLeft: tl, width: d.width * scaleX, height: d.height * scaleY } };
    }
    case "polyline":
      return { data: { ...d, points: d.points.map(tp) } };
    case "ellipse": {
      const c = tp(d.center);
      return {
        data: {
          ...d,
          center: c,
          radiusX: d.radiusX * Math.abs(scaleX),
          radiusY: d.radiusY * Math.abs(scaleY),
          rotation: d.rotation + (rotation * Math.PI) / 180,
        },
      };
    }
    case "text": {
      const pos = tp(d.position);
      return {
        data: {
          ...d,
          position: pos,
          fontSize: d.fontSize * Math.abs(scaleX),
          rotation: d.rotation + rotation,
        },
      };
    }
    case "dimension":
      return { data: { ...d, start: tp(d.start), end: tp(d.end) } };
    case "hatch":
      return { data: { ...d, boundary: d.boundary.map(tp) } };
    default:
      return {};
  }
}

/** Explode a block reference into individual entities */
export function explodeBlockRef(
  blockDef: BlockDefinition,
  refData: BlockRefData,
  layerId: string,
  color: string
): CADEntity[] {
  return getBlockRefEntities(blockDef, refData).map(e => ({
    ...e,
    id: generateId(),
    layerId,
    color,
    selected: false,
  }));
}
