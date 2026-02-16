import { createContext, useContext, useReducer, useCallback, type ReactNode, type Dispatch } from "react";
import type { CADState, CADEntity, Layer, ToolType, LineStyle, ViewState, GridSettings, SnapSettings, CommandEntry } from "@/lib/cad-types";
import { DEFAULT_LAYERS } from "@/lib/cad-types";

type Action =
  | { type: "ADD_ENTITY"; entity: CADEntity }
  | { type: "ADD_ENTITIES"; entities: CADEntity[] }
  | { type: "UPDATE_ENTITY"; id: string; updates: Partial<CADEntity> }
  | { type: "REMOVE_ENTITIES"; ids: string[] }
  | { type: "SELECT_ENTITIES"; ids: string[] }
  | { type: "TOGGLE_SELECT"; id: string }
  | { type: "DESELECT_ALL" }
  | { type: "SET_TOOL"; tool: ToolType }
  | { type: "SET_COLOR"; color: string }
  | { type: "SET_LINE_WIDTH"; width: number }
  | { type: "SET_LINE_STYLE"; style: LineStyle }
  | { type: "SET_VIEW_STATE"; viewState: Partial<ViewState> }
  | { type: "SET_GRID_SETTINGS"; settings: Partial<GridSettings> }
  | { type: "SET_SNAP_SETTINGS"; settings: Partial<SnapSettings> }
  | { type: "TOGGLE_ORTHO" }
  | { type: "SET_ACTIVE_LAYER"; layerId: string }
  | { type: "ADD_LAYER"; layer: Layer }
  | { type: "UPDATE_LAYER"; id: string; updates: Partial<Layer> }
  | { type: "REMOVE_LAYER"; id: string }
  | { type: "SET_DRAWING_STATE"; state: Partial<CADState["drawingState"]> }
  | { type: "ADD_COMMAND"; entry: CommandEntry }
  | { type: "TOGGLE_LAYERS" }
  | { type: "TOGGLE_PROPERTIES" }
  | { type: "TOGGLE_COMMAND_LINE" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR_ALL" }
  | { type: "LOAD_ENTITIES"; entities: CADEntity[] }
  | { type: "PUSH_UNDO" };

const initialState: CADState = {
  entities: [],
  layers: DEFAULT_LAYERS,
  activeLayerId: "layer-0",
  activeTool: "select",
  activeColor: "#ef4444",
  activeLineWidth: 1,
  activeLineStyle: "solid",
  viewState: { panX: 0, panY: 0, zoom: 1 },
  gridSettings: { visible: true, spacing: 20, majorEvery: 5, snapToGrid: true },
  snapSettings: { enabled: true, gridSnap: true, endpointSnap: true, midpointSnap: true, centerSnap: true, intersectionSnap: true, perpendicularSnap: false, tangentSnap: false, nearestSnap: true },
  orthoMode: false,
  selectedEntityIds: [],
  drawingState: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null },
  commandHistory: [{ command: "", timestamp: Date.now(), result: "CAD Studio ready. Type HELP for commands." }],
  showLayers: true,
  showProperties: true,
  showCommandLine: true,
  undoStack: [],
  redoStack: [],
};

