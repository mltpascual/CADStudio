// ============================================================
// HotkeyGuide — Visual hotkey overlay cheat sheet
// Design: Obsidian Forge — floating translucent panel with grouped shortcuts
// Triggered by holding '?' key or via menu
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface ShortcutItem {
  key: string;
  label: string;
  color?: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const groups: ShortcutGroup[] = [
  {
    title: "Draw",
    items: [
      { key: "L", label: "Line", color: "#3b82f6" },
      { key: "C", label: "Circle", color: "#3b82f6" },
      { key: "A", label: "Arc", color: "#3b82f6" },
      { key: "R", label: "Rectangle", color: "#3b82f6" },
      { key: "P", label: "Polyline", color: "#3b82f6" },
      { key: "E", label: "Ellipse", color: "#3b82f6" },
      { key: "S", label: "Spline", color: "#3b82f6" },
      { key: "T", label: "Text", color: "#3b82f6" },
      { key: "D", label: "Dimension", color: "#3b82f6" },
      { key: "H", label: "Hatch", color: "#3b82f6" },
      { key: "G", label: "XLine", color: "#3b82f6" },
      { key: "⇧G", label: "Ray", color: "#3b82f6" },
    ],
  },
  {
    title: "Modify",
    items: [
      { key: "M", label: "Move", color: "#f59e0b" },
      { key: "⇧C", label: "Copy", color: "#f59e0b" },
      { key: "⇧M", label: "Mirror", color: "#f59e0b" },
      { key: "⇧T", label: "Trim", color: "#f59e0b" },
      { key: "⇧E", label: "Extend", color: "#f59e0b" },
      { key: "O", label: "Offset", color: "#f59e0b" },
      { key: "⇧R", label: "Rotate", color: "#f59e0b" },
      { key: "⇧S", label: "Scale", color: "#f59e0b" },
      { key: "F", label: "Fillet", color: "#f59e0b" },
      { key: "⇧A", label: "Rect Array", color: "#f59e0b" },
      { key: "⇧P", label: "Polar Array", color: "#f59e0b" },
      { key: "X", label: "Erase", color: "#ef4444" },
    ],
  },
  {
    title: "Select & Navigate",
    items: [
      { key: "V", label: "Select", color: "#22c55e" },
      { key: "Esc", label: "Cancel", color: "#22c55e" },
      { key: "Scroll", label: "Zoom", color: "#22c55e" },
      { key: "MMB", label: "Pan", color: "#22c55e" },
    ],
  },
  {
    title: "Edit",
    items: [
      { key: "⌘Z", label: "Undo", color: "#a78bfa" },
      { key: "⌘Y", label: "Redo", color: "#a78bfa" },
      { key: "⌘A", label: "Select All", color: "#a78bfa" },
      { key: "Del", label: "Delete", color: "#a78bfa" },
    ],
  },
  {
    title: "Blocks",
    items: [
      { key: "⇧B", label: "Create Block", color: "#06b6d4" },
      { key: "⇧I", label: "Insert Block", color: "#06b6d4" },
    ],
  },
];

export default function HotkeyGuide() {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Show on '/' key (same key as '?' without shift detection issues)
      if (e.key === "/" || e.key === "?") {
        // Don't trigger if typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (pinned) {
          setPinned(false);
          setVisible(false);
        } else {
          setVisible(true);
          setPinned(true);
        }
      }
      if (e.key === "Escape" && visible) {
        setVisible(false);
        setPinned(false);
      }
    },
    [visible, pinned]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={() => {
        if (!pinned) {
          setVisible(false);
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Guide Panel */}
      <div
        className="relative max-w-[900px] w-[90vw] max-h-[85vh] overflow-y-auto rounded-xl border shadow-2xl"
        style={{
          background: "var(--cad-panel-bg, hsl(220 20% 14%))",
          borderColor: "var(--cad-panel-border, hsl(220 15% 25%))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
          style={{
            background: "var(--cad-panel-bg, hsl(220 20% 14%))",
            borderColor: "var(--cad-panel-border, hsl(220 15% 25%))",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold"
              style={{
                background: "var(--cad-accent, #3b82f6)",
                color: "#fff",
              }}
            >
              ?
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Keyboard Shortcuts
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Press <kbd className="px-1 py-0.5 rounded bg-accent text-[10px] font-mono">?</kbd> to toggle
                {" · "}
                <kbd className="px-1 py-0.5 rounded bg-accent text-[10px] font-mono">Esc</kbd> to close
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              setPinned(false);
            }}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcut Groups */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {groups.map((group) => (
            <div
              key={group.title}
              className="rounded-lg border p-4"
              style={{
                borderColor: "var(--cad-panel-border, hsl(220 15% 25%))",
                background: "var(--cad-toolbar-bg, hsl(220 18% 11%))",
              }}
            >
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: group.items[0]?.color || "#fff" }}
              >
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.key + item.label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-foreground/70">
                      {item.label}
                    </span>
                    <kbd
                      className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border"
                      style={{
                        borderColor: `${item.color}40`,
                        background: `${item.color}15`,
                        color: item.color,
                      }}
                    >
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t text-center"
          style={{
            borderColor: "var(--cad-panel-border, hsl(220 15% 25%))",
          }}
        >
          <p className="text-[10px] text-muted-foreground/50">
            You can also type commands directly in the Command Line below (e.g.{" "}
            <span className="font-mono text-primary/60">LINE</span>,{" "}
            <span className="font-mono text-primary/60">CIRCLE</span>,{" "}
            <span className="font-mono text-primary/60">TRIM</span>)
          </p>
        </div>
      </div>
    </div>
  );
}
