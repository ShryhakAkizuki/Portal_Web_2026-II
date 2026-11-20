import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderTarget, WebGLRenderer } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import { Player } from '../../src/gameplay/Player';
import {
  frameMatrix,
  makePortalFrame,
  portalTransform,
  transformDirection,
  yawPitchFromDirection,
} from '../../src/math/portalMath';
import { toV3 } from '../../src/math/vec';
import type { Action, IInput, IRenderer, Vec3 } from '../../src/types/contracts';

class FakeRenderer implements IRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(75, 1, 0.05, 200);
  get gl(): WebGLRenderer {
    throw new Error('gl no disponible en tests');
  }
  resize(_width: number, _height: number): void {}
  render(): void {}
  renderTo(_target: WebGLRenderTarget, _camera: PerspectiveCamera): void {}
  dispose(): void {}
}

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
    return {
      x: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      y: (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0),
    };
  }
  consumeLook(): { dx: number; dy: number } {
    return { dx: 0, dy: 0 };
  }
  readonly isLocked = false;
  lockPointer(): void {}
  endStep(): void {
    this.pressed = [];
  }
  dispose(): void {}
}

const DT = 1 / 60;

describe('Player: cruce por portales (T28)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus;
  let ps: PortalSystem;
  let input: FakeInput;
  let deps: ConstructorParameters<typeof Player>[0];

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    const renderer = new FakeRenderer();
    ps = new PortalSystem({ physics: pw, bus, renderer });
    input = new FakeInput();
    deps = { physics: pw, renderer, input };
  });

  const referenceWorld = (): void => {
    const box = (position: Vec3, halfExtents: Vec3, id: string) =>
      pw.createBody({
        type: 'fixed',
        position,
        shape: { kind: 'box', halfExtents },
        userData: { kind: 'world', portalable: true, surfaceId: id },
      });
    box([0, -0.5, 0], [15, 0.5, 15], 'suelo');
    box([0, 2, -0.25], [5, 2, 0.25], 'muro-a');
    box([5.25, 2, 3], [0.25, 2, 5], 'muro-b');
    pw.step(DT);
  };

  const placeBlueWall = (p: Player, y = 1.5): void => {
    const hit = pw.raycast([0, y, 3], [0, 0, -1], 5, { excludeBody: p.body });
    expect(hit).not.toBeNull();
    expect(ps.place('blue', hit!, [0, 0, -1])).toBe(true);
  };

  const placeOrangeWall = (p: Player): void => {
    const hit = pw.raycast([2, 1.5, 3], [1, 0, 0], 5, { excludeBody: p.body });
    expect(hit).not.toBeNull();
    expect(ps.place('orange', hit!, [1, 0, 0])).toBe(true);
  };

  const placeBlueFloor = (p: Player): void => {
    const hit = pw.raycast([0, 3, 3], [0, -1, 0], 5, { excludeBody: p.body });
    expect(hit).not.toBeNull();
    expect(ps.place('blue', hit!, [0, -1, 0])).toBe(true);
  };

  const events = (): { entityId: string; entering: 'blue' | 'orange' }[] => {
    const list: { entityId: string; entering: 'blue' | 'orange' }[] = [];
    bus.on('portal:crossed', (d) => list.push(d));
    return list;
  };

  const runFrame = (p: Player): void => {
    p.captureState();
    p.preStep(DT);
    pw.step(DT);
    ps.update(DT);
    p.update(DT);
    input.endStep();
  };

  it('cruza el azul y sale por el naranja: v≈(−5,vy,0), yaw≈π/2, s_naranja≥0, grounded false→true', () => {
    referenceWorld();
    const p = new Player(deps, [0, 0, 3], 0);
    ps.track(p);
    placeBlueWall(p, 1.0);
    placeOrangeWall(p);
    pw.step(DT);
    input.down.push('forward');
    const evts = events();
    for (let i = 0; i < 120 && evts.length === 0; i++) runFrame(p);
    expect(evts).toEqual([{ entityId: 'player', entering: 'blue' }]);

    const pos0 = pw.getPose(p.body!).position;
    expect(pos0[0]).toBeLessThan(5);
    const o = ps.get('orange')!;
    const sNaranja =
      pos0[0] * o.normal[0] + pos0[1] * o.normal[1] + pos0[2] * o.normal[2] -
      (o.position[0] * o.normal[0] + o.position[1] * o.normal[1] + o.position[2] * o.normal[2]);
    expect(sNaranja).toBeGreaterThanOrEqual(0);
    expect(p.velocity[0]).toBeCloseTo(-5, 1);
    expect(Math.abs(p.velocity[1])).toBeLessThan(0.5);
    expect(Math.abs(p.velocity[2])).toBeLessThan(0.2);
    expect(Math.abs(p.yaw - Math.PI / 2)).toBeLessThan(0.01);
    expect(p.grounded).toBe(false);

    let landed = false;
    for (let i = 0; i < 120; i++) {
      runFrame(p);
      if (p.grounded && Math.abs(pw.getPose(p.body!).position[1] - 0.9) < 0.05) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(pw.getPose(p.body!).position[1]).toBeCloseTo(0.9, 1);

    const before = evts.length;
    for (let i = 0; i < 5; i++) runFrame(p);
    expect(evts.length).toBe(before);
  });

  it('giro: yaw final = yawPitchFromDirection(R(T)·look).yaw y el pitch 0.3 se conserva', () => {
    const p = new Player(deps, [0, 0, 3], 0);
    p.pitch = 0.3;
    p.velocity[2] = -5;
    const fBlue = makePortalFrame([0, 1.5, 0.01], [0, 0, 1], [0, 1, 0]);
    const fOrange = makePortalFrame([5.01, 1.5, 3], [-1, 0, 0], [0, 1, 0]);
    const T = portalTransform(frameMatrix(fBlue), frameMatrix(fOrange));
    const expected = yawPitchFromDirection(transformDirection(T, toV3(p.lookDirection())));
    p.onTeleport(T);

    expect(p.yaw).toBeCloseTo(expected.yaw, 10);
    expect(Math.abs(p.yaw - Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.abs(p.pitch - 0.3)).toBeLessThan(0.01);
    expect(p.velocity[0]).toBeCloseTo(-5, 5);
    expect(p.velocity[2]).toBeCloseTo(0, 5);
    expect(p.grounded).toBe(false);
  });

  it('suelo→pared: cae a través del azul del suelo, sale por el naranja con v≈(−v,…) y queda de pie', () => {
    referenceWorld();
    const p = new Player(deps, [0, 2.5, 3], 0);
    ps.track(p);
    placeBlueFloor(p);
    placeOrangeWall(p);
    pw.step(DT);
    const evts = events();
    for (let i = 0; i < 240 && evts.length === 0; i++) runFrame(p);
    expect(evts).toEqual([{ entityId: 'player', entering: 'blue' }]);

    const pos0 = pw.getPose(p.body!).position;
    expect(pos0[0]).toBeLessThan(5);
    expect(pos0[0]).toBeGreaterThan(4);
    expect(p.velocity[0]).toBeLessThan(-4);
    expect(Math.abs(p.velocity[1])).toBeLessThan(0.5);
    expect(Math.abs(p.velocity[2])).toBeLessThan(0.5);

    let landed = false;
    for (let i = 0; i < 240; i++) {
      runFrame(p);
      if (p.grounded && Math.abs(pw.getPose(p.body!).position[1] - 0.9) < 0.05) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(pw.getPose(p.body!).position[1]).toBeCloseTo(0.9, 1);

    const start = pw.getPose(p.body!).position;
    input.down.push('right');
    for (let i = 0; i < 30; i++) runFrame(p);
    const end = pw.getPose(p.body!).position;
    expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeGreaterThan(0.3);
    expect(p.grounded).toBe(true);
  });

  it('sin portales no cambia nada respecto a T12: camina 5 m y no hay eventos', () => {
    pw.createBody({
      type: 'fixed',
      position: [0, -0.5, 0],
      shape: { kind: 'box', halfExtents: [50, 0.5, 50] },
      userData: { kind: 'world' },
    });
    pw.step(DT);
    const p = new Player(deps, [0, 0, 3], 0);
    ps.track(p);
    input.down.push('forward');
    const evts = events();
    for (let i = 0; i < 60; i++) runFrame(p);

    expect(evts).toHaveLength(0);
    const pos = pw.getPose(p.body!).position;
    expect(pos[1]).toBeCloseTo(0.9, 1);
    expect(pos[2]).toBeCloseTo(-2, 1);
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
  });
});
