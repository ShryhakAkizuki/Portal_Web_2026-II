import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game, type GameCallbacks } from '../../src/core/Game';
import { FIXED_STEP } from '../../src/config';

const spies = (): { cbs: GameCallbacks; updates: number[]; alphas: number[] } => {
  const updates: number[] = [];
  const alphas: number[] = [];
  const cbs: GameCallbacks = {
    update: (dt) => {
      updates.push(dt);
    },
    render: (alpha) => {
      alphas.push(alpha);
    },
  };
  return { cbs, updates, alphas };
};

const fakeRaf = () => {
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();
  return {
    raf: (fn: (t: number) => void): number => {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    caf: (id: number): void => {
      pending.delete(id);
    },
    tick: (count: number): number => {
      let fired = 0;
      while (fired < count && pending.size > 0) {
        const id = nextId - 1;
        const fn = pending.get(id);
        if (!fn) break;
        pending.delete(id);
        fn(0);
        fired++;
      }
      return fired;
    },
    pendingCount: (): number => pending.size,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Game.advance (paso fijo, sin rAF)', () => {
  it('frameTime = 1/60 → 1 paso, alpha 0', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r = g.advance(1 / 60);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0, 10);
    expect(updates).toEqual([FIXED_STEP]);
  });

  it('frameTime = 1/30 → 2 pasos', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r = g.advance(1 / 30);
    expect(r.steps).toBe(2);
    expect(r.alpha).toBeCloseTo(0, 10);
    expect(updates).toEqual([FIXED_STEP, FIXED_STEP]);
  });

  it('frameTime = 0.01 → 0 pasos y alpha ≈ 0.6', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r = g.advance(0.01);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.6, 10);
    expect(updates).toEqual([]);
  });

  it('frameTime enorme (5 s) se recorta a MAX_FRAME_TIME: 15 pasos', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r = g.advance(5);
    expect(r.steps).toBe(15);
    expect(r.alpha).toBeCloseTo(0, 8);
    expect(updates).toHaveLength(15);
    expect(updates.every((dt) => dt === FIXED_STEP)).toBe(true);
  });

  it('el remanente se conserva entre llamadas: 0.01 + 0.01 → 1 paso', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r1 = g.advance(0.01);
    expect(r1.steps).toBe(0);
    const r2 = g.advance(0.01);
    expect(r2.steps).toBe(1);
    expect(updates).toEqual([FIXED_STEP]);
  });

  it('0.02 + 0.02 → 1 paso por llamada (0.02 > FIXED_STEP) y alpha final ≈ 0.4', () => {
    const { cbs, updates } = spies();
    const g = new Game(cbs);
    const r1 = g.advance(0.02);
    expect(r1.steps).toBe(1);
    expect(r1.alpha).toBeCloseTo(0.2, 8);
    const r2 = g.advance(0.02);
    expect(r2.steps).toBe(1);
    expect(r2.alpha).toBeCloseTo(0.4, 8);
    expect(updates).toEqual([FIXED_STEP, FIXED_STEP]);
  });

  it('pausa: 0 pasos, el acumulador no cambia y no hay updates', () => {
    const { cbs, updates, alphas } = spies();
    const g = new Game(cbs);
    const r1 = g.advance(0.01);
    expect(r1.steps).toBe(0);

    g.paused = true;
    const r2 = g.advance(0.5);
    expect(r2.steps).toBe(0);
    expect(r2.alpha).toBeCloseTo(r1.alpha, 10);
    expect(updates).toEqual([]);
    expect(alphas).toEqual([]);

    g.paused = false;
    const r3 = g.advance(0.01);
    expect(r3.steps).toBe(1);
  });
});

describe('Game.start / stop (bucle con raf y now falsos)', () => {
  it('cada tick llama a render; el primer frame usa frameTime = 0', () => {
    const { cbs, updates, alphas } = spies();
    const raf = fakeRaf();
    let t = 0;
    const g = new Game(cbs, {
      now: () => (t += 0.25),
      raf: raf.raf,
      caf: raf.caf,
    });

    g.start();
    expect(raf.pendingCount()).toBe(1);
    raf.tick(1);
    expect(updates).toEqual([]);
    expect(alphas).toEqual([0]);

    raf.tick(2);
    expect(updates).toHaveLength(30);
    expect(updates.every((dt) => dt === FIXED_STEP)).toBe(true);
    expect(alphas).toHaveLength(3);
    expect(alphas[1]).toBeCloseTo(0, 8);
    expect(alphas[2]).toBeCloseTo(0, 8);
    expect(raf.pendingCount()).toBe(1);
  });

  it('stop() detiene el bucle y cancela el frame pendiente', () => {
    const { cbs, alphas } = spies();
    const raf = fakeRaf();
    const g = new Game(cbs, { raf: raf.raf, caf: raf.caf, now: () => 0 });

    g.start();
    raf.tick(1);
    expect(alphas).toHaveLength(1);

    g.stop();
    expect(raf.pendingCount()).toBe(0);
    const fired = raf.tick(3);
    expect(fired).toBe(0);
    expect(alphas).toHaveLength(1);
  });

  it('doble start() no duplica el bucle', () => {
    const { cbs, alphas } = spies();
    const raf = fakeRaf();
    const g = new Game(cbs, { raf: raf.raf, caf: raf.caf, now: () => 0 });

    g.start();
    g.start();
    expect(raf.pendingCount()).toBe(1);
    raf.tick(1);
    expect(alphas).toHaveLength(1);
    expect(raf.pendingCount()).toBe(1);
  });

  it('start() tras stop() reanuda el bucle con frameTime = 0', () => {
    const { cbs, updates, alphas } = spies();
    const raf = fakeRaf();
    let t = 0;
    const g = new Game(cbs, {
      now: () => (t += 0.25),
      raf: raf.raf,
      caf: raf.caf,
    });

    g.start();
    raf.tick(1);
    expect(alphas).toEqual([0]);
    g.stop();
    expect(raf.pendingCount()).toBe(0);

    g.start();
    raf.tick(1);
    expect(alphas).toHaveLength(2);
    expect(alphas[1]).toBeCloseTo(0, 10);
    expect(updates).toEqual([]);
  });

  it('si update lanza, el error sube (no se captura)', () => {
    const boom = new Error('boom');
    const g = new Game({
      update: () => {
        throw boom;
      },
      render: vi.fn(),
    });
    expect(() => g.advance(1 / 60)).toThrowError(boom);
  });
});
