// ============================================================
// grip-utils.ts — Entity grip point calculation and editing
// Design: Blue squares on endpoints, midpoints, centers
// Draggable to modify entity geometry directly
// ============================================================

import type { Point, CADEntity, EntityData } from "./cad-types";
import type { SplineData, XLineData, RayData } from "./cad-types";

export interface GripPoint {
  id: string;
  entityId: string;
  point: Point;
  type: "endpoint" | "midpoint" | "center" | "control" | "radius" | "quadrant";
  /** Which data key this grip modifies, e.g. "start", "end", "center", "points[2]" */
  dataKey: string;
}

const GRIP_SIZE = 5; // half-size of grip square in screen pixels
const GRIP_HIT_RADIUS = 8; // hit test radius in screen pixels

/** Get all grip points for a single entity */
export function getEntityGrips(entity: CADEntity): GripPoint[] {
  const grips: GripPoint[] = [];
  const d = entity.data;
  const eid = entity.id;

  switch (d.type) {
    case "line": {
      grips.push({ id: `${eid}-start`, entityId: eid, point: d.start, type: "endpoint", dataKey: "start" });
      grips.push({ id: `${eid}-end`, entityId: eid, point: d.end, type: "endpoint", dataKey: "end" });
      grips.push({
        id: `${eid}-mid`, entityId: eid,
        point: { x: (d.start.x + d.end.x) / 2, y: (d.start.y + d.end.y) / 2 },
        type: "midpoint", dataKey: "midpoint",
      });
      break;
    }
    case "circle": {
      grips.push({ id: `${eid}-center`, entityId: eid, point: d.center, type: "center", dataKey: "center" });
      grips.push({ id: `${eid}-q0`, entityId: eid, point: { x: d.center.x + d.radius, y: d.center.y }, type: "quadrant", dataKey: "radius_right" });
      grips.push({ id: `${eid}-q1`, entityId: eid, point: { x: d.center.x, y: d.center.y - d.radius }, type: "quadrant", dataKey: "radius_top" });
      grips.push({ id: `${eid}-q2`, entityId: eid, point: { x: d.center.x - d.radius, y: d.center.y }, type: "quadrant", dataKey: "radius_left" });
      grips.push({ id: `${eid}-q3`, entityId: eid, point: { x: d.center.x, y: d.center.y + d.radius }, type: "quadrant", dataKey: "radius_bottom" });
      break;
    }
    case "arc": {
      grips.push({ id: `${eid}-center`, entityId: eid, point: d.center, type: "center", dataKey: "center" });
      const sa = d.startAngle;
      const ea = d.endAngle;
      grips.push({
        id: `${eid}-start`, entityId: eid,
        point: { x: d.center.x + d.radius * Math.cos(sa), y: d.center.y + d.radius * Math.sin(sa) },
        type: "endpoint", dataKey: "startAngle",
      });
      grips.push({
        id: `${eid}-end`, entityId: eid,
        point: { x: d.center.x + d.radius * Math.cos(ea), y: d.center.y + d.radius * Math.sin(ea) },
        type: "endpoint", dataKey: "endAngle",
      });
      break;
    }
    case "rectangle": {
      const { topLeft, width, height } = d;
      grips.push({ id: `${eid}-tl`, entityId: eid, point: topLeft, type: "endpoint", dataKey: "topLeft" });
      grips.push({ id: `${eid}-tr`, entityId: eid, point: { x: topLeft.x + width, y: topLeft.y }, type: "endpoint", dataKey: "tr" });
      grips.push({ id: `${eid}-bl`, entityId: eid, point: { x: topLeft.x, y: topLeft.y + height }, type: "endpoint", dataKey: "bl" });
      grips.push({ id: `${eid}-br`, entityId: eid, point: { x: topLeft.x + width, y: topLeft.y + height }, type: "endpoint", dataKey: "br" });
      // Midpoints of edges
      grips.push({ id: `${eid}-mt`, entityId: eid, point: { x: topLeft.x + width / 2, y: topLeft.y }, type: "midpoint", dataKey: "mid_top" });
      grips.push({ id: `${eid}-mb`, entityId: eid, point: { x: topLeft.x + width / 2, y: topLeft.y + height }, type: "midpoint", dataKey: "mid_bottom" });
      grips.push({ id: `${eid}-ml`, entityId: eid, point: { x: topLeft.x, y: topLeft.y + height / 2 }, type: "midpoint", dataKey: "mid_left" });
      grips.push({ id: `${eid}-mr`, entityId: eid, point: { x: topLeft.x + width, y: topLeft.y + height / 2 }, type: "midpoint", dataKey: "mid_right" });
      break;
    }
    case "polyline": {
      d.points.forEach((p, i) => {
        grips.push({ id: `${eid}-p${i}`, entityId: eid, point: p, type: "endpoint", dataKey: `points[${i}]` });
      });
      // Midpoints between consecutive points
      for (let i = 0; i < d.points.length - 1; i++) {
        const a = d.points[i], b = d.points[i + 1];
        grips.push({
          id: `${eid}-m${i}`, entityId: eid,
          point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          type: "midpoint", dataKey: `mid[${i}]`,
        });
      }
      break;
    }
    case "ellipse": {
      grips.push({ id: `${eid}-center`, entityId: eid, point: d.center, type: "center", dataKey: "center" });
      grips.push({ id: `${eid}-rx`, entityId: eid, point: { x: d.center.x + d.radiusX, y: d.center.y }, type: "quadrant", dataKey: "radiusX" });
      grips.push({ id: `${eid}-ry`, entityId: eid, point: { x: d.center.x, y: d.center.y - d.radiusY }, type: "quadrant", dataKey: "radiusY" });
      break;
    }
    case "text": {
      grips.push({ id: `${eid}-pos`, entityId: eid, point: d.position, type: "endpoint", dataKey: "position" });
      break;
    }
    case "dimension": {
      grips.push({ id: `${eid}-start`, entityId: eid, point: d.start, type: "endpoint", dataKey: "start" });
      grips.push({ id: `${eid}-end`, entityId: eid, point: d.end, type: "endpoint", dataKey: "end" });
      break;
    }
    case "spline": {
      const sd = d as SplineData;
      sd.controlPoints.forEach((p, i) => {
        grips.push({ id: `${eid}-cp${i}`, entityId: eid, point: p, type: "control", dataKey: `controlPoints[${i}]` });
      });
      break;
    }
    case "xline": {
      const xd = d as XLineData;
      grips.push({ id: `${eid}-base`, entityId: eid, point: xd.basePoint, type: "endpoint", dataKey: "basePoint" });
      grips.push({ id: `${eid}-dir`, entityId: eid, point: { x: xd.basePoint.x + xd.direction.x * 50, y: xd.basePoint.y + xd.direction.y * 50 }, type: "control", dataKey: "direction" });
      break;
    }
    case "ray": {
      const rd = d as RayData;
      grips.push({ id: `${eid}-base`, entityId: eid, point: rd.basePoint, type: "endpoint", dataKey: "basePoint" });
      grips.push({ id: `${eid}-dir`, entityId: eid, point: { x: rd.basePoint.x + rd.direction.x * 50, y: rd.basePoint.y + rd.direction.y * 50 }, type: "control", dataKey: "direction" });
      break;
    }
    default:
      break;
  }

  return grips;
}

