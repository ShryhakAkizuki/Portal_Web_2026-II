import { Vector3, Quaternion } from 'three';
import type { Vec3, Quat } from '../types/contracts';

export const toV3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

export const fromV3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

export const toQuat = (q: Quat): Quaternion => new Quaternion(q[0], q[1], q[2], q[3]);

export const fromQuat = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];
