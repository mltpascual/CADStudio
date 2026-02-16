import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const shortcuts = [
  { category: "Tools", items: [
    { key: "V", action: "Select" }, { key: "L", action: "Line" }, { key: "C", action: "Circle" },
    { key: "A", action: "Arc" }, { key: "R", action: "Rectangle" }, { key: "P", action: "Polyline" },
    { key: "E", action: "Ellipse" }, { key: "T", action: "Text" }, { key: "D", action: "Dimension" },
    { key: "M", action: "Move" }, { key: "Shift+C", action: "Copy" }, { key: "Shift+T", action: "Trim" },
    { key: "Shift+E", action: "Extend" }, { key: "O", action: "Offset" },
    { key: "Shift+R", action: "Rotate" }, { key: "Shift+S", action: "Scale" },
    { key: "F", action: "Fillet/Chamfer" }, { key: "Shift+M", action: "Mirror" },
    { key: "H", action: "Hatch/Fill" }, { key: "Shift+B", action: "Create Block" },
    { key: "Shift+I", action: "Insert Block" }, { key: "X", action: "Erase" },
  ]},
  { category: "Edit", items: [
    { key: "Ctrl+Z", action: "Undo" }, { key: "Ctrl+Y", action: "Redo" },
    { key: "Ctrl+A", action: "Select All" }, { key: "Delete", action: "Delete Selected" },
    { key: "Escape", action: "Cancel / Deselect" },
  ]},
  { category: "Navigation", items: [
    { key: "Scroll", action: "Zoom In/Out" }, { key: "Middle Click + Drag", action: "Pan" },
    { key: "Right Click", action: "Finish / Cancel" },
  ]},
];

export default function ShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="cad-toolbar-btn" title="Keyboard Shortcuts"><Keyboard size={14} /></button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto bg-card text-card-foreground border-border">
        <DialogHeader><DialogTitle className="text-sm font-semibold">Keyboard Shortcuts</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {shortcuts.map(group => (
            <div key={group.category}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group.category}</h4>
              <div className="space-y-1">
                {group.items.map(item => (
                  <div key={item.key} className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-foreground/70">{item.action}</span>
                    <kbd className="cad-mono px-1.5 py-0.5 rounded bg-accent text-[10px] text-foreground/60">{item.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
