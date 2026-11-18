import { describe, it, expect, vi } from 'vitest';
import { SceneManager } from '../../src/core/SceneManager';
import type { Scene } from '../../src/types/contracts';

const fakeScene = (name: string, opts?: { enterDelay?: number; enterError?: Error }) => {
  const calls: string[] = [];
  const scene: Scene = {
    enter: () => {
      calls.push(`enter:${name}`);
      if (opts?.enterError) {
        if (opts.enterDelay && opts.enterDelay > 0) {
          return new Promise<void>((_, reject) =>
            setTimeout(() => reject(opts.enterError!), opts.enterDelay),
          );
        }
        return Promise.reject(opts.enterError);
      }
      if (opts?.enterDelay && opts.enterDelay > 0) {
        return new Promise<void>((resolve) => setTimeout(resolve, opts.enterDelay));
      }
      return Promise.resolve();
    },
    update: (dt: number) => {
      calls.push(`update:${name}:${dt}`);
    },
    render: (alpha: number) => {
      calls.push(`render:${name}:${alpha}`);
    },
    exit: () => {
      calls.push(`exit:${name}`);
    },
  };
  return { scene, calls };
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('SceneManager.change (orden de llamadas)', () => {
  it('sin escena actual: solo enter(B), y current = B', async () => {
    const sm = new SceneManager();
    const { scene: B } = fakeScene('B');
    await sm.change(B);
    expect(sm.current).toBe(B);
  });

  it('orden: exit(A) antes que enter(B); current pasa de A a B', async () => {
    const sm = new SceneManager();
    const { scene: A, calls: a } = fakeScene('A');
    const { scene: B, calls: b } = fakeScene('B');
    await sm.change(A);
    a.length = 0;
    b.length = 0;

    await sm.change(B);

    expect(a).toEqual(['exit:A']);
    expect(b).toEqual(['enter:B']);
    expect(sm.current).toBe(B);
    expect(sm.current).not.toBe(A);
  });
});

describe('SceneManager.update/render (delegación)', () => {
  it('delegan en current con el mismo dt/alpha', async () => {
    const sm = new SceneManager();
    const { scene: B, calls: b } = fakeScene('B');
    await sm.change(B);
    b.length = 0;

    sm.update(0.5);
    sm.render(0.25);

    expect(b).toEqual(['update:B:0.5', 'render:B:0.25']);
  });

  it('sin escena actual no fallan ni llaman a nada', () => {
    const sm = new SceneManager();
    expect(() => sm.update(0.5)).not.toThrow();
    expect(() => sm.render(0.25)).not.toThrow();
    expect(sm.current).toBeNull();
  });

  it('durante el cambio (current = null) no delegan', async () => {
    const sm = new SceneManager();
    const { scene: A, calls: a } = fakeScene('A');
    const { scene: B } = fakeScene('B', { enterDelay: 20 });
    await sm.change(A);

    const p = sm.change(B);
    expect(sm.current).toBeNull();
    expect(() => sm.update(1)).not.toThrow();
    expect(() => sm.render(1)).not.toThrow();
    await p;
    a.length = 0;
    expect(sm.current).toBe(B);
  });
});

describe('SceneManager.change asíncrono (dos cambios seguidos)', () => {
  it('solo la última queda activa; la intermedia recibe exit y no se asigna', async () => {
    const sm = new SceneManager();
    const { scene: A, calls: a } = fakeScene('A');
    const { scene: B, calls: b } = fakeScene('B', { enterDelay: 30 });
    const { scene: C, calls: c } = fakeScene('C', { enterDelay: 10 });

    await sm.change(A);
    a.length = 0;
    b.length = 0;
    c.length = 0;

    const p1 = sm.change(B);
    const p2 = sm.change(C);

    await delay(1);
    await p2;
    expect(sm.current).toBe(C);
    expect(c).toEqual(['enter:C']);
    expect(b).toEqual(['enter:B']);

    await p1;
    expect(b).toEqual(['enter:B', 'exit:B']);
    expect(sm.current).toBe(C);
    expect(a).toEqual(['exit:A']);
  });

  it('cambio rápido sobre la misma escena: la obsoleta no se asigna', async () => {
    const sm = new SceneManager();
    const { scene: A } = fakeScene('A');
    const { scene: B, calls: b } = fakeScene('B', { enterDelay: 20 });
    const { scene: C } = fakeScene('C');

    await sm.change(A);
    const p1 = sm.change(B);
    const p2 = sm.change(C);
    await Promise.all([p1, p2]);

    expect(sm.current).toBe(C);
    expect(b).toEqual(['enter:B', 'exit:B']);
  });
});

describe('SceneManager.change con error en enter', () => {
  it('current queda null, el error se propaga y se llama next.exit()', async () => {
    const sm = new SceneManager();
    const { scene: A } = fakeScene('A');
    const boom = new Error('boom');
    const { scene: B, calls: b } = fakeScene('B', { enterError: boom });

    await sm.change(A);
    b.length = 0;

    await expect(sm.change(B)).rejects.toThrow('boom');

    expect(b).toEqual(['enter:B', 'exit:B']);
    expect(sm.current).toBeNull();
  });

  it('tras un enter fallido, el siguiente cambio funciona igual', async () => {
    const sm = new SceneManager();
    const { scene: B } = fakeScene('B', { enterError: new Error('nope') });
    const { scene: C, calls: c } = fakeScene('C');

    await expect(sm.change(B)).rejects.toThrow('nope');
    expect(sm.current).toBeNull();

    await sm.change(C);
    expect(sm.current).toBe(C);
    expect(c).toEqual(['enter:C']);
  });
});
