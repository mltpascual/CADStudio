// ============================================================
// CAD Types — Core type definitions for the CAD engine
// ============================================================

export interface Point { x: number; y: number; }

export type ToolType =
  | "select" | "line" | "circle" | "arc" | "rectangle"
  | "polyline" | "ellipse" | "text" | "dimension"
  | "move" | "rotate" | "scale" | "mirror"
  | "trim" | "extend" | "offset" | "fillet"
  | "copy" | "erase" | "pan" | "zoom"
  | "measure_distance" | "measure_area" | "measure_angle"
  | "hatch" | "block_group" | "block_insert"
  | "array_rect" | "array_polar"
  | "spline" | "xline" | "ray";

export type HatchPattern = "solid" | "crosshatch" | "diagonal" | "dots" | "horizontal" | "vertical" | "brick";

export type LineStyle = "solid" | "dashed" | "dotted" | "dashdot";

export interface LineData { type: "line"; start: Point; end: Point; }
export interface CircleData { type: "circle"; center: Point; radius: number; }
export interface ArcData { type: "arc"; center: Point; radius: number; startAngle: number; endAngle: number; }
export interface RectangleData { type: "rectangle"; topLeft: Point; width: number; height: number; }
export interface PolylineData { type: "polyline"; points: Point[]; closed: boolean; }
export interface EllipseData { type: "ellipse"; center: Point; radiusX: number; radiusY: number; rotation: number; }
export interface TextData { type: "text"; position: Point; content: string; fontSize: number; rotation: number; }
export interface DimensionData { type: "dimension"; start: Point; end: Point; offset: number; }
export interface HatchData { type: "hatch"; boundary: Point[]; pattern: HatchPattern; patternScale: number; patternAngle: number; fillColor: string; fillOpacity: number; }
export interface SplineData { type: "spline"; controlPoints: Point[]; degree: number; closed: boolean; }
export interface XLineData { type: "xline"; basePoint: Point; direction: Point; }
export interface RayData { type: "ray"; basePoint: Point; direction: Point; }
export interface BlockRefData { type: "blockref"; blockId: string; insertPoint: Point; scaleX: number; scaleY: number; rotation: number; }

export type EntityData =
  | LineData | CircleData | ArcData | RectangleData
  | PolylineData | EllipseData | TextData | DimensionData
  | HatchData | SplineData | XLineData | RayData | BlockRefData;

export interface CADEntity {
  id: string;
  type: EntityData["type"];
  data: EntityData;
  layerId: string;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  active: boolean;
}

export interface ViewState { panX: number; panY: number; zoom: number; }

export interface GridSettings {
  visible: boolean;
  spacing: number;
  majorEvery: number;
  snapToGrid: boolean;
}

export interface SnapSettings {
  enabled: boolean;
  gridSnap: boolean;
  endpointSnap: boolean;
  midpointSnap: boolean;
  centerSnap: boolean;
  intersectionSnap: boolean;
  perpendicularSnap: boolean;
  tangentSnap: boolean;
  nearestSnap: boolean;
}

export interface SnapResult { point: Point; type: string; entityId?: string; }

export interface PolarTrackingSettings {
  enabled: boolean;
  increment: number; // degrees: 15, 30, 45, 90
  additionalAngles: number[]; // custom angles
  trackFromLastPoint: boolean;
}

export interface CommandEntry { command: string; timestamp: number; result?: string; }

export interface DrawingState {
  isDrawing: boolean;
  startPoint: Point | null;
  currentPoints: Point[];
  previewPoint: Point | null;
}

export interface BlockDefinition {
  id: string;
  name: string;
  entities: CADEntity[];
  basePoint: Point;
}

export interface CADState {
  entities: CADEntity[];
  layers: Layer[];
  activeLayerId: string;
  activeTool: ToolType;
  activeColor: string;
  activeLineWidth: number;
  activeLineStyle: LineStyle;
  viewState: ViewState;
  gridSettings: GridSettings;
  snapSettings: SnapSettings;
  orthoMode: boolean;
  selectedEntityIds: string[];
  drawingState: DrawingState;
  commandHistory: CommandEntry[];
  showLayers: boolean;
  showProperties: boolean;
  showCommandLine: boolean;
  undoStack: CADEntity[][];
  redoStack: CADEntity[][];
  blocks: BlockDefinition[];
  activeHatchPattern: HatchPattern;
  activeHatchScale: number;
  activeHatchAngle: number;
  polarTracking: PolarTrackingSettings;
  dynamicInputEnabled: boolean;
}

export const ENTITY_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#a3a3a3",
  "#ffffff", "#64748b",
];

export const LINE_WIDTHS = [0.5, 1, 1.5, 2, 3, 4, 5];

export const DEFAULT_LAYERS: Layer[] = [
  { id: "layer-0", name: "0", color: "#ffffff", visible: true, locked: false, active: true },
  { id: "layer-construction", name: "Construction", color: "#a3a3a3", visible: true, locked: false, active: false },
  { id: "layer-dimensions", name: "Dimensions", color: "#f59e0b", visible: true, locked: false, active: false },
  { id: "layer-annotations", name: "Annotations", color: "#22c55e", visible: true, locked: false, active: false },
];
