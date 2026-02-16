// ============================================================
// CAD Utils — Geometry, snapping, and export utilities
// ============================================================

import type { Point, CADEntity, SnapSettings, GridSettings, SnapResult, SplineData, XLineData, RayData } from "./cad-types";
import { hitTestSpline, evaluateCatmullRom, getSplineEndpoints } from "./spline-utils";
import { hitTestXLine, hitTestRay } from "./xline-utils";

let _idCounter = 0;
export function generateId(): string {
  return `ent-${Date.now()}-${++_idCounter}`;
}

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function angleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function angleRad(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function snapToAngle(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) > Math.abs(dy)) return { x: end.x, y: start.y };
  return { x: start.x, y: end.y };
}

export function snapToGridPoint(point: Point, grid: GridSettings): Point {
  if (!grid.snapToGrid) return point;
  const s = grid.spacing;
  return { x: Math.round(point.x / s) * s, y: Math.round(point.y / s) * s };
}

export function formatCoordinate(v: number): string { return v.toFixed(4); }
export function formatDistance(v: number): string { return v.toFixed(4); }
export function formatAngle(v: number): string { return `${v.toFixed(2)}°`; }

export function hitTestEntity(entity: CADEntity, point: Point, tolerance: number): boolean {
  const d = entity.data;
  switch (d.type) {
    case "line": return distToSeg(point, d.start, d.end) < tolerance;
    case "circle": return Math.abs(distance(point, d.center) - d.radius) < tolerance;
    case "arc": {
      const dist = distance(point, d.center);
      if (Math.abs(dist - d.radius) > tolerance) return false;
      let angle = Math.atan2(point.y - d.center.y, point.x - d.center.x);
      if (angle < 0) angle += Math.PI * 2;
      let start = d.startAngle, end = d.endAngle;
      if (start < 0) start += Math.PI * 2;
      if (end < 0) end += Math.PI * 2;
      if (start <= end) return angle >= start && angle <= end;
      return angle >= start || angle <= end;
    }
    case "rectangle": {
      const tl = d.topLeft;
      const tr = { x: tl.x + d.width, y: tl.y };
      const br = { x: tl.x + d.width, y: tl.y + d.height };
      const bl = { x: tl.x, y: tl.y + d.height };
      return [
        [tl, tr], [tr, br], [br, bl], [bl, tl]
      ].some(([a, b]) => distToSeg(point, a, b) < tolerance);
    }
    case "polyline": {
      for (let i = 1; i < d.points.length; i++) {
        if (distToSeg(point, d.points[i - 1], d.points[i]) < tolerance) return true;
      }
      if (d.closed && d.points.length > 2 && distToSeg(point, d.points[d.points.length - 1], d.points[0]) < tolerance) return true;
      return false;
    }
    case "ellipse": {
      const dx = (point.x - d.center.x) / d.radiusX;
      const dy = (point.y - d.center.y) / d.radiusY;
      return Math.abs(Math.sqrt(dx * dx + dy * dy) - 1) < tolerance / Math.min(d.radiusX, d.radiusY);
    }
    case "text": {
      const w = d.content.length * d.fontSize * 0.6;
      const h = d.fontSize * 1.2;
      return point.x >= d.position.x && point.x <= d.position.x + w && point.y >= d.position.y - h && point.y <= d.position.y;
    }
    case "dimension": return distToSeg(point, d.start, d.end) < tolerance * 2;
    case "spline": return hitTestSpline(d as SplineData, point, tolerance);
    case "xline": return hitTestXLine(d as XLineData, point, tolerance);
    case "ray": return hitTestRay(d as RayData, point, tolerance);
    default: return false;
  }
}

function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function findSnapPoint(point: Point, entities: CADEntity[], snap: SnapSettings, grid: GridSettings, tolerance: number = 10): SnapResult | null {
  if (!snap.enabled) return null;
  let best: SnapResult | null = null;
  let bestDist = tolerance;
  for (const entity of entities) {
    if (!entity.visible) continue;
    const snaps = getSnapPoints(entity, snap);
    for (const s of snaps) {
      const d = distance(point, s.point);
      if (d < bestDist) { bestDist = d; best = s; }
    }
  }
  if (snap.gridSnap && grid.snapToGrid) {
    const gp = snapToGridPoint(point, grid);
    const d = distance(point, gp);
    if (d < bestDist) best = { point: gp, type: "grid" };
  }
  return best;
}