/** Draw grip points on the canvas */
export function drawGrips(
  ctx: CanvasRenderingContext2D,
  grips: GripPoint[],
  worldToScreen: (wx: number, wy: number) => Point,
  hoveredGripId: string | null,
  activeGripId: string | null,
) {
  for (const grip of grips) {
    const sp = worldToScreen(grip.point.x, grip.point.y);
    const isHovered = grip.id === hoveredGripId;
    const isActive = grip.id === activeGripId;
    const size = isHovered || isActive ? GRIP_SIZE + 1 : GRIP_SIZE;

    // Fill
    if (isActive) {
      ctx.fillStyle = "#ef4444"; // red when dragging
    } else if (isHovered) {
      ctx.fillStyle = "#60a5fa"; // lighter blue on hover
    } else {
      ctx.fillStyle = "#3b82f6"; // standard blue
    }

    // Draw based on grip type
    if (grip.type === "midpoint") {
      // Triangle for midpoints
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - size);
      ctx.lineTo(sp.x + size, sp.y + size * 0.7);
      ctx.lineTo(sp.x - size, sp.y + size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (grip.type === "center") {
      // Circle for centers
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Cross inside
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sp.x - 2, sp.y); ctx.lineTo(sp.x + 2, sp.y);
      ctx.moveTo(sp.x, sp.y - 2); ctx.lineTo(sp.x, sp.y + 2);
      ctx.stroke();
    } else if (grip.type === "control") {
      // Diamond for control points
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - size);
      ctx.lineTo(sp.x + size, sp.y);
      ctx.lineTo(sp.x, sp.y + size);
      ctx.lineTo(sp.x - size, sp.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // Square for endpoints and quadrants
      ctx.fillRect(sp.x - size, sp.y - size, size * 2, size * 2);
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 1;
      ctx.strokeRect(sp.x - size, sp.y - size, size * 2, size * 2);
    }
  }
}

