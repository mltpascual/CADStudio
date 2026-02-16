import { useState, useEffect, useCallback } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import { ENTITY_COLORS, LINE_WIDTHS } from "@/lib/cad-types";
import type { HatchPattern, CADEntity, EntityData, Point } from "@/lib/cad-types";
import { distance, formatCoordinate, formatDistance, formatAngle, angleDeg } from "@/lib/cad-utils";
import { Separator } from "@/components/ui/separator";

const HATCH_PATTERNS: { id: HatchPattern; label: string }[] = [
  { id: "crosshatch", label: "Crosshatch" },
  { id: "diagonal", label: "Diagonal" },
  { id: "horizontal", label: "Horizontal" },
  { id: "vertical", label: "Vertical" },
  { id: "dots", label: "Dots" },
  { id: "brick", label: "Brick" },
  { id: "solid", label: "Solid" },
];

export default function PropertiesPanel() {
  const { state } = useCAD();
  const { dispatch, pushUndo } = useCADActions();
  const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

  const updateEntityData = useCallback((id: string, dataUpdates: Partial<EntityData>) => {
    const entity = state.entities.find(e => e.id === id);
    if (!entity) return;
    pushUndo();
    dispatch({ type: "UPDATE_ENTITY", id, updates: { data: { ...entity.data, ...dataUpdates } as EntityData } });
  }, [state.entities, dispatch, pushUndo]);

  const updateEntityProp = useCallback((id: string, updates: Partial<CADEntity>) => {
    pushUndo();
    dispatch({ type: "UPDATE_ENTITY", id, updates });
  }, [dispatch, pushUndo]);

  return (
    <div className="flex flex-col border-l h-full overflow-y-auto" style={{ background: "var(--cad-panel-bg)", borderColor: "var(--cad-panel-border)", width: "240px" }}>
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--cad-panel-border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drawing Settings</span>
      </div>
      <div className="px-3 py-2 space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Color</label>
          <div className="flex flex-wrap gap-1">
            {ENTITY_COLORS.map(color => (
              <button key={color} className={`w-5 h-5 rounded-sm border transition-all ${state.activeColor === color ? "border-foreground scale-110 ring-1 ring-primary" : "border-border hover:border-foreground/30"}`} style={{ backgroundColor: color }} onClick={() => dispatch({ type: "SET_COLOR", color })} />
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Line Width</label>
          <div className="flex gap-1">
            {LINE_WIDTHS.map(w => (
              <button key={w} className={`flex-1 py-1 text-[10px] rounded border transition-colors ${state.activeLineWidth === w ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`} onClick={() => dispatch({ type: "SET_LINE_WIDTH", width: w })}>{w}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Line Style</label>
          <div className="flex gap-1">
            {(["solid", "dashed", "dotted", "dashdot"] as const).map(style => (
              <button key={style} className={`flex-1 py-1 text-[10px] rounded border transition-colors ${state.activeLineStyle === style ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`} onClick={() => dispatch({ type: "SET_LINE_STYLE", style })}>{style === "dashdot" ? "D-D" : style.charAt(0).toUpperCase() + style.slice(1, 4)}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Active Layer</label>
          <select value={state.activeLayerId} onChange={e => dispatch({ type: "SET_ACTIVE_LAYER", layerId: e.target.value })} className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50">
            {state.layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Hatch Pattern</label>
          <select value={state.activeHatchPattern} onChange={e => dispatch({ type: "SET_HATCH_PATTERN", pattern: e.target.value as HatchPattern })} className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50">
            {HATCH_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <Separator className="opacity-20" />
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--cad-panel-border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Properties</span>
      </div>
      <div className="px-3 py-2 flex-1 overflow-y-auto">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic">No selection</p>
        ) : selected.length > 1 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground/60">{selected.length} entities selected</p>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Batch Color</label>
              <div className="flex flex-wrap gap-1">
                {ENTITY_COLORS.map(color => (
                  <button key={color} className="w-4 h-4 rounded-sm border border-border hover:border-foreground/30 transition-all" style={{ backgroundColor: color }} onClick={() => {
                    pushUndo();
                    selected.forEach(e => dispatch({ type: "UPDATE_ENTITY", id: e.id, updates: { color } }));
                  }} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Batch Layer</label>
              <select onChange={e => {
                pushUndo();
                selected.forEach(ent => dispatch({ type: "UPDATE_ENTITY", id: ent.id, updates: { layerId: e.target.value } }));
              }} className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50" defaultValue="">
                <option value="" disabled>Move to layer...</option>
                {state.layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        ) : single ? (
          <div className="space-y-2">
            <PropRow label="Type" value={single.type.toUpperCase()} />
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Layer</label>
              <select value={single.layerId} onChange={e => updateEntityProp(single.id, { layerId: e.target.value })} className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50">
                {state.layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Color</label>
              <div className="flex flex-wrap gap-1">
                {ENTITY_COLORS.map(color => (
                  <button key={color} className={`w-4 h-4 rounded-sm border transition-all ${single.color === color ? "border-foreground scale-110 ring-1 ring-primary" : "border-border hover:border-foreground/30"}`} style={{ backgroundColor: color }} onClick={() => updateEntityProp(single.id, { color })} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Line Width</label>
              <div className="flex gap-1">
                {LINE_WIDTHS.map(w => (
                  <button key={w} className={`flex-1 py-0.5 text-[9px] rounded border transition-colors ${single.lineWidth === w ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`} onClick={() => updateEntityProp(single.id, { lineWidth: w })}>{w}</button>
                ))}
              </div>
            </div>
            <Separator className="opacity-10 my-2" />

            {/* LINE */}
            {single.data.type === "line" && (
              <LineEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* CIRCLE */}
            {single.data.type === "circle" && (
              <CircleEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* ARC */}
            {single.data.type === "arc" && (
              <ArcEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* RECTANGLE */}
            {single.data.type === "rectangle" && (
              <RectangleEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* POLYLINE */}
            {single.data.type === "polyline" && (
              <PolylineEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* ELLIPSE */}
            {single.data.type === "ellipse" && (
              <EllipseEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* TEXT */}
            {single.data.type === "text" && (
              <TextEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* DIMENSION */}
            {single.data.type === "dimension" && (
              <DimensionEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* HATCH */}
            {single.data.type === "hatch" && (
              <HatchEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* SPLINE */}
            {single.data.type === "spline" && (
              <SplineEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* XLINE */}
            {single.data.type === "xline" && (
              <XLineEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* RAY */}
            {single.data.type === "ray" && (
              <RayEditor entity={single} onUpdate={updateEntityData} />
            )}

            {/* BLOCKREF */}
            {single.data.type === "blockref" && (
              <BlockRefEditor entity={single} onUpdate={updateEntityData} />
            )}
          </div>
        ) : null}
      </div>
      <div className="px-3 py-2 border-t" style={{ borderColor: "var(--cad-panel-border)" }}>
        <div className="flex justify-between text-[10px] text-muted-foreground/40">
          <span>Entities: {state.entities.length}</span>
          <span>Selected: {state.selectedEntityIds.length}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Editable input component
// ============================================================

function EditableField({ label, value, onChange, suffix, type = "number" }: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  suffix?: string;
  type?: "number" | "text";
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(String(value));

  useEffect(() => {
    if (!editing) setLocalVal(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (localVal !== String(value)) {
      onChange(localVal);
    }
  };

  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex items-center gap-0.5">
        {editing ? (
          <input
            autoFocus
            type={type === "number" ? "text" : "text"}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocalVal(String(value)); setEditing(false); } }}
            className="w-20 bg-input border border-primary/50 rounded px-1.5 py-0.5 text-[11px] cad-mono text-foreground focus:outline-none text-right"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-20 bg-transparent hover:bg-input/50 border border-transparent hover:border-border rounded px-1.5 py-0.5 text-[11px] cad-mono text-foreground/80 text-right transition-colors"
            title="Click to edit"
          >
            {type === "number" ? formatCoordinate(Number(value)) : String(value)}
          </button>
        )}
        {suffix && <span className="text-[9px] text-muted-foreground/40">{suffix}</span>}
      </div>
    </div>
  );
}

function PropRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        {color && <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />}
        <span className="cad-mono text-foreground/80">{value}</span>
      </div>
    </div>
  );
}

function ReadonlyField({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</span>
      <span className="cad-mono text-foreground/60 text-[11px]">{value}{suffix ? ` ${suffix}` : ""}</span>
    </div>
  );
}

// ============================================================
// Entity-specific editors
// ============================================================

function LineEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "line"; start: Point; end: Point };
  return (
    <div className="space-y-1.5">
      <EditableField label="Start X" value={d.start.x} onChange={v => onUpdate(entity.id, { start: { ...d.start, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Start Y" value={d.start.y} onChange={v => onUpdate(entity.id, { start: { ...d.start, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="End X" value={d.end.x} onChange={v => onUpdate(entity.id, { end: { ...d.end, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="End Y" value={d.end.y} onChange={v => onUpdate(entity.id, { end: { ...d.end, y: parseFloat(v) || 0 } } as any)} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Length" value={formatDistance(distance(d.start, d.end))} />
      <ReadonlyField label="Angle" value={formatAngle(angleDeg(d.start, d.end))} />
    </div>
  );
}

function CircleEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "circle"; center: Point; radius: number };
  return (
    <div className="space-y-1.5">
      <EditableField label="Center X" value={d.center.x} onChange={v => onUpdate(entity.id, { center: { ...d.center, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Center Y" value={d.center.y} onChange={v => onUpdate(entity.id, { center: { ...d.center, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Radius" value={d.radius} onChange={v => { const r = parseFloat(v); if (r > 0) onUpdate(entity.id, { radius: r } as any); }} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Diameter" value={formatDistance(d.radius * 2)} />
      <ReadonlyField label="Circumf." value={formatDistance(2 * Math.PI * d.radius)} />
      <ReadonlyField label="Area" value={formatDistance(Math.PI * d.radius ** 2)} />
    </div>
  );
}

function ArcEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "arc"; center: Point; radius: number; startAngle: number; endAngle: number };
  // Angles stored in radians, display in degrees
  const startDeg = d.startAngle * 180 / Math.PI;
  const endDeg = d.endAngle * 180 / Math.PI;
  return (
    <div className="space-y-1.5">
      <EditableField label="Center X" value={d.center.x} onChange={v => onUpdate(entity.id, { center: { ...d.center, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Center Y" value={d.center.y} onChange={v => onUpdate(entity.id, { center: { ...d.center, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Radius" value={d.radius} onChange={v => { const r = parseFloat(v); if (r > 0) onUpdate(entity.id, { radius: r } as any); }} />
      <EditableField label="Start ∠" value={startDeg.toFixed(2)} onChange={v => onUpdate(entity.id, { startAngle: (parseFloat(v) || 0) * Math.PI / 180 } as any)} suffix="°" />
      <EditableField label="End ∠" value={endDeg.toFixed(2)} onChange={v => onUpdate(entity.id, { endAngle: (parseFloat(v) || 0) * Math.PI / 180 } as any)} suffix="°" />
      <Separator className="opacity-10" />
      <ReadonlyField label="Arc Len" value={formatDistance(Math.abs(d.endAngle - d.startAngle) * d.radius)} />
    </div>
  );
}

function RectangleEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "rectangle"; topLeft: Point; width: number; height: number };
  return (
    <div className="space-y-1.5">
      <EditableField label="X" value={d.topLeft.x} onChange={v => onUpdate(entity.id, { topLeft: { ...d.topLeft, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Y" value={d.topLeft.y} onChange={v => onUpdate(entity.id, { topLeft: { ...d.topLeft, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Width" value={d.width} onChange={v => { const w = parseFloat(v); if (w > 0) onUpdate(entity.id, { width: w } as any); }} />
      <EditableField label="Height" value={d.height} onChange={v => { const h = parseFloat(v); if (h > 0) onUpdate(entity.id, { height: h } as any); }} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Perimeter" value={formatDistance(2 * (d.width + d.height))} />
      <ReadonlyField label="Area" value={formatDistance(d.width * d.height)} />
    </div>
  );
}

function PolylineEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "polyline"; points: Point[]; closed: boolean };
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-1.5">
      <ReadonlyField label="Vertices" value={`${d.points.length}`} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Closed</span>
        <button
          onClick={() => onUpdate(entity.id, { closed: !d.closed } as any)}
          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${d.closed ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`}
        >
          {d.closed ? "Yes" : "No"}
        </button>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-[10px] text-primary/70 hover:text-primary py-0.5 transition-colors"
      >
        {expanded ? "▾ Hide vertices" : "▸ Edit vertices"}
      </button>
      {expanded && (
        <div className="space-y-1 max-h-40 overflow-y-auto border border-border/30 rounded p-1.5">
          {d.points.map((pt, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground/40 w-4 shrink-0">V{i}</span>
              <input
                type="text"
                value={formatCoordinate(pt.x)}
                onChange={e => {
                  const newPts = [...d.points];
                  newPts[i] = { ...newPts[i], x: parseFloat(e.target.value) || 0 };
                  onUpdate(entity.id, { points: newPts } as any);
                }}
                className="w-16 bg-input border border-border rounded px-1 py-0.5 text-[10px] cad-mono text-foreground focus:outline-none focus:border-primary/50 text-right"
              />
              <input
                type="text"
                value={formatCoordinate(pt.y)}
                onChange={e => {
                  const newPts = [...d.points];
                  newPts[i] = { ...newPts[i], y: parseFloat(e.target.value) || 0 };
                  onUpdate(entity.id, { points: newPts } as any);
                }}
                className="w-16 bg-input border border-border rounded px-1 py-0.5 text-[10px] cad-mono text-foreground focus:outline-none focus:border-primary/50 text-right"
              />
              {d.points.length > 2 && (
                <button
                  onClick={() => {
                    const newPts = d.points.filter((_, idx) => idx !== i);
                    onUpdate(entity.id, { points: newPts } as any);
                  }}
                  className="text-[10px] text-destructive/60 hover:text-destructive transition-colors"
                  title="Remove vertex"
                >×</button>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              const last = d.points[d.points.length - 1];
              const newPts = [...d.points, { x: last.x + 20, y: last.y }];
              onUpdate(entity.id, { points: newPts } as any);
            }}
            className="w-full text-[10px] text-primary/60 hover:text-primary py-0.5 border border-dashed border-border/40 rounded transition-colors"
          >+ Add vertex</button>
        </div>
      )}
      <Separator className="opacity-10" />
      <ReadonlyField label="Perimeter" value={formatDistance(
        d.points.reduce((sum, pt, i) => {
          const next = d.points[(i + 1) % d.points.length];
          return i < d.points.length - 1 || d.closed ? sum + distance(pt, next) : sum;
        }, 0)
      )} />
    </div>
  );
}

function EllipseEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "ellipse"; center: Point; radiusX: number; radiusY: number; rotation: number };
  return (
    <div className="space-y-1.5">
      <EditableField label="Center X" value={d.center.x} onChange={v => onUpdate(entity.id, { center: { ...d.center, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Center Y" value={d.center.y} onChange={v => onUpdate(entity.id, { center: { ...d.center, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Radius X" value={d.radiusX} onChange={v => { const r = parseFloat(v); if (r > 0) onUpdate(entity.id, { radiusX: r } as any); }} />
      <EditableField label="Radius Y" value={d.radiusY} onChange={v => { const r = parseFloat(v); if (r > 0) onUpdate(entity.id, { radiusY: r } as any); }} />
      <EditableField label="Rotation" value={d.rotation} onChange={v => onUpdate(entity.id, { rotation: parseFloat(v) || 0 } as any)} suffix="°" />
      <Separator className="opacity-10" />
      <ReadonlyField label="Area" value={formatDistance(Math.PI * d.radiusX * d.radiusY)} />
    </div>
  );
}

function TextEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "text"; position: Point; content: string; fontSize: number; rotation: number };
  return (
    <div className="space-y-1.5">
      <EditableField label="X" value={d.position.x} onChange={v => onUpdate(entity.id, { position: { ...d.position, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Y" value={d.position.y} onChange={v => onUpdate(entity.id, { position: { ...d.position, y: parseFloat(v) || 0 } } as any)} />
      <div>
        <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider block mb-0.5">Content</label>
        <input
          type="text"
          value={d.content}
          onChange={e => onUpdate(entity.id, { content: e.target.value } as any)}
          className="w-full bg-input border border-border rounded px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/50"
        />
      </div>
      <EditableField label="Font Size" value={d.fontSize} onChange={v => { const s = parseFloat(v); if (s > 0) onUpdate(entity.id, { fontSize: s } as any); }} />
      <EditableField label="Rotation" value={d.rotation} onChange={v => onUpdate(entity.id, { rotation: parseFloat(v) || 0 } as any)} suffix="°" />
    </div>
  );
}

function DimensionEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "dimension"; start: Point; end: Point; offset: number };
  return (
    <div className="space-y-1.5">
      <EditableField label="Start X" value={d.start.x} onChange={v => onUpdate(entity.id, { start: { ...d.start, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Start Y" value={d.start.y} onChange={v => onUpdate(entity.id, { start: { ...d.start, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="End X" value={d.end.x} onChange={v => onUpdate(entity.id, { end: { ...d.end, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="End Y" value={d.end.y} onChange={v => onUpdate(entity.id, { end: { ...d.end, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Offset" value={d.offset} onChange={v => onUpdate(entity.id, { offset: parseFloat(v) || 20 } as any)} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Distance" value={formatDistance(distance(d.start, d.end))} />
    </div>
  );
}

function HatchEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "hatch"; boundary: Point[]; pattern: HatchPattern; patternScale: number; patternAngle: number; fillColor: string; fillOpacity: number };
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider block mb-0.5">Pattern</label>
        <select value={d.pattern} onChange={e => onUpdate(entity.id, { pattern: e.target.value } as any)} className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50">
          {HATCH_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <EditableField label="Scale" value={d.patternScale} onChange={v => { const s = parseFloat(v); if (s > 0) onUpdate(entity.id, { patternScale: s } as any); }} />
      <EditableField label="Angle" value={d.patternAngle} onChange={v => onUpdate(entity.id, { patternAngle: parseFloat(v) || 0 } as any)} suffix="°" />
      <EditableField label="Opacity" value={d.fillOpacity} onChange={v => { const o = parseFloat(v); if (o >= 0 && o <= 1) onUpdate(entity.id, { fillOpacity: o } as any); }} />
      <ReadonlyField label="Boundary" value={`${d.boundary.length} pts`} />
    </div>
  );
}

function SplineEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "spline"; controlPoints: Point[]; degree: number; closed: boolean };
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-1.5">
      <ReadonlyField label="Ctrl Points" value={`${d.controlPoints.length}`} />
      <EditableField label="Degree" value={d.degree} onChange={v => { const deg = parseInt(v); if (deg >= 1 && deg <= 5) onUpdate(entity.id, { degree: deg } as any); }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Closed</span>
        <button
          onClick={() => onUpdate(entity.id, { closed: !d.closed } as any)}
          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${d.closed ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`}
        >
          {d.closed ? "Yes" : "No"}
        </button>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-[10px] text-primary/70 hover:text-primary py-0.5 transition-colors"
      >
        {expanded ? "▾ Hide points" : "▸ Edit points"}
      </button>
      {expanded && (
        <div className="space-y-1 max-h-40 overflow-y-auto border border-border/30 rounded p-1.5">
          {d.controlPoints.map((pt, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground/40 w-4 shrink-0">P{i}</span>
              <input
                type="text"
                value={formatCoordinate(pt.x)}
                onChange={e => {
                  const newPts = [...d.controlPoints];
                  newPts[i] = { ...newPts[i], x: parseFloat(e.target.value) || 0 };
                  onUpdate(entity.id, { controlPoints: newPts } as any);
                }}
                className="w-16 bg-input border border-border rounded px-1 py-0.5 text-[10px] cad-mono text-foreground focus:outline-none focus:border-primary/50 text-right"
              />
              <input
                type="text"
                value={formatCoordinate(pt.y)}
                onChange={e => {
                  const newPts = [...d.controlPoints];
                  newPts[i] = { ...newPts[i], y: parseFloat(e.target.value) || 0 };
                  onUpdate(entity.id, { controlPoints: newPts } as any);
                }}
                className="w-16 bg-input border border-border rounded px-1 py-0.5 text-[10px] cad-mono text-foreground focus:outline-none focus:border-primary/50 text-right"
              />
              {d.controlPoints.length > 2 && (
                <button
                  onClick={() => {
                    const newPts = d.controlPoints.filter((_, idx) => idx !== i);
                    onUpdate(entity.id, { controlPoints: newPts } as any);
                  }}
                  className="text-[10px] text-destructive/60 hover:text-destructive transition-colors"
                  title="Remove point"
                >×</button>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              const last = d.controlPoints[d.controlPoints.length - 1];
              const newPts = [...d.controlPoints, { x: last.x + 20, y: last.y }];
              onUpdate(entity.id, { controlPoints: newPts } as any);
            }}
            className="w-full text-[10px] text-primary/60 hover:text-primary py-0.5 border border-dashed border-border/40 rounded transition-colors"
          >+ Add point</button>
        </div>
      )}
    </div>
  );
}

function XLineEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "xline"; basePoint: Point; direction: Point };
  return (
    <div className="space-y-1.5">
      <EditableField label="Base X" value={d.basePoint.x} onChange={v => onUpdate(entity.id, { basePoint: { ...d.basePoint, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Base Y" value={d.basePoint.y} onChange={v => onUpdate(entity.id, { basePoint: { ...d.basePoint, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Dir X" value={d.direction.x} onChange={v => onUpdate(entity.id, { direction: { ...d.direction, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Dir Y" value={d.direction.y} onChange={v => onUpdate(entity.id, { direction: { ...d.direction, y: parseFloat(v) || 0 } } as any)} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Angle" value={formatAngle(Math.atan2(d.direction.y - d.basePoint.y, d.direction.x - d.basePoint.x) * 180 / Math.PI)} />
    </div>
  );
}

function RayEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "ray"; basePoint: Point; direction: Point };
  return (
    <div className="space-y-1.5">
      <EditableField label="Base X" value={d.basePoint.x} onChange={v => onUpdate(entity.id, { basePoint: { ...d.basePoint, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Base Y" value={d.basePoint.y} onChange={v => onUpdate(entity.id, { basePoint: { ...d.basePoint, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Dir X" value={d.direction.x} onChange={v => onUpdate(entity.id, { direction: { ...d.direction, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Dir Y" value={d.direction.y} onChange={v => onUpdate(entity.id, { direction: { ...d.direction, y: parseFloat(v) || 0 } } as any)} />
      <Separator className="opacity-10" />
      <ReadonlyField label="Angle" value={formatAngle(Math.atan2(d.direction.y - d.basePoint.y, d.direction.x - d.basePoint.x) * 180 / Math.PI)} />
    </div>
  );
}

function BlockRefEditor({ entity, onUpdate }: { entity: CADEntity; onUpdate: (id: string, data: Partial<EntityData>) => void }) {
  const d = entity.data as { type: "blockref"; blockId: string; insertPoint: Point; scaleX: number; scaleY: number; rotation: number };
  return (
    <div className="space-y-1.5">
      <ReadonlyField label="Block ID" value={d.blockId.slice(0, 12)} />
      <EditableField label="Insert X" value={d.insertPoint.x} onChange={v => onUpdate(entity.id, { insertPoint: { ...d.insertPoint, x: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Insert Y" value={d.insertPoint.y} onChange={v => onUpdate(entity.id, { insertPoint: { ...d.insertPoint, y: parseFloat(v) || 0 } } as any)} />
      <EditableField label="Scale X" value={d.scaleX} onChange={v => { const s = parseFloat(v); if (s !== 0) onUpdate(entity.id, { scaleX: s } as any); }} />
      <EditableField label="Scale Y" value={d.scaleY} onChange={v => { const s = parseFloat(v); if (s !== 0) onUpdate(entity.id, { scaleY: s } as any); }} />
      <EditableField label="Rotation" value={d.rotation} onChange={v => onUpdate(entity.id, { rotation: parseFloat(v) || 0 } as any)} suffix="°" />
    </div>
  );
}