function getSnapPoints(entity: CADEntity, snap: SnapSettings): SnapResult[] {
  const results: SnapResult[] = [];
  const d = entity.data;
  const id = entity.id;
  switch (d.type) {
    case "line":
      if (snap.endpointSnap) { results.push({ point: d.start, type: "endpoint", entityId: id }); results.push({ point: d.end, type: "endpoint", entityId: id }); }
      if (snap.midpointSnap) results.push({ point: midpoint(d.start, d.end), type: "midpoint", entityId: id });
      break;
    case "circle":
      if (snap.centerSnap) results.push({ point: d.center, type: "center", entityId: id });
      if (snap.endpointSnap) {
        [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(a =>
          results.push({ point: { x: d.center.x + d.radius * Math.cos(a), y: d.center.y + d.radius * Math.sin(a) }, type: "quadrant", entityId: id })
        );
      }
      break;
    case "arc":
      if (snap.centerSnap) results.push({ point: d.center, type: "center", entityId: id });
      if (snap.endpointSnap) {
        results.push({ point: { x: d.center.x + d.radius * Math.cos(d.startAngle), y: d.center.y + d.radius * Math.sin(d.startAngle) }, type: "endpoint", entityId: id });
        results.push({ point: { x: d.center.x + d.radius * Math.cos(d.endAngle), y: d.center.y + d.radius * Math.sin(d.endAngle) }, type: "endpoint", entityId: id });
      }
      break;
    case "rectangle": {
      const tl = d.topLeft, tr = { x: tl.x + d.width, y: tl.y }, br = { x: tl.x + d.width, y: tl.y + d.height }, bl = { x: tl.x, y: tl.y + d.height };
      if (snap.endpointSnap) [tl, tr, br, bl].forEach(p => results.push({ point: p, type: "endpoint", entityId: id }));
      if (snap.midpointSnap) [[tl, tr], [tr, br], [br, bl], [bl, tl]].forEach(([a, b]) => results.push({ point: midpoint(a, b), type: "midpoint", entityId: id }));
      if (snap.centerSnap) results.push({ point: { x: tl.x + d.width / 2, y: tl.y + d.height / 2 }, type: "center", entityId: id });
      break;
    }
    case "polyline":
      if (snap.endpointSnap) d.points.forEach(p => results.push({ point: p, type: "endpoint", entityId: id }));
      if (snap.midpointSnap) for (let i = 1; i < d.points.length; i++) results.push({ point: midpoint(d.points[i - 1], d.points[i]), type: "midpoint", entityId: id });
      break;
    case "ellipse":
      if (snap.centerSnap) results.push({ point: d.center, type: "center", entityId: id });
      break;
    case "text":
      if (snap.endpointSnap) results.push({ point: d.position, type: "endpoint", entityId: id });
      break;
    case "dimension":
      if (snap.endpointSnap) { results.push({ point: d.start, type: "endpoint", entityId: id }); results.push({ point: d.end, type: "endpoint", entityId: id }); }
      break;
    case "spline": {
      const sd = d as SplineData;
      const endpoints = getSplineEndpoints(sd);
      if (snap.endpointSnap) endpoints.forEach(p => results.push({ point: p, type: "endpoint", entityId: id }));
      if (snap.endpointSnap) sd.controlPoints.forEach(p => results.push({ point: p, type: "endpoint", entityId: id }));
      break;
    }
    case "xline": {
      const xd = d as XLineData;
      if (snap.endpointSnap) results.push({ point: xd.basePoint, type: "endpoint", entityId: id });
      break;
    }
    case "ray": {
      const rd = d as RayData;
      if (snap.endpointSnap) results.push({ point: rd.basePoint, type: "endpoint", entityId: id });
      break;
    }
  }
  return results;
}

export function entitiesInBox(entities: CADEntity[], p1: Point, p2: Point): string[] {
  const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
  const crossing = p2.x < p1.x;
  return entities.filter(e => {
    if (!e.visible || e.locked) return false;
    const bb = getBBox(e);
    if (!bb) return false;
    if (crossing) return !(bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY);
    return bb.minX >= minX && bb.maxX <= maxX && bb.minY >= minY && bb.maxY <= maxY;
  }).map(e => e.id);
}

function getBBox(entity: CADEntity) {
  const d = entity.data;
  switch (d.type) {
    case "line": return { minX: Math.min(d.start.x, d.end.x), minY: Math.min(d.start.y, d.end.y), maxX: Math.max(d.start.x, d.end.x), maxY: Math.max(d.start.y, d.end.y) };
    case "circle": return { minX: d.center.x - d.radius, minY: d.center.y - d.radius, maxX: d.center.x + d.radius, maxY: d.center.y + d.radius };
    case "rectangle": return { minX: d.topLeft.x, minY: d.topLeft.y, maxX: d.topLeft.x + d.width, maxY: d.topLeft.y + d.height };
    case "ellipse": return { minX: d.center.x - d.radiusX, minY: d.center.y - d.radiusY, maxX: d.center.x + d.radiusX, maxY: d.center.y + d.radiusY };
    case "polyline": {
      if (!d.points.length) return null;
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      d.points.forEach(p => { mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y); mxX = Math.max(mxX, p.x); mxY = Math.max(mxY, p.y); });
      return { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY };
    }
    case "text": return { minX: d.position.x, minY: d.position.y - d.fontSize, maxX: d.position.x + d.content.length * d.fontSize * 0.6, maxY: d.position.y };
    case "arc": return { minX: d.center.x - d.radius, minY: d.center.y - d.radius, maxX: d.center.x + d.radius, maxY: d.center.y + d.radius };
    case "dimension": return { minX: Math.min(d.start.x, d.end.x), minY: Math.min(d.start.y, d.end.y) - Math.abs(d.offset) - 20, maxX: Math.max(d.start.x, d.end.x), maxY: Math.max(d.start.y, d.end.y) };
    case "spline": {
      const sd = d as SplineData;
      if (!sd.controlPoints.length) return null;
      const pts = evaluateCatmullRom(sd.controlPoints, sd.closed, 60);
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      pts.forEach(p => { mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y); mxX = Math.max(mxX, p.x); mxY = Math.max(mxY, p.y); });
      return { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY };
    }
    default: return null;
  }
}

