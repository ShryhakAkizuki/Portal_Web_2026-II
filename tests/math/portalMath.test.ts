import { describe, it, expect } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import {
  makePortalFrame,
  frameMatrix,
  portalTransform,
  transformPoint,
  transformDirection,
  signedDistance,
  crossedPortal,
  directionFromYawPitch,
  yawPitchFromDirection,
} from '../../src/math/portalMath';

const TOL = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const vClose = (a: Vector3, b: Vector3) => a.distanceTo(b) <= TOL;
const IDENT = new Matrix4().identity();

describe('math/portalMath', () => {
  describe('makePortalFrame / frameMatrix', () => {
    it('normaliza normal, ortogonaliza up y calcula right = up × normal', () => {
      const f = makePortalFrame([1, 2, 3], [0, 0, 3], [0, 4, 2]);
      expect(f.normal.lengthSq()).toBeCloseTo(1, 9);
      expect(f.normal).toEqual(new Vector3(0, 0, 1));
      expect(f.up.lengthSq()).toBeCloseTo(1, 9);
      expect(near(f.up.dot(f.normal), 0)).toBe(true);
      expect(f.up).toEqual(new Vector3(0, 1, 0));
      expect(f.right).toEqual(new Vector3(1, 0, 0));
      expect(frameMatrix(f).determinant()).toBeCloseTo(1, 9);
    });

    it('frameMatrix coloca la posición en la traslación', () => {
      const f = makePortalFrame([5, -2, 7], [0, 0, 1], [0, 1, 0]);
      const e = frameMatrix(f).elements;
      expect(e[12]).toBeCloseTo(5, 9);
      expect(e[13]).toBeCloseTo(-2, 9);
      expect(e[14]).toBeCloseTo(7, 9);
    });

    it('soporta up degenerado (paralelo a normal) sin NaN', () => {
      const f = makePortalFrame([0, 0, 0], [0, 0, 1], [0, 0, 5]);
      expect(f.up.lengthSq()).toBeCloseTo(1, 9);
      expect(near(f.up.dot(f.normal), 0)).toBe(true);
      expect(f.right.lengthSq()).toBeCloseTo(1, 9);
    });
  });

  describe('portalTransform entre marcos arbitrarios', () => {
    const A = makePortalFrame([0, 0, 0], [0, 0, 1], [0, 1, 0]);
    const B = makePortalFrame([4, 1, -3], [-1, 0, 0], [0, 1, 0]);
    const MA = frameMatrix(A);
    const MB = frameMatrix(B);
    const T = portalTransform(MA, MB);

    it('T·posA = posB', () => {
      expect(vClose(transformPoint(T, A.position), B.position)).toBe(true);
    });

    it('R(T)·nA = −nB', () => {
      expect(vClose(transformDirection(T, A.normal), B.normal.clone().negate())).toBe(true);
    });

    it('R(T)·upA = upB', () => {
      expect(vClose(transformDirection(T, A.up), B.up)).toBe(true);
    });

    it('R(T)·rightA = −rightB', () => {
      expect(vClose(transformDirection(T, A.right), B.right.clone().negate())).toBe(true);
    });

    it('portalTransform(B,A) · T = I (tolerancia 1e-6)', () => {
      const roundTrip = portalTransform(MB, MA).multiply(T);
      for (let i = 0; i < 16; i++) expect(Math.abs(roundTrip.elements[i] - IDENT.elements[i])).toBeLessThanOrEqual(TOL);
    });

    it('no modifica las matrices de entrada', () => {
      const mA = MA.clone();
      const mB = MB.clone();
      portalTransform(mA, mB);
      expect(mA.elements).toEqual(MA.elements);
      expect(mB.elements).toEqual(MB.elements);
    });
  });

  describe('transformPoint / transformDirection', () => {
    const A = makePortalFrame([0, 0, 0], [0, 0, 1], [0, 1, 0]);
    const B = makePortalFrame([4, 1, -3], [-1, 0, 0], [0, 1, 0]);
    const T = portalTransform(frameMatrix(A), frameMatrix(B));

    it('punto delante de A a distancia d queda a distancia −d respecto de B (detrás)', () => {
      const d = 2.5;
      const p = A.position.clone().addScaledVector(A.normal, d);
      expect(near(signedDistance(p, A), d)).toBe(true);
      const q = transformPoint(T, p);
      expect(near(signedDistance(q, B), -d)).toBe(true);
    });

    it('punto detrás de A (s<0) queda delante de B', () => {
      const p = A.position.clone().addScaledVector(A.normal, -1.5);
      expect(signedDistance(p, A) < 0).toBe(true);
      expect(signedDistance(transformPoint(T, p), B) > 0).toBe(true);
    });

    it('transformPoint devuelve un vector nuevo', () => {
      const p = new Vector3(1, 2, 3);
      const q = transformPoint(T, p);
      expect(q).not.toBe(p);
      q.x = 99;
      expect(p.x).toBe(1);
    });

    it('transformDirection devuelve un vector nuevo y conserva la magnitud', () => {
      const v = new Vector3(3, -5, 2);
      const out = transformDirection(T, v);
      expect(out).not.toBe(v);
      expect(out.length()).toBeCloseTo(v.length(), 6);
      const entering = A.normal.clone().negate();
      expect(vClose(transformDirection(T, entering), B.normal)).toBe(true);
    });

    it('una dirección que entra a A (−nA) sale de B como +nB', () => {
      expect(vClose(transformDirection(T, A.normal.clone().negate()), B.normal)).toBe(true);
    });
  });

  describe('caso suelo → pared', () => {
    const A = makePortalFrame([0, 0, 0], [0, 1, 0], [0, 0, -1]);
    const B = makePortalFrame([2, 1, 0], [1, 0, 0], [0, 1, 0]);
    const T = portalTransform(frameMatrix(A), frameMatrix(B));

    it('velocidad (0,−5,0) (cayendo) sale como (+5,0,0) (alejándose de la pared B)', () => {
      const out = transformDirection(T, new Vector3(0, -5, 0));
      expect(out.x).toBeCloseTo(5, 6);
      expect(out.y).toBeCloseTo(0, 6);
      expect(out.z).toBeCloseTo(0, 6);
    });
  });

  describe('crossedPortal', () => {
    const f = makePortalFrame([0, 0, 0], [0, 0, 1], [0, 1, 0]);
    const W = 1.0;
    const H = 2.0;

    it('cruce dentro del rectángulo → true', () => {
      expect(crossedPortal(new Vector3(0, 0, 1), new Vector3(0, 0, -1), f, W, H)).toBe(true);
    });

    it('mismo cruce fuera (lateral > w/2) → false', () => {
      expect(crossedPortal(new Vector3(0.8, 0, 1), new Vector3(0.8, 0, -1), f, W, H)).toBe(false);
    });

    it('ya detrás → false', () => {
      expect(crossedPortal(new Vector3(0, 0, -1), new Vector3(0, 0, -2), f, W, H)).toBe(false);
    });

    it('sin cambio de signo (detrás → delante) → false', () => {
      expect(crossedPortal(new Vector3(0, 0, -1), new Vector3(0, 0, 1), f, W, H)).toBe(false);
    });

    it('cruce por el borde exacto → true (|dot| ≤ W/2 es inclusivo)', () => {
      expect(crossedPortal(new Vector3(0.5, 0, 1), new Vector3(0.5, 0, -1), f, W, H)).toBe(true);
      expect(crossedPortal(new Vector3(0, 1, 1), new Vector3(0, 1, -1), f, W, H)).toBe(true);
    });

    it('curr exactamente en el plano (s_curr = 0) cuenta como cruce', () => {
      expect(crossedPortal(new Vector3(0, 0, 1), new Vector3(0, 0, 0), f, W, H)).toBe(true);
    });
  });

  describe('yaw/pitch', () => {
    it('yaw=0, pitch=0 ↔ (0,0,−1)', () => {
      const d = directionFromYawPitch(0, 0);
      expect(vClose(d, new Vector3(0, 0, -1))).toBe(true);
      const { yaw, pitch } = yawPitchFromDirection(new Vector3(0, 0, -1));
      expect(yaw).toBeCloseTo(0, 9);
      expect(pitch).toBeCloseTo(0, 9);
    });

    it('yawPitchFromDirection(directionFromYawPitch(y,p)) ≈ (y,p) para varios valores', () => {
      const cases: Array<[number, number]> = [
        [0.3, -0.2], [-1.2, 0.7], [2.5, -1.0], [-2.9, 0.1], [Math.PI, 0], [0, 1.2],
      ];
      for (const [y, p] of cases) {
        const d = directionFromYawPitch(y, p);
        const back = yawPitchFromDirection(d);
        expect(vClose(directionFromYawPitch(back.yaw, back.pitch), d)).toBe(true);
        expect(Math.abs(back.pitch - p)).toBeLessThanOrEqual(TOL);
      }
    });

    it('yawPitchFromDirection acepta vectores no unitarios', () => {
      const { yaw, pitch } = yawPitchFromDirection(new Vector3(0, 0, -5));
      expect(yaw).toBeCloseTo(0, 9);
      expect(pitch).toBeCloseTo(0, 9);
    });
  });
});
