// ============================================================
// PDF Export — Render paper space layout or model space to PDF
// Uses jsPDF for PDF generation
// ============================================================

import { jsPDF } from "jspdf";
import type { CADEntity, Layout, Point } from "./cad-types";
import { getPaperMmSize, MM_TO_PX } from "./layout-utils";

// ============================================================
// Color helpers
// ============================================================
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return [r, g, b];
}

// For PDF we invert white entities to black for print
function printColor(color: string): [number, number, number] {
  const [r, g, b] = hexToRgb(color);
  // If very light (near white), make it black for printing
  if (r > 220 && g > 220 && b > 220) return [0, 0, 0];
  return [r, g, b];
}

// ============================================================
// Draw entity to PDF
// ============================================================
function drawEntityToPdf(
  doc: jsPDF,
  entity: CADEntity,
  offsetX: number,
  offsetY: number,
  scale: number, // mm per model unit
  allEntities: CADEntity[],
  blocks: { id: string; entities: CADEntity[]; basePoint: Point }[]
) {
  if (!entity.visible) return;

  const [r, g, b] = printColor(entity.color);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(Math.max(0.1, entity.lineWidth * 0.15));

  // Set line dash
  if (entity.lineStyle === "dashed") {
    // @ts-ignore - jsPDF supports setLineDash in some builds
    doc.setLineDashPattern?.([2, 1], 0);
  } else if (entity.lineStyle === "dotted") {
    doc.setLineDashPattern?.([0.5, 0.5], 0);
  } else if (entity.lineStyle === "dashdot") {
    doc.setLineDashPattern?.([2, 0.5, 0.5, 0.5], 0);
  } else {
    doc.setLineDashPattern?.([], 0);
  }

  const tx = (x: number) => offsetX + x * scale;
  const ty = (y: number) => offsetY + y * scale; // Y is already inverted in our model

  const data = entity.data;

  switch (data.type) {
    case "line": {
      doc.line(tx(data.start.x), ty(data.start.y), tx(data.end.x), ty(data.end.y));
      break;
    }
    case "circle": {
      doc.circle(tx(data.center.x), ty(data.center.y), data.radius * scale, "S");
      break;
    }
    case "arc": {
      // jsPDF doesn't have a direct arc method, approximate with line segments
      const steps = 64;
      let sa = data.startAngle;
      let ea = data.endAngle;
      if (ea < sa) ea += Math.PI * 2;
      const points: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * (i / steps);
        points.push([
          tx(data.center.x + Math.cos(a) * data.radius),
          ty(data.center.y + Math.sin(a) * data.radius),
        ]);
      }
      for (let i = 0; i < points.length - 1; i++) {
        doc.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      }
      break;
    }
    case "rectangle": {
      doc.rect(
        tx(data.topLeft.x),
        ty(data.topLeft.y),
        data.width * scale,
        data.height * scale,
        "S"
      );
      break;
    }
    case "polyline": {
      const pts = data.points;
      for (let i = 0; i < pts.length - 1; i++) {
        doc.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i + 1].x), ty(pts[i + 1].y));
      }
      if (data.closed && pts.length > 2) {
        doc.line(tx(pts[pts.length - 1].x), ty(pts[pts.length - 1].y), tx(pts[0].x), ty(pts[0].y));
      }
      break;
    }
    case "ellipse": {
      // Approximate ellipse with line segments
      const eSteps = 64;
      const ePts: [number, number][] = [];
      for (let i = 0; i <= eSteps; i++) {
        const a = (i / eSteps) * Math.PI * 2;
        const ex = data.center.x + data.radiusX * Math.cos(a) * Math.cos(data.rotation) - data.radiusY * Math.sin(a) * Math.sin(data.rotation);
        const ey = data.center.y + data.radiusX * Math.cos(a) * Math.sin(data.rotation) + data.radiusY * Math.sin(a) * Math.cos(data.rotation);
        ePts.push([tx(ex), ty(ey)]);
      }
      for (let i = 0; i < ePts.length - 1; i++) {
        doc.line(ePts[i][0], ePts[i][1], ePts[i + 1][0], ePts[i + 1][1]);
      }
      break;
    }
    case "text": {
      doc.setFontSize(Math.max(6, data.fontSize * scale * 2.5));
      doc.setTextColor(r, g, b);
      if (data.rotation !== 0) {
        // jsPDF text rotation
        const angle = -(data.rotation * 180 / Math.PI);
        doc.text(data.content, tx(data.position.x), ty(data.position.y), { angle });
      } else {
        doc.text(data.content, tx(data.position.x), ty(data.position.y));
      }
      doc.setTextColor(0, 0, 0);
      break;
    }
    case "dimension": {
      // Draw dimension lines and text
      const dx = data.end.x - data.start.x;
      const dy = data.end.y - data.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (data.start.x + data.end.x) / 2;
      const midY = (data.start.y + data.end.y) / 2;

      // Extension lines
      const perpX = -dy / dist * data.offset;
      const perpY = dx / dist * data.offset;
      doc.line(tx(data.start.x), ty(data.start.y), tx(data.start.x + perpX), ty(data.start.y + perpY));
      doc.line(tx(data.end.x), ty(data.end.y), tx(data.end.x + perpX), ty(data.end.y + perpY));

      // Dimension line
      doc.line(tx(data.start.x + perpX), ty(data.start.y + perpY), tx(data.end.x + perpX), ty(data.end.y + perpY));

      // Dimension text
      doc.setFontSize(Math.max(5, 8 * scale));
      doc.setTextColor(r, g, b);
      doc.text(dist.toFixed(2), tx(midX + perpX), ty(midY + perpY) - 1, { align: "center" });
      doc.setTextColor(0, 0, 0);
      break;
    }
    case "spline": {
      // Approximate spline with Catmull-Rom segments
      const cp = data.controlPoints;
      if (cp.length < 2) break;
      const splinePts: [number, number][] = [];
      for (let i = 0; i < cp.length - 1; i++) {
        const p0 = cp[Math.max(0, i - 1)];
        const p1 = cp[i];
        const p2 = cp[Math.min(cp.length - 1, i + 1)];
        const p3 = cp[Math.min(cp.length - 1, i + 2)];
        for (let t = 0; t <= 20; t++) {
          const tt = t / 20;
          const tt2 = tt * tt;
          const tt3 = tt2 * tt;
          const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3);
          const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3);
          splinePts.push([tx(x), ty(y)]);
        }
      }
      for (let i = 0; i < splinePts.length - 1; i++) {
        doc.line(splinePts[i][0], splinePts[i][1], splinePts[i + 1][0], splinePts[i + 1][1]);
      }
      break;
    }
    case "hatch": {
      // Draw hatch boundary
      const bp = data.boundary;
      if (bp.length < 3) break;
      doc.setFillColor(...hexToRgb(data.fillColor));
      // Draw boundary as closed polyline
      for (let i = 0; i < bp.length - 1; i++) {
        doc.line(tx(bp[i].x), ty(bp[i].y), tx(bp[i + 1].x), ty(bp[i + 1].y));
      }
      doc.line(tx(bp[bp.length - 1].x), ty(bp[bp.length - 1].y), tx(bp[0].x), ty(bp[0].y));

      // Draw hatch pattern lines (simplified)
      if (data.pattern !== "solid") {
        const minX = Math.min(...bp.map(p => p.x));
        const maxX = Math.max(...bp.map(p => p.x));
        const minY = Math.min(...bp.map(p => p.y));
        const maxY = Math.max(...bp.map(p => p.y));
        const spacing = (data.patternScale || 5) * 2;
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(0.1);

        if (data.pattern === "crosshatch" || data.pattern === "diagonal") {
          for (let d = minX + minY; d < maxX + maxY; d += spacing) {
            doc.line(tx(Math.max(minX, d - maxY)), ty(Math.max(minY, d - maxX)), tx(Math.min(maxX, d - minY)), ty(Math.min(maxY, d - minX)));
          }
        }
        if (data.pattern === "crosshatch" || data.pattern === "horizontal") {
          for (let y = minY; y < maxY; y += spacing) {
            doc.line(tx(minX), ty(y), tx(maxX), ty(y));
          }
        }
        if (data.pattern === "vertical") {
          for (let x = minX; x < maxX; x += spacing) {
            doc.line(tx(x), ty(minY), tx(x), ty(maxY));
          }
        }
      }
      break;
    }
    case "xline":
    case "ray":
      // Skip infinite lines in PDF — they don't make sense in print
      break;
    case "blockref": {
      const block = blocks.find(b => b.id === data.blockId);
      if (!block) break;
      for (const child of block.entities) {
        // Transform child entity positions
        const transformed = transformBlockEntity(child, data.insertPoint, data.scaleX, data.scaleY, data.rotation, block.basePoint);
        drawEntityToPdf(doc, transformed, offsetX, offsetY, scale, allEntities, blocks);
      }
      break;
    }
  }

  // Reset line dash
  doc.setLineDashPattern?.([], 0);
}

