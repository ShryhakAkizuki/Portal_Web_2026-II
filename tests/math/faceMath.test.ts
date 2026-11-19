import { describe, it, expect } from 'vitest';
import {
  axisOfNormal,
  faceBasis,
  snapUp,
  fitPortalOnFace,
  rectsOverlap,
  portalRect,
  splitBoxAroundHole,
  subtractHoles,
} from '../../src/math/faceMath';
import type { Bounds, Rect2 } from '../../src/math/faceMath';
import type { Vec3 } from '../../src/types/contracts';
import { PORTAL_WIDTH, PORTAL_HEIGHT } from '../../src/config';

const vol = (b: Bounds): number =>
  (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);

const WALL: Bounds = { min: [-5, 0, 0], max: [5, 4, 0.5] };
const FACE: { axis: 2; sign: -1 } = { axis: 2, sign: -1 };
const UP_WALL: Vec3 = [0, 1, 0];

describe('math/faceMath', () => {
  describe('axisOfNormal', () => {
    it('(0,0,1) → eje 2, signo +1', () => {
      expect(axisOfNormal([0, 0, 1])).toEqual({ axis: 2, sign: 1 });
    });

    it('(0.0004,1,0) → eje 1, signo +1 (dentro de la tolerancia)', () => {
      expect(axisOfNormal([0.0004, 1, 0])).toEqual({ axis: 1, sign: 1 });
    });

    it('(0.7,0.7,0) → null (no es ±eje)', () => {
      expect(axisOfNormal([0.7, 0.7, 0])).toBeNull();
    });

    it('vector nulo → null', () => {
      expect(axisOfNormal([0, 0, 0])).toBeNull();
    });

    it('signo negativo', () => {
      expect(axisOfNormal([-0.999, 0.0001, 0])).toEqual({ axis: 0, sign: -1 });
    });
  });

  describe('faceBasis', () => {
    it('los otros dos ejes, en orden creciente', () => {
      expect(faceBasis(0)).toEqual({ u: 1, v: 2 });
      expect(faceBasis(1)).toEqual({ u: 0, v: 2 });
      expect(faceBasis(2)).toEqual({ u: 0, v: 1 });
    });
  });

  describe('snapUp', () => {
    it('pared (normal horizontal) → (0,1,0)', () => {
      expect(snapUp([0.3, 0.2, -1], [0, 0, 1])).toEqual([0, 1, 0]);
      expect(snapUp([0, 0, 0], [-1, 0, 0])).toEqual([0, 1, 0]);
    });

    it('suelo con viewDir=(0.2,−0.5,−0.9) → (0,0,−1)', () => {
      expect(snapUp([0.2, -0.5, -0.9], [0, -1, 0])).toEqual([0, 0, -1]);
    });

    it('techo con viewDir=(1,0.3,0.1) → (1,0,0)', () => {
      expect(snapUp([1, 0.3, 0.1], [0, 1, 0])).toEqual([1, 0, 0]);
    });

    it('viewDir casi vertical → (0,0,−1)', () => {
      expect(snapUp([0, -1, 0], [0, -1, 0])).toEqual([0, 0, -1]);
    });
  });

  describe('fitPortalOnFace', () => {
    it('punto cerca del borde: centro limitado a w/2 (ancho) y h/2 (alto) del borde', () => {
      const r = fitPortalOnFace(WALL, [4.8, 3.8, 0], FACE, UP_WALL, PORTAL_WIDTH, PORTAL_HEIGHT);
      expect(r.ok).toBe(true);
      expect(r.center[2]).toBe(0);
      expect(r.center[0]).toBeCloseTo(4.5);
      expect(r.center[1]).toBeCloseTo(3);
    });

    it('signo +1: el centro queda en max[axis]', () => {
      const r = fitPortalOnFace(WALL, [0, 2, 10], { axis: 2, sign: 1 }, UP_WALL, PORTAL_WIDTH, PORTAL_HEIGHT);
      expect(r.ok).toBe(true);
      expect(r.center[2]).toBe(0.5);
    });

    it('cara 0.8×4: el portal no cabe → ok = false', () => {
      const small: Bounds = { min: [-0.4, 0, 0], max: [0.4, 4, 0.5] };
      const r = fitPortalOnFace(small, [0, 2, 0], FACE, UP_WALL, PORTAL_WIDTH, PORTAL_HEIGHT);
      expect(r.ok).toBe(false);
      expect(r.center[2]).toBe(0);
    });

    it('suelo: el alto va en el eje de up (Z) y el ancho en el otro (X)', () => {
      const floor: Bounds = { min: [-5, -0.5, -5], max: [5, 0, 5] };
      const r = fitPortalOnFace(floor, [4.9, 0, -4.9], { axis: 1, sign: -1 }, [0, 0, -1], PORTAL_WIDTH, PORTAL_HEIGHT);
      expect(r.ok).toBe(true);
      expect(r.center[1]).toBe(-0.5);
      expect(r.center[0]).toBeCloseTo(4.5);
      expect(r.center[2]).toBeCloseTo(-4);
    });
  });

  describe('rectsOverlap', () => {
    const a: Rect2 = { u0: 0, u1: 2, v0: 0, v1: 2 };

    it('solapan', () => {
      expect(rectsOverlap(a, { u0: 1, u1: 3, v0: 1, v1: 3 })).toBe(true);
    });

    it('no solapan', () => {
      expect(rectsOverlap(a, { u0: 3, u1: 4, v0: 0, v1: 2 })).toBe(false);
      expect(rectsOverlap(a, { u0: 0, u1: 2, v0: 5, v1: 6 })).toBe(false);
    });

    it('rozar un borde no cuenta como solape (sin margen)', () => {
      expect(rectsOverlap(a, { u0: 2, u1: 4, v0: 0, v1: 2 })).toBe(false);
    });

    it('con margen', () => {
      expect(rectsOverlap(a, { u0: 2.1, u1: 3, v0: 0, v1: 2 }, 0.2)).toBe(true);
      expect(rectsOverlap(a, { u0: 2.5, u1: 3, v0: 0, v1: 2 }, 0.2)).toBe(false);
    });
  });

  describe('portalRect', () => {
    it('portal en pared (up = +Y): ancho en u, alto en v', () => {
      expect(portalRect([0, 2, 0], 2, UP_WALL, PORTAL_WIDTH, PORTAL_HEIGHT)).toEqual({
        u0: -PORTAL_WIDTH / 2,
        u1: PORTAL_WIDTH / 2,
        v0: 2 - PORTAL_HEIGHT / 2,
        v1: 2 + PORTAL_HEIGHT / 2,
      });
    });

    it('portal en suelo (up = −Z): ancho en u (X), alto en v (Z)', () => {
      expect(portalRect([0, 0, 1], 1, [0, 0, -1], PORTAL_WIDTH, PORTAL_HEIGHT)).toEqual({
        u0: -PORTAL_WIDTH / 2,
        u1: PORTAL_WIDTH / 2,
        v0: 1 - PORTAL_HEIGHT / 2,
        v1: 1 + PORTAL_HEIGHT / 2,
      });
    });
  });

  describe('splitBoxAroundHole', () => {
    const hole: Rect2 = { u0: -PORTAL_WIDTH / 2, u1: PORTAL_WIDTH / 2, v0: 1, v1: 3 };

    it('agujero central: 4 cajas; volumen = original − w·h·grosor', () => {
      const boxes = splitBoxAroundHole(WALL, 2, hole);
      expect(boxes).toHaveLength(4);
      expect(boxes.reduce((s, b) => s + vol(b), 0)).toBeCloseTo(
        vol(WALL) - PORTAL_WIDTH * PORTAL_HEIGHT * 0.5,
      );
    });

    it('ninguna caja resultante solapa el agujero', () => {
      for (const b of splitBoxAroundHole(WALL, 2, hole)) {
        const rect: Rect2 = { u0: b.min[0], u1: b.max[0], v0: b.min[1], v1: b.max[1] };
        expect(rectsOverlap(rect, hole)).toBe(false);
      }
    });

    it('agujero pegado al borde: 3 cajas', () => {
      const edge: Rect2 = { u0: -5, u1: -4, v0: 1, v1: 3 };
      const boxes = splitBoxAroundHole(WALL, 2, edge);
      expect(boxes).toHaveLength(3);
      expect(boxes.reduce((s, b) => s + vol(b), 0)).toBeCloseTo(vol(WALL) - 1 * 2 * 0.5);
    });

    it('agujero fuera: la caja original (misma referencia)', () => {
      const out: Rect2 = { u0: 6, u1: 8, v0: 1, v1: 3 };
      const boxes = splitBoxAroundHole(WALL, 2, out);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toBe(WALL);
    });

    it('agujero que se sale de la cara: se recorta', () => {
      const spill: Rect2 = { u0: 4, u1: 6, v0: 0, v1: 5 };
      const boxes = splitBoxAroundHole(WALL, 2, spill);
      expect(boxes.reduce((s, b) => s + vol(b), 0)).toBeCloseTo(vol(WALL) - 1 * 4 * 0.5);
    });
  });

  describe('subtractHoles', () => {
    it('2 agujeros disjuntos: volumen restante = original − ambos', () => {
      const h1: Rect2 = { u0: -4, u1: -3, v0: 1, v1: 3 };
      const h2: Rect2 = { u0: 3, u1: 4, v0: 1, v1: 3 };
      const rest = subtractHoles(WALL, 2, [h1, h2]);
      expect(rest.reduce((s, b) => s + vol(b), 0)).toBeCloseTo(vol(WALL) - 2 * (1 * 2 * 0.5));
    });

    it('2 agujeros solapados: el solape no se cuenta dos veces', () => {
      const h1: Rect2 = { u0: -1, u1: 0, v0: 1, v1: 3 };
      const h2: Rect2 = { u0: -0.5, u1: 0.5, v0: 1, v1: 3 };
      const rest = subtractHoles(WALL, 2, [h1, h2]);
      expect(vol(WALL) - rest.reduce((s, b) => s + vol(b), 0)).toBeCloseTo(3 * 0.5);
    });

    it('sin agujeros: la caja original', () => {
      const boxes = subtractHoles(WALL, 2, []);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toBe(WALL);
    });
  });
});
