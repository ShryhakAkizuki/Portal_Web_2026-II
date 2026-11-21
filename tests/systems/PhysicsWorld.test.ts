import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { GROUPS, ALL_GROUPS, interactionGroups } from '../../src/config';
import type { BodyDesc, PhysicsBody } from '../../src/types/contracts';

type PW = PhysicsWorld;

function boxDesc(overrides: Partial<BodyDesc> = {}): BodyDesc {
  return {
    type: 'fixed',
    position: [0, 0, 0],
    shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] },
    ...overrides,
  };
}

function makeFloor(pw: PW): PhysicsBody {
  return pw.createBody({
    type: 'fixed',
    position: [0, -0.5, 0],
    shape: { kind: 'box', halfExtents: [5, 0.5, 5] },
    userData: { kind: 'world' },
  });
}

describe('PhysicsWorld (T09)', () => {
  let pw: PW;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
  });

  it('bodyCount refleja los cuerpos vivos y removeBody es idempotente', () => {
    const inicial = pw.bodyCount();
    const b1 = pw.createBody(boxDesc({ position: [10, 0, 0] }));
    const b2 = pw.createBody(boxDesc({ position: [20, 0, 0] }));
    expect(pw.bodyCount()).toBe(inicial + 2);
    pw.removeBody(b1);
    pw.removeBody(b2);
    expect(pw.bodyCount()).toBe(inicial);
    expect(() => pw.removeBody(b1)).not.toThrow();
  });

  it('createBody aplica posición, sensor y grupos por defecto según kind', () => {
    const sensorBody = pw.createBody(
      boxDesc({ position: [50, 0, 0], sensor: true, userData: { kind: 'sensor' } }),
    );
    expect(sensorBody.collider.isSensor()).toBe(true);
    expect(sensorBody.collider.collisionGroups()).toBe(
      interactionGroups(GROUPS.SENSOR, ALL_GROUPS),
    );

    const worldBody = pw.createBody(boxDesc({ position: [60, 0, 0], userData: { kind: 'world' } }));
    expect(worldBody.collider.isSensor()).toBe(false);
    expect(worldBody.collider.collisionGroups()).toBe(
      interactionGroups(GROUPS.WORLD, ALL_GROUPS),
    );

    const t = pw.getPose(worldBody).position;
    expect(t).toEqual([60, 0, 0]);

    pw.removeBody(sensorBody);
    pw.removeBody(worldBody);
  });

  it('raycast hacia abajo: distancia, normal (0,1,0), body correcto; el sensor no bloquea; excludeBody; null', () => {
    const solid = pw.createBody(boxDesc({ position: [100, 0, 0] }));
    const sensor = pw.createBody(
      boxDesc({ position: [100, 3, 0], sensor: true, userData: { kind: 'sensor' } }),
    );
    pw.step(1 / 60);

    const hit = pw.raycast([100, 5, 0], [0, -1, 0], 10);
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(solid);
    expect(hit!.distance).toBeCloseTo(4.5, 3);
    expect(hit!.point).toEqual([100, 0.5, 0]);
    expect(hit!.normal).toEqual([0, 1, 0]);

    expect(pw.raycast([100, 5, 0], [0, -1, 0], 10, { excludeBody: solid })).toBeNull();

    expect(pw.raycast([0, 0, 100], [0, 0, 1], 5)).toBeNull();

    pw.removeBody(solid);
    pw.removeBody(sensor);
  });

  it('getBoxBounds: caja en (1,2,3) de tamaño (2,2,2) → min=(0,1,2), max=(2,3,4); bola → null', () => {
    const box = pw.createBody({
      type: 'kinematic',
      position: [1, 2, 3],
      shape: { kind: 'box', halfExtents: [1, 1, 1] },
    });
    const b = pw.getBoxBounds(box);
    expect(b).not.toBeNull();
    expect(b!.min).toEqual([0, 1, 2]);
    expect(b!.max).toEqual([2, 3, 4]);
    pw.removeBody(box);

    const ball = pw.createBody({
      type: 'kinematic',
      position: [0, 0, 0],
      shape: { kind: 'ball', radius: 1 },
    });
    expect(pw.getBoxBounds(ball)).toBeNull();
    pw.removeBody(ball);
  });

  it('setPose + getPose son consistentes (posición y rotación)', () => {
    const b = pw.createBody(boxDesc({ type: 'kinematic' }));
    const p0 = pw.getPose(b);
    expect(p0.position).toEqual([0, 0, 0]);
    expect(p0.rotation[3]).toBeCloseTo(1, 5);

    pw.setPose(b, [3, 4, 5]);
    expect(pw.getPose(b).position).toEqual([3, 4, 5]);

    const s = Math.SQRT1_2;
    pw.setPose(b, [3, 4, 5], [s, 0, 0, s]);
    const r = pw.getPose(b).rotation;
    expect(r[0]).toBeCloseTo(s, 5);
    expect(r[3]).toBeCloseTo(s, 5);
    pw.removeBody(b);
  });

  it('setVelocity + getVelocity son consistentes (lineal y angular)', () => {
    const b = pw.createBody({
      type: 'dynamic',
      position: [0, 10, 0],
      shape: { kind: 'ball', radius: 0.25 },
    });
    pw.setVelocity(b, [1, 2, 3], [0, 0, 4]);
    const v = pw.getVelocity(b);
    expect(v.linear).toEqual([1, 2, 3]);
    expect(v.angular).toEqual([0, 0, 4]);
    pw.removeBody(b);
  });

  it('setGravityScale cambia la escala de gravedad del cuerpo', () => {
    const b = pw.createBody(boxDesc({ type: 'dynamic' }));
    pw.setGravityScale(b, 0);
    expect(b.rb.gravityScale()).toBe(0);
    pw.setGravityScale(b, 2);
    expect(b.rb.gravityScale()).toBe(2);
    pw.removeBody(b);
  });

  it('step integra: caja dinámica de 0.5 sobre suelo fijo se asienta en y≈0.25 tras 120 pasos', () => {
    const floor = makeFloor(pw);
    const cube = pw.createBody({
      type: 'dynamic',
      position: [0, 2, 0],
      shape: { kind: 'box', halfExtents: [0.25, 0.25, 0.25] },
    });
    for (let i = 0; i < 120; i++) pw.step(1 / 60);
    const y = pw.getPose(cube).position[1];
    expect(Math.abs(y - 0.25)).toBeLessThan(0.02);
    pw.removeBody(cube);
    pw.removeBody(floor);
  });

  it('setBodyEnabled(false): el raycast lo atraviesa; con true vuelve a impactar (T26)', () => {
    const wall = pw.createBody(boxDesc({ position: [0, 0, 0] }));
    pw.step(1 / 60);

    expect(pw.raycast([0, 0, 2], [0, 0, -1], 5)).not.toBeNull();

    pw.setBodyEnabled(wall, false);
    expect(wall.rb.isEnabled()).toBe(false);
    pw.step(1 / 60);
    expect(pw.raycast([0, 0, 2], [0, 0, -1], 5)).toBeNull();

    pw.setBodyEnabled(wall, true);
    expect(wall.rb.isEnabled()).toBe(true);
    pw.step(1 / 60);
    expect(pw.raycast([0, 0, 2], [0, 0, -1], 5)).not.toBeNull();

    pw.removeBody(wall);
  });
});