// ============================================================
// Transform block entity for insertion
// ============================================================
function transformBlockEntity(
  entity: CADEntity,
  insertPoint: Point,
  scaleX: number,
  scaleY: number,
  rotation: number,
  basePoint: Point
): CADEntity {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const tp = (p: Point): Point => {
    const dx = (p.x - basePoint.x) * scaleX;
    const dy = (p.y - basePoint.y) * scaleY;
    return {
      x: insertPoint.x + dx * cos - dy * sin,
      y: insertPoint.y + dx * sin + dy * cos,
    };
  };

  const d = entity.data;
  let newData: any;

  switch (d.type) {
    case "line":
      newData = { ...d, start: tp(d.start), end: tp(d.end) };
      break;
    case "circle":
      newData = { ...d, center: tp(d.center), radius: d.radius * Math.abs(scaleX) };
      break;
    case "arc":
      newData = { ...d, center: tp(d.center), radius: d.radius * Math.abs(scaleX), startAngle: d.startAngle + rotation, endAngle: d.endAngle + rotation };
      break;
    case "rectangle":
      newData = { ...d, topLeft: tp(d.topLeft), width: d.width * scaleX, height: d.height * scaleY };
      break;
    case "polyline":
      newData = { ...d, points: d.points.map(tp) };
      break;
    case "text":
      newData = { ...d, position: tp(d.position), fontSize: d.fontSize * Math.abs(scaleX) };
      break;
    default:
      newData = d;
  }

  return { ...entity, data: newData };
}

