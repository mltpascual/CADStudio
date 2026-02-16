import { useCAD, useCADActions } from "@/contexts/CADContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings2 } from "lucide-react";

export default function SnapSettingsDialog() {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const snap = state.snapSettings;
  const grid = state.gridSettings;

  const toggleSnap = (key: string, value: boolean) => dispatch({ type: "SET_SNAP_SETTINGS", settings: { [key]: value } });
  const updateGrid = (key: string, value: number | boolean) => dispatch({ type: "SET_GRID_SETTINGS", settings: { [key]: value } });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="cad-toolbar-btn" title="Snap & Grid Settings"><Settings2 size={14} /></button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]" style={{ background: "var(--cad-panel-bg)", borderColor: "var(--cad-panel-border)" }}>
        <DialogHeader><DialogTitle className="text-sm font-semibold">Snap & Grid Settings</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Object Snap (OSNAP)</h4>
            <div className="space-y-2">
              <SnapToggle label="Enabled" checked={snap.enabled} onChange={v => toggleSnap("enabled", v)} />
              <Separator className="opacity-10" />
              <SnapToggle label="Endpoint" checked={snap.endpointSnap} onChange={v => toggleSnap("endpointSnap", v)} />
              <SnapToggle label="Midpoint" checked={snap.midpointSnap} onChange={v => toggleSnap("midpointSnap", v)} />
              <SnapToggle label="Center" checked={snap.centerSnap} onChange={v => toggleSnap("centerSnap", v)} />
              <SnapToggle label="Intersection" checked={snap.intersectionSnap} onChange={v => toggleSnap("intersectionSnap", v)} />
              <SnapToggle label="Perpendicular" checked={snap.perpendicularSnap} onChange={v => toggleSnap("perpendicularSnap", v)} />
              <SnapToggle label="Nearest" checked={snap.nearestSnap} onChange={v => toggleSnap("nearestSnap", v)} />
            </div>
          </div>
          <Separator className="opacity-20" />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Grid</h4>
            <div className="space-y-2">
              <SnapToggle label="Show Grid" checked={grid.visible} onChange={v => updateGrid("visible", v)} />
              <SnapToggle label="Snap to Grid" checked={grid.snapToGrid} onChange={v => updateGrid("snapToGrid", v)} />
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Grid Spacing</Label>
                <input type="number" value={grid.spacing} onChange={e => updateGrid("spacing", Math.max(1, parseInt(e.target.value) || 10))} className="w-16 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground text-right focus:outline-none focus:border-primary/50" min={1} max={100} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Major Grid Every</Label>
                <input type="number" value={grid.majorEvery} onChange={e => updateGrid("majorEvery", Math.max(1, parseInt(e.target.value) || 5))} className="w-16 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground text-right focus:outline-none focus:border-primary/50" min={1} max={20} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnapToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
