import type { Vec3 } from '../types/contracts';

export interface Bounds { min: Vec3; max: Vec3 }
export type Axis = 0 | 1 | 2;
export interface Rect2 { u0: number; u1: number; v0: number; v1: number }

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

export function axisOfNormal(n: Vec3, tol = 1e-3): { axis: Axis; sign: 1 | -1 } | null {
  const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  let axis: Axis = 0;
  for (let i = 1; i < 3; i++) {
    if (a[i] > a[axis]) axis = i as Axis;
  }
  if (a[axis] <= tol) return null;
  if (a[(axis + 1) % 3] > tol || a[(axis + 2) % 3] > tol) return null;
  return { axis, sign: n[axis] >= 0 ? 1 : -1 };
}

export function faceBasis(axis: Axis): { u: Axis; v: Axis } {
  const rest = ([0, 1, 2] as Axis[]).filter((i) => i !== axis);
  return { u: rest[0], v: rest[1] };
}

export function snapUp(viewDir: Vec3, normal: Vec3): Vec3 {
  const na = axisOfNormal(normal);
  if (!na || na.axis !== 1) return [0, 1, 0];
  const h = Math.hypot(viewDir[0], viewDir[2]);
  if (h < 1e-6) return [0, 0, -1];
  if (Math.abs(viewDir[0]) >= Math.abs(viewDir[2])) return [Math.sign(viewDir[0]), 0, 0];
  return [0, 0, Math.sign(viewDir[2])];
}

function widthHeightAxes(normalAxis: Axis, up: Vec3): { wAxis: Axis; hAxis: Axis } {
  const { u, v } = faceBasis(normalAxis);
  const upAxis = axisOfNormal(up)?.axis;
  const hAxis: Axis = upAxis === u || upAxis === v ? upAxis : v;
  const wAxis: Axis = hAxis === u ? v : u;
  return { wAxis, hAxis };
}

export function fitPortalOnFace(
  b: Bounds,
  point: Vec3,
  normalAxis: { axis: Axis; sign: 1 | -1 },
  up: Vec3,
  w: number,
  h: number,
): { center: Vec3; ok: boolean } {
  const n = normalAxis.axis;
  const { wAxis, hAxis } = widthHeightAxes(n, up);
  const size = (a: Axis): number => b.max[a] - b.min[a];
  const ok = size(hAxis) >= h && size(wAxis) >= w;
  const center: Vec3 = [0, 0, 0];
  center[n] = normalAxis.sign === 1 ? b.max[n] : b.min[n];
  if (ok) {
    center[hAxis] = clamp(point[hAxis], b.min[hAxis] + h / 2, b.max[hAxis] - h / 2);
    center[wAxis] = clamp(point[wAxis], b.min[wAxis] + w / 2, b.max[wAxis] - w / 2);
  } else {
    center[hAxis] = clamp(point[hAxis], b.min[hAxis], b.max[hAxis]);
    center[wAxis] = clamp(point[wAxis], b.min[wAxis], b.max[wAxis]);
  }
  return { center, ok };
}

export function rectsOverlap(a: Rect2, b: Rect2, margin = 0): boolean {
  return (
    a.u0 < b.u1 + margin &&
    a.u1 > b.u0 - margin &&
    a.v0 < b.v1 + margin &&
    a.v1 > b.v0 - margin
  );
}

export function portalRect(center: Vec3, normalAxis: Axis, up: Vec3, w: number, h: number): Rect2 {
  const { u, v } = faceBasis(normalAxis);
  const { hAxis } = widthHeightAxes(normalAxis, up);
  const half = (a: Axis): number => (a === hAxis ? h / 2 : w / 2);
  return {
    u0: center[u] - half(u),
    u1: center[u] + half(u),
    v0: center[v] - half(v),
    v1: center[v] + half(v),
  };
}

export function splitBoxAroundHole(b: Bounds, axis: Axis, hole: Rect2): Bounds[] {
  const { u, v } = faceBasis(axis);
  const hU0 = clamp(hole.u0, b.min[u], b.max[u]);
  const hU1 = clamp(hole.u1, b.min[u], b.max[u]);
  const hV0 = clamp(hole.v0, b.min[v], b.max[v]);
  const hV1 = clamp(hole.v1, b.min[v], b.max[v]);
  if (hU1 <= hU0 || hV1 <= hV0) return [b];

  const boxes: Bounds[] = [];
  const band = (u0: number, u1: number, v0: number, v1: number): void => {
    if (u1 - u0 <= 0 || v1 - v0 <= 0) return;
    const min: Vec3 = [0, 0, 0];
    const max: Vec3 = [0, 0, 0];
    min[axis] = b.min[axis];
    max[axis] = b.max[axis];
    min[u] = u0;
    max[u] = u1;
    min[v] = v0;
    max[v] = v1;
    boxes.push({ min, max });
  };
  band(b.min[u], hU0, b.min[v], b.max[v]);
  band(hU1, b.max[u], b.min[v], b.max[v]);
  band(hU0, hU1, b.min[v], hV0);
  band(hU0, hU1, hV1, b.max[v]);
  return boxes;
}

export function subtractHoles(b: Bounds, axis: Axis, holes: Rect2[]): Bounds[] {
  let boxes: Bounds[] = [b];
  for (const hole of holes) {
    boxes = boxes.flatMap((box) => splitBoxAroundHole(box, axis, hole));
  }
  return boxes;
}
