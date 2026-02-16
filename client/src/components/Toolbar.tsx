import { useCAD, useCADActions } from "@/contexts/CADContext";
import type { ToolType } from "@/lib/cad-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { MousePointer2, Minus, Circle, Square, Spline, Type, Ruler, Move, RotateCw, Eraser, Hand, Maximize2, ArrowUpRight, Scissors, ArrowRightToLine, Copy, Layers, Scaling, Blend, FlipHorizontal2, RulerIcon, Triangle, Compass, PaintBucket, Group, PackagePlus, Grid3X3, CircleDot } from "lucide-react";

interface ToolItem { id: ToolType; label: string; shortcut: string; icon: React.ReactNode; }

const drawTools: ToolItem[] = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 size={16} /> },
  { id: "line", label: "Line", shortcut: "L", icon: <Minus size={16} /> },
  { id: "circle", label: "Circle", shortcut: "C", icon: <Circle size={16} /> },
  { id: "arc", label: "Arc", shortcut: "A", icon: <ArrowUpRight size={16} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: <Square size={16} /> },
  { id: "polyline", label: "Polyline", shortcut: "P", icon: <Spline size={16} /> },
  { id: "ellipse", label: "Ellipse", shortcut: "E", icon: <Maximize2 size={16} /> },
];
const annotateTools: ToolItem[] = [
  { id: "text", label: "Text", shortcut: "T", icon: <Type size={16} /> },
  { id: "dimension", label: "Dimension", shortcut: "D", icon: <Ruler size={16} /> },
  { id: "hatch", label: "Hatch/Fill", shortcut: "H", icon: <PaintBucket size={16} /> },
];
const blockTools: ToolItem[] = [
  { id: "block_group", label: "Create Block", shortcut: "Shift+B", icon: <Group size={16} /> },
  { id: "block_insert", label: "Insert Block", shortcut: "Shift+I", icon: <PackagePlus size={16} /> },
];
const modifyTools: ToolItem[] = [
  { id: "move", label: "Move", shortcut: "M", icon: <Move size={16} /> },
  { id: "copy", label: "Copy", shortcut: "Shift+C", icon: <Copy size={16} /> },
  { id: "mirror", label: "Mirror", shortcut: "Shift+M", icon: <FlipHorizontal2 size={16} /> },
  { id: "trim", label: "Trim", shortcut: "Shift+T", icon: <Scissors size={16} /> },
  { id: "extend", label: "Extend", shortcut: "Shift+E", icon: <ArrowRightToLine size={16} /> },
  { id: "offset", label: "Offset", shortcut: "O", icon: <Layers size={16} /> },
  { id: "rotate", label: "Rotate", shortcut: "Shift+R", icon: <RotateCw size={16} /> },
  { id: "scale", label: "Scale", shortcut: "Shift+S", icon: <Scaling size={16} /> },
  { id: "fillet", label: "Fillet/Chamfer", shortcut: "F", icon: <Blend size={16} /> },
  { id: "array_rect", label: "Rectangular Array", shortcut: "Shift+A", icon: <Grid3X3 size={16} /> },
  { id: "array_polar", label: "Polar Array", shortcut: "Shift+P", icon: <CircleDot size={16} /> },
  { id: "erase", label: "Erase", shortcut: "X", icon: <Eraser size={16} /> },
];
const measureTools: ToolItem[] = [
  { id: "measure_distance", label: "Measure Distance", shortcut: "", icon: <RulerIcon size={16} /> },
  { id: "measure_area", label: "Measure Area", shortcut: "", icon: <Triangle size={16} /> },
  { id: "measure_angle", label: "Measure Angle", shortcut: "", icon: <Compass size={16} /> },
];
const navTools: ToolItem[] = [
  { id: "pan", label: "Pan", shortcut: "Middle Mouse", icon: <Hand size={16} /> },
];

export default function Toolbar() {
  const { state } = useCAD();
  const { setTool } = useCADActions();

  const renderGroup = (tools: ToolItem[], label: string) => (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-0.5 font-medium">{label}</span>
      {tools.map(tool => (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <button className={`cad-toolbar-btn ${state.activeTool === tool.id ? "active" : ""}`} onClick={() => setTool(tool.id)} aria-label={tool.label}>
              {tool.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            <span>{tool.label}</span>
            {tool.shortcut && <kbd className="cad-mono px-1 py-0.5 rounded bg-muted text-[10px]">{tool.shortcut}</kbd>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center py-2 px-1 gap-1 border-r overflow-y-auto" style={{ background: "var(--cad-toolbar-bg)", borderColor: "var(--cad-panel-border)", width: "42px" }}>
      {renderGroup(drawTools, "Draw")}
      <Separator className="w-6 my-1 opacity-20" />
      {renderGroup(annotateTools, "Note")}
      <Separator className="w-6 my-1 opacity-20" />
      {renderGroup(modifyTools, "Edit")}
      <Separator className="w-6 my-1 opacity-20" />
      {renderGroup(blockTools, "Block")}
      <Separator className="w-6 my-1 opacity-20" />
      {renderGroup(measureTools, "Meas")}
      <Separator className="w-6 my-1 opacity-20" />
      {renderGroup(navTools, "Nav")}
    </div>
  );
}
