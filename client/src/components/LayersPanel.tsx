import { useState } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { ENTITY_COLORS } from "@/lib/cad-types";
import { generateId } from "@/lib/cad-utils";

export default function LayersPanel() {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const [newLayerName, setNewLayerName] = useState("");

  const handleAddLayer = () => {
    const name = newLayerName.trim() || `Layer ${state.layers.length}`;
    dispatch({ type: "ADD_LAYER", layer: { id: `layer-${generateId()}`, name, color: ENTITY_COLORS[state.layers.length % ENTITY_COLORS.length], visible: true, locked: false, active: false } });
    setNewLayerName("");
  };

  const entityCount = state.entities.reduce<Record<string, number>>((acc, e) => { acc[e.layerId] = (acc[e.layerId] || 0) + 1; return acc; }, {});

  return (
    <div className="flex flex-col border-l h-full" style={{ background: "var(--cad-panel-bg)", borderColor: "var(--cad-panel-border)", width: "220px" }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--cad-panel-border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layers</span>
        <button className="cad-toolbar-btn !w-6 !h-6" onClick={handleAddLayer} title="Add Layer"><Plus size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {state.layers.map(layer => (
          <div key={layer.id} className={`flex items-center gap-1.5 px-2 py-1.5 border-b cursor-pointer transition-colors ${layer.active ? "bg-primary/10 border-primary/20" : "hover:bg-accent/30 border-transparent"}`} style={{ borderBottomColor: "var(--cad-panel-border)" }} onClick={() => dispatch({ type: "SET_ACTIVE_LAYER", layerId: layer.id })}>
            <div className="w-3 h-3 rounded-sm flex-shrink-0 border border-border" style={{ backgroundColor: layer.color }} />
            <span className="text-xs flex-1 truncate" style={{ color: layer.active ? "var(--foreground)" : "var(--muted-foreground)" }}>{layer.name}</span>
            <span className="cad-mono text-muted-foreground/40 text-[10px]">{entityCount[layer.id] || 0}</span>
            <button className="cad-toolbar-btn !w-5 !h-5" onClick={e => { e.stopPropagation(); dispatch({ type: "UPDATE_LAYER", id: layer.id, updates: { visible: !layer.visible } }); }} title={layer.visible ? "Hide" : "Show"}>
              {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            <button className="cad-toolbar-btn !w-5 !h-5" onClick={e => { e.stopPropagation(); dispatch({ type: "UPDATE_LAYER", id: layer.id, updates: { locked: !layer.locked } }); }} title={layer.locked ? "Unlock" : "Lock"}>
              {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
            {state.layers.length > 1 && (
              <button className="cad-toolbar-btn !w-5 !h-5 hover:!text-destructive" onClick={e => { e.stopPropagation(); dispatch({ type: "REMOVE_LAYER", id: layer.id }); }} title="Delete Layer">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-2 border-t" style={{ borderColor: "var(--cad-panel-border)" }}>
        <input type="text" value={newLayerName} onChange={e => setNewLayerName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddLayer()} placeholder="New layer name..." className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50" />
      </div>
    </div>
  );
}
