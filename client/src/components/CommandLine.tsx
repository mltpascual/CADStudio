import { useState, useRef, useEffect } from "react";
import { useCAD, useCADActions } from "@/contexts/CADContext";
import type { ToolType } from "@/lib/cad-types";
import { Terminal } from "lucide-react";

const CMD: Record<string, ToolType> = {
  line: "line", l: "line", circle: "circle", c: "circle", arc: "arc", a: "arc",
  rectangle: "rectangle", rect: "rectangle", r: "rectangle", polyline: "polyline", pl: "polyline", p: "polyline",
  ellipse: "ellipse", el: "ellipse", e: "ellipse", text: "text", t: "text",
  dimension: "dimension", dim: "dimension", d: "dimension", move: "move", m: "move",
  erase: "erase", x: "erase", trim: "trim", tr: "trim", extend: "extend", ex: "extend",
  copy: "copy", co: "copy", cp: "copy", offset: "offset", of: "offset", o: "offset",
  rotate: "rotate", ro: "rotate", scale: "scale", sc: "scale",
  fillet: "fillet", fi: "fillet", f: "fillet", chamfer: "fillet", ch: "fillet",
  mirror: "mirror", mi: "mirror",
  hatch: "hatch", h: "hatch", fill: "hatch", bhatch: "hatch",
  block: "block_group", b: "block_group", group: "block_group",
  insert: "block_insert", i: "block_insert",
  arrayrect: "array_rect", ar: "array_rect", rectarray: "array_rect",
  arraypolar: "array_polar", ap: "array_polar", polararray: "array_polar", array: "array_rect",
  spline: "spline", spl: "spline", sp: "spline", curve: "spline", bezier: "spline",
  xline: "xline", xl: "xline", constructionline: "xline", cline: "xline",
  ray: "ray",
  dist: "measure_distance", distance: "measure_distance", measuredist: "measure_distance",
  area: "measure_area", measurearea: "measure_area",
  angle: "measure_angle", measureangle: "measure_angle",
  select: "select", v: "select", pan: "pan",
};

export default function CommandLine() {
  const { state } = useCAD();
  const { setTool, undo, redo, deselectAll, dispatch } = useCADActions();
  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [state.commandHistory]);

  const exec = (cmd: string) => {
    const t = cmd.trim().toLowerCase();
    if (!t) return;
    let result = "";
    if (CMD[t]) { setTool(CMD[t]); result = `Tool: ${CMD[t].toUpperCase()}`; }
    else if (t === "undo" || t === "u") { undo(); result = "Undo"; }
    else if (t === "redo") { redo(); result = "Redo"; }
    else if (t === "esc" || t === "escape") { deselectAll(); setTool("select"); result = "Cancelled"; }
    else if (t === "ortho") { dispatch({ type: "TOGGLE_ORTHO" }); result = `Ortho: ${!state.orthoMode ? "ON" : "OFF"}`; }
    else if (t === "grid") { dispatch({ type: "SET_GRID_SETTINGS", settings: { visible: !state.gridSettings.visible } }); result = `Grid: ${!state.gridSettings.visible ? "ON" : "OFF"}`; }
    else if (t === "snap") { dispatch({ type: "SET_SNAP_SETTINGS", settings: { enabled: !state.snapSettings.enabled } }); result = `Snap: ${!state.snapSettings.enabled ? "ON" : "OFF"}`; }
    else if (t.startsWith("zoom ")) { const v = parseFloat(t.split(" ")[1]); if (!isNaN(v)) { dispatch({ type: "SET_VIEW_STATE", viewState: { zoom: v / 100 } }); result = `Zoom: ${v}%`; } else result = "Invalid zoom"; }
    else if (t === "zoomfit" || t === "zf") { dispatch({ type: "SET_VIEW_STATE", viewState: { panX: 0, panY: 0, zoom: 1 } }); result = "Zoom to fit"; }
    else if (t === "explode") {
      // Explode selected block references
      const selected = state.entities.filter(e => state.selectedEntityIds.includes(e.id) && e.data.type === "blockref");
      if (selected.length === 0) { result = "Select a block reference to explode"; }
      else {
        // Import handled in CADCanvas, just set result here
        result = "Use the canvas to explode blocks (select block, type EXPLODE)";
      }
    }
    else if (t === "model" || t === "mspace") { dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: null }); result = "Switched to Model Space"; }
    else if (t === "paper" || t === "pspace") {
      if (state.layouts.length > 0) { dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: state.layouts[0].id }); result = `Switched to Paper Space: ${state.layouts[0].name}`; }
      else result = "No layouts defined. Create a layout first.";
    }
    else if (t.startsWith("layout ")) {
      const name = cmd.trim().slice(7).trim();
      const found = state.layouts.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (found) { dispatch({ type: "SET_ACTIVE_LAYOUT", layoutId: found.id }); result = `Layout: ${found.name}`; }
      else result = `Layout "${name}" not found`;
    }
    else if (t === "help" || t === "?") { result = "LINE, CIRCLE, ARC, RECT, POLYLINE, ELLIPSE, SPLINE, XLINE, RAY, TEXT, DIM, HATCH, BLOCK, INSERT, MOVE, COPY, MIRROR, TRIM, EXTEND, OFFSET, ROTATE, SCALE, FILLET, CHAMFER, ARRAYRECT, ARRAYPOLAR, DIST, AREA, ANGLE, ERASE, UNDO, REDO, ORTHO, GRID, SNAP, ZOOM <n>, ZOOMFIT, MODEL, PAPER, LAYOUT <name>"; }
    else result = `Unknown: ${t}`;
    dispatch({ type: "ADD_COMMAND", entry: { command: cmd.trim(), timestamp: Date.now(), result } });
    setInput(""); setHistIdx(-1);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") exec(input);
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const cmds = state.commandHistory.filter(c => c.command);
      if (cmds.length) { const ni = histIdx < cmds.length - 1 ? histIdx + 1 : histIdx; setHistIdx(ni); setInput(cmds[cmds.length - 1 - ni]?.command || ""); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx > 0) { const ni = histIdx - 1; setHistIdx(ni); const cmds = state.commandHistory.filter(c => c.command); setInput(cmds[cmds.length - 1 - ni]?.command || ""); }
      else { setHistIdx(-1); setInput(""); }
    } else if (e.key === "Escape") { setInput(""); deselectAll(); setTool("select"); }
  };

  return (
    <div className="flex flex-col border-t" style={{ background: "var(--cad-cmdline-bg, var(--cad-toolbar-bg))", borderColor: "var(--cad-panel-border)", height: "120px" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-1">
        {state.commandHistory.slice(-20).map((entry, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="text-primary/60 select-none">{">"}</span>
            <span className="text-foreground/70 font-mono">{entry.command}</span>
            {entry.result && <span className="text-muted-foreground/50 font-mono ml-auto">{entry.result}</span>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-t" style={{ borderColor: "var(--cad-panel-border)" }}>
        <Terminal size={12} className="text-primary/60 flex-shrink-0" />
        <span className="text-primary/60 text-xs select-none">Command:</span>
        <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Type a command..." className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/20 focus:outline-none" autoComplete="off" spellCheck={false} />
        <span className="cad-mono text-muted-foreground/30 text-[10px]">{state.activeTool.toUpperCase()}</span>
      </div>
    </div>
  );
}
