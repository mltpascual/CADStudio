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
import { mirrorEntities } from "@/lib/mirror-utils";
import { measureDistance, measureArea, measureAngle, drawDistanceOverlay, drawAreaOverlay, drawAngleOverlay, type MeasureResult } from "@/lib/measure-utils";
import { getEntityBoundary, createHatchEntity, drawHatchPattern } from "@/lib/hatch-utils";
import { createBlockDefinition, createBlockRefEntity, getBlockRefEntities, explodeBlockRef } from "@/lib/block-utils";
import { createRectangularArray, createPolarArray, getEntitiesCentroid } from "@/lib/array-utils";
import { drawSpline, drawSplinePreview, hitTestSpline, moveSpline } from "@/lib/spline-utils";
import { drawXLine, drawRay, moveXLine, moveRay } from "@/lib/xline-utils";
import { drawPaperSheet, drawViewportFrame, drawTitleBlock, getPaperPixelSize, MM_TO_PX } from "@/lib/layout-utils";
import type { BlockRefData, SplineData, XLineData, RayData } from "@/lib/cad-types";
import DynamicInput from "@/components/DynamicInput";

export default function CADCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state } = useCAD();
  const { dispatch, pushUndo } = useCADActions();
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });
  const [mouseScreen, setMouseScreen] = useState<Point>({ x: 0, y: 0 });
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [snapPoint, setSnapPoint] = useState<{ point: Point; type: string } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const selBoxStart = useRef<Point | null>(null);
  const selBoxEnd = useRef<Point | null>(null);
  const offsetEntityRef = useRef<CADEntity | null>(null);
  const offsetDistRef = useRef<number | null>(null);
  const filletFirstRef = useRef<CADEntity | null>(null);
  const mirrorAxisStart = useRef<Point | null>(null);
  const measurePoints = useRef<Point[]>([]);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);
  const hatchBoundaryPts = useRef<Point[]>([]);
  const blockInsertId = useRef<string | null>(null);
  const splinePoints = useRef<Point[]>([]);

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
      // Render block reference child entities
      if (entity.data.type === "blockref") {
        const blockDef = state.blocks.find(b => b.id === (entity.data as BlockRefData).blockId);
        if (blockDef) {
          const childEntities = getBlockRefEntities(blockDef, entity.data as BlockRefData);
          for (const child of childEntities) {
            drawEntity(ctx, child, zoom, panX, panY, cx, cy, isSelected);
          }
        }
      }
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
      } else if (tool === "spline" && splinePoints.current.length > 0) {
        ctx.restore();
        drawSplinePreview(ctx, splinePoints.current, ds.previewPoint, false, state.activeColor, cx + panX, cy + panY, zoom);
        ctx.save();
      } else if ((tool === "xline" || tool === "ray") && ds.startPoint) {
        const s = worldToScreen(ds.startPoint.x, ds.startPoint.y);
        const e = worldToScreen(ds.previewPoint.x, ds.previewPoint.y);
        const dx = e.x - s.x, dy = e.y - s.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const nx = dx / len, ny = dy / len;
          const ext = Math.max(canvas.width, canvas.height) * 2;
          ctx.setLineDash([8, 6]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          if (tool === "xline") {
            ctx.moveTo(s.x - nx * ext, s.y - ny * ext);
            ctx.lineTo(s.x + nx * ext, s.y + ny * ext);
          } else {
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + nx * ext, s.y + ny * ext);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          // Base point marker
          ctx.fillStyle = state.activeColor;
          ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
        }
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

    // Measurement overlays
    const measureColor = "#f97316";
    if (measureResult && measurePoints.current.length >= 2) {
      if (measureResult.type === "distance") {
        const sp1 = worldToScreen(measurePoints.current[0].x, measurePoints.current[0].y);
        const sp2 = worldToScreen(measurePoints.current[1].x, measurePoints.current[1].y);
        drawDistanceOverlay(ctx, sp1, sp2, measureResult, measureColor);
      } else if (measureResult.type === "area" && measurePoints.current.length >= 3) {
        const screenPts = measurePoints.current.map(p => worldToScreen(p.x, p.y));
        drawAreaOverlay(ctx, screenPts, measureResult, measureColor);
      } else if (measureResult.type === "angle" && measurePoints.current.length >= 3) {
        const sp1 = worldToScreen(measurePoints.current[0].x, measurePoints.current[0].y);
        const sp2 = worldToScreen(measurePoints.current[1].x, measurePoints.current[1].y);
        const sp3 = worldToScreen(measurePoints.current[2].x, measurePoints.current[2].y);
        drawAngleOverlay(ctx, sp1, sp2, sp3, measureResult, measureColor);
      }
    }
    // In-progress measurement preview
    if ((state.activeTool === "measure_distance" || state.activeTool === "measure_area" || state.activeTool === "measure_angle") && measurePoints.current.length > 0 && !measureResult) {
      ctx.save();
      ctx.strokeStyle = measureColor + "80";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const pts = measurePoints.current.map(p => worldToScreen(p.x, p.y));
      const mPt = worldToScreen(mouseWorld.x, mouseWorld.y);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(mPt.x, mPt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw dots at placed points
      ctx.fillStyle = measureColor;
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // Mirror axis preview
    if (state.activeTool === "mirror" && mirrorAxisStart.current) {
      const axS = worldToScreen(mirrorAxisStart.current.x, mirrorAxisStart.current.y);
      const axE = worldToScreen(mouseWorld.x, mouseWorld.y);
      ctx.save();
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(axS.x, axS.y); ctx.lineTo(axE.x, axE.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a855f7";
      ctx.beginPath(); ctx.arc(axS.x, axS.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Polar tracking guide lines
    if (state.polarTracking.enabled && state.drawingState.isDrawing && state.drawingState.startPoint) {
      const base = state.drawingState.startPoint;
      const baseScreen = worldToScreen(base.x, base.y);
      const inc = state.polarTracking.increment;
      const trackAngles: number[] = [];
      for (let a = 0; a < 360; a += inc) trackAngles.push(a);
      for (const a of state.polarTracking.additionalAngles) {
        if (!trackAngles.includes(a % 360)) trackAngles.push(a % 360);
      }
      const mPt = worldToScreen(mouseWorld.x, mouseWorld.y);
      const dx = mouseWorld.x - base.x, dy = mouseWorld.y - base.y;
      const mouseDist = Math.sqrt(dx * dx + dy * dy);
      let mouseAngle = ((Math.atan2(dy, dx) * 180 / Math.PI % 360) + 360) % 360;
      // Find if mouse is near a tracking angle
      let activeAngle: number | null = null;
      for (const ta of trackAngles) {
        let diff = Math.abs(mouseAngle - ta);
        if (diff > 180) diff = 360 - diff;
        if (diff < 10) { activeAngle = ta; break; }
      }
      ctx.save();
      // Draw all tracking angle lines faintly
      for (const ta of trackAngles) {
        const rad = ta * Math.PI / 180;
        const isActive = ta === activeAngle;
        ctx.strokeStyle = isActive ? "#22d3ee" : "#22d3ee15";
        ctx.lineWidth = isActive ? 1 : 0.5;
        ctx.setLineDash(isActive ? [8, 4] : [2, 6]);
        const len = Math.max(w, h) * 2;
        const ex = baseScreen.x + len * Math.cos(rad);
        const ey = baseScreen.y + len * Math.sin(rad);
        const ex2 = baseScreen.x - len * Math.cos(rad);
        const ey2 = baseScreen.y - len * Math.sin(rad);
        ctx.beginPath(); ctx.moveTo(ex2, ey2); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // Draw angle tooltip near cursor when snapped
      if (activeAngle !== null && mouseDist > 0.001) {
        ctx.setLineDash([]);
        ctx.fillStyle = "#0e7490";
        ctx.globalAlpha = 0.85;
        const label = `${activeAngle}° (${mouseDist.toFixed(2)})`;
        const tw = ctx.measureText(label).width;
        ctx.fillRect(mPt.x + 14, mPt.y - 24, tw + 12, 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ecfeff";
        ctx.font = "11px 'Fira Code'";
        ctx.textAlign = "left";
        ctx.fillText(label, mPt.x + 20, mPt.y - 10);
      }
      ctx.restore();
    }

    // Crosshair
    const mScreen = worldToScreen(mouseWorld.x, mouseWorld.y);
    ctx.strokeStyle = cadCrosshair + "30"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(mScreen.x, 0); ctx.lineTo(mScreen.x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mScreen.y); ctx.lineTo(w, mScreen.y); ctx.stroke();

    // Coordinates display
    ctx.fillStyle = cadEntityDefault + "80"; ctx.font = "11px 'Fira Code'"; ctx.textAlign = "right";
    ctx.fillText(`X: ${mouseWorld.x.toFixed(4)}  Y: ${mouseWorld.y.toFixed(4)}`, w - 12, h - 12);

    // Paper space overlay — render when a layout is active
    const activeLayout = state.activeLayoutId ? state.layouts.find(l => l.id === state.activeLayoutId) : null;
    if (activeLayout && state.activeSpace === "paper") {
      const isDark = document.documentElement.classList.contains('dark');
      const { w: paperW, h: paperH } = getPaperPixelSize(activeLayout);
      const paperZoom = Math.min((w - 80) / paperW, (h - 80) / paperH, 1.5);
      const paperOffX = (w - paperW * paperZoom) / 2;
      const paperOffY = (h - paperH * paperZoom) / 2;

      // Dim the model space background
      ctx.fillStyle = isDark ? 'rgba(5,5,15,0.85)' : 'rgba(200,210,220,0.85)';
      ctx.fillRect(0, 0, w, h);

      // Draw paper sheet
      drawPaperSheet(ctx, activeLayout, paperOffX, paperOffY, paperZoom, isDark);

      // Draw viewports with clipped model space content
      for (const vp of activeLayout.viewports) {
        const vpX = paperOffX + vp.x * MM_TO_PX * paperZoom;
        const vpY = paperOffY + vp.y * MM_TO_PX * paperZoom;
        const vpW = vp.width * MM_TO_PX * paperZoom;
        const vpH = vp.height * MM_TO_PX * paperZoom;

        // Clip to viewport bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(vpX, vpY, vpW, vpH);
        ctx.clip();

        // Viewport background
        ctx.fillStyle = isDark ? '#0a0a12' : '#f4f6f9';
        ctx.fillRect(vpX, vpY, vpW, vpH);

        // Render model space entities within viewport
        const vpCx = vpX + vpW / 2;
        const vpCy = vpY + vpH / 2;
        const vpZoom = vp.viewZoom * paperZoom;
        const vpPanX = -vp.viewCenter.x * vpZoom;
        const vpPanY = -vp.viewCenter.y * vpZoom;

        for (const entity of state.entities) {
          if (!entity.visible) continue;
          const layer = state.layers.find(l => l.id === entity.layerId);
          if (layer && !layer.visible) continue;
          drawEntity(ctx, entity, vpZoom, vpPanX, vpPanY, vpCx, vpCy, false);
        }

        ctx.restore();

        // Draw viewport frame
        drawViewportFrame(ctx, vp, paperOffX, paperOffY, paperZoom, vp.active, isDark);
      }

      // Draw title block
      drawTitleBlock(ctx, activeLayout, paperOffX, paperOffY, paperZoom, isDark);

      // Paper space label
      ctx.fillStyle = isDark ? '#6366f1' : '#4338ca';
      ctx.font = "bold 12px 'Space Grotesk'";
      ctx.textAlign = "left";
      ctx.fillText(`PAPER: ${activeLayout.name} (${activeLayout.paperSize} ${activeLayout.orientation})`, 12, 20);
    }
  }, [state, mouseWorld, snapPoint, measureResult, worldToScreen]);

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
    // Polar tracking: snap to configured angle increments
    if (state.polarTracking.enabled && !state.orthoMode && state.drawingState.startPoint) {
      const base = state.drawingState.startPoint;
      const dx = pt.x - base.x, dy = pt.y - base.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001) {
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const inc = state.polarTracking.increment;
        // Build list of all tracking angles
        const trackAngles: number[] = [];
        for (let a = 0; a < 360; a += inc) trackAngles.push(a);
        for (const a of state.polarTracking.additionalAngles) {
          if (!trackAngles.includes(a % 360)) trackAngles.push(a % 360);
        }
        // Normalize angle to 0-360
        let normAngle = ((angle % 360) + 360) % 360;
        // Find nearest tracking angle
        let nearestAngle = trackAngles[0];
        let minDiff = 360;
        for (const ta of trackAngles) {
          let diff = Math.abs(normAngle - ta);
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) { minDiff = diff; nearestAngle = ta; }
        }
        // Snap if within threshold (10 degrees)
        if (minDiff < 10) {
          const rad = nearestAngle * Math.PI / 180;
          pt = { x: base.x + dist * Math.cos(rad), y: base.y + dist * Math.sin(rad) };
        }
      }
    }
    return pt;
  }, [state.entities, state.snapSettings, state.gridSettings, state.viewState.zoom, state.orthoMode, state.drawingState.startPoint, state.polarTracking]);

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

    if (tool === "spline") {
      if (!state.drawingState.isDrawing) {
        splinePoints.current = [pt];
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, currentPoints: [pt], previewPoint: pt } });
      } else {
        splinePoints.current = [...splinePoints.current, pt];
        dispatch({ type: "SET_DRAWING_STATE", state: { currentPoints: splinePoints.current, previewPoint: pt } });
      }
      return;
    }

    if (tool === "xline") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const dir = { x: pt.x - state.drawingState.startPoint.x, y: pt.y - state.drawingState.startPoint.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        if (len > 0.1) {
          const ent = createEntity({ type: "xline", basePoint: state.drawingState.startPoint, direction: dir });
          dispatch({ type: "ADD_ENTITY", entity: ent });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "ray") {
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      } else if (state.drawingState.startPoint) {
        pushUndo();
        const dir = { x: pt.x - state.drawingState.startPoint.x, y: pt.y - state.drawingState.startPoint.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        if (len > 0.1) {
          const ent = createEntity({ type: "ray", basePoint: state.drawingState.startPoint, direction: dir });
          dispatch({ type: "ADD_ENTITY", entity: ent });
        }
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
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

    if (tool === "mirror") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "MIRROR", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      if (!mirrorAxisStart.current) {
        mirrorAxisStart.current = pt;
        dispatch({ type: "ADD_COMMAND", entry: { command: "MIRROR", timestamp: Date.now(), result: "First axis point set. Click second point." } });
      } else {
        pushUndo();
        const { newEntities, removeIds } = mirrorEntities(state.entities, state.selectedEntityIds, mirrorAxisStart.current, pt, true);
        if (newEntities.length > 0) {
          dispatch({ type: "ADD_ENTITIES", entities: newEntities });
          dispatch({ type: "ADD_COMMAND", entry: { command: "MIRROR", timestamp: Date.now(), result: `Mirrored ${newEntities.length} entities` } });
        }
        mirrorAxisStart.current = null;
      }
      return;
    }

    if (tool === "measure_distance") {
      if (!state.drawingState.isDrawing) {
        measurePoints.current = [pt];
        setMeasureResult(null);
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: "First point set. Click second point." } });
      } else {
        const result = measureDistance(measurePoints.current[0], pt);
        setMeasureResult(result);
        measurePoints.current = [measurePoints.current[0], pt];
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: `Distance: ${result.value.toFixed(4)}` } });
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
      }
      return;
    }

    if (tool === "measure_area") {
      measurePoints.current = [...measurePoints.current, pt];
      if (measurePoints.current.length >= 3) {
        const result = measureArea(measurePoints.current);
        setMeasureResult(result);
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: `Area: ${result.value.toFixed(4)} (${measurePoints.current.length} pts, right-click to finish)` } });
      } else {
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: `Point ${measurePoints.current.length} set. Click more points (min 3).` } });
      }
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: measurePoints.current[0], currentPoints: measurePoints.current, previewPoint: pt } });
      return;
    }

    if (tool === "hatch") {
      const tolerance = 8 / state.viewState.zoom;
      // Check if user clicked on a closed entity to auto-detect boundary
      for (let i = state.entities.length - 1; i >= 0; i--) {
        const ent = state.entities[i];
        if (!ent.visible || ent.locked) continue;
        const layer = state.layers.find(l => l.id === ent.layerId);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (hitTestEntity(ent, pt, tolerance)) {
          const boundary = getEntityBoundary(ent);
          if (boundary) {
            pushUndo();
            const hatchEnt = createHatchEntity(
              boundary,
              state.activeHatchPattern,
              state.activeHatchScale,
              state.activeHatchAngle,
              state.activeColor,
              state.activeLayerId
            );
            dispatch({ type: "ADD_ENTITY", entity: hatchEnt });
            dispatch({ type: "ADD_COMMAND", entry: { command: "HATCH", timestamp: Date.now(), result: `Hatched ${ent.type} with ${state.activeHatchPattern} pattern` } });
          } else {
            dispatch({ type: "ADD_COMMAND", entry: { command: "HATCH", timestamp: Date.now(), result: "Entity is not closed. Use rectangle, circle, ellipse, or closed polyline." } });
          }
          return;
        }
      }
      // If no entity clicked, allow manual boundary drawing
      hatchBoundaryPts.current = [...hatchBoundaryPts.current, pt];
      if (hatchBoundaryPts.current.length >= 3) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "HATCH", timestamp: Date.now(), result: `Boundary point ${hatchBoundaryPts.current.length}. Right-click to finish.` } });
      } else {
        dispatch({ type: "ADD_COMMAND", entry: { command: "HATCH", timestamp: Date.now(), result: `Boundary point ${hatchBoundaryPts.current.length}. Click more points (min 3) or click a closed entity.` } });
      }
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: hatchBoundaryPts.current[0], currentPoints: hatchBoundaryPts.current, previewPoint: pt } });
      return;
    }

    if (tool === "block_group") {
      if (state.selectedEntityIds.length < 1) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "BLOCK", timestamp: Date.now(), result: "Select entities first, then use Block/Group" } });
        return;
      }
      const name = prompt("Enter block name:") || `Block_${state.blocks.length + 1}`;
      const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
      const block = createBlockDefinition(name, selected);
      pushUndo();
      dispatch({ type: "ADD_BLOCK", block });
      // Remove original entities and replace with a block reference
      dispatch({ type: "REMOVE_ENTITIES", ids: state.selectedEntityIds });
      const ref = createBlockRefEntity(block.id, block.basePoint, 1, 1, 0, state.activeLayerId, state.activeColor);
      dispatch({ type: "ADD_ENTITY", entity: ref });
      dispatch({ type: "ADD_COMMAND", entry: { command: "BLOCK", timestamp: Date.now(), result: `Created block "${name}" with ${selected.length} entities` } });
      return;
    }

    if (tool === "block_insert") {
      if (state.blocks.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "INSERT", timestamp: Date.now(), result: "No blocks defined. Create a block first." } });
        return;
      }
      if (!blockInsertId.current) {
        // Show block selection
        const blockList = state.blocks.map((b, i) => `${i + 1}. ${b.name}`).join("\n");
        const choice = prompt(`Select block to insert:\n${blockList}\n\nEnter number:`);
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (idx < 0 || idx >= state.blocks.length) {
          dispatch({ type: "ADD_COMMAND", entry: { command: "INSERT", timestamp: Date.now(), result: "Invalid block number" } });
          return;
        }
        blockInsertId.current = state.blocks[idx].id;
        dispatch({ type: "ADD_COMMAND", entry: { command: "INSERT", timestamp: Date.now(), result: `Block "${state.blocks[idx].name}" selected. Click to place.` } });
        return;
      }
      // Place the block
      pushUndo();
      const ref = createBlockRefEntity(blockInsertId.current, pt, 1, 1, 0, state.activeLayerId, state.activeColor);
      dispatch({ type: "ADD_ENTITY", entity: ref });
      const block = state.blocks.find(b => b.id === blockInsertId.current);
      dispatch({ type: "ADD_COMMAND", entry: { command: "INSERT", timestamp: Date.now(), result: `Inserted block "${block?.name}" at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})` } });
      blockInsertId.current = null;
      return;
    }

    if (tool === "array_rect") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "ARRAYRECT", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      const rowsStr = prompt("Number of rows (Y direction):", "3");
      if (!rowsStr) return;
      const colsStr = prompt("Number of columns (X direction):", "3");
      if (!colsStr) return;
      const rowSpStr = prompt("Row spacing (distance between rows):", "50");
      if (!rowSpStr) return;
      const colSpStr = prompt("Column spacing (distance between columns):", "50");
      if (!colSpStr) return;
      const rows = parseInt(rowsStr) || 3;
      const cols = parseInt(colsStr) || 3;
      const rowSp = parseFloat(rowSpStr) || 50;
      const colSp = parseFloat(colSpStr) || 50;
      const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
      const newEntities = createRectangularArray(selected, { rows, columns: cols, rowSpacing: rowSp, colSpacing: colSp, angle: 0 });
      if (newEntities.length > 0) {
        pushUndo();
        dispatch({ type: "ADD_ENTITIES", entities: newEntities });
        dispatch({ type: "ADD_COMMAND", entry: { command: "ARRAYRECT", timestamp: Date.now(), result: `Created ${rows}x${cols} rectangular array (${newEntities.length} new entities)` } });
      }
      return;
    }

    if (tool === "array_polar") {
      if (state.selectedEntityIds.length === 0) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "ARRAYPOLAR", timestamp: Date.now(), result: "Select entities first" } });
        return;
      }
      const countStr = prompt("Total number of items (including original):", "6");
      if (!countStr) return;
      const angleStr = prompt("Total angle to fill (degrees, 360 = full circle):", "360");
      if (!angleStr) return;
      const rotateStr = prompt("Rotate items as they are arrayed? (y/n):", "y");
      const count = parseInt(countStr) || 6;
      const totalAngle = parseFloat(angleStr) || 360;
      const rotateItems = rotateStr?.toLowerCase() !== "n";
      const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
      // Use clicked point as center, or centroid if not drawing
      const center = pt;
      const newEntities = createPolarArray(selected, { center, count, totalAngle, rotateItems });
      if (newEntities.length > 0) {
        pushUndo();
        dispatch({ type: "ADD_ENTITIES", entities: newEntities });
        dispatch({ type: "ADD_COMMAND", entry: { command: "ARRAYPOLAR", timestamp: Date.now(), result: `Created polar array: ${count} items over ${totalAngle}° (${newEntities.length} new entities)` } });
      }
      return;
    }

    if (tool === "measure_angle") {
      measurePoints.current = [...measurePoints.current, pt];
      if (measurePoints.current.length === 1) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: "First point set. Click vertex point." } });
      } else if (measurePoints.current.length === 2) {
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: "Vertex set. Click third point." } });
      } else if (measurePoints.current.length >= 3) {
        const result = measureAngle(measurePoints.current[0], measurePoints.current[1], measurePoints.current[2]);
        setMeasureResult(result);
        dispatch({ type: "ADD_COMMAND", entry: { command: "MEASURE", timestamp: Date.now(), result: `Angle: ${result.value.toFixed(2)}°` } });
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, previewPoint: null } });
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
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMouseScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (!canvasRect || canvasRect.width !== rect.width || canvasRect.height !== rect.height) setCanvasRect(rect);
    }

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
    if (state.activeTool === "hatch" && hatchBoundaryPts.current.length >= 3) {
      pushUndo();
      const hatchEnt = createHatchEntity(
        hatchBoundaryPts.current,
        state.activeHatchPattern,
        state.activeHatchScale,
        state.activeHatchAngle,
        state.activeColor,
        state.activeLayerId
      );
      dispatch({ type: "ADD_ENTITY", entity: hatchEnt });
      dispatch({ type: "ADD_COMMAND", entry: { command: "HATCH", timestamp: Date.now(), result: `Created hatch with ${hatchBoundaryPts.current.length} boundary points` } });
      hatchBoundaryPts.current = [];
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } });
    } else if (state.activeTool === "polyline" && state.drawingState.isDrawing && state.drawingState.currentPoints.length >= 2) {
      pushUndo();
      const ent = createEntity({ type: "polyline", points: state.drawingState.currentPoints, closed: false });
      dispatch({ type: "ADD_ENTITY", entity: ent });
      dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: false, startPoint: null, currentPoints: [], previewPoint: null } });
    } else if (state.activeTool === "spline" && state.drawingState.isDrawing && splinePoints.current.length >= 2) {
      pushUndo();
      const ent = createEntity({ type: "spline", controlPoints: [...splinePoints.current], degree: 3, closed: false });
      dispatch({ type: "ADD_ENTITY", entity: ent });
      dispatch({ type: "ADD_COMMAND", entry: { command: "SPLINE", timestamp: Date.now(), result: `Created spline with ${splinePoints.current.length} control points` } });
      splinePoints.current = [];
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
      if (e.key === "Escape") { offsetEntityRef.current = null; offsetDistRef.current = null; filletFirstRef.current = null; mirrorAxisStart.current = null; measurePoints.current = []; setMeasureResult(null); hatchBoundaryPts.current = []; blockInsertId.current = null; splinePoints.current = []; dispatch({ type: "DESELECT_ALL" }); dispatch({ type: "SET_TOOL", tool: "select" }); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (state.selectedEntityIds.length) { pushUndo(); dispatch({ type: "REMOVE_ENTITIES", ids: state.selectedEntityIds }); } return; }
      if (e.key === "T" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "trim" }); return; }
      if (e.key === "E" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "extend" }); return; }
      if (e.key === "C" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "copy" }); return; }
      if (e.key === "o" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "offset" }); return; }
      if (e.key === "R" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "rotate" }); return; }
      if (e.key === "S" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "scale" }); return; }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "fillet" }); return; }
      if (e.key === "h" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "hatch" }); return; }
      if (e.key === "B" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "block_group" }); return; }
      if (e.key === "I" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "block_insert" }); return; }
      if (e.key === "M" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "mirror" }); return; }
      if (e.key === "A" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "array_rect" }); return; }
      if (e.key === "P" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "array_polar" }); return; }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "spline" }); return; }
      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.shiftKey) { dispatch({ type: "SET_TOOL", tool: "xline" }); return; }
      if (e.key === "G" && e.shiftKey) { e.preventDefault(); dispatch({ type: "SET_TOOL", tool: "ray" }); return; }
      // Function keys
      if (e.key === "F3") { e.preventDefault(); dispatch({ type: "SET_SNAP_SETTINGS", settings: { enabled: !state.snapSettings.enabled } }); return; }
      if (e.key === "F7") { e.preventDefault(); dispatch({ type: "SET_GRID_SETTINGS", settings: { visible: !state.gridSettings.visible } }); return; }
      if (e.key === "F8") { e.preventDefault(); dispatch({ type: "TOGGLE_ORTHO" }); return; }
      if (e.key === "F9") { e.preventDefault(); dispatch({ type: "SET_GRID_SETTINGS", settings: { snapToGrid: !state.gridSettings.snapToGrid } }); return; }
      if (e.key === "F10") { e.preventDefault(); dispatch({ type: "TOGGLE_POLAR_TRACKING" }); return; }
      if (e.key === "F12") { e.preventDefault(); dispatch({ type: "TOGGLE_DYNAMIC_INPUT" }); return; }
      const keyMap: Record<string, any> = { v: "select", l: "line", c: "circle", a: "arc", r: "rectangle", p: "polyline", e: "ellipse", t: "text", d: "dimension", m: "move", x: "erase" };
      if (keyMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { dispatch({ type: "SET_TOOL", tool: keyMap[e.key.toLowerCase()] }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.entities, state.selectedEntityIds, dispatch, pushUndo]);

  const handleDynamicInputSubmit = useCallback((value: { distance?: number; angle?: number; x?: number; y?: number }) => {
    if (value.x !== undefined || value.y !== undefined) {
      // Absolute coordinate input — simulate a click at that world position
      const pt: Point = { x: value.x ?? mouseWorld.x, y: value.y ?? mouseWorld.y };
      // Dispatch as if user clicked that point
      const fakeEvent = { clientX: 0, clientY: 0, button: 0, preventDefault: () => {}, stopPropagation: () => {} } as any;
      // Set mouse world to the target and trigger drawing state
      setMouseWorld(pt);
      if (!state.drawingState.isDrawing) {
        dispatch({ type: "SET_DRAWING_STATE", state: { isDrawing: true, startPoint: pt, previewPoint: pt } });
      }
    } else if (value.distance !== undefined || value.angle !== undefined) {
      // Relative distance/angle from start point
      const sp = state.drawingState.startPoint;
      if (!sp) return;
      const dx = mouseWorld.x - sp.x;
      const dy = mouseWorld.y - sp.y;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const currentAngle = ((Math.atan2(-dy, dx) * 180 / Math.PI) + 360) % 360;
      const dist = value.distance ?? currentDist;
      const angleDeg = value.angle ?? currentAngle;
      const angleRad = angleDeg * Math.PI / 180;
      const pt: Point = { x: sp.x + dist * Math.cos(angleRad), y: sp.y - dist * Math.sin(angleRad) };
      setMouseWorld(pt);
      dispatch({ type: "SET_DRAWING_STATE", state: { previewPoint: pt } });
    }
  }, [mouseWorld, state.drawingState, dispatch]);

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
      <DynamicInput
        mouseScreenPos={mouseScreen}
        mouseWorldPos={mouseWorld}
        onSubmit={handleDynamicInputSubmit}
        canvasRect={canvasRect ? { width: canvasRect.width, height: canvasRect.height } as DOMRect : null}
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
    case "mirror": return "crosshair";
    case "hatch": return "crosshair";
    case "block_group": return "crosshair";
    case "block_insert": return "crosshair";
    case "array_rect": return "crosshair";
    case "array_polar": return "crosshair";
    case "spline": return "crosshair";
    case "xline": return "crosshair";
    case "ray": return "crosshair";
    case "measure_distance": return "crosshair";
    case "measure_area": return "crosshair";
    case "measure_angle": return "crosshair";
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
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x, e.y - off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x, s.y - off); ctx.lineTo(e.x, e.y - off); ctx.stroke();
      const arrowSize = 6;
      const angle = Math.atan2(0, e.x - s.x);
      drawArrow(ctx, s.x, s.y - off, angle, arrowSize);
      drawArrow(ctx, e.x, e.y - off, angle + Math.PI, arrowSize);
      ctx.fillStyle = selected ? "#3b82f6" : "#f59e0b";
      ctx.font = `${Math.max(10, 12 * zoom)}px 'Fira Code'`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(dist.toFixed(2), (s.x + e.x) / 2, (s.y + e.y) / 2 - off - 4);
      break;
    }
    case "hatch": {
      const canvasEl = ctx.canvas;
      drawHatchPattern(
        ctx, d.boundary, d.pattern, d.patternScale, d.patternAngle,
        selected ? "#3b82f6" : d.fillColor, d.fillOpacity,
        zoom, panX, panY, canvasEl.width / (window.devicePixelRatio || 1), canvasEl.height / (window.devicePixelRatio || 1)
      );
      // Draw boundary outline
      if (selected) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const bp0 = toScreen(d.boundary[0]);
        ctx.moveTo(bp0.x, bp0.y);
        for (let i = 1; i < d.boundary.length; i++) {
          const bp = toScreen(d.boundary[i]);
          ctx.lineTo(bp.x, bp.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    case "spline": {
      const sd = entity.data as SplineData;
      drawSpline(ctx, sd, entity.color, entity.lineWidth, entity.lineStyle, cx + panX, cy + panY, zoom, selected, selected);
      break;
    }
    case "xline": {
      const xd = entity.data as XLineData;
      const canvasEl = ctx.canvas;
      const cw = canvasEl.width / (window.devicePixelRatio || 1);
      const ch = canvasEl.height / (window.devicePixelRatio || 1);
      drawXLine(ctx, xd, selected ? "#3b82f6" : entity.color, entity.lineWidth, cx + panX, cy + panY, zoom, cw, ch);
      break;
    }
    case "ray": {
      const rd = entity.data as RayData;
      const canvasEl2 = ctx.canvas;
      const cw2 = canvasEl2.width / (window.devicePixelRatio || 1);
      const ch2 = canvasEl2.height / (window.devicePixelRatio || 1);
      drawRay(ctx, rd, selected ? "#3b82f6" : entity.color, entity.lineWidth, cx + panX, cy + panY, zoom, cw2, ch2);
      break;
    }
    case "blockref": {
      // Block references are rendered by expanding their child entities
      // The parent canvas loop handles this via getBlockRefEntities
      // Draw a small indicator at insert point
      const ip = toScreen(d.insertPoint);
      ctx.strokeStyle = selected ? "#3b82f6" : entity.color;
      ctx.lineWidth = 1;
      const sz = 6;
      ctx.beginPath();
      ctx.moveTo(ip.x - sz, ip.y); ctx.lineTo(ip.x + sz, ip.y);
      ctx.moveTo(ip.x, ip.y - sz); ctx.lineTo(ip.x, ip.y + sz);
      ctx.stroke();
      // Draw diamond marker
      ctx.beginPath();
      ctx.moveTo(ip.x, ip.y - sz); ctx.lineTo(ip.x + sz, ip.y);
      ctx.lineTo(ip.x, ip.y + sz); ctx.lineTo(ip.x - sz, ip.y);
      ctx.closePath();
      ctx.stroke();
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
    case "hatch": return { ...data, boundary: data.boundary.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case "blockref": return { ...data, insertPoint: { x: data.insertPoint.x + dx, y: data.insertPoint.y + dy } };
    case "spline": return moveSpline(data as SplineData, dx, dy);
    case "xline": return moveXLine(data as XLineData, dx, dy);
    case "ray": return moveRay(data as RayData, dx, dy);
    default: return null;
  }
}
