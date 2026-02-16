// ============================================================
// DXF Import — Parse standard DXF files into CAD Studio entities
// Supports: LINE, CIRCLE, ARC, ELLIPSE, LWPOLYLINE, POLYLINE,
//           TEXT, MTEXT, DIMENSION, SPLINE, POINT, INSERT (basic)
// ============================================================

import type { CADEntity, EntityData, Point, Layer, LineStyle } from "./cad-types";

interface DXFGroup {
  code: number;
  value: string;
}

interface DXFSection {
  name: string;
  groups: DXFGroup[];
}

// AutoCAD Color Index (ACI) to hex — first 10 standard colors
const ACI_COLORS: Record<number, string> = {
  0: "#ffffff", // BYBLOCK
  1: "#ff0000",
  2: "#ffff00",
  3: "#00ff00",
  4: "#00ffff",
  5: "#0000ff",
  6: "#ff00ff",
  7: "#ffffff",
  8: "#808080",
  9: "#c0c0c0",
  10: "#ff0000",
  11: "#ff7f7f",
  30: "#ff7f00",
  40: "#ff7f00",
  50: "#ffff00",
  60: "#7fff00",
  70: "#00ff00",
  80: "#00ff7f",
  90: "#00ffff",
  100: "#007fff",
  110: "#0000ff",
  120: "#7f00ff",
  130: "#ff00ff",
  140: "#ff007f",
  150: "#ff3333",
  160: "#ff6633",
  170: "#ff9933",
  180: "#ffcc33",
  190: "#ffff33",
  200: "#ccff33",
  210: "#99ff33",
  220: "#66ff33",
  230: "#33ff33",
  240: "#33ff66",
  250: "#33ff99",
  251: "#a0a0a0",
  252: "#808080",
  253: "#606060",
  254: "#404040",
  255: "#000000",
  256: "#ffffff", // BYLAYER
};

function aciToHex(aci: number): string {
  return ACI_COLORS[aci] || `#${Math.min(255, aci * 3).toString(16).padStart(2, "0")}${Math.min(255, (aci * 7) % 256).toString(16).padStart(2, "0")}${Math.min(255, (aci * 11) % 256).toString(16).padStart(2, "0")}`;
}

