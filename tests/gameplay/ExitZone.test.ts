import { beforeEach, describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Scene } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { ExitZone } from '../../src/gameplay/ExitZone';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { ExitDef, IRenderer, PhysicsBody } from '../../src/types/contracts';

const DT = 1 / 60;

const DEF: ExitDef = { type: 'exit', id: 'exit-1', position: [0, 0.5, 0], size: [1, 1, 1] };

describe('ExitZone (T32)', () => {
  let pw: PhysicsWorld;
  let scene: Scene;
  let deps: EntityDeps;
  let bus: EventBus;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    scene = new Scene();
    deps = { physics: pw, renderer: { scene } as unknown as IRenderer };
    bus = new EventBus();
  });

  const makeZone = (): ExitZone => new ExitZone(DEF, { ...deps, bus }, 'test-room');

  const makePlayer = (x: number, y: number, z: number): PhysicsBody =>
    pw.createBody({
      type: 'kinematic',
      position: [x, y, z],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { kind: 'player' },
    });

  it('cuerpo fixed sensor cuboide size/2 y malla verde semitransparente', () => {
    const zone = makeZone();
    expect(zone.kind).toBe('exit');
    expect(zone.body!.userData.kind).toBe('sensor');
    expect(zone.body!.rb.isFixed()).toBe(true);
    const b = pw.getBoxBounds(zone.body!)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(1, 5);
    expect(b.max[1] - b.min[1]).toBeCloseTo(1, 5);
    expect(b.max[2] - b.min[2]).toBeCloseTo(1, 5);

    expect(zone.mesh).toBeInstanceOf(Mesh);
    const mat = (zone.mesh as Mesh).material as MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x57c46b);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.25, 5);
    expect(mat.depthWrite).toBe(false);
    zone.dispose();
  });

  it('jugador fuera de la zona: no emite', () => {
    const zone = makeZone();
    const events: string[] = [];
    bus.on('level:completed', (d) => events.push(d.levelId));
    const player = makePlayer(5, 0.9, 0);
    pw.step(DT);

    zone.update(DT);
    zone.update(DT);
    expect(zone.completed).toBe(false);
    expect(events).toEqual([]);

    pw.removeBody(player);
    zone.dispose();
  });

  it('jugador dentro: emite una vez aunque siga dentro varios pasos', () => {
    const zone = makeZone();
    const events: string[] = [];
    bus.on('level:completed', (d) => events.push(d.levelId));
    const player = makePlayer(0, 0.9, 0);
    pw.step(DT);

    for (let i = 0; i < 30; i++) {
      zone.update(DT);
    }
    expect(zone.completed).toBe(true);
    expect(events).toEqual(['test-room']);

    pw.removeBody(player);
    zone.dispose();
  });

  it('un cubo dentro no emite', () => {
    const zone = makeZone();
    const events: string[] = [];
    bus.on('level:completed', (d) => events.push(d.levelId));
    const cube = pw.createBody({
      type: 'dynamic',
      position: [0, 0.9, 0],
      shape: { kind: 'box', halfExtents: [0.3, 0.3, 0.3] },
      userData: { kind: 'prop' },
    });
    pw.step(DT);

    zone.update(DT);
    zone.update(DT);
    expect(zone.completed).toBe(false);
    expect(events).toEqual([]);

    pw.removeBody(cube);
    zone.dispose();
  });

  it('cubo y jugador dentro: emite una vez (el jugador cuenta, el cubo no)', () => {
    const zone = makeZone();
    const events: string[] = [];
    bus.on('level:completed', (d) => events.push(d.levelId));
    const cube = pw.createBody({
      type: 'dynamic',
      position: [0.2, 0.9, 0],
      shape: { kind: 'box', halfExtents: [0.3, 0.3, 0.3] },
      userData: { kind: 'prop' },
    });
    const player = makePlayer(0, 0.9, 0);
    pw.step(DT);

    zone.update(DT);
    expect(zone.completed).toBe(true);
    expect(events).toEqual(['test-room']);

    pw.removeBody(cube);
    pw.removeBody(player);
    zone.dispose();
  });

  it('dispose retira cuerpo y malla (bodyCount vuelve a la línea base)', () => {
    const base = pw.bodyCount();
    const zone = makeZone();
    expect(pw.bodyCount()).toBe(base + 1);
    zone.dispose();
    expect(pw.bodyCount()).toBe(base);
    expect(scene.children).toHaveLength(0);
  });
});
