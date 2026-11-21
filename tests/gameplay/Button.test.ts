import { beforeEach, describe, expect, it } from 'vitest';
import { Group, Scene } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Button } from '../../src/gameplay/Button';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { IRenderer, PhysicsBody } from '../../src/types/contracts';

const DT = 1 / 60;

describe('Button (T31)', () => {
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

  const makeButton = (): Button =>
    new Button({ ...deps, bus }, { type: 'button', id: 'b1', position: [0, 0.05, 0] });

  const dropCube = (x = 0, y = 0.25, z = 0): PhysicsBody =>
    pw.createBody({
      type: 'dynamic',
      position: [x, y, z],
      shape: { kind: 'box', halfExtents: [0.2, 0.2, 0.2] },
      userData: { kind: 'prop' },
    });

  it('base fija 1.0×0.1×1.0 en position (kind world) y sensor fijo 0.8×0.3×0.8 a 0.2 m (kind sensor)', () => {
    const b = makeButton();
    expect(b.kind).toBe('button');
    expect(b.body!.userData.kind).toBe('world');
    expect(b.body!.rb.isFixed()).toBe(true);
    const base = pw.getBoxBounds(b.body!)!;
    expect(base.max[0] - base.min[0]).toBeCloseTo(1.0, 5);
    expect(base.max[1] - base.min[1]).toBeCloseTo(0.1, 5);
    expect(base.max[2] - base.min[2]).toBeCloseTo(1.0, 5);

    const hits = pw.queryOverlaps(b.body!).length;
    expect(hits).toBe(0);
    b.dispose();
  });

  it('sin nada encima no pulsa (sin eventos)', () => {
    const b = makeButton();
    const pressed: string[] = [];
    const released: string[] = [];
    bus.on('button:pressed', (d) => pressed.push(d.id));
    bus.on('button:released', (d) => released.push(d.id));
    pw.step(DT);
    b.update(DT);
    expect(b.pressed).toBe(false);
    expect(pressed).toEqual([]);
    expect(released).toEqual([]);
    b.dispose();
  });

  it('un cubo encima: un solo button:pressed; retirarlo: un solo button:released', () => {
    const b = makeButton();
    const pressed: string[] = [];
    const released: string[] = [];
    bus.on('button:pressed', (d) => pressed.push(d.id));
    bus.on('button:released', (d) => released.push(d.id));
    const cube = dropCube();
    pw.step(DT);

    b.update(DT);
    b.update(DT);
    expect(b.pressed).toBe(true);
    expect(pressed).toEqual(['b1']);

    pw.setPose(cube, [10, 5, 0]);
    pw.step(DT);
    b.update(DT);
    b.update(DT);
    expect(b.pressed).toBe(false);
    expect(released).toEqual(['b1']);

    pw.removeBody(cube);
    b.dispose();
  });

  it('el jugador encima también pulsa (kind player)', () => {
    const b = makeButton();
    const pressed: string[] = [];
    bus.on('button:pressed', (d) => pressed.push(d.id));
    const player = pw.createBody({
      type: 'kinematic',
      position: [0, 0.7, 0],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { kind: 'player' },
    });
    pw.step(DT);

    b.update(DT);
    expect(b.pressed).toBe(true);
    expect(pressed).toEqual(['b1']);

    pw.removeBody(player);
    b.dispose();
  });

  it('la malla es un grupo con base + placa; al pulsar la placa baja 0.05 m', () => {
    const b = makeButton();
    expect(b.mesh).toBeInstanceOf(Group);
    const cube = dropCube();
    pw.step(DT);

    const plate = (b.mesh!.children as Group['children']).find((m) => m.position.y > 0);
    expect(plate).toBeDefined();
    const yRest = plate!.position.y;

    b.update(DT);
    expect(plate!.position.y).toBeCloseTo(yRest - 0.05, 5);

    pw.removeBody(cube);
    b.dispose();
  });

  it('dispose retira base y sensor del mundo (bodyCount vuelve a la línea base)', () => {
    const base = pw.bodyCount();
    const b = makeButton();
    expect(pw.bodyCount()).toBe(base + 2);
    b.dispose();
    expect(pw.bodyCount()).toBe(base);
    expect(scene.children).toHaveLength(0);
  });
});
