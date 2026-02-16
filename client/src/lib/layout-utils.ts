// ============================================================
// Layout Utilities — Paper space, viewports, title blocks
// ============================================================

import type { Layout, LayoutViewport, TitleBlockInfo, PaperSize, PaperOrientation, Point, CADEntity, PAPER_SIZES } from "./cad-types";
import { PAPER_SIZES as PS } from "./cad-types";

/** Scale factor: 1mm on paper = this many pixels on screen at zoom=1 */
export const MM_TO_PX = 3.0;

export function getPaperPixelSize(layout: Layout): { w: number; h: number } {
  const dim = layout.paperSize === "Custom"
    ? { width: layout.customWidth ?? 297, height: layout.customHeight ?? 210 }
    : PS[layout.paperSize];
  const w = layout.orientation === "landscape" ? Math.max(dim.width, dim.height) : Math.min(dim.width, dim.height);
  const h = layout.orientation === "landscape" ? Math.min(dim.width, dim.height) : Math.max(dim.width, dim.height);
  return { w: w * MM_TO_PX, h: h * MM_TO_PX };
}

export function getPaperMmSize(layout: Layout): { w: number; h: number } {
  const dim = layout.paperSize === "Custom"
    ? { width: layout.customWidth ?? 297, height: layout.customHeight ?? 210 }
    : PS[layout.paperSize];
  const w = layout.orientation === "landscape" ? Math.max(dim.width, dim.height) : Math.min(dim.width, dim.height);
  const h = layout.orientation === "landscape" ? Math.min(dim.width, dim.height) : Math.max(dim.width, dim.height);
  return { w, h };
}

export function createDefaultLayout(name: string, paperSize: PaperSize = "A3", orientation: PaperOrientation = "landscape"): Layout {
  const id = `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mm = getPaperMmSize({ paperSize, orientation } as Layout);

  // Default viewport fills most of the paper
  const margin = 15; // mm
  const tbHeight = 40; // title block height mm
  const vp: LayoutViewport = {
    id: `vp-${Date.now()}`,
    name: "Viewport 1",
    x: margin,
    y: margin,
    width: mm.w - margin * 2,
    height: mm.h - margin - tbHeight - 5,
    viewCenter: { x: 0, y: 0 },
    viewZoom: 1,
    locked: false,
    active: true,
  };

  return {
    id,
    name,
    paperSize,
    orientation,
    viewports: [vp],
    titleBlock: {
      projectName: "CAD Studio Project",
      drawingTitle: name,
      drawnBy: "",
      checkedBy: "",
      date: new Date().toISOString().split("T")[0],
      scale: "1:1",
      sheetNumber: "1",
      totalSheets: "1",
      revision: "A",
      company: "",
    },
    showTitleBlock: true,
    marginTop: margin,
    marginRight: margin,
    marginBottom: margin,
    marginLeft: margin,
  };
}

export function createViewport(layout: Layout, name: string): LayoutViewport {
  const mm = getPaperMmSize(layout);
  return {
    id: `vp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    x: layout.marginLeft + 10,
    y: layout.marginTop + 10,
    width: (mm.w - layout.marginLeft - layout.marginRight) * 0.4,
    height: (mm.h - layout.marginTop - layout.marginBottom - 45) * 0.4,
    viewCenter: { x: 0, y: 0 },
    viewZoom: 0.5,
    locked: false,
    active: false,
  };
}

/** Draw the paper sheet background, border, and margins */
export function drawPaperSheet(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  offsetX: number,
  offsetY: number,
  zoom: number,
  isDark: boolean
) {
  const { w, h } = getPaperPixelSize(layout);
  const pw = w * zoom;
  const ph = h * zoom;

  // Shadow
  ctx.fillStyle = isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)";
  ctx.fillRect(offsetX + 4 * zoom, offsetY + 4 * zoom, pw, ph);

  // Paper
  ctx.fillStyle = isDark ? "#1e1e2e" : "#ffffff";
  ctx.fillRect(offsetX, offsetY, pw, ph);

  // Border
  ctx.strokeStyle = isDark ? "#4a4a6a" : "#333333";
  ctx.lineWidth = 2 * zoom;
  ctx.strokeRect(offsetX, offsetY, pw, ph);

  // Margin lines (dashed)
  const ml = layout.marginLeft * MM_TO_PX * zoom;
  const mr = layout.marginRight * MM_TO_PX * zoom;
  const mt = layout.marginTop * MM_TO_PX * zoom;
  const mb = layout.marginBottom * MM_TO_PX * zoom;

  ctx.strokeStyle = isDark ? "rgba(100,100,180,0.2)" : "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.5 * zoom;
  ctx.setLineDash([4 * zoom, 4 * zoom]);
  ctx.strokeRect(offsetX + ml, offsetY + mt, pw - ml - mr, ph - mt - mb);
  ctx.setLineDash([]);
}