function generateId(): string {
  return `dxf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// DXF Tokenizer — split file into group code/value pairs
// ============================================================
function tokenize(content: string): DXFGroup[] {
  const lines = content.split(/\r?\n/);
  const groups: DXFGroup[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1]?.trim() ?? "";
    if (!isNaN(code)) {
      groups.push({ code, value });
    }
  }
  return groups;
}

// ============================================================
// Section splitter
// ============================================================
function splitSections(groups: DXFGroup[]): DXFSection[] {
  const sections: DXFSection[] = [];
  let current: DXFSection | null = null;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].code === 0 && groups[i].value === "SECTION") {
      const nameGroup = groups[i + 1];
      if (nameGroup && nameGroup.code === 2) {
        current = { name: nameGroup.value, groups: [] };
        i++; // skip the name group
      }
    } else if (groups[i].code === 0 && groups[i].value === "ENDSEC") {
      if (current) {
        sections.push(current);
        current = null;
      }
    } else if (current) {
      current.groups.push(groups[i]);
    }
  }
  return sections;
}

// ============================================================
// Entity splitter — split ENTITIES section into individual entities
// ============================================================
interface RawEntity {
  type: string;
  groups: DXFGroup[];
}

function splitEntities(groups: DXFGroup[]): RawEntity[] {
  const entities: RawEntity[] = [];
  let current: RawEntity | null = null;
  for (const g of groups) {
    if (g.code === 0) {
      if (current) entities.push(current);
      current = { type: g.value, groups: [] };
    } else if (current) {
      current.groups.push(g);
    }
  }
  if (current) entities.push(current);
  return entities;
}

// ============================================================
// Helper: extract group values from entity
// ============================================================
function getVal(groups: DXFGroup[], code: number, fallback = ""): string {
  const g = groups.find(g => g.code === code);
  return g ? g.value : fallback;
}

function getNum(groups: DXFGroup[], code: number, fallback = 0): number {
  const v = parseFloat(getVal(groups, code, String(fallback)));
  return isNaN(v) ? fallback : v;
}

function getAllVals(groups: DXFGroup[], code: number): string[] {
  return groups.filter(g => g.code === code).map(g => g.value);
}

function getAllNums(groups: DXFGroup[], code: number): number[] {
  return getAllVals(groups, code).map(v => parseFloat(v)).filter(v => !isNaN(v));
}

// ============================================================
// Parse TABLES section for layers
// ============================================================
function parseLayers(section: DXFSection | undefined): Layer[] {
  if (!section) return [];
  const layers: Layer[] = [];
  const rawEntities = splitEntities(section.groups);
  for (const raw of rawEntities) {
    if (raw.type !== "LAYER") continue;
    const name = getVal(raw.groups, 2, "0");
    const colorIndex = getNum(raw.groups, 62, 7);
    const flags = getNum(raw.groups, 70, 0);
    const frozen = (flags & 1) !== 0;
    const locked = (flags & 4) !== 0;
    layers.push({
      id: `layer-${name.toLowerCase().replace(/\s+/g, "-")}-${generateId()}`,
      name,
      color: aciToHex(Math.abs(colorIndex)),
      visible: !frozen && colorIndex >= 0,
      locked,
      active: name === "0",
    });
  }
  return layers;
}

// ============================================================
// Parse individual entity types
// ============================================================
function parseLineEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const start: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  const end: Point = { x: getNum(raw.groups, 11), y: -getNum(raw.groups, 21) };
  return {
    id: generateId(), type: "line",
    data: { type: "line", start, end } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseCircleEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const center: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  const radius = getNum(raw.groups, 40);
  if (radius <= 0) return null;
  return {
    id: generateId(), type: "circle",
    data: { type: "circle", center, radius } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseArcEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const center: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  const radius = getNum(raw.groups, 40);
  // DXF angles are in degrees, counter-clockwise from +X
  // We negate Y so we need to flip angles
  const startAngleDeg = getNum(raw.groups, 50, 0);
  const endAngleDeg = getNum(raw.groups, 51, 360);
  // Convert to radians and flip for Y-inversion
  const startAngle = -(endAngleDeg * Math.PI / 180);
  const endAngle = -(startAngleDeg * Math.PI / 180);
  if (radius <= 0) return null;
  return {
    id: generateId(), type: "arc",
    data: { type: "arc", center, radius, startAngle, endAngle } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseEllipseEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const center: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  // Major axis endpoint relative to center
  const majorX = getNum(raw.groups, 11);
  const majorY = -getNum(raw.groups, 21);
  const ratio = getNum(raw.groups, 40, 1); // minor/major ratio
  const majorLen = Math.sqrt(majorX * majorX + majorY * majorY);
  const rotation = Math.atan2(majorY, majorX);
  return {
    id: generateId(), type: "ellipse",
    data: { type: "ellipse", center, radiusX: majorLen, radiusY: majorLen * ratio, rotation } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseLWPolylineEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const flags = getNum(raw.groups, 70, 0);
  const closed = (flags & 1) !== 0;
  const xs = getAllNums(raw.groups, 10);
  const ys = getAllNums(raw.groups, 20);
  const points: Point[] = [];
  const len = Math.min(xs.length, ys.length);
  for (let i = 0; i < len; i++) {
    points.push({ x: xs[i], y: -ys[i] });
  }
  if (points.length < 2) return null;
  return {
    id: generateId(), type: "polyline",
    data: { type: "polyline", points, closed } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parsePolylineEntity(raw: RawEntity, vertices: RawEntity[], layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const flags = getNum(raw.groups, 70, 0);
  const closed = (flags & 1) !== 0;
  const points: Point[] = [];
  for (const v of vertices) {
    if (v.type === "VERTEX") {
      points.push({ x: getNum(v.groups, 10), y: -getNum(v.groups, 20) });
    }
  }
  if (points.length < 2) return null;
  return {
    id: generateId(), type: "polyline",
    data: { type: "polyline", points, closed } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseTextEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const position: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  const content = getVal(raw.groups, 1, "");
  const fontSize = getNum(raw.groups, 40, 2.5);
  const rotation = getNum(raw.groups, 50, 0) * Math.PI / 180;
  if (!content) return null;
  return {
    id: generateId(), type: "text",
    data: { type: "text", position, content, fontSize, rotation } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseMTextEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const position: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  let content = getVal(raw.groups, 1, "");
  // Strip MTEXT formatting codes
  content = content.replace(/\\[A-Za-z][^;]*;/g, "").replace(/\{|\}/g, "").replace(/\\P/g, "\n").trim();
  const fontSize = getNum(raw.groups, 40, 2.5);
  const rotation = getNum(raw.groups, 50, 0) * Math.PI / 180;
  if (!content) return null;
  return {
    id: generateId(), type: "text",
    data: { type: "text", position, content, fontSize, rotation } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseDimensionEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const start: Point = { x: getNum(raw.groups, 13), y: -getNum(raw.groups, 23) };
  const end: Point = { x: getNum(raw.groups, 14), y: -getNum(raw.groups, 24) };
  const defPoint: Point = { x: getNum(raw.groups, 10), y: -getNum(raw.groups, 20) };
  // Calculate offset from the midpoint of start-end to the definition point
  const midY = (start.y + end.y) / 2;
  const offset = defPoint.y - midY;
  return {
    id: generateId(), type: "dimension",
    data: { type: "dimension", start, end, offset: Math.abs(offset) || 10 } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseSplineEntity(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  const flags = getNum(raw.groups, 70, 0);
  const closed = (flags & 1) !== 0;
  const degree = getNum(raw.groups, 71, 3);
  const xs = getAllNums(raw.groups, 10);
  const ys = getAllNums(raw.groups, 20);
  const controlPoints: Point[] = [];
  const len = Math.min(xs.length, ys.length);
  for (let i = 0; i < len; i++) {
    controlPoints.push({ x: xs[i], y: -ys[i] });
  }
  if (controlPoints.length < 2) return null;
  return {
    id: generateId(), type: "spline",
    data: { type: "spline", controlPoints, degree, closed } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

function parseRectangleFromSolid(raw: RawEntity, layerId: string, color: string, lineWidth: number, lineStyle: LineStyle): CADEntity | null {
  // SOLID entities have 4 corner points
  const x1 = getNum(raw.groups, 10), y1 = -getNum(raw.groups, 20);
  const x2 = getNum(raw.groups, 11), y2 = -getNum(raw.groups, 21);
  const x3 = getNum(raw.groups, 12), y3 = -getNum(raw.groups, 22);
  const x4 = getNum(raw.groups, 13), y4 = -getNum(raw.groups, 23);
  const points: Point[] = [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, { x: x4, y: y4 }];
  return {
    id: generateId(), type: "polyline",
    data: { type: "polyline", points, closed: true } as EntityData,
    layerId, color, lineWidth, lineStyle, visible: true, locked: false, selected: false,
  };
}

// ============================================================
// DXF Line type mapping
// ============================================================
function mapLineType(ltypeName: string): LineStyle {
  const n = ltypeName.toUpperCase();
  if (n.includes("DASH") && n.includes("DOT")) return "dashdot";
  if (n.includes("DASH") || n.includes("HIDDEN")) return "dashed";
  if (n.includes("DOT")) return "dotted";
  if (n.includes("CENTER")) return "dashdot";
  if (n.includes("PHANTOM")) return "dashdot";
  return "solid";
}

// ============================================================
// Main parser
// ============================================================
export interface DXFImportResult {
  entities: CADEntity[];
  layers: Layer[];
  stats: {
    totalParsed: number;
    skipped: number;
    byType: Record<string, number>;
  };
}

export function parseDXF(content: string): DXFImportResult {
  const groups = tokenize(content);
  const sections = splitSections(groups);

  // Parse layers from TABLES section
  const tablesSection = sections.find(s => s.name === "TABLES");
  const dxfLayers = parseLayers(tablesSection);

  // Build layer lookup
  const layerMap = new Map<string, Layer>();
  for (const l of dxfLayers) {
    layerMap.set(l.name.toLowerCase(), l);
  }

  // Ensure default layer exists
  if (!layerMap.has("0")) {
    const defaultLayer: Layer = { id: "layer-0", name: "0", color: "#ffffff", visible: true, locked: false, active: true };
    dxfLayers.unshift(defaultLayer);
    layerMap.set("0", defaultLayer);
  }

  // Make first layer active
  let hasActive = false;
  for (const l of dxfLayers) {
    if (l.active) { hasActive = true; break; }
  }
  if (!hasActive && dxfLayers.length > 0) {
    dxfLayers[0].active = true;
  }

  // Parse entities
  const entitiesSection = sections.find(s => s.name === "ENTITIES");
  if (!entitiesSection) {
    return { entities: [], layers: dxfLayers, stats: { totalParsed: 0, skipped: 0, byType: {} } };
  }

  const rawEntities = splitEntities(entitiesSection.groups);
  const entities: CADEntity[] = [];
  const stats = { totalParsed: 0, skipped: 0, byType: {} as Record<string, number> };

  for (let i = 0; i < rawEntities.length; i++) {
    const raw = rawEntities[i];
    stats.totalParsed++;

    // Get entity properties
    const layerName = getVal(raw.groups, 8, "0");
    const layer = layerMap.get(layerName.toLowerCase()) || layerMap.get("0")!;
    const layerId = layer.id;
    const colorIndex = getNum(raw.groups, 62, -1);
    const color = colorIndex >= 0 ? aciToHex(colorIndex) : layer.color;
    const ltypeName = getVal(raw.groups, 6, "CONTINUOUS");
    const lineStyle = mapLineType(ltypeName);
    const lineWidth = Math.max(0.5, getNum(raw.groups, 370, 0) / 100) || 1;

    let entity: CADEntity | null = null;

    switch (raw.type) {
      case "LINE":
        entity = parseLineEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "CIRCLE":
        entity = parseCircleEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "ARC":
        entity = parseArcEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "ELLIPSE":
        entity = parseEllipseEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "LWPOLYLINE":
        entity = parseLWPolylineEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "POLYLINE": {
        // Collect VERTEX entities until SEQEND
        const vertices: RawEntity[] = [];
        let j = i + 1;
        while (j < rawEntities.length && rawEntities[j].type !== "SEQEND") {
          vertices.push(rawEntities[j]);
          j++;
        }
        entity = parsePolylineEntity(raw, vertices, layerId, color, lineWidth, lineStyle);
        i = j; // skip past SEQEND
        break;
      }
      case "TEXT":
        entity = parseTextEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "MTEXT":
        entity = parseMTextEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "DIMENSION":
        entity = parseDimensionEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "SPLINE":
        entity = parseSplineEntity(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "SOLID":
      case "3DFACE":
        entity = parseRectangleFromSolid(raw, layerId, color, lineWidth, lineStyle);
        break;
      case "POINT":
        // Skip point entities (they're just markers)
        break;
      case "INSERT":
        // Block inserts — skip for now (would need BLOCKS section parsing)
        break;
      case "HATCH":
        // Hatch entities are complex — skip for now
        break;
      default:
        break;
    }

    if (entity) {
      entities.push(entity);
      stats.byType[raw.type] = (stats.byType[raw.type] || 0) + 1;
    } else {
      stats.skipped++;
    }
  }

  return { entities, layers: dxfLayers, stats };
}
