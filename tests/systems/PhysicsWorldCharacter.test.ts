import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import type { PhysicsBody } from '../../src/types/contracts';

type PW = PhysicsWorld;

function makeFloor(pw: PW): PhysicsBody {
  return pw.createBody({
    type: 'fixed',
    position: [0, -0.5, 0],
    shape: { kind: 'box', halfExtents: [5, 0.5, 5] },
    userData: { kind: 'world' },
  });
}

function makeCharacter(pw: PW): PhysicsBody {
  return pw.createBody({
    type: 'kinematic',
    position: [0, 0.9, 0],
    shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
    userData: { kind: 'player' },
  });
}

describe('PhysicsWorld.moveCharacter (T09)', () => {
  let pw: PW;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
  });

  it('avanza 1 m sobre el suelo con grounded=true', () => {
    const floor = makeFloor(pw);
    const c = makeCharacter(pw);
    pw.step(1 / 60);
    const res = pw.moveCharacter(c, [1, 0, 0], 1 / 60);
    expect(res.movement[0]).toBeGreaterThan(0.9);
    expect(res.movement[0]).toBeLessThan(1.1);
    expect(res.grounded).toBe(true);
    pw.removeBody(c);
    pw.removeBody(floor);
  });

  it('una pared cercana detiene al personaje (movement.x < 0.5)', () => {
    const floor = makeFloor(pw);
    const c = makeCharacter(pw);
    const wall = pw.createBody({
      type: 'fixed',
      position: [1.1, 0.9, 0],
      shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] },
      userData: { kind: 'world' },
    });
    pw.step(1 / 60);
    const res = pw.moveCharacter(c, [1, 0, 0], 1 / 60);
    expect(res.movement[0]).toBeGreaterThan(0);
    expect(res.movement[0]).toBeLessThan(0.5);
    pw.removeBody(wall);
    pw.removeBody(c);
    pw.removeBody(floor);
  });

  it('grounded=false en el aire', () => {
    const floor = makeFloor(pw);
    const c = pw.createBody({
      type: 'kinematic',
      position: [0, 5, 0],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { kind: 'player' },
    });
    pw.step(1 / 60);
    const res = pw.moveCharacter(c, [1, 0, 0], 1 / 60);
    expect(res.grounded).toBe(false);
    pw.removeBody(c);
    pw.removeBody(floor);
  });

  it('sube un escalón de 0.25 m (autostep) pero no uno de 0.6 m', () => {
    const floor = makeFloor(pw);

    {
      const c = makeCharacter(pw);
      const step = pw.createBody({
        type: 'fixed',
        position: [1.0, 0.125, 0],
        shape: { kind: 'box', halfExtents: [0.25, 0.125, 10] },
        userData: { kind: 'world' },
      });
      pw.step(1 / 60);
      const res = pw.moveCharacter(c, [1, 0, 0], 1 / 60);
      expect(res.movement[0]).toBeGreaterThan(0.5);
      expect(res.movement[1]).toBeGreaterThan(0.1);
      pw.removeBody(step);
      pw.removeBody(c);
    }

    {
      const c = makeCharacter(pw);
      const step = pw.createBody({
        type: 'fixed',
        position: [0.7, 0.3, 0],
        shape: { kind: 'box', halfExtents: [0.25, 0.3, 10] },
        userData: { kind: 'world' },
      });
      pw.step(1 / 60);
      const res = pw.moveCharacter(c, [1, 0, 0], 1 / 60);
      expect(res.movement[0]).toBeLessThan(0.5);
      expect(Math.abs(res.movement[1])).toBeLessThan(0.01);
      pw.removeBody(step);
      pw.removeBody(c);
    }

    pw.removeBody(floor);
  });
});
