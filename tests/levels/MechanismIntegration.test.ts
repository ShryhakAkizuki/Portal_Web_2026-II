import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene as ThreeScene } from 'three';
import type { WebGLRenderer } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Level } from '../../src/levels/Level';
import { registerAll } from '../../src/levels/registerAll';
import { Prop } from '../../src/gameplay/Prop';
import type { IInput, IRenderer, LevelData } from '../../src/types/contracts';

const DT = 1 / 60;

/** Nivel de prueba: suelo, botón en el centro, puerta al lado, exit (obligatorio). */
const DATA: LevelData = {
  id: 'mech-room',
  name: 'Sala de mecanismos',
  spawn: { position: [0, 0, 5], yaw: 0 },
  geometry: [{ id: 'floor', position: [0, -0.5, 0], size: [20, 1, 20], portalable: false }],
  entities: [
    { type: 'button', id: 'b1', position: [0, 0.05, 0] },
    { type: 'door', id: 'd1', position: [3, 1.5, 0], size: [2, 3, 0.5], opensOn: ['b1'], mode: 'all' },
    { type: 'exit', id: 'exit', position: [0, 0.5, 6], size: [1, 1, 1] },
  ],
};

class FakeInput implements IInput {
  isDown(): boolean {
    return false;
  }
  wasPressed(): boolean {
    return false;
  }
  getMoveAxis(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  consumeLook(): { dx: number; dy: number } {
    return { dx: 0, dy: 0 };
  }
  readonly isLocked = false;
  lockPointer(): void {}
  endStep(): void {}
  dispose(): void {}
}

function makeRenderer(): IRenderer {
  return {
    gl: null as unknown as WebGLRenderer,
    scene: new ThreeScene(),
    camera: new PerspectiveCamera(75, 1, 0.1, 100),
    resize(): void {},
    render(): void {},
    renderTo(): void {},
    dispose(): void {},
  } as unknown as IRenderer;
}

describe('Integración botón→puerta (T31)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus;
  let renderer: IRenderer;
  let level: Level;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    renderer = makeRenderer();
    registerAll();
    level = new Level({ physics: pw, renderer, bus, input: new FakeInput() }, DATA);
    level.enter();
  });

  it('un cubo cae sobre el botón (Level.load + builders) y la puerta se abre', () => {
    const pressed: string[] = [];
    const doorEvents: Array<{ id: string; open: boolean }> = [];
    bus.on('button:pressed', (d) => pressed.push(d.id));
    bus.on('door:changed', (e) => doorEvents.push(e));

    const doorEntity = level.getEntity('d1')!;
    const baseY = pw.getPose(doorEntity.body!).position[1];
    const cube = new Prop({ physics: pw, renderer }, bus, 'cube1', [0, 1.2, 0]);
    level.add(cube);
    pw.step(DT);

    for (let i = 0; i < 60; i++) {
      level.update(DT);
    }
    expect(pressed).toEqual(['b1']);
    expect(doorEvents).toEqual([{ id: 'd1', open: true }]);

    for (let i = 0; i < 40; i++) {
      level.update(DT);
    }
    const doorY = pw.getPose(doorEntity.body!).position[1];
    expect(Math.abs(doorY - (baseY + 3))).toBeLessThan(0.1);

    level.dispose();
  });
});
