import { useRef, useEffect, useCallback, useState } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import type { Point, CADEntity, EntityData } from "@/lib/cad-types";
import { generateId, distance, hitTestEntity, findSnapPoint, entitiesInBox, getLineDash, snapToAngle, snapToGridPoint } from "@/lib/cad-utils";
import { trimEntity } from "@/lib/trim-utils";
import { extendEntity } from "@/lib/extend-utils";
import { copyEntities } from "@/lib/copy-utils";
import { offsetEntity } from "@/lib/offset-utils";
import { rotateEntityData, scaleEntityData } from "@/lib/rotate-scale-utils";
import { filletEntities, type FilletMode } from "@/lib/fillet-utils";

export default function CADCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state } = useCAD();
  const { dispatch, pushUndo } = useCADActions();
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });
  const [snapPoint, setSnapPoint] = useState<{ point: Point; type: string } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const selBoxStart = useRef<Point | null>(null);
  const selBoxEnd = useRef<Point | null>(null);
  const offsetEntityRef = useRef<CADEntity | null>(null);
  const offsetDistRef = useRef<number | null>(null);
  const filletFirstRef = useRef<CADEntity | null>(null);

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const cx = canvas.width / 2, cy = canvas.height / 2;
    return { x: (sx - cx - state.viewState.panX) / state.viewState.zoom, y: (sy - cy - state.viewState.panY) / state.viewState.zoom };
  }, [state.viewState]);

  const worldToScreen = useCallback((wx: number, wy: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const cx = canvas.width / 2, cy = canvas.height / 2;
    return { x: wx * state.viewState.zoom + cx + state.viewState.panX, y: wy * state.viewState.zoom + cy + state.viewState.panY };
  }, [state.viewState]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    // Background — read from CSS variable for theme support
    const computedStyle = getComputedStyle(canvas);
    const cadCanvas = computedStyle.getPropertyValue('--cad-canvas').trim() || '#0d0d0d';
    const cadGrid = computedStyle.getPropertyValue('--cad-grid').trim() || '#1a1a2e';
    const cadGridMajor = computedStyle.getPropertyValue('--cad-grid-major').trim() || '#252540';
    const cadCrosshair = computedStyle.getPropertyValue('--cad-crosshair').trim() || '#3b82f6';
    const cadSnap = computedStyle.getPropertyValue('--cad-snap').trim() || '#10b981';
    const cadDimension = computedStyle.getPropertyValue('--cad-dimension').trim() || '#f59e0b';
    const cadEntityDefault = computedStyle.getPropertyValue('--cad-entity-default').trim() || '#e2e8f0';
    ctx.fillStyle = cadCanvas;
    ctx.fillRect(0, 0, w, h);

    const { zoom, panX, panY } = state.viewState;
    const cx = w / 2, cy = h / 2;

    // Grid
    if (state.gridSettings.visible) {
      const spacing = state.gridSettings.spacing * zoom;
      const major = state.gridSettings.majorEvery;
      if (spacing > 4) {
        const startX = ((panX + cx) % spacing) - spacing;
        const startY = ((panY + cy) % spacing) - spacing;
        const worldOffX = -(panX + cx) / zoom;
        const worldOffY = -(panY + cy) / zoom;
        for (let x = startX; x < w + spacing; x += spacing) {
          const worldX = (x - cx - panX) / zoom;
          const isMajor = Math.abs(Math.round(worldX / state.gridSettings.spacing) % major) < 0.01;
          ctx.strokeStyle = isMajor ? cadGridMajor : cadGrid;
          ctx.lineWidth = isMajor ? 0.5 : 0.25;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = startY; y < h + spacing; y += spacing) {
          const worldY = (y - cy - panY) / zoom;
          const isMajor = Math.abs(Math.round(worldY / state.gridSettings.spacing) % major) < 0.01;
          ctx.strokeStyle = isMajor ? cadGridMajor : cadGrid;
          ctx.lineWidth = isMajor ? 0.5 : 0.25;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
      } else {
        // Dot grid when zoomed out
        const dotSpacing = state.gridSettings.spacing * state.gridSettings.majorEvery * zoom;
        if (dotSpacing > 8) {
          ctx.fillStyle = cadGridMajor;
          const startX = ((panX + cx) % dotSpacing) - dotSpacing;
          const startY = ((panY + cy) % dotSpacing) - dotSpacing;
          for (let x = startX; x < w + dotSpacing; x += dotSpacing) {
            for (let y = startY; y < h + dotSpacing; y += dotSpacing) {
              ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
            }
          }
        }
      }
    }

    // Origin axes
    const originScreen = worldToScreen(0, 0);
    ctx.strokeStyle = cadCrosshair + "20"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, originScreen.y); ctx.lineTo(w, originScreen.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(originScreen.x, 0); ctx.lineTo(originScreen.x, h); ctx.stroke();
    // Origin marker
    ctx.fillStyle = cadCrosshair + "40"; ctx.beginPath(); ctx.arc(originScreen.x, originScreen.y, 3, 0, Math.PI * 2); ctx.fill();

    // Draw entities
    ctx.save();
    for (const entity of state.entities) {
      if (!entity.visible) continue;
      const layer = state.layers.find(l => l.id === entity.layerId);
      if (layer && !layer.visible) continue;
      const isSelected = state.selectedEntityIds.includes(entity.id);
      drawEntity(ctx, entity, zoom, panX, panY, cx, cy, isSelected);
    }
    ctx.restore();

    // Drawing preview
    const ds = state.drawingState;
    if (ds.isDrawing && ds.previewPoint) {
      ctx.save();
      ctx.strokeStyle = cadCrosshair + "80";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      const tool = state.activeTool;
      if (tool === "line" && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const e = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      } else if (tool === "circle" && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const r = distance(ds.startPoint, ds.previewPoint) * zoom;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (tool === "rectangle" && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const e = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
        ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
      } else if (tool === "arc" && ds.startPoint) {
        if (ds.currentPoints.length === 0) {
          const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
          const e = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        } else if (ds.currentPoints.length === 1) {
          const center = ds.startPoint;
          const r = distance(center, ds.currentPoints[0]);
          const startAngle = Math.atan2(ds.currentPoints[0].y - center.y, ds.currentPoints[0].x - center.x);
          const endAngle = Math.atan2(ds.previewPoint.y - center.y, ds.previewPoint.x - center.x);
          const sc = worldToScreen(center.x, center.y);
          ctx.beginPath(); ctx.arc(sc.x, sc.y, r * zoom, startAngle, endAngle); ctx.stroke();
        }
      } else if (tool === "ellipse" && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const rx = Math.abs(ds.previewPoint.x - ds.startPoint.x) * zoom;
        const ry = Math.abs(ds.previewPoint.y - ds.startPoint.y) * zoom;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (tool === "polyline" && ds.currentPoints.length > 0) {
        ctx.beginPath();
        const first = worldToScreen(ds.currentPoints[0].x, ds.currentPoints[0].y);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < ds.currentPoints.length; i++) {
          const p = worldToScreen(ds.currentPoints[i].x, ds.currentPoints[i].y);
          ctx.lineTo(p.x, p.y);
        }
        const preview = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
        ctx.lineTo(preview.x, preview.y);
        ctx.stroke();
      } else if (tool === "dimension" && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const e = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        const dist = distance(ds.startPoint, ds.previewPoint);
        const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2;
        ctx.fillStyle = cadDimension; ctx.font = "11px 'Fira Code'"; ctx.textAlign = "center";
        ctx.fillText(dist.toFixed(2), mx, my - 8);
      }
      ctx.restore();
    }

    // Selection box
    if (selBoxStart.current && selBoxEnd.current) {
      const s = worldToScreen(selBoxStart.current.x, selBoxStart.current.y);
      const e = worldToScreen(selBoxEnd.current.x, selBoxEnd.current.y);
      const crossing = selBoxEnd.current.x < selBoxStart.current.x;
      ctx.strokeStyle = crossing ? "#22c55e" : "#3b82f6";
      ctx.fillStyle = crossing ? "#22c55e10" : "#3b82f610";
      ctx.lineWidth = 1;
      ctx.setLineDash(crossing ? [4, 4] : []);
      ctx.fillRect(s.x, s.y, e.x - s.x, e.y - s.y);
      ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
      ctx.setLineDash([]);
    }

    // Snap indicator
    if (snapPoint) {
      const sp = worldToScreen(snapPoint.point.x, snapPoint.point.y);
      ctx.strokeStyle = cadSnap; ctx.lineWidth = 1.5;
      if (snapPoint.type === "endpoint" || snapPoint.type === "quadrant") {
        ctx.strokeRect(sp.x - 5, sp.y - 5, 10, 10);
      } else if (snapPoint.type === "midpoint") {
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 6); ctx.lineTo(sp.x + 6, sp.y + 4); ctx.lineTo(sp.x - 6, sp.y + 4); ctx.closePath(); ctx.stroke();
      } else if (snapPoint.type === "center") {
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sp.x - 3, sp.y); ctx.lineTo(sp.x + 3, sp.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 3); ctx.lineTo(sp.x, sp.y + 3); ctx.stroke();
      } else if (snapPoint.type === "grid") {
        ctx.fillStyle = cadSnap + "60"; ctx.fillRect(sp.x - 2, sp.y - 2, 4, 4);
      } else {
        ctx.beginPath(); ctx.moveTo(sp.x - 5, sp.y - 5); ctx.lineTo(sp.x + 5, sp.y + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sp.x + 5, sp.y - 5); ctx.lineTo(sp.x - 5, sp.y + 5); ctx.stroke();
      }
    }

    // Crosshair
    const mScreen = worldToScreen(mouseWorld.x, mouseWorld.y);
    ctx.strokeStyle = cadCrosshair + "30"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(mScreen.x, 0); ctx.lineTo(mScreen.x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mScreen.y); ctx.lineTo(w, mScreen.y); ctx.stroke();

    // Coordinates display
    ctx.fillStyle = cadEntityDefault + "80"; ctx.font = "11px 'Fira Code'"; ctx.textAlign = "right";
    ctx.fillText(`X: ${mouseWorld.x.toFixed(4)}  Y: ${mouseWorld.y.toFixed(4)}`, w - 12, h - 12);
  }, [state, mouseWorld, snapPoint, worldToScreen]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (canvas) { canvas.style.width = "100%"; canvas.style.height = "100%"; }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const getWorldPoint = useCallback((e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }, [screenToWorld]);

  const processPoint = useCallback((raw: Point): Point => {
    let pt = raw;
    const snap = findSnapPoint(pt, state.entities, state.snapSettings, state.gridSettings, 15 / state.viewState.zoom);
    if (snap) { setSnapPoint(snap); pt = snap.point; }
    else { setSnapPoint(null); if (state.gridSettings.snapToGrid) pt = snapToGridPoint(pt, state.gridSettings); }
    if (state.orthoMode && state.drawingState.startPoint) pt = snapToAngle(state.drawingState.startPoint, pt);
    return pt;
  }, [state.entities, state.snapSettings, state.gridSettings, state.viewState.zoom, state.orthoMode, state.drawingState.startPoint]);

  const createEntity = useCallback((data: EntityData): CADEntity => ({
    id: generateId(), type: data.type, data, layerId: state.activeLayerId, color: state.activeColor,
    lineWidth: state.activeLineWidth, lineStyle: state.activeLineStyle, visible: true, locked: false, selected: false,
  }), [state.activeLayerId, state.activeColor, state.activeLineWidth, state.activeLineStyle]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && state.activeTool === "pan")) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - state.viewState.panX, y: e.clientY - state.viewState.panY };
      return;
    }
    if (e.button === 2) return;
    const raw = getWorldPoint(e);
    const pt = processPoint(raw);
    const tool = state.activeTool;

    if (tool === "select") {
      const tolerance = 8 / state.viewState.zoom;
      let hit: CADEntity | null = null;
      for (let i = state.entities.length - 1; i >= 0; i--) {
        const ent = state.entities[i];
        if (!ent.visible || ent.locked) continue;
        const layer = state.layers.find(l => l.id === ent.layerId);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (hitTestEntity(ent, pt, tolerance)) { hit = ent; break; }
      }
      if (hit) {
        if (e.shiftKey) dispatch({ type: "TOGGLE_SELECT", id: hit.id });
        else dispatch({ type: "SELECT_ENTITIES", ids: [hit.id] });
      } else {
        if (!e.shiftKey) dispatch({ type: "DESELECT_ALL" });
        selBoxStart.current = pt;
        selBoxEnd.current = pt;
      }
      return;
    }

    if (tool === "erase") {
      const tolerance = 8 / state.viewState.zoom;
      for (let i = state.entities.length - 1; i >= 0; i--) {
        if (hitTestEntity(state.entities[i], pt, tolerance)) {
          pushUndo();
          dispatch({ type: "REMOVE_ENTITIES", ids: [state.entities[i].id] });
          break;
        }
      }
      return;
    }

    if (tool === "line") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const ent = createEntity({ type: "line", start: state.drawingState.startPoint, end: pt });
        dispatch({ type: "ADD_ENTITY", entity: ent });
        dispatch({ type: "SET_DRAWING_STATE", state: { startPoint: pt, previewPoint: pt } });
      }
      return;
    }

    if (tool === "circle") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const r = distance(state.drawingState.startPoint, pt);
        if (r > 0.1) {
          const ent = createEntity({ type: "circle", center: state.drawingState.startPoint, radius: r });
          dispatch({ type: "ADD_ENTITY", entity: ent });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "rectangle") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const sp = state.drawingState.startPoint;
        const w = pt.x - sp.x, h = pt.y - sp.y;
        if (Math.abs(w) > 0.1 && Math.abs(h) > 0.1) {
          const topLeft = { x: Math.min(sp.x, pt.x), y: Math.min(sp.y, pt.y) };
          const ent = createEntity({ type: "rectangle", topLeft, width: Math.abs(w), height: Math.abs(h) });
          dispatch({ type: "ADD_ENTITY", entity: ent });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "ellipse") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const sp = state.drawingState.startPoint;
        const rx = Math.abs(pt.x - sp.x), ry = Math.abs(pt.y - sp.y);
        if (rx > 0.1 && ry > 0.1) {
          const ent = createEntity({ type: "ellipse", center: sp, radiusX: rx, radiusY: ry, rotation: 0 });
          dispatch({ type: "ADD_ENTITY", entity: ent });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "arc") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, currentPoints: [], previewPoint: pt } });
      } else if (state.drawingState.currentPoints.length === 0) {
        dispatch({ type: "SET_DRAWING_STATE", state: { currentPoints: [pt], previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const center = state.drawingState.startPoint;
        const r = distance(center, state.drawingState.currentPoints[0]);
        const startAngle = Math.atan2(state.drawingState.currentPoints[0].y - center.y, state.drawingState.currentPoints[0].x - center.x);
        const endAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
        const ent = createEntity({ type: "arc", center, radius: r, startAngle, endAngle });
        dispatch({ type: "ADD_ENTITY", entity: ent });
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } });
      }
      return;
    }

    if (tool === "polyline") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, currentPoints: [pt], previewPoint: pt } });
      } else {
        dispatch({ type: "SET_DRAWING_STATE", state: { currentPoints: [...state.drawingState.currentPoints, pt], previewPoint: pt } });
      }
      return;
    }

    if (tool === "text") {
      const content = prompt("Enter text:");
      if (content) {
        pushUndo();
        const ent = createEntity({ type: "text", position: pt, content, fontSize: 16, rotation: 0 });
        dispatch({ type: "ADD_ENTITY", entity: ent });
      }
      return;
    }

    if (tool === "dimension") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const ent = createEntity({ type: "dimension", start: state.drawingState.startPoint, end: pt, offset: 30 });
        dispatch({ type: "ADD_ENTITY", entity: ent });
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "trim") {
      const tolerance = 8 / state.viewState.zoom;
      for (let i = state.entities.length - 1; i >= 0; i--) {
        const ent = state.entities[i];
        if (!ent.visible || ent.locked) continue;
        const layer = state.layers.find(l => l.id === ent.layerId);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (hitTestEntity(ent, pt, tolerance)) {
          const result = trimEntity(pt, ent, state.entities, tolerance);
          if (result) {
            pushUndo();
            dispatch({ type: "REMOVE_ENTITIES", ids: result.removeIds });
            if (result.addEntities.length > 0) {
              dispatch({ type: "ADD_ENTITIES", entities: result.addEntities });
            }
            dispatch({ type: "ADD_COMMAND", entry: { command: "TRIM", timestamp: Date.now(), result: `Trimmed ${ent.type}` } });
          } else {
            dispatch({ type: "ADD_COMMAND", entry: { command: "TRIM", timestamp: Date.now(), result: "No intersections found to trim" } });
          }
          break;
        }
      }
      return;
    }

    if (tool === "extend") {
      const tolerance = 8 / state.viewState.zoom;
      for (let i = state.entities.length - 1; i >= 0; i--) {
        const ent = state.entities[i];
        if (!ent.visible || ent.locked) continue;
        const layer = state.layers.find(l => l.id === ent.layerId);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (hitTestEntity(ent, pt, tolerance)) {
          const result = extendEntity(pt, ent, state.entities, tolerance);
          if (result) {
            pushUndo();
            dispatch({ type: "UPDATE_ENTITY", id: result.entityId, updates: { data: result.newData } });
            dispatch({ type: "ADD_COMMAND", entry: { command: "EXTEND", timestamp: Date.now(), result: `Extended ${ent.type}` } });
          } else {
            dispatch({ type: "ADD_COMMAND", entry: { command: "EXTEND", timestamp: Date.now(), result: "No boundary found to extend to" } });
          }
          break;
        }
      }
      return;
    }

    if (tool === "copy") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "COPY", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
        dispatch({ type: "ADD_COMMAND", entry: { command: "COPY", timestamp: Date.now(), result: "Base point set. Click destination." } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const dx = pt.x - state.drawingState.startPoint.x;
        const dy = pt.y - state.drawingState.startPoint.y;
        const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
        const copies = copyEntities(selected, dx, dy);
        dispatch({ type: "ADD_ENTITIES", entities: copies });
        dispatch({ type: "ADD_COMMAND", entry: { command: "COPY", timestamp: Date.now(), result: `Copied ${copies.length} entities` } });
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "offset") {
      const tolerance = 8 / state.viewState.zoom;
      if (!offsetEntityRef.current) {
        // Step 1: Pick the entity to offset
        for (let i = state.entities.length - 1; i >= 0; i--) {
          const ent = state.entities[i];
          if (!ent.visible || ent.locked) continue;
          const layer = state.layers.find(l => l.id === ent.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (hitTestEntity(ent, pt, tolerance)) {
            offsetEntityRef.current = ent;
            const distStr = prompt("Enter offset distance:");
            if (!distStr || isNaN(parseFloat(distStr))) {
              offsetEntityRef.current = null;
              dispatch({ type: "ADD_COMMAND", entry: { command: "OFFSET", timestamp: Date.now(), result: "Invalid distance" } });
              return;
            }
            offsetDistRef.current = Math.abs(parseFloat(distStr));
            dispatch({ type: "ADD_COMMAND", entry: { command: "OFFSET", timestamp: Date.now(), result: `Distance: ${offsetDistRef.current}. Click side to offset.` } });
            return;
          }
        }
        dispatch({ type: "ADD_COMMAND", entry: { command: "OFFSET", timestamp: Date.now(), result: "Click an entity to offset" } });
      } else {
        // Step 2: Click the side to offset toward
        const result = offsetEntity(offsetEntityRef.current, offsetDistRef.current!, pt);
        if (result) {
          pushUndo();
          dispatch({ type: "ADD_ENTITY", entity: result });
          dispatch({ type: "ADD_COMMAND", entry: { command: "OFFSET", timestamp: Date.now(), result: `Offset ${offsetEntityRef.current.type} by ${offsetDistRef.current}` } });
        }
        offsetEntityRef.current = null;
        offsetDistRef.current = null;
      }
      return;
    }

    if (tool === "move") {
      if (state.selectedEntityIds.length === 0) return;
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const dx = pt.x - state.drawingState.startPoint.x;
        const dy = pt.y - state.drawingState.startPoint.y;
        for (const id of state.selectedEntityIds) {
          const ent = state.entities.find(e => e.id === id);
          if (!ent) continue;
          const moved = moveEntityData(ent.data, dx, dy);
          if (moved) dispatch({ type: "UPDATE_ENTITY", id, updates: { data: moved } });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "rotate") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "ROTATE", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
        dispatch({ type: "ADD_COMMAND", entry: { command: "ROTATE", timestamp: Date.now(), result: "Base point set. Click to define angle." } });
      } else if (state.drawingState.startPoint) {
        const angleStr = prompt("Enter rotation angle in degrees (positive = counter-clockwise):");
        if (angleStr && !isNaN(parseFloat(angleStr))) {
          pushUndo();
          const angle = (parseFloat(angleStr) * Math.PI) / 180;
          for (const id of state.selectedEntityIds) {
            const ent = state.entities.find(e => e.id === id);
            if (!ent) continue;
            const rotated = rotateEntityData(ent.data, state.drawingState.startPoint, angle);
            dispatch({ type: "UPDATE_ENTITY", id, updates: { data: rotated, type: rotated.type } });
          }
          dispatch({ type: "ADD_COMMAND", entry: { command: "ROTATE", timestamp: Date.now(), result: `Rotated ${state.selectedEntityIds.length} entities by ${angleStr}°` } });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "scale") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "SCALE", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
        dispatch({ type: "ADD_COMMAND", entry: { command: "SCALE", timestamp: Date.now(), result: "Base point set. Enter scale factor." } });
      } else if (state.drawingState.startPoint) {
        const factorStr = prompt("Enter scale factor (e.g. 2 = double, 0.5 = half):");
        if (factorStr && !isNaN(parseFloat(factorStr)) && parseFloat(factorStr) > 0) {
          pushUndo();
          const factor = parseFloat(factorStr);
          for (const id of state.selectedEntityIds) {
            const ent = state.entities.find(e => e.id === id);
            if (!ent) continue;
            const scaled = scaleEntityData(ent.data, state.drawingState.startPoint, factor);
            dispatch({ type: "UPDATE_ENTITY", id, updates: { data: scaled } });
          }
          dispatch({ type: "ADD_COMMAND", entry: { command: "SCALE", timestamp: Date.now(), result: `Scaled ${state.selectedEntityIds.length} entities by ${factorStr}x` } });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "fillet") {
      const tolerance = 8 / state.viewState.zoom;
      if (!filletFirstRef.current) {
        // Step 1: Pick first line
        for (let i = state.entities.length - 1; i >= 0; i--) {
          const ent = state.entities[i];
          if (!ent.visible || ent.locked) continue;
          if (ent.data.type !== "line") continue;
          const layer = state.layers.find(l => l.id === ent.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (hitTestEntity(ent, pt, tolerance)) {
            filletFirstRef.current = ent;
            dispatch({ type: "ADD_COMMAND", entry: { command: "FILLET", timestamp: Date.now(), result: "First line selected. Click second line." } });
            return;
          }
        }
        dispatch({ type: "ADD_COMMAND", entry: { command: "FILLET", timestamp: Date.now(), result: "Click a line entity" } });
      } else {
        // Step 2: Pick second line and apply fillet
        for (let i = state.entities.length - 1; i >= 0; i--) {
          const ent = state.entities[i];
          if (!ent.visible || ent.locked || ent.id === filletFirstRef.current.id) continue;
          if (ent.data.type !== "line") continue;
          const layer = state.layers.find(l => l.id === ent.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (hitTestEntity(ent, pt, tolerance)) {
            const modeStr = prompt("Enter radius (0 for sharp corner).\nPrefix with 'c' for chamfer (e.g. 'c10'):");
            if (modeStr !== null) {
              const isChamfer = modeStr.toLowerCase().startsWith("c");
              const numStr = isChamfer ? modeStr.slice(1).trim() : modeStr.trim();
              const radius = parseFloat(numStr) || 0;
              const mode: FilletMode = isChamfer ? "chamfer" : "fillet";
              const result = filletEntities(filletFirstRef.current, ent, radius, mode, state.entities);
              if (result) {
                pushUndo();
                dispatch({ type: "REMOVE_ENTITIES", ids: result.removeIds });
                dispatch({ type: "ADD_ENTITIES", entities: result.addEntities });
                dispatch({ type: "ADD_COMMAND", entry: { command: mode === "chamfer" ? "CHAMFER" : "FILLET", timestamp: Date.now(), result: `${mode === "chamfer" ? "Chamfered" : "Filleted"} with ${mode === "chamfer" ? "distance" : "radius"} ${radius}` } });
              } else {
                dispatch({ type: "ADD_COMMAND", entry: { command: "FILLET", timestamp: Date.now(), result: "Could not fillet these entities" } });
              }
            }
            filletFirstRef.current = null;
            return;
          }
        }
        dispatch({ type: "ADD_COMMAND", entry: { command: "FILLET", timestamp: Date.now(), result: "Click a second line entity" } });
      }
      return;
    }
  }, [state, getWorldPoint, processPoint, createEntity, dispatch, pushUndo]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      dispatch({ type: "SET_VIEW_STATE", viewState: { panX: e.clientX - panStart.current.x, panY: e.clientY - panStart.current.y } });
      return;
    }
    const raw = getWorldPoint(e);
    const pt = processPoint(raw);
    setMouseWorld(pt);

    if (state.drawingState.isDrawing) {
      dispatch({ type: "SET_DRAWING_STATE", state: { previewPoint: pt } });
    }

    if (selBoxStart.current) {
      selBoxEnd.current = pt;
    }
  }, [state.drawingState.isDrawing, getWorldPoint, processPoint, dispatch]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) { isPanning.current = false; return; }
    if (selBoxStart.current && selBoxEnd.current) {
      const ids = entitiesInBox(state.entities, selBoxStart.current, selBoxEnd.current);
      if (ids.length > 0) {
        if (e.shiftKey) dispatch({ type: "SELECT_ENTITIES", ids: [...state.selectedEntityIds, ...ids] });
        else dispatch({ type: "SELECT_ENTITIES", ids });
      }
      selBoxStart.current = null; selBoxEnd.current = null;
    }
  }, [state.entities, state.selectedEntityIds, dispatch]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.01, Math.min(100, state.viewState.zoom * factor));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const newPanX = mx - (mx - state.viewState.panX - cx) * (newZoom / state.viewState.zoom) - cx;
    const newPanY = my - (my - state.viewState.panY - cy) * (newZoom / state.viewState.zoom) - cy;
    dispatch({ type: "SET_VIEW_STATE", viewState: { zoom: newZoom, panX: newPanX, panY: newPanY } });
  }, [state.viewState, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (state.activeTool === "polyline" && state.drawingState.isDrawing && state.drawingState.currentPoints.length >= 2) {
      pushUndo();
      const ent = createEntity({ type: "polyline", points: state.drawingState.currentPoints, closed: false });
      dispatch({ type: "ADD_ENTITY", entity: ent });
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } });
    } else if (state.drawingState.isDrawing) {
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } });
    }
  }, [state.activeTool, state.drawingState, createEntity, dispatch, pushUndo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") { e.preventDefault(); dispatch({ type: "UNDO" }); return; }
        if (e.key === "y") { e.preventDefault(); dispatch({ type: "REDO" }); return; }
        if (e.key === "a") { e.preventDefault(); dispatch({ type: "SELECT_ENTITIES", ids: state.entities.filter(en => en.visible && !en.locked).map(en => en.id) }); return; }
        if (e.key === "s") { e.preventDefault(); return; }
      }
      if (e.key === "Escape") { offsetEntityRef.current = null; offsetDistRef.current = null; filletFirstRef.current = null; dispatch({ type: "DESELECT_ALL" }); dispatch({ type: "SET_TOOL", tool: "select" }); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (state.selectedEntityIds.length) { pushUndo(); dispatch({ type: "REMOVE_ENTITIES", ids: state.selectedEntityIds }); } return; }
      if (e.key === "T" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "trim" }); return; }
      if (e.key === "E" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "extend" }); return; }
      if (e.key === "C" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "copy" }); return; }
      if (e.key === "o" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "offset" }); return; }
      if (e.key === "R" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "rotate" }); return; }
      if (e.key === "S" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "scale" }); return; }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "fillet" }); return; }
      const keyMap: Record<string, any> = { v: "select", l: "line", c: "circle", a: "arc", r: "rectangle", p: "polyline", e: "ellipse", t: "text", d: "dimension", m: "move", x: "erase" };
      if (keyMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { dispatch({ type: "SET_TOOL", tool: keyMap[e.key.toLowerCase()] }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.entities, state.selectedEntityIds, dispatch, pushUndo]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ cursor: getCursor(state.activeTool, isPanning.current) }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}

