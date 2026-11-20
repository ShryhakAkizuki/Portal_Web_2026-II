import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderTarget, WebGLRenderer } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import { Prop } from '../../src/gameplay/Prop';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { GameEvents, IRenderer, PhysicsBody, Vec3 } from '../../src/types/contracts';

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

const DT = 1 / 60;

describe('PortalSystem: cruce de cuerpos dinámicos (T27)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus;
  let ps: PortalSystem;
  let deps: EntityDeps;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    const renderer = new FakeRenderer();
    ps = new PortalSystem({ physics: pw, bus, renderer });
    deps = { physics: pw, renderer };
  });

  const box = (position: Vec3, halfExtents: Vec3, id: string): PhysicsBody =>
    pw.createBody({
      type: 'fixed',
      position,
      shape: { kind: 'box', halfExtents },
      userData: { kind: 'world', portalable: true, surfaceId: id },
    });

  const referenceWorld = (): void => {
    box([0, -0.5, 0], [15, 0.5, 15], 'suelo');
    box([0, 2, -0.25], [5, 2, 0.25], 'muro-a');
    box([5.25, 2, 3], [0.25, 2, 5], 'muro-b');
    pw.step(DT);
  };

  const placeBlueWall = (): void => {
    const hit = pw.raycast([0, 1.5, 3], [0, 0, -1], 5);
    expect(hit).not.toBeNull();
    expect(ps.place('blue', hit!, [0, 0, -1])).toBe(true);
  };

  const placeOrangeWall = (): void => {
    const hit = pw.raycast([2, 1.5, 3], [1, 0, 0], 5);
    expect(hit).not.toBeNull();
    expect(ps.place('orange', hit!, [1, 0, 0])).toBe(true);
    pw.step(DT);
  };

  const launchCube = (position: Vec3, velocity: Vec3): Prop => {
    const cube = new Prop(deps, 'cubo-1', position);
    pw.setVelocity(cube.body!, velocity);
    pw.setGravityScale(cube.body!, 0);
    pw.step(DT);
    ps.track(cube);
    return cube;
  };

  const events = (): { entityId: string; entering: 'blue' | 'orange' }[] => {
    const list: { entityId: string; entering: 'blue' | 'orange' }[] = [];
    bus.on('portal:crossed', (d) => list.push(d));
    return list;
  };

  const runUntilCrossed = (cube: Prop, evts: { entityId: string; entering: 'blue' | 'orange' }[], maxSteps = 60): void => {
    for (let i = 0; i < maxSteps && evts.length === 0; i++) {
      pw.step(DT);
      ps.update(DT);
    }
  };

  it('cubo en (0,1.5,2) con v=(0,0,−4): cruza el azul y sale por el naranja con v≈(−4,0,0), x≈4.45, z≈3', () => {
    referenceWorld();
    placeBlueWall();
    placeOrangeWall();
    const evts = events();
    const cube = launchCube([0, 1.5, 2], [0, 0, -4]);
    runUntilCrossed(cube, evts);

    expect(evts).toEqual([{ entityId: 'cubo-1', entering: 'blue' }]);
    const pos = pw.getPose(cube.body!).position;
    expect(pos[0]).toBeCloseTo(4.45, 1);
    expect(pos[1]).toBeCloseTo(1.5, 1);
    expect(pos[2]).toBeCloseTo(3, 1);
    const v = pw.getVelocity(cube.body!).linear;
    expect(v[0]).toBeCloseTo(-4, 1);
    expect(v[1]).toBeCloseTo(0, 1);
    expect(v[2]).toBeCloseTo(0, 1);
  });

  it('conserva el módulo de velocidad (|v| antes ≈ |v| después)', () => {
    referenceWorld();
    placeBlueWall();
    placeOrangeWall();
    const evts = events();
    const cube = launchCube([0, 1.5, 2], [0, 0, -4]);
    const antes = Math.hypot(...pw.getVelocity(cube.body!).linear);
    runUntilCrossed(cube, evts);
    expect(evts).toHaveLength(1);
    const despues = Math.hypot(...pw.getVelocity(cube.body!).linear);
    expect(despues).toBeCloseTo(antes, 2);
  });

  it('sin portales enlazados no hay cruce: el cubo se detiene delante del muro', () => {
    referenceWorld();
    placeBlueWall();
    const evts = events();
    const cube = launchCube([0, 1.5, 2], [0, 0, -4]);
    for (let i = 0; i < 40; i++) {
      pw.step(DT);
      ps.update(DT);
    }
    expect(evts).toHaveLength(0);
    const pos = pw.getPose(cube.body!).position;
    expect(pos[2]).toBeGreaterThan(0.1);
  });

  it('un cubo que pasa lejos del rectángulo (fuera de W×H) no se teletransporta', () => {
    referenceWorld();
    placeBlueWall();
    placeOrangeWall();
    const evts = events();
    const cube = launchCube([3, 1.5, 2], [0, 0, -4]);
    for (let i = 0; i < 40; i++) {
      pw.step(DT);
      ps.update(DT);
    }
    expect(evts).toHaveLength(0);
    const pos = pw.getPose(cube.body!).position;
    expect(pos[2]).toBeGreaterThan(0.1);
  });

  it('portal:crossed se emite una sola vez y no recruza de inmediato', () => {
    referenceWorld();
    placeBlueWall();
    placeOrangeWall();
    const evts = events();
    const cube = launchCube([0, 1.5, 2], [0, 0, -4]);
    runUntilCrossed(cube, evts);
    expect(evts).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      pw.step(DT);
      ps.update(DT);
    }
    expect(evts).toHaveLength(1);
    const pos = pw.getPose(cube.body!).position;
    expect(pos[0]).toBeCloseTo(4.43 - 5 * 4 * DT, 1);
    expect(pos[0]).toBeLessThan(4.43);
  });

  it('suelo→pared: cubo que cae en (0,2,3) con v=(0,−6,0) sale por el naranja con v≈(−6,0,0)', () => {
    referenceWorld();
    const hitFloor = pw.raycast([0, 3, 3], [0, -1, 0], 5);
    expect(hitFloor).not.toBeNull();
    expect(ps.place('blue', hitFloor!, [0, -1, 0])).toBe(true);
    placeOrangeWall();
    const evts = events();
    const cube = launchCube([0, 2, 3], [0, -6, 0]);
    runUntilCrossed(cube, evts);

    expect(evts).toEqual([{ entityId: 'cubo-1', entering: 'blue' }]);
    const pos = pw.getPose(cube.body!).position;
    expect(pos[0]).toBeCloseTo(4.45, 1);
    expect(pos[1]).toBeCloseTo(1.5, 1);
    expect(pos[2]).toBeCloseTo(3, 1);
    const v = pw.getVelocity(cube.body!).linear;
    expect(v[0]).toBeCloseTo(-6, 1);
    expect(v[1]).toBeCloseTo(0, 1);
    expect(v[2]).toBeCloseTo(0, 1);
  });
});