export function getLineDash(style: string): number[] {
  switch (style) { case "dashed": return [10, 5]; case "dotted": return [2, 4]; case "dashdot": return [10, 4, 2, 4]; default: return []; }
}

export function exportToDXF(entities: CADEntity[]): string {
  let dxf = "0\nSECTION\n2\nENTITIES\n";
  for (const entity of entities) {
    const d = entity.data;
    switch (d.type) {
      case "line": dxf += `0\nLINE\n8\n${entity.layerId}\n10\n${d.start.x}\n20\n${d.start.y}\n30\n0\n11\n${d.end.x}\n21\n${d.end.y}\n31\n0\n`; break;
      case "circle": dxf += `0\nCIRCLE\n8\n${entity.layerId}\n10\n${d.center.x}\n20\n${d.center.y}\n30\n0\n40\n${d.radius}\n`; break;
      case "arc": dxf += `0\nARC\n8\n${entity.layerId}\n10\n${d.center.x}\n20\n${d.center.y}\n30\n0\n40\n${d.radius}\n50\n${(d.startAngle * 180) / Math.PI}\n51\n${(d.endAngle * 180) / Math.PI}\n`; break;
      case "rectangle": {
        const tl = d.topLeft;
        const pts = [tl, { x: tl.x + d.width, y: tl.y }, { x: tl.x + d.width, y: tl.y + d.height }, { x: tl.x, y: tl.y + d.height }];
        for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; dxf += `0\nLINE\n8\n${entity.layerId}\n10\n${a.x}\n20\n${a.y}\n30\n0\n11\n${b.x}\n21\n${b.y}\n31\n0\n`; }
        break;
      }
      case "polyline":
        for (let i = 1; i < d.points.length; i++) dxf += `0\nLINE\n8\n${entity.layerId}\n10\n${d.points[i - 1].x}\n20\n${d.points[i - 1].y}\n30\n0\n11\n${d.points[i].x}\n21\n${d.points[i].y}\n31\n0\n`;
        if (d.closed && d.points.length > 2) { const l = d.points[d.points.length - 1], f = d.points[0]; dxf += `0\nLINE\n8\n${entity.layerId}\n10\n${l.x}\n20\n${l.y}\n30\n0\n11\n${f.x}\n21\n${f.y}\n31\n0\n`; }
        break;
      case "text": dxf += `0\nTEXT\n8\n${entity.layerId}\n10\n${d.position.x}\n20\n${d.position.y}\n30\n0\n40\n${d.fontSize}\n1\n${d.content}\n`; break;
    }
  }
  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
}

