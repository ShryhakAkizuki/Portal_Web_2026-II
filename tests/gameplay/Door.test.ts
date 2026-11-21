import { beforeEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Door } from '../../src/gameplay/Door';
import type { DoorDef } from '../../src/types/contracts';

const DT = 1 / 60;

describe('Door (T31)', () => {
  let pw: PhysicsWorld;
  let scene: Scene;
  let bus: EventBus;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    scene = new Scene();
    bus = new EventBus();
  });

  const deps = () => ({ physics: pw, renderer: { scene } as never, bus });

  const makeDoor = (opensOn: string[], mode?: 'all' | 'any'): Door => {
    const def: DoorDef = {
      type: 'door',
      id: 'd1',
      position: [0, 1, 0],
      size: [2, 2, 0.5],
      opensOn,
      ...(mode ? { mode } : {}),
    };
    return new Door(def, deps());
  };

  const press = (id: string): void => bus.emit('button:pressed', { id });
  const release = (id: string): void => bus.emit('button:released', { id });

  const stepDoor = (d: Door, n: number): void => {
    for (let i = 0; i < n; i++) {
      d.preStep(DT);
      pw.step(DT);
    }
  };

  it('cuerpo kinematic cuboide size/2 en position, kind door', () => {
    const d = makeDoor(['b1']);
    expect(d.kind).toBe('door');
    expect(d.body!.userData.kind).toBe('door');
    expect(pw.isDynamic(d.body!)).toBe(false);
    const t = pw.getPose(d.body!).position;
    expect(t).toEqual([0, 1, 0]);
    const b = pw.getBoxBounds(d.body!)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(2, 5);
    expect(b.max[1] - b.min[1]).toBeCloseTo(2, 5);
    d.dispose();
  });

  it('mode all con 2 botones: abre solo cuando ambos están pulsados', () => {
    const d = makeDoor(['b1', 'b2'], 'all');
    const events: Array<{ id: string; open: boolean }> = [];
    bus.on('door:changed', (e) => events.push(e));

    press('b1');
    expect(d.open).toBe(false);
    press('b2');
    expect(d.open).toBe(true);
    expect(events).toEqual([
      { id: 'd1', open: true },
    ]);

    release('b2');
    expect(d.open).toBe(false);
    release('b1');
    expect(d.open).toBe(false);
    expect(events).toEqual([
      { id: 'd1', open: true },
      { id: 'd1', open: false },
    ]);
    d.dispose();
  });

  it('mode any: abre con un solo botón y cierra al soltarlo', () => {
    const d = makeDoor(['b1', 'b2'], 'any');
    const events: Array<{ id: string; open: boolean }> = [];
    bus.on('door:changed', (e) => events.push(e));

    press('b1');
    expect(d.open).toBe(true);
    release('b1');
    expect(d.open).toBe(false);
    expect(events).toEqual([
      { id: 'd1', open: true },
      { id: 'd1', open: false },
    ]);
    d.dispose();
  });

  it('ignora botones que no están en opensOn', () => {
    const d = makeDoor(['b1'], 'all');
    press('otro');
    expect(d.open).toBe(false);
    d.dispose();
  });

  it('door:changed solo en cambios de estado', () => {
    const d = makeDoor(['b1'], 'all');
    const events: boolean[] = [];
    bus.on('door:changed', (e) => events.push(e.open));

    press('b1');
    press('b1');
    release('b1');
    release('b1');
    expect(events).toEqual([true, false]);
    d.dispose();
  });

  it('tras 40 pasos abierta el cuerpo ha subido ≈ size.y (±0.1); 40 pasos cerrada vuelve a la base', () => {
    const d = makeDoor(['b1'], 'all');
    const baseY = pw.getPose(d.body!).position[1];

    press('b1');
    stepDoor(d, 40);
    const yOpen = pw.getPose(d.body!).position[1];
    expect(Math.abs(yOpen - (baseY + 2))).toBeLessThan(0.1);

    release('b1');
    stepDoor(d, 40);
    const yClosed = pw.getPose(d.body!).position[1];
    expect(Math.abs(yClosed - baseY)).toBeLessThan(0.1);
    d.dispose();
  });

  it('dispose da de baja los listeners (listenerCount vuelve a la línea base)', () => {
    const d = makeDoor(['b1'], 'all');
    expect(bus.listenerCount('button:pressed')).toBe(1);
    expect(bus.listenerCount('button:released')).toBe(1);

    d.dispose();
    expect(bus.listenerCount('button:pressed')).toBe(0);
    expect(bus.listenerCount('button:released')).toBe(0);
    expect(pw.bodyCount()).toBe(0);
    expect(scene.children).toHaveLength(0);

    press('b1');
    expect(bus.listenerCount('button:pressed')).toBe(0);
  });
});
