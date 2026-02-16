/**
 * SnapToolbar — Visual snap mode toggles for fast workflow.
 * Design: Horizontal bar between canvas and status bar with icon-based toggles.
 * Each snap mode is a small pill button with an SVG icon and label.
 */
import { useCAD, useCADActions } from "@/contexts/CADContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings2 } from "lucide-react";

interface SnapMode {
  key: keyof typeof snapKeyMap;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

const snapKeyMap = {
  endpointSnap: "endpointSnap",
  midpointSnap: "midpointSnap",
  centerSnap: "centerSnap",
  intersectionSnap: "intersectionSnap",
  perpendicularSnap: "perpendicularSnap",
  tangentSnap: "tangentSnap",
  nearestSnap: "nearestSnap",
  gridSnap: "gridSnap",
} as const;

// Custom SVG icons for snap modes — small, distinctive, and recognizable
function EndpointIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="8" height="8" />
    </svg>
  );
}

function MidpointIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 3L11 11H3Z" />
    </svg>
  );
}

function CenterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4" />
      <line x1="5" y1="7" x2="9" y2="7" />
      <line x1="7" y1="5" x2="7" y2="9" />
    </svg>
  );
}

function IntersectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="2" x2="12" y2="12" />
      <line x1="12" y1="2" x2="2" y2="12" />
    </svg>
  );
}

function PerpendicularIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="11" x2="11" y2="11" />
      <line x1="3" y1="11" x2="3" y2="3" />
      <rect x="3" y="8" width="3" height="3" fill="none" />
    </svg>
  );
}

function TangentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4" />
      <line x1="1" y1="3" x2="13" y2="3" />
    </svg>
  );
}

function NearestIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12L7 2L12 12" />
      <line x1="7" y1="7" x2="7" y2="12" strokeDasharray="2 1" />
    </svg>
  );
}

function GridSnapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
      <line x1="1" y1="4" x2="13" y2="4" />
      <line x1="1" y1="7" x2="13" y2="7" />
      <line x1="1" y1="10" x2="13" y2="10" />
      <line x1="4" y1="1" x2="4" y2="13" />
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="10" y1="1" x2="10" y2="13" />
    </svg>
  );
}

function PolarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="7" cy="7" r="5" strokeDasharray="2 1.5" />
      <line x1="7" y1="7" x2="12" y2="4" />
      <line x1="7" y1="7" x2="11" y2="10" />
      <line x1="7" y1="7" x2="7" y2="2" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

const snapModes: SnapMode[] = [
  { key: "endpointSnap", label: "Endpoint", shortLabel: "END", icon: <EndpointIcon /> },
  { key: "midpointSnap", label: "Midpoint", shortLabel: "MID", icon: <MidpointIcon /> },
  { key: "centerSnap", label: "Center", shortLabel: "CEN", icon: <CenterIcon /> },
  { key: "intersectionSnap", label: "Intersection", shortLabel: "INT", icon: <IntersectionIcon /> },
  { key: "perpendicularSnap", label: "Perpendicular", shortLabel: "PER", icon: <PerpendicularIcon /> },
  { key: "tangentSnap", label: "Tangent", shortLabel: "TAN", icon: <TangentIcon /> },
  { key: "nearestSnap", label: "Nearest", shortLabel: "NEA", icon: <NearestIcon /> },
  { key: "gridSnap", label: "Grid Snap", shortLabel: "GRID", icon: <GridSnapIcon /> },
];

