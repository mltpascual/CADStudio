import { useCAD, useCADActions } from "@/contexts/CADContext";
import { exportToDXF, exportToSVG } from "@/lib/cad-utils";
import { parseDXF } from "@/lib/dxf-import";
import { exportModelSpaceToPdf, exportLayoutToPdf } from "@/lib/pdf-export";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { FileDown, FileUp, Undo2, Redo2, Trash2, Copy, Grid3X3, Layers, Terminal, PanelRight, Sun, Moon, Printer, FileInput } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import ShortcutsDialog from "./ShortcutsDialog";
import { NamedViewsButton } from "./NamedViewsPanel";

const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663343684150/bRJEUWLqFHNMPniX.png";

export default function MenuBar() {
  const { state } = useCAD();
  const { undo, redo, deselectAll, dispatch } = useCADActions();
  const { theme, toggleTheme } = useTheme();

  const handleExportDXF = () => { downloadFile(exportToDXF(state.entities), "drawing.dxf", "application/dxf"); toast.success("Exported as DXF"); };
  const handleExportSVG = () => { downloadFile(exportToSVG(state.entities), "drawing.svg", "image/svg+xml"); toast.success("Exported as SVG"); };

  const handleNewDrawing = () => {
    if (state.entities.length > 0 && !confirm("Clear all entities? This cannot be undone.")) return;
    dispatch({ type: "CLEAR_ALL" });
    dispatch({ type: "SET_VIEW_STATE", viewState: { panX: 0, panY: 0, zoom: 1 } });
    toast.success("New drawing created");
  };

  const handleSaveJSON = () => {
    downloadFile(JSON.stringify({ entities: state.entities, layers: state.layers, viewState: state.viewState, gridSettings: state.gridSettings }, null, 2), "drawing.cad.json", "application/json");
    toast.success("Drawing saved");
  };

  const handleLoadJSON = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
    inp.onchange = (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const data = JSON.parse(re.target?.result as string);
          if (data.entities) { dispatch({ type: "LOAD_ENTITIES", entities: data.entities }); if (data.viewState) dispatch({ type: "SET_VIEW_STATE", viewState: data.viewState }); toast.success("Drawing loaded"); }
        } catch { toast.error("Failed to parse file"); }
      };
      reader.readAsText(file);
    };
    inp.click();
  };

  const handleImportDXF = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".dxf";
    inp.onchange = (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const content = re.target?.result as string;
          const result = parseDXF(content);
          if (result.entities.length > 0) {
            dispatch({ type: "LOAD_ENTITIES", entities: result.entities });
            // Import layers if present
            if (result.layers.length > 0) {
              for (const layer of result.layers) {
                dispatch({ type: "ADD_LAYER", layer });
              }
            }
            toast.success(`Imported ${result.entities.length} entities from DXF`);
          } else {
            toast.warning("No supported entities found in DXF file");
          }
        } catch (err) {
          console.error("DXF import error:", err);
          toast.error("Failed to parse DXF file");
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  };

  const handleExportPDF = () => {
    if (state.activeSpace === "paper" && state.activeLayoutId) {
      const layout = state.layouts.find(l => l.id === state.activeLayoutId);
      if (layout) {
        exportLayoutToPdf(layout, state.entities, state.blocks, `${layout.name}.pdf`);
        toast.success(`Exported layout "${layout.name}" as PDF`);
        return;
      }
    }
    exportModelSpaceToPdf(state.entities, state.blocks, "drawing.pdf");
    toast.success("Exported model space as PDF");
  };

  return (
    <div className="flex items-center h-9 px-2 gap-1 border-b select-none" style={{ background: "var(--cad-toolbar-bg)", borderColor: "var(--cad-panel-border)" }}>
      <div className="flex items-center gap-2 mr-2">
        <img src={LOGO_URL} alt="CAD Studio" className="w-5 h-5 rounded" />
        <span className="text-xs font-semibold tracking-wide text-foreground/90">CAD Studio</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">File</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={handleNewDrawing}><Trash2 className="mr-2 h-3.5 w-3.5" /> New Drawing<DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLoadJSON}><FileUp className="mr-2 h-3.5 w-3.5" /> Open...<DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onClick={handleSaveJSON}><FileDown className="mr-2 h-3.5 w-3.5" /> Save as JSON<DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleImportDXF}><FileInput className="mr-2 h-3.5 w-3.5" /> Import DXF...<DropdownMenuShortcut>Ctrl+I</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExportDXF}><FileDown className="mr-2 h-3.5 w-3.5" /> Export DXF</DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportSVG}><FileDown className="mr-2 h-3.5 w-3.5" /> Export SVG</DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportPDF}><Printer className="mr-2 h-3.5 w-3.5" /> Export PDF<DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">Edit</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={undo}><Undo2 className="mr-2 h-3.5 w-3.5" /> Undo<DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onClick={redo}><Redo2 className="mr-2 h-3.5 w-3.5" /> Redo<DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => dispatch({ type: "SELECT_ENTITIES", ids: state.entities.filter((e: any) => e.visible && !e.locked).map((e: any) => e.id) })}><Copy className="mr-2 h-3.5 w-3.5" /> Select All<DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onClick={deselectAll}>Deselect All<DropdownMenuShortcut>Esc</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { if (state.selectedEntityIds.length > 0) dispatch({ type: "REMOVE_ENTITIES", ids: state.selectedEntityIds }); }}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Selected<DropdownMenuShortcut>Del</DropdownMenuShortcut></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">View</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_VIEW_STATE", viewState: { panX: 0, panY: 0, zoom: 1 } })}>Zoom to Fit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_VIEW_STATE", viewState: { zoom: state.viewState.zoom * 1.5 } })}>Zoom In</DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_VIEW_STATE", viewState: { zoom: state.viewState.zoom * 0.67 } })}>Zoom Out</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_GRID_SETTINGS", settings: { visible: !state.gridSettings.visible } })}><Grid3X3 className="mr-2 h-3.5 w-3.5" />{state.gridSettings.visible ? "Hide Grid" : "Show Grid"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_SNAP_SETTINGS", settings: { enabled: !state.snapSettings.enabled } })}>{state.snapSettings.enabled ? "✓ " : "  "}Object Snap<DropdownMenuShortcut>F3</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "TOGGLE_ORTHO" })}>{state.orthoMode ? "✓ " : "  "}Ortho Mode<DropdownMenuShortcut>F8</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => dispatch({ type: "TOGGLE_LAYERS" })}><Layers className="mr-2 h-3.5 w-3.5" />{state.showLayers ? "Hide Layers" : "Show Layers"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "TOGGLE_PROPERTIES" })}><PanelRight className="mr-2 h-3.5 w-3.5" />{state.showProperties ? "Hide Properties" : "Show Properties"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "TOGGLE_COMMAND_LINE" })}><Terminal className="mr-2 h-3.5 w-3.5" />{state.showCommandLine ? "Hide Command Line" : "Show Command Line"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: null })}>{state.activeSpace === "model" ? "✓ " : "  "}Model Space</DropdownMenuItem>
          {state.layouts.map(l => (
            <DropdownMenuItem key={l.id} onClick={() => dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: l.id })}>{state.activeLayoutId === l.id ? "✓ " : "  "}{l.name}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <NamedViewsButton />
        <button className="cad-toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
        <button className="cad-toolbar-btn" onClick={redo} title="Redo (Ctrl+Y)"><Redo2 size={14} /></button>
        <ShortcutsDialog />
        <button
          className="cad-toolbar-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      <div className="cad-mono text-muted-foreground/60 ml-2 min-w-[60px] text-right">{(state.viewState.zoom * 100).toFixed(0)}%</div>
    </div>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
