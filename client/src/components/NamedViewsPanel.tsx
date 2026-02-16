/**
 * NamedViewsPanel — Small panel for saving/restoring named views.
 * Accessible from the View menu or as a floating panel.
 */
import { useState } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Bookmark, Eye, Trash2, Plus } from "lucide-react";
import type { NamedView } from "@/lib/cad-types";

export function NamedViewsButton() {
  const { state } = useCAD();
  const { dispatch } = useCADActions();
  const [newViewName, setNewViewName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    const view: NamedView = {
      id: `nv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newViewName.trim(),
      viewState: { ...state.viewState },
      timestamp: Date.now(),
    };
    dispatch({ type: "ADD_NAMED_VIEW", view });
    toast.success(`View "${view.name}" saved`);
    setNewViewName("");
    setShowInput(false);
  };

  const handleRestoreView = (id: string, name: string) => {
    dispatch({ type: "RESTORE_NAMED_VIEW", id });
    toast.success(`Restored view "${name}"`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="cad-toolbar-btn" title="Named Views">
          <Bookmark size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 p-3 bg-card text-card-foreground border-border">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Named Views</h4>
            <button
              className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              onClick={() => setShowInput(!showInput)}
            >
              <Plus size={10} /> Save Current
            </button>
          </div>

          {showInput && (
            <div className="flex gap-1.5">
              <input
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveView()}
                placeholder="View name..."
                className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
                autoFocus
              />
              <button
                className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={handleSaveView}
              >
                Save
              </button>
            </div>
          )}

          {state.namedViews.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2 text-center">No saved views yet</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {state.namedViews.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-accent transition-colors group"
                >
                  <Eye size={12} className="text-muted-foreground shrink-0" />
                  <button
                    className="flex-1 text-left text-xs text-foreground truncate"
                    onClick={() => handleRestoreView(view.id, view.name)}
                  >
                    {view.name}
                  </button>
                  <span className="text-[9px] text-muted-foreground cad-mono shrink-0">
                    {Math.round(view.viewState.zoom * 100)}%
                  </span>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      dispatch({ type: "REMOVE_NAMED_VIEW", id: view.id });
                      toast.success(`View "${view.name}" removed`);
                    }}
                    title="Delete view"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
