import { beforeEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Player } from '../../src/gameplay/Player';
import type { Action, IInput, IRenderer, Vec3 } from '../../src/types/contracts';

const STEP = 1 / 60;

class FakeInput implements IInput {
  down: Action[] = [];
  pressed: Action[] = [];

  isDown(a: Action): boolean {
    return this.down.includes(a);
  }
  wasPressed(a: Action): boolean {
    return this.pressed.includes(a);
  }
  getMoveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
  consumeLook(): { dx: number; dy: number } {
    return { dx: 0, dy: 0 };
  }
  readonly isLocked = false;
  lockPointer(): void {
  }
  endStep(): void {
    this.pressed = [];
  }
  dispose(): void {
    this.down = [];
    this.pressed = [];
  }
}

describe('Player (T12)', () => {
  let pw: PhysicsWorld;
  let input: FakeInput;
  let deps: ConstructorParameters<typeof Player>[0];

  function step(p: Player): void {
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    p.update(STEP);
  }

  function floor(): void {
    pw.createBody({
      type: 'fixed',
      position: [0, -0.5, 0],
      shape: { kind: 'box', halfExtents: [50, 0.5, 50] },
      userData: { kind: 'world' },
    });
  }

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    input = new FakeInput();
    deps = { physics: pw, renderer: { scene: new Scene() } as unknown as IRenderer, input };
  });

  it('cae desde 2 m y se detiene con centro y ≈ 0.9, grounded = true', () => {
    floor();
    const p = new Player(deps, [0, 2, 0]);
    for (let i = 0; i < 240; i++) step(p);
    const pos = pw.getPose(p.body!).position;
    expect(pos[1]).toBeCloseTo(0.9, 1);
    expect(p.grounded).toBe(true);
  });

  it('forward 60 pasos con yaw = 0 avanza ≈ 5 m hacia −Z', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    input.down.push('forward');
    for (let i = 0; i < 60; i++) step(p);
    const pos = pw.getPose(p.body!).position;
    expect(pos[2]).toBeCloseTo(-5, 1);
    expect(Math.abs(pos[0])).toBeLessThan(0.1);
  });

  it('forward con yaw = π/2 avanza hacia −X', () => {
    floor();
    const p = new Player(deps, [0, 0, 0], Math.PI / 2);
    input.down.push('forward');
    for (let i = 0; i < 60; i++) step(p);
    const pos = pw.getPose(p.body!).position;
    expect(pos[0]).toBeCloseTo(-5, 1);
    expect(Math.abs(pos[2])).toBeLessThan(0.1);
  });

  it('salto: altura máxima ≈ 1.27 m (pies) y vuelve a caer', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    for (let i = 0; i < 30; i++) step(p);
    expect(p.grounded).toBe(true);

    input.pressed.push('jump');
    let maxFeet = -Infinity;
    let n = 0;
    do {
      step(p);
      maxFeet = Math.max(maxFeet, pw.getPose(p.body!).position[1] - 0.9);
      n++;
    } while (!p.grounded && n < 300);
    expect(n).toBeLessThan(300);
    expect(Math.abs(maxFeet - 1.27)).toBeLessThan(0.15);
    expect(p.grounded).toBe(true);
  });

  it('no salta en el aire: pulsar jump durante el vuelo no suma altura', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    for (let i = 0; i < 30; i++) step(p);

    input.pressed.push('jump');
    let maxFeet = -Infinity;
    let n = 0;
    let airTries = 0;
    do {
      if (n === 30 && !p.grounded) {
        input.pressed.push('jump');
        airTries++;
      }
      step(p);
      maxFeet = Math.max(maxFeet, pw.getPose(p.body!).position[1] - 0.9);
      n++;
    } while (!p.grounded && n < 300);
    expect(airTries).toBe(1);
    expect(maxFeet).toBeLessThan(1.27 + 0.15);
  });

  it('una pared frente a él lo detiene (no la atraviesa)', () => {
    floor();
    const wall = pw.createBody({
      type: 'fixed',
      position: [0, 0.9, -2],
      shape: { kind: 'box', halfExtents: [5, 0.9, 0.5] },
      userData: { kind: 'world' },
    });
    const p = new Player(deps, [0, 0, 0]);
    input.down.push('forward');
    for (let i = 0; i < 180; i++) step(p);
    const pos = pw.getPose(p.body!).position;
    expect(pos[2]).toBeGreaterThan(-1.25);
    expect(pos[2]).toBeLessThan(-0.5);
    pw.removeBody(wall);
  });

  it('sube un escalón de 0.25 m caminando', () => {
    floor();
    const stepUp = pw.createBody({
      type: 'fixed',
      position: [0, 0.125, -2],
      shape: { kind: 'box', halfExtents: [10, 0.125, 1] },
      userData: { kind: 'world' },
    });
    const p = new Player(deps, [0, 0, 0]);
    input.down.push('forward');
    let maxY = -Infinity;
    for (let i = 0; i < 120; i++) {
      step(p);
      maxY = Math.max(maxY, pw.getPose(p.body!).position[1]);
    }
    expect(Math.abs(maxY - 1.15)).toBeLessThan(0.05);
    expect(pw.getPose(p.body!).position[2]).toBeLessThan(-2);
    pw.removeBody(stepUp);
  });

  it('no sube un escalón de 0.6 m (lo detiene)', () => {
    floor();
    const stepUp = pw.createBody({
      type: 'fixed',
      position: [0, 0.3, -2],
      shape: { kind: 'box', halfExtents: [10, 0.3, 1] },
      userData: { kind: 'world' },
    });
    const p = new Player(deps, [0, 0, 0]);
    input.down.push('forward');
    for (let i = 0; i < 180; i++) step(p);
    const pos = pw.getPose(p.body!).position;
    expect(pos[1]).toBeCloseTo(0.9, 1);
    expect(pos[2]).toBeGreaterThan(-1.55);
    pw.removeBody(stepUp);
  });

  it('eyePosition = centro del cuerpo + eyeOffset', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    step(p);
    const pos = pw.getPose(p.body!).position;
    const eye: Vec3 = p.eyePosition;
    expect(eye).toEqual([pos[0], pos[1] + 0.7, pos[2]]);
  });

  it('look y lookDirection lanzan Error("T13")', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    expect(() => p.look(1, 0)).toThrow('T13');
    expect(() => p.lookDirection()).toThrow('T13');
  });

  it('id, kind, canCross y userData del cuerpo', () => {
    floor();
    const p = new Player(deps, [0, 0, 0]);
    expect(p.id).toBe('player');
    expect(p.kind).toBe('player');
    expect(p.canCross).toBe(true);
    expect(p.body!.userData.entityId).toBe('player');
    expect(p.body!.userData.kind).toBe('player');
  });
});
