# CAD Studio

A full-featured AutoCAD clone web application built with React, TypeScript, and HTML5 Canvas.

![CAD Studio](https://img.shields.io/badge/CAD-Studio-blue?style=for-the-badge)

## Features

### Drawing Tools
- **Line** (L) — Click-to-click line drawing with continuous mode
- **Circle** (C) — Center + radius circle creation
- **Arc** (A) — Three-point arc: center, start angle, end angle
- **Rectangle** (R) — Corner-to-corner rectangle drawing
- **Polyline** (P) — Multi-segment connected lines (right-click to finish)
- **Ellipse** (E) — Center + radii ellipse creation
- **Text** (T) — Place text annotations on the canvas
- **Dimension** (D) — Linear dimension with measurement display

### Modify Tools
- **Select** (V) — Click to select, Shift+click for multi-select, box selection
- **Move** (M) — Move selected entities by base point + displacement
- **Copy** (Shift+C) — Duplicate selected entities with base point + destination
- **Trim** (Shift+T) — Trim entities at intersection points (like AutoCAD)
- **Extend** (Shift+E) — Extend lines/arcs/polylines to the nearest boundary entity
- **Offset** (O) — Create parallel copies of entities at a specified distance
- **Rotate** (Shift+R) — Rotate selected entities around a base point by a specified angle
- **Scale** (Shift+S) — Scale selected entities from a base point by a specified factor
- **Fillet/Chamfer** (F) — Round or bevel corners between two intersecting lines
- **Erase** (X) — Click to delete entities

### Precision Features
- **Snap System** — Endpoint, midpoint, center, grid, intersection snapping
- **Ortho Mode** — Constrain drawing to horizontal/vertical
- **Grid** — Configurable grid with major/minor lines and dot mode
- **Crosshair Cursor** — Full-screen crosshair with coordinate display

### Layer System
- Multiple layers with color, visibility, and lock controls
- Default layers: 0, Construction, Dimensions, Annotations
- Add/remove custom layers

### File Operations
- **Export** — DXF, SVG, JSON formats
- **Import** — Load from JSON
- **New** — Clear canvas and start fresh

### UI Features
- **Light/Dark mode toggle** — Blueprint-style light theme and Obsidian dark theme
- Collapsible panels (Layers, Properties, Command Line)
- Command line with autocomplete and history
- Status bar with tool, layer, color, snap, and grid indicators
- Undo/Redo (Ctrl+Z / Ctrl+Y)

## Tech Stack

- **React 19** + TypeScript
- **HTML5 Canvas** for rendering
- **Tailwind CSS 4** for UI styling
- **shadcn/ui** components
- **Vite** for development and building

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| L | Line tool |
| C | Circle tool |
| A | Arc tool |
| R | Rectangle tool |
| P | Polyline tool |
| E | Ellipse tool |
| T | Text tool |
| D | Dimension tool |
| M | Move tool |
| Shift+C | Copy tool |
| Shift+T | Trim tool |
| Shift+E | Extend tool |
| O | Offset tool |
| Shift+R | Rotate tool |
| Shift+S | Scale tool |
| F | Fillet/Chamfer tool |
| X | Erase tool |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+A | Select all |
| Delete | Delete selected |
| Escape | Cancel / Deselect |
| Scroll | Zoom in/out |
| Middle click + drag | Pan |

## Command Line

Type commands directly in the command line at the bottom:

- `LINE`, `CIRCLE`, `ARC`, `RECT`, `POLYLINE`, `ELLIPSE`, `TEXT`, `DIM`
- `COPY`, `EXTEND`, `OFFSET`, `ROTATE`, `SCALE`, `FILLET`, `CHAMFER`
- `MOVE`, `TRIM`, `ERASE`
- `UNDO`, `REDO`
- `ORTHO`, `GRID`, `SNAP`
- `ZOOM <percentage>`, `ZOOMFIT`
- `HELP` — Show all commands

## License

MIT
