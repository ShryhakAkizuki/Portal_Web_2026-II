import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene as ThreeScene } from 'three';
import type { Object3D, WebGLRenderer } from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Level } from '../../src/levels/Level';
import { buildEntity, clearBuilders, registerBuilder } from '../../src/levels/entityFactory';
import type {
  Controller,
  Entity,
  EntityDef,
  IEventBus,
  IInput,
  IPortalSystem,
  IRenderer,
  LevelData,
  LevelDeps,
  PhysicsBody,
} from '../../src/types/contracts';
import testRoom from '../../src/levels/data/test-room.json';

const ROOM_DATA = testRoom as unknown as LevelData;

// ---------- Fakes ----------

class FakeInput implements IInput {
  endStepCount = 0;
  private readonly log?: string[];

  constructor(log?: string[]) {
    this.log = log;
  }
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
  endStep(): void {
    this.endStepCount++;
    this.log?.push('input.endStep');
  }
  dispose(): void {}
}

class FakePortals implements IPortalSystem {
  tracked: Entity[] = [];
  calls: string[] = [];
  private readonly log?: string[];

  constructor(log?: string[]) {
    this.log = log;
  }
  place(): boolean {
    return false;
  }
  remove(): void {}
  get(): null {
    return null;
  }
  isLinked(): boolean {
    return false;
  }
  track(e: Entity): void {
    this.tracked.push(e);
    this.calls.push('track');
  }
  untrack(e: Entity): void {
    const i = this.tracked.indexOf(e);
    if (i !== -1) this.tracked.splice(i, 1);
    this.calls.push('untrack');
  }
  update(dt: number): void {
    this.calls.push(`update(${dt})`);
    this.log?.push('portals.update');
  }
  renderViews(): void {
    this.calls.push('renderViews');
    this.log?.push('renderViews');
  }
  dispose(): void {
    this.calls.push('dispose');
  }
}

class FakeEntity implements Entity {
  readonly kind = 'fake';
  readonly canCross: boolean;
  body?: PhysicsBody;
  mesh?: Object3D;
  calls: string[] = [];
  disposed = false;
  private readonly log?: string[];
  private readonly onDispose?: () => void;

  constructor(
    readonly id: string,
    opts: { canCross?: boolean; log?: string[]; onDispose?: () => void } = {},
  ) {
    this.canCross = opts.canCross ?? false;
    this.log = opts.log;
    this.onDispose = opts.onDispose;
  }
  captureState(): void {
    this.calls.push('captureState');
    this.log?.push('captureState');
  }
  preStep(): void {
    this.calls.push('preStep');
    this.log?.push('preStep');
  }
  update(): void {
    this.calls.push('update');
    this.log?.push('entity.update');
  }
  syncMesh(): void {
    this.calls.push('syncMesh');
    this.log?.push('syncMesh');
  }
  resetInterpolation(): void {}
  dispose(): void {
    this.disposed = true;
    this.calls.push('dispose');
    this.onDispose?.();
  }
}

function makeRenderer(log?: string[]): IRenderer {
  return {
    gl: null as unknown as WebGLRenderer,
    scene: new ThreeScene(),
    camera: new PerspectiveCamera(75, 1, 0.1, 100),
    resize(): void {},
    render(): void {
      log?.push('renderer.render');
    },
    renderTo(): void {},
    dispose(): void {},
  } as unknown as IRenderer;
}

function withStepSpy(world: PhysicsWorld, log: string[]): PhysicsWorld {
  return new Proxy(world, {
    get(target, prop) {
      if (prop === 'step') {
        return (dt: number) => {
          log.push('physics.step');
          target.step(dt);
        };
      }
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function'
        ? (value as (this: unknown, ...args: never[]) => unknown).bind(target)
        : value;
    },
  });
}

// ---------- Pruebas ----------