export default function SnapToolbar() {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const snap = state.snapSettings;
  const grid = state.gridSettings;

  const toggleSnap = (key: string) => {
    dispatch({ type: "SET_SNAP_SETTINGS", settings: { [key]: !(snap as any)[key] } });
  };

  const toggleMasterSnap = () => {
    dispatch({ type: "SET_SNAP_SETTINGS", settings: { enabled: !snap.enabled } });
  };

  const updateGrid = (key: string, value: number | boolean) => {
    dispatch({ type: "SET_GRID_SETTINGS", settings: { [key]: value } });
  };

  return (
    <div
      className="flex items-center h-7 px-2 gap-0.5 border-t select-none overflow-x-auto"
      style={{
        background: "var(--cad-toolbar-bg)",
        borderColor: "var(--cad-panel-border)",
      }}
    >
      {/* Master OSNAP toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`snap-toggle-btn master ${snap.enabled ? "active" : ""}`}
            onClick={toggleMasterSnap}
          >
            <span className="snap-toggle-label">OSNAP</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {snap.enabled ? "Disable" : "Enable"} Object Snap (F3)
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-1 opacity-20" />

      {/* Individual snap mode toggles */}
      {snapModes.map((mode) => {
        const isActive = (snap as any)[mode.key];
        const isDisabled = !snap.enabled;
        return (
          <Tooltip key={mode.key}>
            <TooltipTrigger asChild>
              <button
                className={`snap-toggle-btn ${isActive ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
                onClick={() => toggleSnap(mode.key)}
                disabled={isDisabled}
              >
                {mode.icon}
                <span className="snap-toggle-label">{mode.shortLabel}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {mode.label} {isActive ? "(ON)" : "(OFF)"}
            </TooltipContent>
          </Tooltip>
        );
      })}

      <Separator orientation="vertical" className="h-4 mx-1 opacity-20" />

      {/* Grid controls */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`snap-toggle-btn ${grid.visible ? "active" : ""}`}
            onClick={() => updateGrid("visible", !grid.visible)}
          >
            <GridSnapIcon />
            <span className="snap-toggle-label">GRID</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {grid.visible ? "Hide" : "Show"} Grid (F7)
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`snap-toggle-btn ${grid.snapToGrid ? "active" : ""}`}
            onClick={() => updateGrid("snapToGrid", !grid.snapToGrid)}
          >
            <span className="snap-toggle-label">GSNAP</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {grid.snapToGrid ? "Disable" : "Enable"} Grid Snap (F9)
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`snap-toggle-btn ${state.orthoMode ? "active" : ""}`}
            onClick={() => dispatch({ type: "TOGGLE_ORTHO" })}
          >
            <span className="snap-toggle-label">ORTHO</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {state.orthoMode ? "Disable" : "Enable"} Ortho Mode (F8)
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-1 opacity-20" />

      {/* Polar Tracking toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`snap-toggle-btn ${state.polarTracking.enabled ? "active" : ""}`}
            onClick={() => dispatch({ type: "TOGGLE_POLAR_TRACKING" })}
          >
            <PolarIcon />
            <span className="snap-toggle-label">POLAR</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {state.polarTracking.enabled ? "Disable" : "Enable"} Polar Tracking (F10)
        </TooltipContent>
      </Tooltip>

      {/* Polar increment selector */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`snap-toggle-btn text-[10px] tabular-nums ${state.polarTracking.enabled ? "" : "disabled"}`}
            disabled={!state.polarTracking.enabled}
          >
            {state.polarTracking.increment}°
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="w-44 p-3 bg-card text-card-foreground border-border"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Polar Increment</h4>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 15, 22.5, 30, 45, 60, 90].map((angle) => (
              <button
                key={angle}
                className={`px-1.5 py-1 text-xs rounded border transition-colors ${
                  state.polarTracking.increment === angle
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-input border-border text-foreground hover:bg-accent"
                }`}
                onClick={() => dispatch({ type: "SET_POLAR_TRACKING", settings: { increment: angle } })}
              >
                {angle}°
              </button>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={state.polarTracking.trackFromLastPoint}
                onChange={(e) => dispatch({ type: "SET_POLAR_TRACKING", settings: { trackFromLastPoint: e.target.checked } })}
                className="rounded border-border"
              />
              Track from last point
            </label>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1" />

      {/* Grid settings popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="snap-toggle-btn" title="Grid & Snap Settings">
            <Settings2 size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-56 p-3 bg-card text-card-foreground border-border"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Grid Settings</h4>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Grid Spacing</Label>
              <input
                type="number"
                value={grid.spacing}
                onChange={(e) => updateGrid("spacing", Math.max(1, parseInt(e.target.value) || 10))}
                className="w-14 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground text-right focus:outline-none focus:border-primary/50"
                min={1}
                max={100}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Major Every</Label>
              <input
                type="number"
                value={grid.majorEvery}
                onChange={(e) => updateGrid("majorEvery", Math.max(1, parseInt(e.target.value) || 5))}
                className="w-14 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground text-right focus:outline-none focus:border-primary/50"
                min={1}
                max={20}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
