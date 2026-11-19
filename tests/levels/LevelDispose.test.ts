import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene as ThreeScene } from 'three';
import type { Object3D, WebGLRenderer } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Level } from '../../src/levels/Level';
import { clearBuilders, registerBuilder } from '../../src/levels/entityFactory';
import type {
  Controller,
  Entity,
  GameEvents,
  IEventBus,
  IInput,
  IRenderer,
  LevelData,
  LevelDeps,
  PhysicsBody,
} from '../../src/types/contracts';

// ---------- Fakes mínimos ----------

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

class FakeEntity implements Entity {
  readonly kind = 'fake';
  readonly canCross = false;
  body?: PhysicsBody;
  mesh?: Object3D;
  private readonly onDispose?: () => void;

  constructor(
    readonly id: string,
    opts: { onDispose?: () => void } = {},
  ) {
    this.onDispose = opts.onDispose;
  }
  captureState(): void {}
  update(): void {}
  syncMesh(): void {}
  resetInterpolation(): void {}
  dispose(): void {
    this.onDispose?.();
  }
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

// ---------- Nivel de prueba ----------

const BUS_LEVEL: LevelData = {
  id: 't18-bus',
  name: 'T18 bus',
  spawn: { position: [0, 0, 0], yaw: 0 },
  geometry: [{ id: 'floor', position: [0, -0.5, 0], size: [10, 1, 10], portalable: false }],
  entities: [
    { type: 'button', id: 'btn-a', position: [1, 0.55, 0] },
    { type: 'button', id: 'btn-b', position: [-1, 0.55, 0] },
    { type: 'door', id: 'door-1', position: [0, 1, -4], size: [2, 2, 0.3], opensOn: ['btn-a'] },
    { type: 'exit', id: 'exit', position: [0, 0.5, -4.5], size: [1, 1, 1] },
  ],
};

// ---------- Pruebas ----------

describe('Level.dispose (T18): sin fugas', () => {
  let pw: PhysicsWorld;
  let bus: IEventBus;
  let renderer: IRenderer;
  let log: string[];

  function deps(): LevelDeps {
    return { physics: pw, renderer, bus, input: new FakeInput() };
  }

  function makeBusEntity(d: LevelDeps, id: string, position: [number, number, number]): Entity {
    const off = d.bus.on('button:pressed', () => {});
    const e = new FakeEntity(id, {
      onDispose: () => {
        off();
        log.push(`entity:${id}`);
        if (e.body) {
          d.physics.removeBody(e.body);
          e.body = undefined;
        }
      },
    });
    e.body = d.physics.createBody({
      type: 'fixed',
      position,
      shape: { kind: 'ball', radius: 0.1 },
      userData: { kind: 'sensor' },
    });
    return e;
  }

  function registerBusBuilders(): void {
    registerBuilder('button', (def, d) => makeBusEntity(d, def.id, def.position));
    registerBuilder('door', (def, d) => makeBusEntity(d, def.id, def.position));
    registerBuilder('exit', (def, d) => makeBusEntity(d, def.id, def.position));
  }

  function baselines(): { bodies: number; children: number; listeners: number } {
    return {
      bodies: pw.bodyCount(),
      children: renderer.scene.children.length,
      listeners: bus.listenerCount(),
    };
  }

  beforeEach(async () => {
    clearBuilders();
    pw = await PhysicsWorld.create();
    bus = new EventBus<GameEvents>();
    renderer = makeRenderer();
    log = [];
  });

  it('load + dispose: cuerpos, nodos de escena y listeners vuelven a la línea base', () => {
    registerBusBuilders();
    const level = new Level(deps(), BUS_LEVEL);
    const base = baselines();

    level.load(BUS_LEVEL);
    expect(pw.bodyCount()).toBeGreaterThan(base.bodies);
    expect(renderer.scene.children.length).toBeGreaterThan(base.children);
    expect(bus.listenerCount()).toBeGreaterThan(base.listeners);

    level.dispose();
    expect(pw.bodyCount()).toBe(base.bodies);
    expect(renderer.scene.children.length).toBe(base.children);
    expect(bus.listenerCount()).toBe(base.listeners);
    expect(level.entities).toHaveLength(0);
    expect(level.getEntity('player')).toBeUndefined();
  });

  it('5 ciclos de load/dispose sin crecimiento', () => {
    registerBusBuilders();
    const level = new Level(deps(), BUS_LEVEL);
    const base = baselines();

    for (let i = 0; i < 5; i++) {
      level.load(BUS_LEVEL);
      level.dispose();
      expect(pw.bodyCount(), `ciclo ${i + 1}: cuerpos`).toBe(base.bodies);
      expect(renderer.scene.children.length, `ciclo ${i + 1}: nodos`).toBe(base.children);
      expect(bus.listenerCount(), `ciclo ${i + 1}: listeners`).toBe(base.listeners);
      expect(level.entities, `ciclo ${i + 1}: entidades`).toHaveLength(0);
    }
  });

  it('dispose doble y triple no lanza', () => {
    registerBusBuilders();
    const level = new Level(deps(), BUS_LEVEL);
    level.load(BUS_LEVEL);
    expect(() => {
      level.dispose();
      level.dispose();
      level.dispose();
    }).not.toThrow();
    expect(level.entities).toHaveLength(0);
  });

  it('un controller con dispose espía recibe exactamente una llamada', () => {
    registerBusBuilders();
    const level = new Level(deps(), BUS_LEVEL);
    level.load(BUS_LEVEL);
    let disposed = 0;
    const controller: Controller = {
      update: () => {},
      dispose: () => {
        disposed++;
      },
    };
    level.addController(controller);
    level.dispose();
    level.dispose();
    expect(disposed).toBe(1);
  });

  it('dispose: controllers primero y entidades en orden inverso a la creación', () => {
    registerBusBuilders();
    const level = new Level(deps(), BUS_LEVEL);
    level.load(BUS_LEVEL);
    level.addController({
      update: () => {},
      dispose: () => {
        log.push('controller:c1');
      },
    });

    level.dispose();

    expect(log).toEqual([
      'controller:c1',
      'entity:exit',
      'entity:door-1',
      'entity:btn-b',
      'entity:btn-a',
    ]);
  });
});
