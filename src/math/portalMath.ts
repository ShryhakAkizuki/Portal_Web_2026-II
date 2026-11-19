import { Matrix3, Matrix4, Vector3 } from 'three';
import type { Vec3 } from '../types/contracts';

export interface PortalFrame {
  position: Vector3;
  normal: Vector3;
  up: Vector3;
  right: Vector3;
}

const ROT_180_Y = new Matrix4().makeRotationY(Math.PI);

const toVector = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

export function makePortalFrame(position: Vec3, normal: Vec3, up: Vec3): PortalFrame {
  const n = toVector(normal).normalize();
  const u = toVector(up);
  u.addScaledVector(n, -u.dot(n));
  if (u.lengthSq() < 1e-12) {
    u.set(0, 1, 0).addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-12) u.set(1, 0, 0).addScaledVector(n, -u.dot(n));
  }
  u.normalize();
  const right = new Vector3().crossVectors(u, n);
  return { position: toVector(position), normal: n, up: u, right };
}

export function frameMatrix(f: PortalFrame): Matrix4 {
  return new Matrix4().makeBasis(f.right, f.up, f.normal).setPosition(f.position);
}

export function portalTransform(from: Matrix4, to: Matrix4): Matrix4 {
  return to.clone().multiply(ROT_180_Y).multiply(from.clone().invert());
}

export function transformPoint(T: Matrix4, p: Vector3): Vector3 {
  return p.clone().applyMatrix4(T);
}

export function transformDirection(T: Matrix4, d: Vector3): Vector3 {
  return d.clone().applyMatrix3(new Matrix3().setFromMatrix4(T));
}

export function signedDistance(p: Vector3, f: PortalFrame): number {
  return (p.x - f.position.x) * f.normal.x
    + (p.y - f.position.y) * f.normal.y
    + (p.z - f.position.z) * f.normal.z;
}

export function crossedPortal(
  prev: Vector3,
  curr: Vector3,
  f: PortalFrame,
  width: number,
  height: number,
): boolean {
  const s0 = signedDistance(prev, f);
  const s1 = signedDistance(curr, f);
  if (s0 <= 0 || s1 > 0) return false;
  const t = s0 / (s0 - s1);
  const q = prev.clone().lerp(curr, t).sub(f.position);
  return Math.abs(q.dot(f.right)) <= width / 2 && Math.abs(q.dot(f.up)) <= height / 2;
}

export function directionFromYawPitch(yaw: number, pitch: number): Vector3 {
  const cp = Math.cos(pitch);
  return new Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function yawPitchFromDirection(d: Vector3): { yaw: number; pitch: number } {
  const n = d.clone().normalize();
  return {
    yaw: Math.atan2(-n.x, -n.z),
    pitch: Math.asin(Math.min(1, Math.max(-1, n.y))),
  };
}