/** Draw a viewport frame on the paper */
export function drawViewportFrame(
  ctx: CanvasRenderingContext2D,
  vp: LayoutViewport,
  offsetX: number,
  offsetY: number,
  zoom: number,
  isActive: boolean,
  isDark: boolean
) {
  const x = offsetX + vp.x * MM_TO_PX * zoom;
  const y = offsetY + vp.y * MM_TO_PX * zoom;
  const w = vp.width * MM_TO_PX * zoom;
  const h = vp.height * MM_TO_PX * zoom;

  // Viewport border
  ctx.strokeStyle = isActive ? "#3b82f6" : (isDark ? "#555577" : "#888888");
  ctx.lineWidth = isActive ? 2 * zoom : 1 * zoom;
  ctx.setLineDash(isActive ? [] : [6 * zoom, 3 * zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Viewport label
  ctx.font = `${10 * zoom}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = isActive ? "#3b82f6" : (isDark ? "#777799" : "#666666");
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(vp.name, x + 4 * zoom, y - 2 * zoom);

  // Lock indicator
  if (vp.locked) {
    ctx.fillText("🔒", x + w - 16 * zoom, y - 2 * zoom);
  }
}

/** Draw the title block in the bottom-right of the paper */
export function drawTitleBlock(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  offsetX: number,
  offsetY: number,
  zoom: number,
  isDark: boolean
) {
  if (!layout.showTitleBlock) return;

  const { w: pw, h: ph } = getPaperPixelSize(layout);
  const tb = layout.titleBlock;

  // Title block dimensions (in pixels at zoom)
  const tbW = 180 * MM_TO_PX * zoom;
  const tbH = 40 * MM_TO_PX * zoom;
  const tbX = offsetX + pw * zoom - tbW - layout.marginRight * MM_TO_PX * zoom;
  const tbY = offsetY + ph * zoom - tbH - layout.marginBottom * MM_TO_PX * zoom;

  // Background
  ctx.fillStyle = isDark ? "#16162a" : "#f8f8f8";
  ctx.fillRect(tbX, tbY, tbW, tbH);

  // Border
  ctx.strokeStyle = isDark ? "#4a4a6a" : "#333333";
  ctx.lineWidth = 1.5 * zoom;
  ctx.strokeRect(tbX, tbY, tbW, tbH);

  // Internal dividers
  const rowH = tbH / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(tbX, tbY + rowH * i);
    ctx.lineTo(tbX + tbW, tbY + rowH * i);
    ctx.stroke();
  }

  // Vertical divider at 60%
  const colDiv = tbW * 0.6;
  ctx.beginPath();
  ctx.moveTo(tbX + colDiv, tbY);
  ctx.lineTo(tbX + colDiv, tbY + tbH);
  ctx.stroke();

  // Another vertical at 80%
  const colDiv2 = tbW * 0.8;
  ctx.beginPath();
  ctx.moveTo(tbX + colDiv2, tbY + rowH);
  ctx.lineTo(tbX + colDiv2, tbY + tbH);
  ctx.stroke();

  // Text
  const textColor = isDark ? "#c0c0e0" : "#222222";
  const labelColor = isDark ? "#7070a0" : "#666666";
  const fontSize = Math.max(8, 9 * zoom);
  const labelSize = Math.max(6, 7 * zoom);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // Row 1: Company / Project Name (full width)
  ctx.font = `bold ${fontSize * 1.2}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.company || tb.projectName, tbX + 6 * zoom, tbY + rowH * 0.5);

  // Row 2: Drawing Title
  ctx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.drawingTitle, tbX + 6 * zoom, tbY + rowH * 1.5);
  // Scale
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("SCALE", tbX + colDiv + 6 * zoom, tbY + rowH * 1.25);
  ctx.font = `${fontSize}px "Fira Code", monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.scale, tbX + colDiv + 6 * zoom, tbY + rowH * 1.7);
  // Rev
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("REV", tbX + colDiv2 + 6 * zoom, tbY + rowH * 1.25);
  ctx.font = `${fontSize}px "Fira Code", monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.revision, tbX + colDiv2 + 6 * zoom, tbY + rowH * 1.7);

  // Row 3: Drawn By / Date
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("DRAWN BY", tbX + 6 * zoom, tbY + rowH * 2.25);
  ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.drawnBy, tbX + 6 * zoom, tbY + rowH * 2.7);
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("DATE", tbX + colDiv + 6 * zoom, tbY + rowH * 2.25);
  ctx.font = `${fontSize}px "Fira Code", monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.date, tbX + colDiv + 6 * zoom, tbY + rowH * 2.7);
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("SHEET", tbX + colDiv2 + 6 * zoom, tbY + rowH * 2.25);
  ctx.font = `${fontSize}px "Fira Code", monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(`${tb.sheetNumber}/${tb.totalSheets}`, tbX + colDiv2 + 6 * zoom, tbY + rowH * 2.7);

  // Row 4: Checked By
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("CHECKED BY", tbX + 6 * zoom, tbY + rowH * 3.25);
  ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.checkedBy, tbX + 6 * zoom, tbY + rowH * 3.7);
  ctx.font = `${labelSize}px "Fira Code", monospace`;
  ctx.fillStyle = labelColor;
  ctx.fillText("PROJECT", tbX + colDiv + 6 * zoom, tbY + rowH * 3.25);
  ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText(tb.projectName, tbX + colDiv + 6 * zoom, tbY + rowH * 3.7);
}