// ============================================================
// Draw title block to PDF
// ============================================================
function drawTitleBlockToPdf(doc: jsPDF, layout: Layout) {
  if (!layout.showTitleBlock) return;

  const { w: pw, h: ph } = getPaperMmSize(layout);
  const tb = layout.titleBlock;

  const tbW = 180;
  const tbH = 40;
  const tbX = pw - tbW - layout.marginRight;
  const tbY = ph - tbH - layout.marginBottom;

  // Border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(tbX, tbY, tbW, tbH, "S");

  // Internal dividers
  const rowH = tbH / 4;
  for (let i = 1; i < 4; i++) {
    doc.line(tbX, tbY + rowH * i, tbX + tbW, tbY + rowH * i);
  }

  // Vertical dividers
  const colDiv = tbW * 0.6;
  doc.line(tbX + colDiv, tbY, tbX + colDiv, tbY + tbH);
  const colDiv2 = tbW * 0.8;
  doc.line(tbX + colDiv2, tbY + rowH, tbX + colDiv2, tbY + tbH);

  // Text
  doc.setTextColor(0, 0, 0);

  // Row 1: Company/Project
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(tb.company || tb.projectName, tbX + 2, tbY + rowH * 0.65);

  // Row 2: Drawing Title
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(tb.drawingTitle, tbX + 2, tbY + rowH * 1.65);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("SCALE", tbX + colDiv + 2, tbY + rowH * 1.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.scale, tbX + colDiv + 2, tbY + rowH * 1.75);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("REV", tbX + colDiv2 + 2, tbY + rowH * 1.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.revision, tbX + colDiv2 + 2, tbY + rowH * 1.75);

  // Row 3: Drawn By / Date / Sheet
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("DRAWN BY", tbX + 2, tbY + rowH * 2.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.drawnBy, tbX + 2, tbY + rowH * 2.75);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("DATE", tbX + colDiv + 2, tbY + rowH * 2.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.date, tbX + colDiv + 2, tbY + rowH * 2.75);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("SHEET", tbX + colDiv2 + 2, tbY + rowH * 2.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(`${tb.sheetNumber}/${tb.totalSheets}`, tbX + colDiv2 + 2, tbY + rowH * 2.75);

  // Row 4: Checked By / Project
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("CHECKED BY", tbX + 2, tbY + rowH * 3.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.checkedBy, tbX + 2, tbY + rowH * 3.75);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("PROJECT", tbX + colDiv + 2, tbY + rowH * 3.3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text(tb.projectName, tbX + colDiv + 2, tbY + rowH * 3.75);
}

// ============================================================
// Export Model Space to PDF
// ============================================================
export function exportModelSpaceToPdf(
  entities: CADEntity[],
  blocks: { id: string; entities: CADEntity[]; basePoint: Point }[],
  filename: string = "drawing.pdf"
) {
  // Calculate bounding box of all entities
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    if (!e.visible) continue;
    const d = e.data;
    const pts = getEntityBounds(d);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!isFinite(minX)) {
    // No entities, create empty page
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    doc.setFontSize(14);
    doc.text("CAD Studio — Empty Drawing", 20, 20);
    doc.save(filename);
    return;
  }

  // Add margin
  const margin = 20;
  const drawW = maxX - minX;
  const drawH = maxY - minY;

  // Choose paper size based on aspect ratio
  const aspect = drawW / (drawH || 1);
  const orientation = aspect > 1 ? "landscape" : "portrait";
  const format = "a3";

  const doc = new jsPDF({ orientation: orientation as "landscape" | "portrait", unit: "mm", format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Calculate scale to fit drawing on page
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const scale = Math.min(availW / (drawW || 1), availH / (drawH || 1));

  // Center the drawing
  const offsetX = margin + (availW - drawW * scale) / 2 - minX * scale;
  const offsetY = margin + (availH - drawH * scale) / 2 - minY * scale;

  // Draw all entities
  for (const entity of entities) {
    drawEntityToPdf(doc, entity, offsetX, offsetY, scale, entities, blocks);
  }

  // Add watermark
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text("Exported from CAD Studio", pageW - margin, pageH - 5, { align: "right" });

  doc.save(filename);
}

// ============================================================
// Export Layout (Paper Space) to PDF
// ============================================================
export function exportLayoutToPdf(
  layout: Layout,
  entities: CADEntity[],
  blocks: { id: string; entities: CADEntity[]; basePoint: Point }[],
  filename: string = "layout.pdf"
) {
  const { w: paperW, h: paperH } = getPaperMmSize(layout);
  const orientation = paperW > paperH ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation: orientation as "landscape" | "portrait",
    unit: "mm",
    format: [Math.max(paperW, paperH), Math.min(paperW, paperH)],
  });

  // Draw paper border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(0, 0, paperW, paperH, "S");

  // Draw margin lines (light)
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern?.([2, 1], 0);
  doc.rect(
    layout.marginLeft,
    layout.marginTop,
    paperW - layout.marginLeft - layout.marginRight,
    paperH - layout.marginTop - layout.marginBottom,
    "S"
  );
  doc.setLineDashPattern?.([], 0);

  // Draw each viewport's content
  for (const vp of layout.viewports) {
    // Clip to viewport area
    // jsPDF doesn't have native clipping, so we just draw within bounds
    const vpX = vp.x;
    const vpY = vp.y;
    const vpW = vp.width;
    const vpH = vp.height;

    // Draw viewport border
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(vpX, vpY, vpW, vpH, "S");

    // Calculate scale for this viewport
    // viewport shows model space centered at viewCenter with viewZoom
    const vpScale = vp.viewZoom * Math.min(vpW / 500, vpH / 500); // approximate scale

    const vpOffsetX = vpX + vpW / 2 - vp.viewCenter.x * vpScale;
    const vpOffsetY = vpY + vpH / 2 - vp.viewCenter.y * vpScale;

    // Draw visible entities within this viewport
    for (const entity of entities) {
      if (!entity.visible) continue;
      // Simple bounds check
      drawEntityToPdf(doc, entity, vpOffsetX, vpOffsetY, vpScale, entities, blocks);
    }
  }

  // Draw title block
  drawTitleBlockToPdf(doc, layout);

  // Watermark
  doc.setFontSize(6);
  doc.setTextColor(200, 200, 200);
  doc.text("Exported from CAD Studio", paperW - layout.marginRight, paperH - 2, { align: "right" });

  doc.save(filename);
}

// ============================================================
// Helper: get bounding points for an entity
// ============================================================
function getEntityBounds(data: any): Point[] {
  switch (data.type) {
    case "line":
      return [data.start, data.end];
    case "circle":
      return [
        { x: data.center.x - data.radius, y: data.center.y - data.radius },
        { x: data.center.x + data.radius, y: data.center.y + data.radius },
      ];
    case "arc":
      return [
        { x: data.center.x - data.radius, y: data.center.y - data.radius },
        { x: data.center.x + data.radius, y: data.center.y + data.radius },
      ];
    case "rectangle":
      return [
        data.topLeft,
        { x: data.topLeft.x + data.width, y: data.topLeft.y + data.height },
      ];
    case "polyline":
      return data.points;
    case "ellipse":
      return [
        { x: data.center.x - data.radiusX, y: data.center.y - data.radiusY },
        { x: data.center.x + data.radiusX, y: data.center.y + data.radiusY },
      ];
    case "text":
      return [data.position, { x: data.position.x + 20, y: data.position.y + data.fontSize }];
    case "dimension":
      return [data.start, data.end];
    case "spline":
      return data.controlPoints;
    case "hatch":
      return data.boundary;
    default:
      return [];
  }
}
