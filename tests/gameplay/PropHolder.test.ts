import { beforeEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Prop } from '../../src/gameplay/Prop';
import { PropHolder } from '../../src/gameplay/PropHolder';
import { HOLD_DISTANCE } from '../../src/config';
import type {
  Action,
  Entity,
  IInput,
  IPlayer,
  IRenderer,
  PhysicsBody,
  Vec3,
} from '../../src/types/contracts';

const DT = 1 / 60;

class FakeInput implements IInput {
  pressed: Action[] = [];

  isDown(_a: Action): boolean {
    return false;
  }
  wasPressed(a: Action): boolean {
    return this.pressed.includes(a);
  }
  getMoveAxis(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  consumeLook(): { dx: number; dy: number } {
    return { dx: 0, dy: 0 };
  }
  get isLocked(): boolean {
    return true;
  }
  lockPointer(): void {}
  endStep(): void {
    this.pressed = [];
  }
  dispose(): void {}
}

class FakePlayer implements IPlayer {
  readonly id = 'player';
  readonly kind = 'player';
  readonly canCross = true;
  yaw = 0;
  pitch = 0;
  readonly velocity: Vec3 = [0, 0, 0];
  grounded = true;
  eyePosition: Vec3 = [0, 1.6, 5];
  dir: Vec3 = [0, 0, -1];
  body?: PhysicsBody;

  look(_dx: number, _dy: number): void {}
  lookDirection(): Vec3 {
    return this.dir;
  }
  captureState(): void {}
  update(_dt: number): void {}
  syncMesh(_alpha: number): void {}
  resetInterpolation(): void {}
  dispose(): void {}
}

describe('PropHolder (T30)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus;
  let input: FakeInput;
  let player: FakePlayer;
  let cube: Prop;
  let holder: PropHolder;
  const entities = new Map<string, Entity>();

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    input = new FakeInput();
    player = new FakePlayer();
    player.body = pw.createBody({
      type: 'kinematic',
      position: [0, 0.9, 5],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { entityId: 'player', kind: 'player' },
    });
    pw.createBody({
      type: 'fixed',
      position: [0, -0.5, 0],
      shape: { kind: 'box', halfExtents: [25, 0.5, 25] },
      userData: { kind: 'world', surfaceId: 'suelo' },
    });
    cube = new Prop(
      { physics: pw, renderer: { scene: new Scene() } as unknown as IRenderer },
      bus,
      'cubo-1',
      [0, 1.6, 3],
    );
    entities.set(cube.id, cube);
    holder = new PropHolder({
      physics: pw,
      input,
      player,
      bus,
      getEntity: (id) => entities.get(id),
    });
    pw.step(DT);
  });

  const frame = (press?: Action): void => {
    if (press) input.pressed.push(press);
    pw.step(DT);
    holder.update(DT);
    input.endStep();
  };

  const cubePos = (): Vec3 => pw.getPose(cube.body!).position;
  const distToEye = (): number => {
    const p = cubePos();
    const e = player.eyePosition;
    return Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
  };

  it('agarra un cubo a 2 m con `interact` (held, gravityScale 0, evento) y tras 60 pasos queda a HOLD_DISTANCE ± 0.1 del ojo', () => {
    const grabbed: string[] = [];
    bus.on('prop:grabbed', (d) => grabbed.push(d.id));
    frame('interact');
    expect(cube.held).toBe(true);
    expect(cube.body!.rb.gravityScale()).toBe(0);
    expect(grabbed).toEqual(['cubo-1']);
    expect(holder.canGrab).toBe(false);

    for (let i = 0; i < 59; i++) frame();
    const d = distToEye();
    expect(d).toBeGreaterThan(HOLD_DISTANCE - 0.1);
    expect(d).toBeLessThan(HOLD_DISTANCE + 0.1);
  });

  it('la segunda pulsación lo suelta y cae (y disminuye)', () => {
    frame('interact');
    for (let i = 0; i < 30; i++) frame();
    const y0 = cubePos()[1];
    const released: string[] = [];
    bus.on('prop:released', (d) => released.push(d.id));
    frame('interact');
    expect(cube.held).toBe(false);
    expect(cube.body!.rb.gravityScale()).toBe(1);
    expect(released).toEqual(['cubo-1']);
    expect(holder.canGrab).toBe(true);

    for (let i = 0; i < 60; i++) frame();
    expect(cubePos()[1]).toBeLessThan(y0 - 0.3);
  });

  it('fuera de alcance (3 m) no se agarra; apuntando a una pared no se agarra', () => {
    frame();
    expect(holder.canGrab).toBe(true);

    pw.setPose(cube.body!, [0, 1.6, 2]);
    frame();
    expect(holder.canGrab).toBe(false);
    frame('interact');
    expect(cube.held).toBe(false);

    pw.createBody({
      type: 'fixed',
      position: [0, 1.6, 3],
      shape: { kind: 'box', halfExtents: [1.5, 1, 0.25] },
      userData: { kind: 'world', surfaceId: 'muro' },
    });
    pw.step(DT);
    frame();
    expect(holder.canGrab).toBe(false);
    frame('interact');
    expect(cube.held).toBe(false);
  });

  it('si el jugador se aleja 5 m de golpe, el cubo se suelta automáticamente', () => {
    frame('interact');
    for (let i = 0; i < 30; i++) frame();
    expect(cube.held).toBe(true);

    const released: string[] = [];
    bus.on('prop:released', (d) => released.push(d.id));
    pw.setPose(player.body!, [0, 0.9, 0]);
    player.eyePosition = [0, 1.6, 0];
    frame();
    expect(cube.held).toBe(false);
    expect(cube.body!.rb.gravityScale()).toBe(1);
    expect(released).toEqual(['cubo-1']);
  });

  it('girando la mirada el cubo se mueve al nuevo objetivo (sigue a lookDirection)', () => {
    frame('interact');
    for (let i = 0; i < 30; i++) frame();
    player.dir = [1, 0, 0];
    for (let i = 0; i < 90; i++) frame();

    const p = cubePos();
    const e = player.eyePosition;
    const target = [e[0] + HOLD_DISTANCE, e[1], e[2]] as Vec3;
    const d = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
    expect(d).toBeLessThan(0.2);
    expect(p[0]).toBeGreaterThan(1);
  });
});
