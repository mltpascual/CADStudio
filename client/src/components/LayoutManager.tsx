/**
 * LayoutManager — Tab bar at the bottom for switching between Model space and Paper layouts.
 * Includes layout creation, viewport management, and title block editing.
 * Design: Horizontal tab bar with "Model" tab + layout tabs, plus a "+" button.
 */
import { useState } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, X, Settings2, FileText, Maximize2 } from "lucide-react";
import { createDefaultLayout, createViewport } from "@/lib/layout-utils";
import type { PaperSize, PaperOrientation, Layout, TitleBlockInfo } from "@/lib/cad-types";

export default function LayoutManager() {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const [showNewLayout, setShowNewLayout] = useState(false);
  const [editingLayout, setEditingLayout] = useState<string | null>(null);

  const activeLayout = state.layouts.find(l => l.id === state.activeLayoutId);

  const handleAddLayout = (name: string, paperSize: PaperSize, orientation: PaperOrientation) => {
    const layout = createDefaultLayout(name, paperSize, orientation);
    dispatch({ type: "ADD_LAYOUT", layout });
    dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: layout.id });
    toast.success(`Layout "${name}" created`);
    setShowNewLayout(false);
  };

  const handleRemoveLayout = (id: string, name: string) => {
    if (!confirm(`Delete layout "${name}"?`)) return;
    dispatch({ type: "REMOVE_LAYOUT", id });
    toast.success(`Layout "${name}" deleted`);
  };

  const handleAddViewport = (layoutId: string) => {
    const layout = state.layouts.find(l => l.id === layoutId);
    if (!layout) return;
    const vp = createViewport(layout, `Viewport ${layout.viewports.length + 1}`);
    dispatch({ type: "ADD_VIEWPORT", layoutId, viewport: vp });
    toast.success("Viewport added");
  };

  return (
    <div
      className="flex items-center h-7 px-1 gap-0.5 border-t select-none overflow-x-auto"
      style={{ background: "var(--cad-toolbar-bg)", borderColor: "var(--cad-panel-border)" }}
    >
      {/* Model Space tab */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`layout-tab ${state.activeSpace === "model" ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: null })}
          >
            <Maximize2 size={10} />
            <span>Model</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Switch to Model Space</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5 opacity-20" />

      {/* Layout tabs */}
      {state.layouts.map((layout) => (
        <div key={layout.id} className="flex items-center group">
          <button
            className={`layout-tab ${state.activeLayoutId === layout.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: layout.id })}
          >
            <FileText size={10} />
            <span>{layout.name}</span>
          </button>

          {/* Layout settings popover */}
          {state.activeLayoutId === layout.id && (
            <Popover open={editingLayout === layout.id} onOpenChange={(open) => setEditingLayout(open ? layout.id : null)}>
              <PopoverTrigger asChild>
                <button className="layout-tab-action" title="Layout Settings">
                  <Settings2 size={10} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72 p-3 bg-card text-card-foreground border-border">
                <LayoutSettingsPanel layout={layout} onAddViewport={() => handleAddViewport(layout.id)} />
              </PopoverContent>
            </Popover>
          )}

          <button
            className="layout-tab-action opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); handleRemoveLayout(layout.id, layout.name); }}
            title="Delete Layout"
          >
            <X size={10} />
          </button>
        </div>
      ))}

      {/* Add layout button */}
      <Dialog open={showNewLayout} onOpenChange={setShowNewLayout}>
        <DialogTrigger asChild>
          <button className="layout-tab add" title="New Layout">
            <Plus size={12} />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>New Layout</DialogTitle>
          </DialogHeader>
          <NewLayoutForm onSubmit={handleAddLayout} onCancel={() => setShowNewLayout(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {/* Active layout info */}
      {activeLayout && (
        <span className="text-[10px] text-muted-foreground cad-mono px-2">
          {activeLayout.paperSize} {activeLayout.orientation} · {activeLayout.viewports.length} viewport{activeLayout.viewports.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ============================================================
// New Layout Form
// ============================================================
function NewLayoutForm({ onSubmit, onCancel }: { onSubmit: (name: string, size: PaperSize, orientation: PaperOrientation) => void; onCancel: () => void }) {
  const [name, setName] = useState("Layout 1");
  const [paperSize, setPaperSize] = useState<PaperSize>("A3");
  const [orientation, setOrientation] = useState<PaperOrientation>("landscape");

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Layout Name</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Paper Size</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["A4", "A3", "A2", "A1", "A0", "Letter", "Legal", "Tabloid"] as PaperSize[]).map((size) => (
            <button
              key={size}
              className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                paperSize === size
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-input border-border text-foreground hover:bg-accent"
              }`}
              onClick={() => setPaperSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Orientation</Label>
        <div className="flex gap-2">
          {(["landscape", "portrait"] as PaperOrientation[]).map((o) => (
            <button
              key={o}
              className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors capitalize ${
                orientation === o
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-input border-border text-foreground hover:bg-accent"
              }`}
              onClick={() => setOrientation(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          className="flex-1 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => onSubmit(name, paperSize, orientation)}
        >
          Create Layout
        </button>
        <button
          className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Layout Settings Panel (inside popover)
// ============================================================
function LayoutSettingsPanel({ layout, onAddViewport }: { layout: Layout; onAddViewport: () => void }) {
  const { dispatch } = useCADActions();

  const updateTitleBlock = (updates: Partial<TitleBlockInfo>) => {
    dispatch({ type: "UPDATE_LAYOUT", id: layout.id, updates: { titleBlock: { ...layout.titleBlock, ...updates } } });
  };

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout Settings</h4>

      {/* Paper settings */}
      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Paper</Label>
        <div className="flex gap-1.5">
          <select
            value={layout.paperSize}
            onChange={(e) => dispatch({ type: "UPDATE_LAYOUT", id: layout.id, updates: { paperSize: e.target.value as PaperSize } })}
            className="flex-1 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground"
          >
            {["A4", "A3", "A2", "A1", "A0", "Letter", "Legal", "Tabloid"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={layout.orientation}
            onChange={(e) => dispatch({ type: "UPDATE_LAYOUT", id: layout.id, updates: { orientation: e.target.value as PaperOrientation } })}
            className="flex-1 bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground capitalize"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </div>
      </div>

      <Separator className="opacity-20" />

      {/* Title Block */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title Block</Label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={layout.showTitleBlock}
              onChange={(e) => dispatch({ type: "UPDATE_LAYOUT", id: layout.id, updates: { showTitleBlock: e.target.checked } })}
              className="rounded border-border"
            />
            Show
          </label>
        </div>
        {layout.showTitleBlock && (
          <div className="space-y-1">
            {([
              ["projectName", "Project Name"],
              ["drawingTitle", "Drawing Title"],
              ["drawnBy", "Drawn By"],
              ["checkedBy", "Checked By"],
              ["date", "Date"],
              ["scale", "Scale"],
              ["sheetNumber", "Sheet #"],
              ["totalSheets", "Total Sheets"],
              ["revision", "Revision"],
              ["company", "Company"],
            ] as [keyof TitleBlockInfo, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
                <input
                  value={layout.titleBlock[key]}
                  onChange={(e) => updateTitleBlock({ [key]: e.target.value })}
                  className="flex-1 bg-input border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator className="opacity-20" />

      {/* Viewports */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Viewports ({layout.viewports.length})</Label>
          <button
            className="text-[10px] text-primary hover:text-primary/80 transition-colors"
            onClick={onAddViewport}
          >
            + Add
          </button>
        </div>
        {layout.viewports.map((vp) => (
          <div key={vp.id} className="flex items-center gap-1.5 text-[10px]">
            <span className="flex-1 text-foreground truncate">{vp.name}</span>
            <span className="text-muted-foreground cad-mono">{Math.round(vp.width)}×{Math.round(vp.height)}mm</span>
            <button
              className="text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => dispatch({ type: "REMOVE_VIEWPORT", layoutId: layout.id, viewportId: vp.id })}
              title="Remove viewport"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
