import { FIXED_STEP, MAX_FRAME_TIME } from '../config';
import type { IGame } from '../types/contracts';

export interface GameCallbacks {
  update(dt: number): void;
  render(alpha: number): void;
}

export interface GameOptions {
  now?: () => number;
  raf?: (fn: (t: number) => void) => number;
  caf?: (id: number) => void;
}

export class Game implements IGame {
  private readonly cb: GameCallbacks;
  private readonly now: () => number;
  private readonly raf: (fn: (t: number) => void) => number;
  private readonly caf: (id: number) => void;

  private acc = 0;
  private running = false;
  private lastTime: number | null = null;
  private rafId: number | null = null;

  constructor(cb: GameCallbacks, opts?: GameOptions) {
    this.cb = cb;
    this.now = opts?.now ?? (() => performance.now() / 1000);
    this.raf = opts?.raf ?? ((fn) => requestAnimationFrame(fn));
    this.caf = opts?.caf ?? ((id) => cancelAnimationFrame(id));
  }

  paused = false;

  advance(frameTime: number): { steps: number; alpha: number } {
    if (this.paused) {
      return { steps: 0, alpha: this.acc / FIXED_STEP };
    }
    const t = Math.min(frameTime, MAX_FRAME_TIME);
    this.acc += t;
    let steps = 0;
    while (this.acc >= FIXED_STEP) {
      this.cb.update(FIXED_STEP);
      this.acc -= FIXED_STEP;
      steps++;
    }
    return { steps, alpha: this.acc / FIXED_STEP };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    const tick = (): void => {
      if (!this.running) return;
      const t = this.now();
      const frameTime = this.lastTime === null ? 0 : Math.max(0, t - this.lastTime);
      this.lastTime = t;
      const { alpha } = this.advance(frameTime);
      this.cb.render(alpha);
      if (this.running) {
        this.rafId = this.raf(tick);
      }
    };
    this.rafId = this.raf(tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null) {
      this.caf(this.rafId);
      this.rafId = null;
    }
    this.lastTime = null;
  }
}
