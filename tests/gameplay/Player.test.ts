import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PLAYER } from '../../src/config';
import { Player } from '../../src/gameplay/Player';
import type { Action, IInput, IRenderer, Vec3 } from '../../src/types/contracts';

const STEP = 1 / 60;

class FakeInput implements IInput {
  down: Action[] = [];
  pressed: Action[] = [];
  lookDelta: { dx: number; dy: number } | null = null;

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
    const l = this.lookDelta ?? { dx: 0, dy: 0 };
    this.lookDelta = null;
    return l;
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
    this.lookDelta = null;
  }
}

describe('Player (T12–T13)', () => {
  let pw: PhysicsWorld;
  let input: FakeInput;
  let deps: ConstructorParameters<typeof Player>[0];
  let camera: PerspectiveCamera;

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
    camera = new PerspectiveCamera();
    deps = {
      physics: pw,
      renderer: { scene: new Scene(), camera } as unknown as IRenderer,
      input,
    };
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

  it('look(100, 0) reduce yaw en 100*sens; look(0, ±1e6) satura pitch', () => {
    const p = new Player(deps, [0, 0, 0]);
    p.look(100, 0);
    expect(p.yaw).toBeCloseTo(-100 * PLAYER.lookSensitivity, 10);
    expect(p.pitch).toBeCloseTo(0, 10);

    p.look(0, 1e6);
    expect(p.pitch).toBeCloseTo(-PLAYER.maxPitch, 10);
    p.look(0, -1e6);
    expect(p.pitch).toBeCloseTo(PLAYER.maxPitch, 10);
  });

  it('lookDirection: reposo (0,0,−1); yaw=π/2 → (−1,0,0); pitch=π/4 → y≈0.707', () => {
    const p = new Player(deps, [0, 0, 0]);
    let d = p.lookDirection();
    expect(d[0]).toBeCloseTo(0, 10);
    expect(d[1]).toBeCloseTo(0, 10);
    expect(d[2]).toBeCloseTo(-1, 10);

    p.yaw = Math.PI / 2;
    d = p.lookDirection();
    expect(d[0]).toBeCloseTo(-1, 10);
    expect(d[1]).toBeCloseTo(0, 10);
    expect(d[2]).toBeCloseTo(0, 10);

    p.yaw = 0;
    p.pitch = Math.PI / 4;
    d = p.lookDirection();
    expect(d[1]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 10);
  });

  it('syncMesh(1): cámara en centro + (0,0.7,0) y getWorldDirection ≈ lookDirection', () => {
    const p = new Player(deps, [0, 0, 0]);
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    p.syncMesh(1);

    const pos = pw.getPose(p.body!).position;
    expect(camera.position.x).toBeCloseTo(pos[0], 10);
    expect(camera.position.y).toBeCloseTo(pos[1] + 0.7, 10);
    expect(camera.position.z).toBeCloseTo(pos[2], 10);
    expect(camera.rotation.order).toBe('YXZ');

    const dir = new Vector3();
    camera.getWorldDirection(dir);
    const look = p.lookDirection();
    expect(dir.x).toBeCloseTo(look[0], 8);
    expect(dir.y).toBeCloseTo(look[1], 8);
    expect(dir.z).toBeCloseTo(look[2], 8);
  });

  it('syncMesh(0.5) interpola la cámara entre la pose previa y la actual', () => {
    const p = new Player(deps, [0, 0, 0]);
    input.down.push('forward');
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    const prev = pw.getPose(p.body!).position;
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    const curr = pw.getPose(p.body!).position;
    p.syncMesh(0.5);

    expect(camera.position.x).toBeCloseTo((prev[0] + curr[0]) / 2, 10);
    expect(camera.position.y).toBeCloseTo((prev[1] + curr[1]) / 2 + 0.7, 10);
    expect(camera.position.z).toBeCloseTo((prev[2] + curr[2]) / 2, 10);
  });

  it('syncMesh consume la mirada de input una sola vez', () => {
    const p = new Player(deps, [0, 0, 0]);
    input.lookDelta = { dx: 10, dy: 0 };
    p.captureState();
    p.preStep(STEP);
    pw.step(STEP);
    p.syncMesh(1);
    expect(p.yaw).toBeCloseTo(-10 * PLAYER.lookSensitivity, 10);
    p.syncMesh(1);
    expect(p.yaw).toBeCloseTo(-10 * PLAYER.lookSensitivity, 10);
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
