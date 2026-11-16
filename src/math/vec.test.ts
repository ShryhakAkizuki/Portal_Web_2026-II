import { describe, it, expect } from 'vitest';
import { toV3, fromV3, toQuat, fromQuat } from './vec';
import type { Vec3, Quat } from '../types/contracts';

describe('math/vec', () => {
  it('fromV3(toV3(v)) devuelve v', () => {
    const v: Vec3 = [-1.5, 0, 2.25];
    expect(fromV3(toV3(v))).toEqual(v);
  });

  it('fromQuat(toQuat(q)) devuelve q', () => {
    const q: Quat = [0.1, -0.2, 0.3, 0.9];
    expect(fromQuat(toQuat(q))).toEqual(q);
  });
});
