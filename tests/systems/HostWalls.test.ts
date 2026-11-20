import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { HostWalls } from '../../src/systems/HostWalls';
import { PORTAL_OFFSET } from '../../src/config';
import type { PhysicsBody, PortalColor, PortalState, Vec3 } from '../../src/types/contracts';

type PW = PhysicsWorld;

function state(host: PhysicsBody, color: PortalColor, center: Vec3, normal: Vec3, up: Vec3): PortalState {
  return {
    color,
    position: [
      center[0] + normal[0] * PORTAL_OFFSET,
      center[1] + normal[1] * PORTAL_OFFSET,
      center[2] + normal[2] * PORTAL_OFFSET,
    ],
    normal,
    up,
    right: [
      up[1] * normal[2] - up[2] * normal[1],
      up[2] * normal[0] - up[0] * normal[2],
      up[0] * normal[1] - up[1] * normal[0],
    ],
    hostBody: host,
    surfaceId: host.userData.surfaceId,
  };
}

function makeWall(pw: PW, position: Vec3, surfaceId: string): PhysicsBody {
  return pw.createBody({
    type: 'fixed',
    position,
    shape: { kind: 'box', halfExtents: [5, 2, 0.25] },
    userData: { kind: 'world', portalable: true, surfaceId },
  });
}

describe('HostWalls (T26)', () => {
  let pw: PW;
  let hw: HostWalls;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    hw = new HostWalls(pw);
  });

  it('setHole: 4 cuerpos, original desactivado, raycast por el centro lo atraviesa y al lado impacta', () => {
    const w = makeWall(pw, [0, 2, 0], 'muro');
    pw.step(1 / 60);
    const base = pw.bodyCount();

    hw.setHole('blue', w, state(w, 'blue', [0, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);

    expect(pw.bodyCount()).toBe(base + 4);
    expect(w.rb.isEnabled()).toBe(false);

    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).toBeNull();
    const hit = pw.raycast([3, 2, 1], [0, 0, -1], 5);
    expect(hit).not.toBeNull();
    expect(hit!.userData.surfaceId).toBe('muro');
    expect(hit!.body).not.toBe(w);

    hw.dispose();
    expect(pw.bodyCount()).toBe(base);
    expect(w.rb.isEnabled()).toBe(true);
  });

  it('setHole con el mismo color: cierra el agujero anterior y lo abre en el nuevo sitio', () => {
    const w = makeWall(pw, [0, 2, 0], 'muro');
    pw.step(1 / 60);
    const base = pw.bodyCount();

    hw.setHole('blue', w, state(w, 'blue', [0, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);
    hw.setHole('blue', w, state(w, 'blue', [4, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);

    expect(pw.bodyCount()).toBe(base + 4);
    expect(pw.raycast([4, 2, 1], [0, 0, -1], 5)).toBeNull();
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).not.toBeNull();

    hw.dispose();
  });

  it('caja dinámica sobre un agujero en el suelo cae por él; fuera del agujero se queda encima', () => {
    const floor = pw.createBody({
      type: 'fixed',
      position: [0, -0.5, 0],
      shape: { kind: 'box', halfExtents: [5, 0.5, 5] },
      userData: { kind: 'world', portalable: true, surfaceId: 'suelo' },
    });
    pw.step(1 / 60);

    hw.setHole('blue', floor, state(floor, 'blue', [0, 0, 0], [0, 1, 0], [0, 0, -1]));
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(1 + 4);

    const falling = pw.createBody({
      type: 'dynamic',
      position: [0, 1, 0],
      shape: { kind: 'box', halfExtents: [0.25, 0.25, 0.25] },
    });
    const resting = pw.createBody({
      type: 'dynamic',
      position: [2, 1, 0],
      shape: { kind: 'box', halfExtents: [0.25, 0.25, 0.25] },
    });
    for (let i = 0; i < 90; i++) pw.step(1 / 60);

    expect(pw.getPose(falling).position[1]).toBeLessThan(0);
    expect(Math.abs(pw.getPose(resting).position[1] - 0.25)).toBeLessThan(0.05);
  });

  it('dos agujeros: 7 piezas; clearHole de uno deja 4; del segundo restaura el original', () => {
    const w = makeWall(pw, [0, 2, 0], 'muro');
    pw.step(1 / 60);
    const base = pw.bodyCount();

    hw.setHole('blue', w, state(w, 'blue', [-3, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base + 4);

    hw.setHole('orange', w, state(w, 'orange', [3, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base + 7);
    expect(w.rb.isEnabled()).toBe(false);

    hw.clearHole('blue');
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base + 4);
    expect(w.rb.isEnabled()).toBe(false);
    expect(pw.raycast([3, 2, 1], [0, 0, -1], 5)).toBeNull();

    hw.clearHole('orange');
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base);
    expect(w.rb.isEnabled()).toBe(true);

    hw.clearHole('blue');
    expect(pw.bodyCount()).toBe(base);
  });

  it('setHole con una pieza como host reutiliza el registro por surfaceId', () => {
    const w = makeWall(pw, [0, 2, 0], 'muro');
    pw.step(1 / 60);
    const base = pw.bodyCount();

    hw.setHole('blue', w, state(w, 'blue', [0, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);

    const hit = pw.raycast([3, 2, 1], [0, 0, -1], 5);
    expect(hit).not.toBeNull();
    expect(hit!.body).not.toBe(w);
    expect(hit!.userData.surfaceId).toBe('muro');

    const piece = hit!.body!;
    hw.setHole('orange', piece, state(piece, 'orange', [3, 2, 0], [0, 0, 1], [0, 1, 0]));
    pw.step(1 / 60);

    expect(pw.bodyCount()).toBe(base + 7);
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).toBeNull();
    expect(pw.raycast([3, 2, 1], [0, 0, -1], 5)).toBeNull();
    expect(pw.raycast([-3, 2, 1], [0, 0, -1], 5)).not.toBeNull();

    hw.dispose();
    expect(pw.bodyCount()).toBe(base);
    expect(w.rb.isEnabled()).toBe(true);
  });
});
