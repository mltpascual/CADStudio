// ============================================================
// DynamicInput — Floating input fields near cursor during drawing
// Like AutoCAD's Dynamic Input (F12)
// Shows distance + angle fields when drawing, or X/Y coordinate fields
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import type { Point } from "@/lib/cad-types";

interface DynamicInputProps {
  mouseScreenPos: Point;
  mouseWorldPos: Point;
  onSubmit: (value: { distance?: number; angle?: number; x?: number; y?: number }) => void;
  canvasRect: DOMRect | null;
}

export default function DynamicInput({ mouseScreenPos, mouseWorldPos, onSubmit, canvasRect }: DynamicInputProps) {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const isDrawing = state.drawingState.isDrawing;
  const startPoint = state.drawingState.startPoint;
  const enabled = state.dynamicInputEnabled;

  const [distValue, setDistValue] = useState("");
  const [angleValue, setAngleValue] = useState("");
  const [xValue, setXValue] = useState("");
  const [yValue, setYValue] = useState("");
  const [activeField, setActiveField] = useState<"dist" | "angle" | "x" | "y">("dist");
  const [isEditing, setIsEditing] = useState(false);

  const distRef = useRef<HTMLInputElement>(null);
  const angleRef = useRef<HTMLInputElement>(null);
  const xRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);

  // Drawing tools that use dynamic input
  const drawingTools = ["line", "circle", "arc", "rectangle", "polyline", "ellipse", "dimension", "spline", "xline", "ray"];
  const isDrawingTool = drawingTools.includes(state.activeTool);

  // Calculate distance and angle from start point
  const dx = startPoint ? mouseWorldPos.x - startPoint.x : 0;
  const dy = startPoint ? mouseWorldPos.y - startPoint.y : 0;
  const currentDist = Math.sqrt(dx * dx + dy * dy);
  const currentAngle = startPoint ? ((Math.atan2(-dy, dx) * 180 / Math.PI) + 360) % 360 : 0;

  // Reset when tool changes or drawing starts/stops
  useEffect(() => {
    setDistValue("");
    setAngleValue("");
    setXValue("");
    setYValue("");
    setIsEditing(false);
    setActiveField("dist");
  }, [state.activeTool, isDrawing]);

  // Handle Tab key to switch between fields
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled || !isDrawingTool) return;
    if (e.target instanceof HTMLInputElement && (e.target.closest(".dynamic-input-container"))) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (isDrawing && startPoint) {
          // Toggle between distance and angle
          if (activeField === "dist") {
            setActiveField("angle");
            setTimeout(() => angleRef.current?.focus(), 0);
          } else {
            setActiveField("dist");
            setTimeout(() => distRef.current?.focus(), 0);
          }
        } else {
          // Toggle between X and Y
          if (activeField === "x") {
            setActiveField("y");
            setTimeout(() => yRef.current?.focus(), 0);
          } else {
            setActiveField("x");
            setTimeout(() => xRef.current?.focus(), 0);
          }
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      }
      if (e.key === "Escape") {
        setIsEditing(false);
        setDistValue("");
        setAngleValue("");
        setXValue("");
        setYValue("");
      }
    }
  }, [enabled, isDrawingTool, isDrawing, startPoint, activeField]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const handleSubmit = () => {
    if (isDrawing && startPoint) {
      const dist = distValue ? parseFloat(distValue) : undefined;
      const angle = angleValue ? parseFloat(angleValue) : undefined;
      if (dist !== undefined || angle !== undefined) {
        onSubmit({ distance: dist, angle: angle });
        setDistValue("");
        setAngleValue("");
        setIsEditing(false);
      }
    } else {
      const x = xValue ? parseFloat(xValue) : undefined;
      const y = yValue ? parseFloat(yValue) : undefined;
      if (x !== undefined || y !== undefined) {
        onSubmit({ x, y });
        setXValue("");
        setYValue("");
        setIsEditing(false);
      }
    }
  };

  const handleInputFocus = (field: "dist" | "angle" | "x" | "y") => {
    setIsEditing(true);
    setActiveField(field);
  };

  if (!enabled || !isDrawingTool) return null;
  if (!canvasRect) return null;

  // Position the input below and to the right of the cursor
  const offsetX = 24;
  const offsetY = 28;
  let left = mouseScreenPos.x + offsetX;
  let top = mouseScreenPos.y + offsetY;

  // Keep within canvas bounds
  const inputWidth = 200;
  const inputHeight = 32;
  if (left + inputWidth > canvasRect.width) left = mouseScreenPos.x - inputWidth - 8;
  if (top + inputHeight > canvasRect.height) top = mouseScreenPos.y - inputHeight - 8;
  if (left < 4) left = 4;
  if (top < 4) top = 4;

  // Show distance/angle when drawing with a start point
  if (isDrawing && startPoint) {
    return (
      <div
        className="dynamic-input-container absolute pointer-events-auto z-50"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 rounded-md overflow-hidden shadow-lg border"
          style={{
            background: "var(--cad-panel-bg)",
            borderColor: "var(--cad-panel-border)",
          }}
        >
          {/* Distance field */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5">
            <span className="text-[10px] font-mono opacity-50 select-none" style={{ color: "var(--cad-text-secondary)" }}>D:</span>
            <input
              ref={distRef}
              type="text"
              inputMode="decimal"
              value={isEditing && activeField === "dist" ? distValue : currentDist.toFixed(2)}
              onChange={(e) => { setDistValue(e.target.value); setIsEditing(true); }}
              onFocus={() => handleInputFocus("dist")}
              className="w-16 bg-transparent text-[11px] font-mono outline-none text-right tabular-nums"
              style={{ color: activeField === "dist" && isEditing ? "#22d3ee" : "var(--cad-text-primary)" }}
              placeholder="0.00"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-4 opacity-20" style={{ background: "var(--cad-panel-border)" }} />

          {/* Angle field */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5">
            <span className="text-[10px] font-mono opacity-50 select-none" style={{ color: "var(--cad-text-secondary)" }}>∠:</span>
            <input
              ref={angleRef}
              type="text"
              inputMode="decimal"
              value={isEditing && activeField === "angle" ? angleValue : currentAngle.toFixed(1)}
              onChange={(e) => { setAngleValue(e.target.value); setIsEditing(true); }}
              onFocus={() => handleInputFocus("angle")}
              className="w-14 bg-transparent text-[11px] font-mono outline-none text-right tabular-nums"
              style={{ color: activeField === "angle" && isEditing ? "#22d3ee" : "var(--cad-text-primary)" }}
              placeholder="0.0"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-[10px] font-mono opacity-40 select-none" style={{ color: "var(--cad-text-secondary)" }}>°</span>
          </div>
        </div>

        {/* Hint */}
        {isEditing && (
          <div className="text-[9px] font-mono mt-0.5 opacity-40 text-center select-none" style={{ color: "var(--cad-text-secondary)" }}>
            Tab: switch · Enter: confirm
          </div>
        )}
      </div>
    );
  }

  // Show X/Y coordinates when not drawing (first point placement)
  if (isDrawingTool && !isDrawing) {
    return (
      <div
        className="dynamic-input-container absolute pointer-events-auto z-50"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 rounded-md overflow-hidden shadow-lg border"
          style={{
            background: "var(--cad-panel-bg)",
            borderColor: "var(--cad-panel-border)",
          }}
        >
          {/* X field */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5">
            <span className="text-[10px] font-mono opacity-50 select-none" style={{ color: "var(--cad-text-secondary)" }}>X:</span>
            <input
              ref={xRef}
              type="text"
              inputMode="decimal"
              value={isEditing && activeField === "x" ? xValue : mouseWorldPos.x.toFixed(2)}
              onChange={(e) => { setXValue(e.target.value); setIsEditing(true); }}
              onFocus={() => handleInputFocus("x")}
              className="w-16 bg-transparent text-[11px] font-mono outline-none text-right tabular-nums"
              style={{ color: activeField === "x" && isEditing ? "#22d3ee" : "var(--cad-text-primary)" }}
              placeholder="0.00"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-4 opacity-20" style={{ background: "var(--cad-panel-border)" }} />

          {/* Y field */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5">
            <span className="text-[10px] font-mono opacity-50 select-none" style={{ color: "var(--cad-text-secondary)" }}>Y:</span>
            <input
              ref={yRef}
              type="text"
              inputMode="decimal"
              value={isEditing && activeField === "y" ? yValue : mouseWorldPos.y.toFixed(2)}
              onChange={(e) => { setYValue(e.target.value); setIsEditing(true); }}
              onFocus={() => handleInputFocus("y")}
              className="w-16 bg-transparent text-[11px] font-mono outline-none text-right tabular-nums"
              style={{ color: activeField === "y" && isEditing ? "#22d3ee" : "var(--cad-text-primary)" }}
              placeholder="0.00"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Hint */}
        {isEditing && (
          <div className="text-[9px] font-mono mt-0.5 opacity-40 text-center select-none" style={{ color: "var(--cad-text-secondary)" }}>
            Tab: switch · Enter: place point
          </div>
        )}
      </div>
    );
  }

  return null;
}
