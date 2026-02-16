/**
 * Spline/Bezier Curve Utilities
 * 
 * Implements cubic B-spline curves with control point editing.
 * Supports open and closed splines, degree 2 (quadratic) and 3 (cubic).
 * Uses De Boor's algorithm for B-spline evaluation.
 */
import type { Point, CADEntity, SplineData } from "./cad-types";

// ─── De Boor's Algorithm for B-Spline Evaluation ───

function generateUniformKnots(n: number, degree: number, closed: boolean): number[] {
  const knots: number[] = [];
  if (closed) {
    const total = n + degree + 1;
    for (let i = 0; i < total; i++) {
      knots.push(i);
    }
  } else {
    // Clamped knot vector
    for (let i = 0; i <= degree; i++) knots.push(0);
    const interior = n - degree;
    for (let i = 1; i < interior; i++) knots.push(i);
    for (let i = 0; i <= degree; i++) knots.push(Math.max(1, interior));
  }
  return knots;
}

function deBoor(k: number, degree: number, t: number, knots: number[], controlPoints: Point[]): Point {
  const d: Point[] = [];
  for (let j = 0; j <= degree; j++) {
    const idx = (k - degree + j) % controlPoints.length;
    const safeIdx = idx < 0 ? idx + controlPoints.length : idx;
    d.push({ x: controlPoints[safeIdx].x, y: controlPoints[safeIdx].y });
  }

  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j;
      const denom = knots[i + degree - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      };
    }
  }
  return d[degree];
}

// ─── Evaluate Spline Points ───

export function evaluateSpline(controlPoints: Point[], degree: number, closed: boolean, segments: number = 100): Point[] {
  if (controlPoints.length < 2) return [...controlPoints];
  
  const effectiveDegree = Math.min(degree, controlPoints.length - 1);
  
  if (effectiveDegree < 1) return [...controlPoints];

  let pts = controlPoints;
  if (closed) {
    // Wrap control points for closed spline
    pts = [...controlPoints];
    for (let i = 0; i < effectiveDegree; i++) {
      pts.push(controlPoints[i % controlPoints.length]);
    }
  }

  const n = pts.length;
  const knots = generateUniformKnots(n, effectiveDegree, closed);
  const result: Point[] = [];

  const tMin = closed ? effectiveDegree : 0;
  const tMax = closed ? n : knots[knots.length - 1];

  for (let i = 0; i <= segments; i++) {
    const t = tMin + (tMax - tMin) * (i / segments);
    // Find the knot span
    let k = effectiveDegree;
    for (let j = effectiveDegree; j < knots.length - 1; j++) {
      if (t >= knots[j] && t < knots[j + 1]) {
        k = j;
        break;
      }
    }
    // Clamp to last valid span
    if (t >= knots[knots.length - 1]) {
      k = knots.length - effectiveDegree - 2;
    }
    
    const point = deBoor(k, effectiveDegree, t, knots, pts);
    result.push(point);
  }

  return result;
}

// ─── Catmull-Rom Spline (smoother for fewer points) ───

export function evaluateCatmullRom(controlPoints: Point[], closed: boolean, segments: number = 80): Point[] {
  if (controlPoints.length < 2) return [...controlPoints];
  if (controlPoints.length === 2) {
    // Just a line
    const result: Point[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      result.push({
        x: controlPoints[0].x + t * (controlPoints[1].x - controlPoints[0].x),
        y: controlPoints[0].y + t * (controlPoints[1].y - controlPoints[0].y),
      });
    }
    return result;
  }

  const pts = closed
    ? [controlPoints[controlPoints.length - 1], ...controlPoints, controlPoints[0], controlPoints[1]]
    : [controlPoints[0], ...controlPoints, controlPoints[controlPoints.length - 1]];

  const result: Point[] = [];
  const numSegments = pts.length - 3;
  const pointsPerSegment = Math.max(4, Math.ceil(segments / numSegments));

  for (let i = 0; i < numSegments; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];

    for (let j = 0; j <= pointsPerSegment; j++) {
      if (i > 0 && j === 0) continue; // avoid duplicate points
      const t = j / pointsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      result.push({
        x: 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        ),
        y: 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        ),
      });
    }
  }

  return result;
}

// ─── Draw Spline on Canvas ───