describe('Level y entityFactory (T16)', () => {
  let pw: PhysicsWorld;
  let input: FakeInput;
  let renderer: IRenderer;

  function makeLevelDeps(o: {
    portals?: IPortalSystem;
    renderer?: IRenderer;
    input?: IInput;
    physics?: PhysicsWorld;
  } = {}): LevelDeps {
    return {
      physics: o.physics ?? pw,
      renderer: o.renderer ?? renderer,
      bus: {} as unknown as IEventBus,
      input: o.input ?? input,
      ...(o.portals ? { portals: o.portals } : {}),
    };
  }

  function exitEntity(def: EntityDef): Entity {
    const e = new FakeEntity(def.id, {
      onDispose: () => {
        if (e.body) {
          pw.removeBody(e.body);
          e.body = undefined;
        }
      },
    });
    e.body = pw.createBody({
      type: 'fixed',
      position: def.position,
      shape: { kind: 'ball', radius: 0.1 },
      userData: { kind: 'sensor' },
    });
    return e;
  }

  beforeEach(async () => {
    clearBuilders();
    pw = await PhysicsWorld.create();
    input = new FakeInput();
    renderer = makeRenderer();
  });

  describe('entityFactory', () => {
    it('buildEntity: tipo sin builder registrado lanza "Entidad desconocida: <type>"', () => {
      const def = { type: 'lava', id: 'l1', position: [0, 0, 0] } as unknown as EntityDef;
      expect(() => buildEntity(def, makeLevelDeps(), { levelId: 'test-room' })).toThrow(
        'Entidad desconocida: lava',
      );
    });

    it('buildEntity: un builder registrado recibe def, deps y ctx y crea la entidad', () => {
      const deps = makeLevelDeps();
      const ctx = { levelId: 'test-room' };
      const def = { type: 'cube', id: 'c1', position: [0, 0, 0] } as EntityDef;
      registerBuilder('cube', (d, dd, c) => {
        expect(d).toBe(def);
        expect(dd).toBe(deps);
        expect(c).toEqual(ctx);
        return new FakeEntity(d.id);
      });
      const e = buildEntity(def, deps, ctx);
      expect(e.id).toBe('c1');
    });
  });

  describe('load', () => {
    it('test-room.json: 11 entidades, 11 cuerpos, jugador en el spawn (pies + 0.9 m)', () => {
      registerBuilder('exit', exitEntity);
      const level = new Level(makeLevelDeps(), ROOM_DATA);
      level.enter();

      expect(level.entities).toHaveLength(11); // 9 cajas + jugador + exit
      expect(pw.bodyCount()).toBe(11);

      const player = level.getEntity('player');
      expect(player).toBeDefined();
      const pose = pw.getPose(player!.body!).position;
      expect(pose[0]).toBeCloseTo(0, 5);
      expect(pose[1]).toBeCloseTo(0.9, 5); // halfHeight 0.6 + radius 0.3
      expect(pose[2]).toBeCloseTo(5, 5);

      expect(level.getEntity('floor')).toBeDefined();
      expect(level.getEntity('wall-north')).toBeDefined();
      expect(level.getEntity('exit')).toBeDefined();

      level.dispose();
      expect(level.entities).toHaveLength(0);
      expect(pw.bodyCount()).toBe(0);
    });

    it('load: tipo válido pero sin builder lanzado por la fábrica', () => {
      registerBuilder('exit', exitEntity);
      const data: LevelData = {
        ...ROOM_DATA,
        entities: [
          { type: 'cube', id: 'c1', position: [0, 0, 0] },
          { type: 'exit', id: 'exit', position: [0, 0.5, -9.5], size: [1, 1, 1] },
        ],
      };
      const level = new Level(makeLevelDeps(), ROOM_DATA);
      expect(() => level.load(data)).toThrow('Entidad desconocida: cube');
    });

    it('load: caja sin id recibe "box-<i>"', () => {
      registerBuilder('exit', exitEntity);
      const data: LevelData = {
        id: 'mini',
        name: 'Mini',
        spawn: { position: [0, 0, 0], yaw: 0 },
        geometry: [
          { position: [0, -0.5, 0], size: [4, 1, 4], portalable: false },
          { id: 'custom', position: [2, 0.5, 0], size: [1, 1, 1], portalable: true },
        ],
        entities: [{ type: 'exit', id: 'exit', position: [0, 0.5, 0], size: [1, 1, 1] }],
      };
      const level = new Level(makeLevelDeps(), data);
      level.enter();
      expect(level.entities).toHaveLength(4); // 2 cajas + jugador + exit
      expect(level.getEntity('box-0')).toBeDefined();
      expect(level.getEntity('custom')).toBeDefined();
      level.dispose();
    });
  });

  it('update: orden captureState → preStep → physics.step → portals.update → entity.update → controller → input.endStep', () => {
    const order: string[] = [];
    registerBuilder('exit', (def) => new FakeEntity(def.id, { log: order }));
    const portals = new FakePortals(order);
    const inputSpy = new FakeInput(order);
    const level = new Level(
      makeLevelDeps({ portals, physics: withStepSpy(pw, order), input: inputSpy }),
      ROOM_DATA,
    );
    level.enter();

    const player = level.getEntity('player')!;
    const origCapture = player.captureState.bind(player);
    player.captureState = () => {
      order.push('captureState');
      origCapture();
    };
    const origPreStep = player.preStep!.bind(player);
    player.preStep = (dt: number) => {
      order.push('preStep');
      origPreStep(dt);
    };
    const origUpdate = player.update.bind(player);
    player.update = (dt: number) => {
      order.push('entity.update');
      origUpdate(dt);
    };

    const controller: Controller = {
      update: () => {
        order.push('controller.update');
      },
    };
    level.addController(controller);

    level.update(1 / 60);

    const idx = (v: string): number => order.indexOf(v);
    const expected = [
      'captureState',
      'preStep',
      'physics.step',
      'portals.update',
      'entity.update',
      'controller.update',
      'input.endStep',
    ];
    for (const v of expected) {
      expect(idx(v), `falta ${v}`).toBeGreaterThanOrEqual(0);
    }
    expect(idx('preStep')).toBeGreaterThan(idx('captureState'));
    expect(idx('physics.step')).toBeGreaterThan(idx('preStep'));
    expect(idx('portals.update')).toBeGreaterThan(idx('physics.step'));
    expect(idx('entity.update')).toBeGreaterThan(idx('portals.update'));
    expect(idx('controller.update')).toBeGreaterThan(idx('entity.update'));
    expect(idx('input.endStep')).toBeGreaterThan(idx('controller.update'));
    expect(inputSpy.endStepCount).toBe(1);
  });

  it('add/remove: canCross → portals.track/untrack; sin portals no falla', () => {
    const portals = new FakePortals();
    const level = new Level(makeLevelDeps({ portals }), ROOM_DATA);
    const cross = new FakeEntity('cross', { canCross: true });
    const plain = new FakeEntity('plain');
    level.add(cross);
    level.add(plain);
    expect(portals.tracked).toContain(cross);
    expect(portals.tracked).not.toContain(plain);
    expect(level.getEntity('cross')).toBe(cross);

    level.remove(cross);
    expect(portals.tracked).not.toContain(cross);
    expect(cross.disposed).toBe(true);
    expect(level.getEntity('cross')).toBeUndefined();

    const level2 = new Level(makeLevelDeps(), ROOM_DATA);
    const e2 = new FakeEntity('x2', { canCross: true });
    expect(() => level2.add(e2)).not.toThrow();
    expect(level2.getEntity('x2')).toBe(e2);
  });

  it('controllers: update en cada paso; dispose al desmontar (idempotente)', () => {
    const level = new Level(makeLevelDeps(), ROOM_DATA);
    let updates = 0;
    let disposed = 0;
    const controller: Controller = {
      update: () => {
        updates++;
      },
      dispose: () => {
        disposed++;
      },
    };
    level.addController(controller);
    level.update(1 / 60);
    level.update(1 / 60);
    expect(updates).toBe(2);
    level.dispose();
    expect(disposed).toBe(1);
    level.dispose();
    expect(disposed).toBe(1);
  });

  it('render: syncMesh → portals.renderViews → renderer.render', () => {
    const log: string[] = [];
    registerBuilder('exit', (def) => new FakeEntity(def.id, { log }));
    const portals = new FakePortals(log);
    const level = new Level(
      makeLevelDeps({ portals, renderer: makeRenderer(log) }),
      ROOM_DATA,
    );
    level.enter();
    level.render(1);

    const idx = (v: string): number => log.indexOf(v);
    expect(idx('syncMesh')).toBeGreaterThanOrEqual(0);
    expect(idx('renderViews')).toBeGreaterThan(idx('syncMesh'));
    expect(idx('renderer.render')).toBeGreaterThan(idx('renderViews'));
  });
});