function reducer(state: CADState, action: Action): CADState {
  switch (action.type) {
    case "ADD_ENTITY": return { ...state, entities: [...state.entities, action.entity], redoStack: [] };
    case "ADD_ENTITIES": return { ...state, entities: [...state.entities, ...action.entities], redoStack: [] };
    case "UPDATE_ENTITY": return { ...state, entities: state.entities.map(e => e.id === action.id ? { ...e, ...action.updates } : e) };
    case "REMOVE_ENTITIES": return { ...state, entities: state.entities.filter(e => !action.ids.includes(e.id)), selectedEntityIds: state.selectedEntityIds.filter(id => !action.ids.includes(id)), redoStack: [] };
    case "SELECT_ENTITIES": return { ...state, selectedEntityIds: action.ids };
    case "TOGGLE_SELECT": { const has = state.selectedEntityIds.includes(action.id); return { ...state, selectedEntityIds: has ? state.selectedEntityIds.filter(id => id !== action.id) : [...state.selectedEntityIds, action.id] }; }
    case "DESELECT_ALL": return { ...state, selectedEntityIds: [], drawingState: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } };
    case "SET_TOOL": return { ...state, activeTool: action.tool, drawingState: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } };
    case "SET_COLOR": return { ...state, activeColor: action.color };
    case "SET_LINE_WIDTH": return { ...state, activeLineWidth: action.width };
    case "SET_LINE_STYLE": return { ...state, activeLineStyle: action.style };
    case "SET_VIEW_STATE": return { ...state, viewState: { ...state.viewState, ...action.viewState } };
    case "SET_GRID_SETTINGS": return { ...state, gridSettings: { ...state.gridSettings, ...action.settings } };
    case "SET_SNAP_SETTINGS": return { ...state, snapSettings: { ...state.snapSettings, ...action.settings } };
    case "TOGGLE_ORTHO": return { ...state, orthoMode: !state.orthoMode };
    case "SET_ACTIVE_LAYER": return { ...state, activeLayerId: action.layerId, layers: state.layers.map(l => ({ ...l, active: l.id === action.layerId })) };
    case "ADD_LAYER": return { ...state, layers: [...state.layers, action.layer] };
    case "UPDATE_LAYER": return { ...state, layers: state.layers.map(l => l.id === action.id ? { ...l, ...action.updates } : l) };
    case "REMOVE_LAYER": { if (state.layers.length <= 1) return state; const nl = state.layers.filter(l => l.id !== action.id); const na = state.activeLayerId === action.id ? nl[0].id : state.activeLayerId; return { ...state, layers: nl.map(l => ({ ...l, active: l.id === na })), activeLayerId: na }; }
    case "SET_DRAWING_STATE": return { ...state, drawingState: { ...state.drawingState, ...action.state } };
    case "ADD_COMMAND": return { ...state, commandHistory: [...state.commandHistory, action.entry] };
    case "TOGGLE_LAYERS": return { ...state, showLayers: !state.showLayers };
    case "TOGGLE_PROPERTIES": return { ...state, showProperties: !state.showProperties };
    case "TOGGLE_COMMAND_LINE": return { ...state, showCommandLine: !state.showCommandLine };
    case "PUSH_UNDO": return { ...state, undoStack: [...state.undoStack.slice(-49), [...state.entities]], redoStack: [] };
    case "UNDO": { if (!state.undoStack.length) return state; const prev = state.undoStack[state.undoStack.length - 1]; return { ...state, entities: prev, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, [...state.entities]], selectedEntityIds: [] }; }
    case "REDO": { if (!state.redoStack.length) return state; const next = state.redoStack[state.redoStack.length - 1]; return { ...state, entities: next, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, [...state.entities]], selectedEntityIds: [] }; }
    case "CLEAR_ALL": return { ...state, entities: [], selectedEntityIds: [], undoStack: [...state.undoStack, [...state.entities]], redoStack: [] };
    case "LOAD_ENTITIES": return { ...state, entities: action.entities, selectedEntityIds: [], undoStack: [], redoStack: [] };
    default: return state;
  }
}

const CADContext = createContext<{ state: CADState; dispatch: Dispatch<Action> } | null>(null);

export function CADProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <CADContext.Provider value={{ state, dispatch }}>{children}</CADContext.Provider>;
}

export function useCAD() {
  const ctx = useContext(CADContext);
  if (!ctx) throw new Error("useCAD must be used within CADProvider");
  return ctx;
}

export function useCADActions() {
  const { state, dispatch } = useCAD();
  const setTool = useCallback((tool: ToolType) => dispatch({ type: "SET_TOOL", tool }), [dispatch]);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);
  const deselectAll = useCallback(() => dispatch({ type: "DESELECT_ALL" }), [dispatch]);
  const pushUndo = useCallback(() => dispatch({ type: "PUSH_UNDO" }), [dispatch]);
  return { state, dispatch, setTool, undo, redo, deselectAll, pushUndo };
}