export function drawSpline(
  ctx: CanvasRenderingContext2D,
  data: SplineData,
  color: string,
  lineWidth: number,
  lineStyle: string,
  panX: number,
  panY: number,
  zoom: number,
  selected: boolean,
  showControlPoints: boolean = false,
) {
  const { controlPoints, degree, closed } = data;
  if (controlPoints.length < 2) return;

  // Evaluate spline curve points
  const curvePoints = degree <= 1
    ? controlPoints // degree 1 = polyline
    : evaluateCatmullRom(controlPoints, closed, Math.max(60, controlPoints.length * 20));

  // Draw the curve
  ctx.save();
  ctx.strokeStyle = selected ? "#00bfff" : color;
  ctx.lineWidth = (selected ? lineWidth + 1 : lineWidth) * zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (lineStyle === "dashed") ctx.setLineDash([8 * zoom, 4 * zoom]);
  else if (lineStyle === "dotted") ctx.setLineDash([2 * zoom, 3 * zoom]);
  else if (lineStyle === "dashdot") ctx.setLineDash([8 * zoom, 3 * zoom, 2 * zoom, 3 * zoom]);

  ctx.beginPath();
  for (let i = 0; i < curvePoints.length; i++) {
    const sx = curvePoints[i].x * zoom + panX;
    const sy = curvePoints[i].y * zoom + panY;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Draw control points when selected or in spline tool mode
  if (showControlPoints || selected) {
    ctx.save();
    // Draw control polygon (thin dashed line)
    ctx.strokeStyle = selected ? "rgba(0, 191, 255, 0.3)" : "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < controlPoints.length; i++) {
      const sx = controlPoints[i].x * zoom + panX;
      const sy = controlPoints[i].y * zoom + panY;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    if (closed) ctx.closePath();
    ctx.stroke();

    // Draw control point handles
    for (let i = 0; i < controlPoints.length; i++) {
      const sx = controlPoints[i].x * zoom + panX;
      const sy = controlPoints[i].y * zoom + panY;

      // Diamond shape for control points
      ctx.fillStyle = i === 0 ? "#22c55e" : (i === controlPoints.length - 1 && !closed) ? "#ef4444" : "#00bfff";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      const size = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy - size);
      ctx.lineTo(sx + size, sy);
      ctx.lineTo(sx, sy + size);
      ctx.lineTo(sx - size, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ─── Draw Spline Preview (during drawing) ───

export function drawSplinePreview(
  ctx: CanvasRenderingContext2D,
  controlPoints: Point[],
  previewPoint: Point | null,
  closed: boolean,
  color: string,
  panX: number,
  panY: number,
  zoom: number,
) {
  const pts = previewPoint ? [...controlPoints, previewPoint] : controlPoints;
  if (pts.length < 2) {
    // Just draw the single point
    if (pts.length === 1) {
      const sx = pts[0].x * zoom + panX;
      const sy = pts[0].y * zoom + panY;
      ctx.save();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  // Draw the preview curve
  const curvePoints = evaluateCatmullRom(pts, false, Math.max(40, pts.length * 15));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * zoom;
  ctx.globalAlpha = 0.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  for (let i = 0; i < curvePoints.length; i++) {
    const sx = curvePoints[i].x * zoom + panX;
    const sy = curvePoints[i].y * zoom + panY;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Draw control polygon
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const sx = pts[i].x * zoom + panX;
    const sy = pts[i].y * zoom + panY;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Draw control point handles
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (let i = 0; i < pts.length; i++) {
    const sx = pts[i].x * zoom + panX;
    const sy = pts[i].y * zoom + panY;
    const isPreview = previewPoint && i === pts.length - 1;

    ctx.fillStyle = i === 0 ? "#22c55e" : isPreview ? "rgba(0, 191, 255, 0.5)" : "#00bfff";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;

    const size = isPreview ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy - size);
    ctx.lineTo(sx + size, sy);
    ctx.lineTo(sx, sy + size);
    ctx.lineTo(sx - size, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Hit Testing ───

export function hitTestSpline(
  data: SplineData,
  point: Point,
  threshold: number = 5,
): boolean {
  const { controlPoints, closed } = data;
  if (controlPoints.length < 2) return false;

  const curvePoints = evaluateCatmullRom(controlPoints, closed, Math.max(60, controlPoints.length * 20));

  for (let i = 0; i < curvePoints.length - 1; i++) {
    const dist = pointToSegmentDistance(point, curvePoints[i], curvePoints[i + 1]);
    if (dist <= threshold) return true;
  }
  return false;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ─── Move Spline ───

export function moveSpline(data: SplineData, dx: number, dy: number): SplineData {
  return {
    ...data,
    controlPoints: data.controlPoints.map(p => ({ x: p.x + dx, y: p.y + dy })),
  };
}

// ─── Get Spline Endpoints (for snap) ───

export function getSplineEndpoints(data: SplineData): Point[] {
  if (data.controlPoints.length === 0) return [];
  if (data.closed) return []; // closed splines have no endpoints
  return [
    data.controlPoints[0],
    data.controlPoints[data.controlPoints.length - 1],
  ];
}

// ─── Get Spline Control Point Positions (for snap) ───

export function getSplineControlPoints(data: SplineData): Point[] {
  return [...data.controlPoints];
}
