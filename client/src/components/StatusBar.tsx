import { useCAD } from "@/contexts/CADContext";

export default function StatusBar() {
  const { state } = useCAD();
  const activeLayer = state.layers.find(l => l.id === state.activeLayerId);

  return (
    <div className="flex items-center h-6 px-3 gap-4 border-t select-none" style={{ background: "var(--cad-statusbar-bg, var(--cad-toolbar-bg))", borderColor: "var(--cad-panel-border)" }}>
      <StatusItem label="Tool" value={state.activeTool.toUpperCase()} />
      <StatusItem label="Layer" value={activeLayer?.name || "—"} color={activeLayer?.color} />
      <StatusItem label="Color" value="" color={state.activeColor} />
      <StatusItem label="LW" value={`${state.activeLineWidth}`} />
      <Indicator label="ORTHO" active={state.orthoMode} />
      <Indicator label="SNAP" active={state.snapSettings.enabled} />
      <Indicator label="GRID" active={state.gridSettings.visible} />
      <div className="flex-1" />
      <span className="cad-mono text-muted-foreground/40">{state.entities.length} entities</span>
      <span className="cad-mono text-muted-foreground/40">Zoom: {(state.viewState.zoom * 100).toFixed(0)}%</span>
    </div>
  );
}

function StatusItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-muted-foreground/30 uppercase">{label}</span>
      {color && <div className="w-2.5 h-2.5 rounded-sm border border-white/10" style={{ backgroundColor: color }} />}
      {value && <span className="cad-mono text-foreground/60">{value}</span>}
    </div>
  );
}

function Indicator({ label, active }: { label: string; active: boolean }) {
  return <span className={`cad-mono px-1.5 py-0.5 rounded text-[9px] transition-colors ${active ? "bg-primary/20 text-primary" : "text-muted-foreground/30"}`}>{label}</span>;
}