function getCursor(tool: string, panning: boolean): string {
  if (panning) return "grabbing";
  switch (tool) {
    case "select": return "default";
    case "pan": return "grab";
    case "erase": return "crosshair";
    case "trim": return "crosshair";
    case "extend": return "crosshair";
    case "copy": return "crosshair";
    case "offset": return "crosshair";
    case "rotate": return "crosshair";
    case "scale": return "crosshair";
    case "fillet": return "crosshair";
    case "text": return "text";
    default: return "crosshair";
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: CADEntity, zoom: number, panX: number, panY: number, cx: number, cy: number, selected: boolean) {
  const toScreen = (p: Point) => ({ x: p.x * zoom + cx + panX, y: p.y * zoom + cy + panY });
  ctx.strokeStyle = selected ? "#3b82f6" : entity.color;
  ctx.lineWidth = (selected ? entity.lineWidth + 1 : entity.lineWidth);
  ctx.setLineDash(getLineDash(entity.lineStyle));
  const d = entity.data;

  switch (d.type) {
    case "line": { const s = toScreen(d.start), e = toScreen(d.end); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke(); break; }
    case "circle": { const c = toScreen(d.center); ctx.beginPath(); ctx.arc(c.x, c.y, d.radius * zoom, 0, Math.PI * 2); ctx.stroke(); break; }
    case "arc": { const c = toScreen(d.center); ctx.beginPath(); ctx.arc(c.x, c.y, d.radius * zoom, d.startAngle, d.endAngle); ctx.stroke(); break; }
    case "rectangle": { const tl = toScreen(d.topLeft); ctx.strokeRect(tl.x, tl.y, d.width * zoom, d.height * zoom); break; }
    case "polyline": {
      if (d.points.length < 2) break;
      ctx.beginPath();
      const first = toScreen(d.points[0]); ctx.moveTo(first.x, first.y);
      for (let i = 1; i < d.points.length; i++) { const p = toScreen(d.points[i]); ctx.lineTo(p.x, p.y); }
      if (d.closed) ctx.closePath();
      ctx.stroke(); break;
    }
    case "ellipse": { const c = toScreen(d.center); ctx.beginPath(); ctx.ellipse(c.x, c.y, d.radiusX * zoom, d.radiusY * zoom, d.rotation, 0, Math.PI * 2); ctx.stroke(); break; }
    case "text": {
      const p = toScreen(d.position);
      ctx.fillStyle = selected ? "#3b82f6" : entity.color;
      ctx.font = `${d.fontSize * zoom}px 'Fira Code'`;
      ctx.textBaseline = "bottom";
      ctx.fillText(d.content, p.x, p.y);
      break;
    }
    case "dimension": {
      const s = toScreen(d.start), e = toScreen(d.end);
      const dist = distance(d.start, d.end);
      const off = d.offset * zoom;
      ctx.strokeStyle = selected ? "#3b82f6" : "#f59e0b";
      ctx.lineWidth = 0.5;
      // Extension lines
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x, e.y - off); ctx.stroke();
      // Dimension line
      ctx.beginPath(); ctx.moveTo(s.x, s.y - off); ctx.lineTo(e.x, e.y - off); ctx.stroke();
      // Arrows
      const arrowSize = 6;
      const angle = Math.atan2(0, e.x - s.x);
      drawArrow(ctx, s.x, s.y - off, angle, arrowSize);
      drawArrow(ctx, e.x, e.y - off, angle + Math.PI, arrowSize);
      // Text
      ctx.fillStyle = selected ? "#3b82f6" : "#f59e0b";
      ctx.font = `${Math.max(10, 12 * zoom)}px 'Fira Code'`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(dist.toFixed(2), (s.x + e.x) / 2, (s.y + e.y) / 2 - off - 4);
      break;
    }
  }
  ctx.setLineDash([]);
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.4), y - size * Math.sin(angle - 0.4));
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle + 0.4), y - size * Math.sin(angle + 0.4));
  ctx.stroke();
}

function moveEntityData(data: EntityData, dx: number, dy: number): EntityData | null {
  switch (data.type) {
    case "line": return { ...data, start: { x: data.start.x + dx, y: data.start.y + dy }, end: { x: data.end.x + dx, y: data.end.y + dy } };
    case "circle": return { ...data, center: { x: data.center.x + dx, y: data.center.y + dy } };
    case "arc": return { ...data, center: { x: data.center.x + dx, y: data.center.y + dy } };
    case "rectangle": return { ...data, topLeft: { x: data.topLeft.x + dx, y: data.topLeft.y + dy } };
    case "polyline": return { ...data, points: data.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case "ellipse": return { ...data, center: { x: data.center.x + dx, y: data.center.y + dy } };
    case "text": return { ...data, position: { x: data.position.x + dx, y: data.position.y + dy } };
    case "dimension": return { ...data, start: { x: data.start.x + dx, y: data.start.y + dy }, end: { x: data.end.x + dx, y: data.end.y + dy } };
    default: return null;
  }
}
