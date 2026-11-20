import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { virtualCameraWorld } from '../../src/systems/portalViews';
import { M_A, M_B, NOR_B, POS_B, cameraAt } from '../utils/portalTestFakes';

describe('virtualCameraWorld (T23, convención espejo T25)', () => {
  it('cámara 3 m delante de A → virtual a 3 m DELANTE del plano de B (lado sala) mirando +nB', () => {
    const camera = cameraAt([0, 0, 3], [0, 0, 0]);
    const C = camera.matrixWorld.clone();
    const V = virtualCameraWorld(M_A, M_B, C);

    const pos = new Vector3().setFromMatrixPosition(V);
    const expected = new Vector3(POS_B[0], POS_B[1], POS_B[2])
      .addScaledVector(new Vector3(NOR_B[0], NOR_B[1], NOR_B[2]), 3);
    expect(pos.distanceTo(expected)).toBeLessThan(1e-10);

    const dir = new Vector3().setFromMatrixColumn(V, 2).negate().normalize();
    const nB = new Vector3(NOR_B[0], NOR_B[1], NOR_B[2]);
    expect(dir.distanceTo(nB)).toBeLessThan(1e-10);
  });

  it('espejo: conserva distancia y offset lateral respecto de B', () => {
    const camera = cameraAt([2, 1, 3], [0, 0, 0]);
    const V = virtualCameraWorld(M_A, M_B, camera.matrixWorld);
    const pos = new Vector3().setFromMatrixPosition(V);
    expect(pos.distanceTo(new Vector3(2, 1, 7))).toBeLessThan(1e-10);
  });

  it('T inversa devuelve la cámara original', () => {
    const camera = cameraAt([1, -2, 4], [0, 0, 0]);
    const C = camera.matrixWorld.clone();
    const back = virtualCameraWorld(M_B, M_A, virtualCameraWorld(M_A, M_B, C));
    C.elements.forEach((v, i) => expect(back.elements[i]).toBeCloseTo(v, 12));
  });

  it('no modifica las entradas', () => {
    const camera = cameraAt([1, 2, 3], [0, 0, 0]);
    const from = M_A.clone();
    const to = M_B.clone();
    const camWorld = camera.matrixWorld.clone();
    const before = [from.elements.slice(), to.elements.slice(), camWorld.elements.slice()];
    virtualCameraWorld(from, to, camWorld);
    expect(from.elements).toEqual(before[0]);
    expect(to.elements).toEqual(before[1]);
    expect(camWorld.elements).toEqual(before[2]);
  });
});