/** Hit test a screen point against grip points */
export function hitTestGrip(
  grips: GripPoint[],
  screenPoint: Point,
  worldToScreen: (wx: number, wy: number) => Point,
): GripPoint | null {
  for (const grip of grips) {
    const sp = worldToScreen(grip.point.x, grip.point.y);
    const dx = screenPoint.x - sp.x;
    const dy = screenPoint.y - sp.y;
    if (Math.sqrt(dx * dx + dy * dy) <= GRIP_HIT_RADIUS) {
      return grip;
    }
  }
  return null;
}

/** Apply a grip drag to an entity, returning new EntityData */
export function applyGripMove(entity: CADEntity, grip: GripPoint, newWorldPoint: Point): EntityData {
  const d = entity.data;
  const np = newWorldPoint;

  switch (d.type) {
    case "line": {
      if (grip.dataKey === "start") return { ...d, start: np };
      if (grip.dataKey === "end") return { ...d, end: np };
      if (grip.dataKey === "midpoint") {
        const dx = np.x - (d.start.x + d.end.x) / 2;
        const dy = np.y - (d.start.y + d.end.y) / 2;
        return { ...d, start: { x: d.start.x + dx, y: d.start.y + dy }, end: { x: d.end.x + dx, y: d.end.y + dy } };
      }
      return d;
    }
    case "circle": {
      if (grip.dataKey === "center") return { ...d, center: np };
      if (grip.dataKey.startsWith("radius")) {
        const newRadius = Math.sqrt((np.x - d.center.x) ** 2 + (np.y - d.center.y) ** 2);
        return { ...d, radius: Math.max(1, newRadius) };
      }
      return d;
    }
    case "arc": {
      if (grip.dataKey === "center") return { ...d, center: np };
      if (grip.dataKey === "startAngle") {
        const angle = Math.atan2(np.y - d.center.y, np.x - d.center.x);
        const newRadius = Math.sqrt((np.x - d.center.x) ** 2 + (np.y - d.center.y) ** 2);
        return { ...d, startAngle: angle, radius: Math.max(1, newRadius) };
      }
      if (grip.dataKey === "endAngle") {
        const angle = Math.atan2(np.y - d.center.y, np.x - d.center.x);
        const newRadius = Math.sqrt((np.x - d.center.x) ** 2 + (np.y - d.center.y) ** 2);
        return { ...d, endAngle: angle, radius: Math.max(1, newRadius) };
      }
      return d;
    }
    case "rectangle": {
      const { topLeft, width, height } = d;
      if (grip.dataKey === "topLeft") {
        return { ...d, topLeft: np, width: width + (topLeft.x - np.x), height: height + (topLeft.y - np.y) };
      }
      if (grip.dataKey === "tr") {
        return { ...d, width: np.x - topLeft.x, height: height + (topLeft.y - np.y), topLeft: { x: topLeft.x, y: np.y } };
      }
      if (grip.dataKey === "bl") {
        return { ...d, topLeft: { x: np.x, y: topLeft.y }, width: width + (topLeft.x - np.x), height: np.y - topLeft.y };
      }
      if (grip.dataKey === "br") {
        return { ...d, width: np.x - topLeft.x, height: np.y - topLeft.y };
      }
      if (grip.dataKey === "mid_top") {
        return { ...d, topLeft: { x: topLeft.x, y: np.y }, height: height + (topLeft.y - np.y) };
      }
      if (grip.dataKey === "mid_bottom") {
        return { ...d, height: np.y - topLeft.y };
      }
      if (grip.dataKey === "mid_left") {
        return { ...d, topLeft: { x: np.x, y: topLeft.y }, width: width + (topLeft.x - np.x) };
      }
      if (grip.dataKey === "mid_right") {
        return { ...d, width: np.x - topLeft.x };
      }
      return d;
    }
    case "polyline": {
      const match = grip.dataKey.match(/^points\[(\d+)\]$/);
      if (match) {
        const idx = parseInt(match[1]);
        const newPoints = [...d.points];
        newPoints[idx] = np;
        return { ...d, points: newPoints };
      }
      // Midpoint drag — move both adjacent points
      const midMatch = grip.dataKey.match(/^mid\[(\d+)\]$/);
      if (midMatch) {
        const idx = parseInt(midMatch[1]);
        const a = d.points[idx], b = d.points[idx + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = np.x - mx, dy = np.y - my;
        const newPoints = [...d.points];
        newPoints[idx] = { x: a.x + dx, y: a.y + dy };
        newPoints[idx + 1] = { x: b.x + dx, y: b.y + dy };
        return { ...d, points: newPoints };
      }
      return d;
    }
    case "ellipse": {
      if (grip.dataKey === "center") return { ...d, center: np };
      if (grip.dataKey === "radiusX") return { ...d, radiusX: Math.max(1, Math.abs(np.x - d.center.x)) };
      if (grip.dataKey === "radiusY") return { ...d, radiusY: Math.max(1, Math.abs(np.y - d.center.y)) };
      return d;
    }
    case "text": {
      if (grip.dataKey === "position") return { ...d, position: np };
      return d;
    }
    case "dimension": {
      if (grip.dataKey === "start") return { ...d, start: np };
      if (grip.dataKey === "end") return { ...d, end: np };
      return d;
    }
    case "spline": {
      const sd = d as SplineData;
      const cpMatch = grip.dataKey.match(/^controlPoints\[(\d+)\]$/);
      if (cpMatch) {
        const idx = parseInt(cpMatch[1]);
        const newCps = [...sd.controlPoints];
        newCps[idx] = np;
        return { ...sd, controlPoints: newCps };
      }
      return d;
    }
    case "xline": {
      const xd = d as XLineData;
      if (grip.dataKey === "basePoint") return { ...xd, basePoint: np };
      if (grip.dataKey === "direction") {
        const dx = np.x - xd.basePoint.x, dy = np.y - xd.basePoint.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) return { ...xd, direction: { x: dx / len, y: dy / len } };
      }
      return d;
    }
    case "ray": {
      const rd = d as RayData;
      if (grip.dataKey === "basePoint") return { ...rd, basePoint: np };
      if (grip.dataKey === "direction") {
        const dx = np.x - rd.basePoint.x, dy = np.y - rd.basePoint.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) return { ...rd, direction: { x: dx / len, y: dy / len } };
      }
      return d;
    }
    default:
      return d;
  }
}