export function exportToSVG(entities: CADEntity[]): string {
  let bb = { minX: -100, minY: -100, maxX: 500, maxY: 500 };
  entities.forEach(e => { const ebb = getBBox(e); if (ebb) { bb.minX = Math.min(bb.minX, ebb.minX - 20); bb.minY = Math.min(bb.minY, ebb.minY - 20); bb.maxX = Math.max(bb.maxX, ebb.maxX + 20); bb.maxY = Math.max(bb.maxY, ebb.maxY + 20); } });
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.minX} ${bb.minY} ${w} ${h}" width="${w}" height="${h}">\n<rect x="${bb.minX}" y="${bb.minY}" width="${w}" height="${h}" fill="#0d0d0d"/>\n`;
  for (const entity of entities) {
    if (!entity.visible) continue;
    const d = entity.data, c = entity.color, sw = entity.lineWidth;
    const dash = entity.lineStyle === "dashed" ? 'stroke-dasharray="10,5"' : entity.lineStyle === "dotted" ? 'stroke-dasharray="2,4"' : entity.lineStyle === "dashdot" ? 'stroke-dasharray="10,4,2,4"' : "";
    switch (d.type) {
      case "line": svg += `<line x1="${d.start.x}" y1="${d.start.y}" x2="${d.end.x}" y2="${d.end.y}" stroke="${c}" stroke-width="${sw}" ${dash}/>\n`; break;
      case "circle": svg += `<circle cx="${d.center.x}" cy="${d.center.y}" r="${d.radius}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n`; break;
      case "rectangle": svg += `<rect x="${d.topLeft.x}" y="${d.topLeft.y}" width="${d.width}" height="${d.height}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n`; break;
      case "ellipse": svg += `<ellipse cx="${d.center.x}" cy="${d.center.y}" rx="${d.radiusX}" ry="${d.radiusY}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n`; break;
      case "polyline": { const pts = d.points.map(p => `${p.x},${p.y}`).join(" "); svg += d.closed ? `<polygon points="${pts}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n` : `<polyline points="${pts}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n`; break; }
      case "text": svg += `<text x="${d.position.x}" y="${d.position.y}" fill="${c}" font-size="${d.fontSize}" font-family="monospace">${d.content}</text>\n`; break;
      case "arc": { const sx = d.center.x + d.radius * Math.cos(d.startAngle), sy = d.center.y + d.radius * Math.sin(d.startAngle), ex = d.center.x + d.radius * Math.cos(d.endAngle), ey = d.center.y + d.radius * Math.sin(d.endAngle); let sweep = d.endAngle - d.startAngle; if (sweep < 0) sweep += Math.PI * 2; svg += `<path d="M ${sx} ${sy} A ${d.radius} ${d.radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${ex} ${ey}" stroke="${c}" stroke-width="${sw}" fill="none" ${dash}/>\n`; break; }
      case "dimension": { const dist = distance(d.start, d.end); const mx = (d.start.x + d.end.x) / 2, my = (d.start.y + d.end.y) / 2 - d.offset; svg += `<line x1="${d.start.x}" y1="${d.start.y - d.offset}" x2="${d.end.x}" y2="${d.end.y - d.offset}" stroke="${c}" stroke-width="0.5"/>\n<text x="${mx}" y="${my - 3}" fill="${c}" font-size="12" text-anchor="middle" font-family="monospace">${dist.toFixed(2)}</text>\n`; break; }
    }
  }
  svg += "</svg>";
  return svg;
}
