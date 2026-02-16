import { useCAD, useCADActions } from "@/contexts/CADContext";
import { ENTITY_COLORS, LINE_WIDTHS } from "@/lib/cad-types";
import type { HatchPattern } from "@/lib/cad-types";
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
  const { dispatch } = useCADActions();
  const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

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
      <div className="px-3 py-2 flex-1">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic">No selection</p>
        ) : selected.length > 1 ? (
          <p className="text-xs text-muted-foreground/60">{selected.length} entities selected</p>
        ) : single ? (
          <div className="space-y-2">
            <PropRow label="Type" value={single.type.toUpperCase()} />
            <PropRow label="Layer" value={state.layers.find(l => l.id === single.layerId)?.name || "—"} />
            <PropRow label="Color" value={single.color} color={single.color} />
            <PropRow label="Line Width" value={`${single.lineWidth}`} />
            <Separator className="opacity-10 my-2" />
            {single.data.type === "line" && <>
              <PropRow label="Start X" value={formatCoordinate(single.data.start.x)} />
              <PropRow label="Start Y" value={formatCoordinate(single.data.start.y)} />
              <PropRow label="End X" value={formatCoordinate(single.data.end.x)} />
              <PropRow label="End Y" value={formatCoordinate(single.data.end.y)} />
              <PropRow label="Length" value={formatDistance(distance(single.data.start, single.data.end))} />
              <PropRow label="Angle" value={formatAngle(angleDeg(single.data.start, single.data.end))} />
            </>}
            {single.data.type === "circle" && <>
              <PropRow label="Center X" value={formatCoordinate(single.data.center.x)} />
              <PropRow label="Center Y" value={formatCoordinate(single.data.center.y)} />
              <PropRow label="Radius" value={formatDistance(single.data.radius)} />
              <PropRow label="Area" value={formatDistance(Math.PI * single.data.radius ** 2)} />
            </>}
            {single.data.type === "rectangle" && <>
              <PropRow label="X" value={formatCoordinate(single.data.topLeft.x)} />
              <PropRow label="Y" value={formatCoordinate(single.data.topLeft.y)} />
              <PropRow label="Width" value={formatDistance(single.data.width)} />
              <PropRow label="Height" value={formatDistance(single.data.height)} />
              <PropRow label="Area" value={formatDistance(single.data.width * single.data.height)} />
            </>}
            {single.data.type === "polyline" && <>
              <PropRow label="Vertices" value={`${single.data.points.length}`} />
              <PropRow label="Closed" value={single.data.closed ? "Yes" : "No"} />
            </>}
            {single.data.type === "ellipse" && <>
              <PropRow label="Center X" value={formatCoordinate(single.data.center.x)} />
              <PropRow label="Center Y" value={formatCoordinate(single.data.center.y)} />
              <PropRow label="Radius X" value={formatDistance(single.data.radiusX)} />
              <PropRow label="Radius Y" value={formatDistance(single.data.radiusY)} />
            </>}
            {single.data.type === "text" && <>
              <PropRow label="X" value={formatCoordinate(single.data.position.x)} />
              <PropRow label="Y" value={formatCoordinate(single.data.position.y)} />
              <PropRow label="Content" value={single.data.content} />
              <PropRow label="Font Size" value={`${single.data.fontSize}`} />
            </>}
            {single.data.type === "dimension" && <>
              <PropRow label="Distance" value={formatDistance(distance(single.data.start, single.data.end))} />
            </>}
            {single.data.type === "hatch" && <>
              <PropRow label="Pattern" value={single.data.pattern} />
              <PropRow label="Boundary Pts" value={`${single.data.boundary.length}`} />
              <PropRow label="Scale" value={`${single.data.patternScale}`} />
              <PropRow label="Angle" value={`${single.data.patternAngle}°`} />
            </>}
            {single.data.type === "blockref" && <>
              <PropRow label="Block ID" value={single.data.blockId.slice(0, 12)} />
              <PropRow label="Insert X" value={formatCoordinate(single.data.insertPoint.x)} />
              <PropRow label="Insert Y" value={formatCoordinate(single.data.insertPoint.y)} />
              <PropRow label="Scale X" value={`${single.data.scaleX}`} />
              <PropRow label="Scale Y" value={`${single.data.scaleY}`} />
              <PropRow label="Rotation" value={`${single.data.rotation}°`} />
            </>}
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
