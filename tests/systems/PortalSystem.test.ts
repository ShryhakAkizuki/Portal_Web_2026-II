import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import { PORTAL_OFFSET } from '../../src/config';
import type { PhysicsBody, PortalColor, RayHit, Vec3 } from '../../src/types/contracts';

const WALL_HALF: Vec3 = [5, 2, 0.25];
const VIEW: Vec3 = [0, 0, -1];

describe('PortalSystem.place (T20)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus;
  let ps: PortalSystem;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    ps = new PortalSystem({ physics: pw, bus });
  });

  const wall = (
    portalable: boolean,
    half: Vec3 = WALL_HALF,
    position: Vec3 = [0, 2, 0],
  ): PhysicsBody =>
    pw.createBody({
      type: 'fixed',
      position,
      shape: { kind: 'box', halfExtents: half },
      userData: { kind: 'world', portalable, surfaceId: 'muro' },
    });

  const hitFront = (x: number, y: number, z = 1.5): RayHit | null => {
    pw.step(1 / 60);
    return pw.raycast([x, y, z], [0, 0, -1], 5);
  };

  it('colocar en el centro de un muro: posición, up, right, hostBody y evento', () => {
    const w = wall(true);
    const hit = hitFront(0, 2);
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(w);

    const events: PortalColor[] = [];
    bus.on('portal:placed', (d) => events.push(d.color));

    expect(ps.place('blue', hit!, VIEW)).toBe(true);
    const st = ps.get('blue');
    expect(st).not.toBeNull();
    expect(st!.position).toEqual([0, 2, 0.25 + PORTAL_OFFSET]);
    expect(st!.normal).toEqual([0, 0, 1]);
    expect(st!.up).toEqual([0, 1, 0]);
    expect(st!.right).toEqual([1, 0, 0]);
    expect(st!.hostBody).toBe(w);
    expect(st!.surfaceId).toBe('muro');
    expect(events).toEqual(['blue']);
  });

  it('cerca del borde: el centro se desplaza para que el portal quepa', () =>
    (() => {
      const w = wall(true);
      const hit = hitFront(0, 3.9);
      expect(hit).not.toBeNull();
      expect(ps.place('blue', hit!, VIEW)).toBe(true);
      const st = ps.get('blue')!;
      expect(st.position[1]).toBeCloseTo(3.0, 5);
      expect(st.position[0]).toBeCloseTo(0, 5);
      expect(st.position[2]).toBeCloseTo(0.25 + PORTAL_OFFSET, 5);
      expect(st.hostBody).toBe(w);
    })());

  it('muro no portalable → false y no cambia el estado previo', () => {
    const w1 = wall(true);
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    const prev = ps.get('blue')!;

    const w2 = wall(false, WALL_HALF, [20, 2, 0]);
    const hit2 = hitFront(20, 2);
    expect(hit2).not.toBeNull();
    expect(hit2!.body).toBe(w2);
    expect(ps.place('blue', hit2!, VIEW)).toBe(false);
    expect(ps.get('blue')).toBe(prev);
  });

  it('cara menor que el portal (muro de 0.8 de ancho) → false', () => {
    const w = wall(true, [0.4, 2, 0.25]);
    const hit = hitFront(0, 2);
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(w);
    expect(ps.place('blue', hit!, VIEW)).toBe(false);
    expect(ps.get('blue')).toBeNull();
  });

  it('suelo con viewDir=(0,−0.3,−1) → up=(0,0,−1)', () => {
    const floor = pw.createBody({
      type: 'fixed',
      position: [0, 0, 0],
      shape: { kind: 'box', halfExtents: [5, 0.25, 5] },
      userData: { kind: 'world', portalable: true, surfaceId: 'suelo' },
    });
    pw.step(1 / 60);
    const hit = pw.raycast([0, 2, 1], [0, -1, 0], 5);
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(floor);
    expect(ps.place('orange', hit!, [0, -0.3, -1])).toBe(true);
    const st = ps.get('orange')!;
    expect(st.up).toEqual([0, 0, -1]);
    expect(st.position).toEqual([0, 0.25 + PORTAL_OFFSET, 1]);
  });

  it('mismo color dos veces: reemplaza', () => {
    const w = wall(true);
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('blue', hitFront(2, 2)!, VIEW)).toBe(true);
    const st = ps.get('blue')!;
    expect(st.position[0]).toBeCloseTo(2, 5);
    expect(st.hostBody).toBe(w);
  });

  it('colores distintos solapados en el mismo plano → el segundo falla', () => {
    const w = wall(true);
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitFront(0, 2)!, VIEW)).toBe(false);
    expect(ps.get('orange')).toBeNull();
    expect(ps.isLinked()).toBe(false);
    expect(ps.get('blue')!.hostBody).toBe(w);
  });

  it('colores distintos no solapados → ambos colocados y isLinked()', () => {
    const w = wall(true);
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitFront(4, 2)!, VIEW)).toBe(true);
    expect(ps.get('blue')).not.toBeNull();
    expect(ps.get('orange')!.hostBody).toBe(w);
    expect(ps.isLinked()).toBe(true);
  });

  it('remove borra el portal y isLinked() pasa a false', () => {
    const w = wall(true);
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitFront(4, 2)!, VIEW)).toBe(true);
    expect(ps.isLinked()).toBe(true);

    ps.remove('blue');
    expect(ps.get('blue')).toBeNull();
    expect(ps.isLinked()).toBe(false);
    expect(ps.get('orange')!.hostBody).toBe(w);
  });
});
