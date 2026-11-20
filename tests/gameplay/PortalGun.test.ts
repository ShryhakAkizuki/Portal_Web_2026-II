import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import { PortalGun } from '../../src/gameplay/PortalGun';
import { PORTAL_OFFSET } from '../../src/config';
import type {
  Action,
  Entity,
  IInput,
  IPlayer,
  IPhysicsWorld,
  IRenderer,
  IPortalSystem,
  PhysicsBody,
  PortalColor,
  PortalState,
  RayHit,
  Vec3,
} from '../../src/types/contracts';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderTarget, WebGLRenderer } from 'three';

class FakeRenderer implements IRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(75, 1, 0.05, 200);

  get gl(): WebGLRenderer {
    throw new Error('gl no disponible en tests');
  }
  resize(_width: number, _height: number): void {}
  render(): void {}
  renderTo(_target: WebGLRenderTarget, _camera: PerspectiveCamera): void {}
  dispose(): void {}
}

class FakeInput implements IInput {
  locked = false;
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
    return this.locked;
  }
  lockPointer(): void {
    this.locked = true;
  }
  endStep(): void {
    this.pressed = [];
  }
  dispose(): void {
    this.pressed = [];
  }
}

class FakePortals implements IPortalSystem {
  calls: { color: PortalColor; point: Vec3 }[] = [];

  place(color: PortalColor, hit: RayHit, _viewDir: Vec3): boolean {
    this.calls.push({ color, point: hit.point });
    return true;
  }
  remove(_color: PortalColor): void {}
  get(_color: PortalColor): PortalState | null {
    return null;
  }
  isLinked(): boolean {
    return false;
  }
  track(_e: Entity): void {}
  untrack(_e: Entity): void {}
  update(_dt: number): void {}
  renderViews(_renderer: IRenderer, _camera: PerspectiveCamera): void {}
  dispose(): void {}
}

class FakePlayer implements IPlayer {
  readonly id = 'player';
  readonly kind = 'player';
  readonly canCross = true;
  yaw = 0;
  pitch = 0;
  readonly velocity: Vec3 = [0, 0, 0];
  grounded = false;
  readonly eyePosition: Vec3 = [0, 1.6, 5];
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

describe('PortalGun (T21)', () => {
  let pw: PhysicsWorld;
  let input: FakeInput;
  let player: FakePlayer;
  let ps: PortalSystem;
  let gun: PortalGun;
  let wall: PhysicsBody;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    const bus = new EventBus();
    ps = new PortalSystem({ physics: pw, bus, renderer: new FakeRenderer() });
    input = new FakeInput();
    player = new FakePlayer();
    player.body = pw.createBody({
      type: 'kinematic',
      position: [0, 0.9, 5],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { entityId: 'player', kind: 'player' },
    });
    wall = pw.createBody({
      type: 'fixed',
      position: [0, 2, 0],
      shape: { kind: 'box', halfExtents: [5, 2, 0.25] },
      userData: { kind: 'world', portalable: true, surfaceId: 'muro' },
    });
    pw.step(1 / 60);
    gun = new PortalGun({ physics: pw, input, portals: ps, player });
  });

  it('clic izquierdo con puntero bloqueado coloca blue en el muro frente al jugador', () => {
    input.lockPointer();
    input.pressed.push('firePrimary');
    gun.update(1 / 60);
    const st = ps.get('blue');
    expect(st).not.toBeNull();
    expect(st!.hostBody).toBe(wall);
    expect(st!.normal).toEqual([0, 0, 1]);
    expect(st!.position).toEqual([0, 1.6, 0.25 + PORTAL_OFFSET]);
    expect(ps.get('orange')).toBeNull();
  });

  it('clic derecho con puntero bloqueado coloca orange', () => {
    input.lockPointer();
    input.pressed.push('fireSecondary');
    gun.update(1 / 60);
    const st = ps.get('orange');
    expect(st).not.toBeNull();
    expect(st!.hostBody).toBe(wall);
    expect(st!.position[0]).toBeCloseTo(0, 5);
    expect(st!.position[1]).toBeCloseTo(1.6, 5);
    expect(st!.position[2]).toBeCloseTo(0.25 + PORTAL_OFFSET, 5);
    expect(ps.get('blue')).toBeNull();
  });

  it('sin bloqueo no hace nada', () => {
    input.locked = false;
    input.pressed.push('firePrimary');
    gun.update(1 / 60);
    expect(ps.get('blue')).toBeNull();
    expect(ps.get('orange')).toBeNull();
  });

  it('sin impacto (cielo) no llama a place', () => {
    const fake = new FakePortals();
    const g = new PortalGun({ physics: pw, input, portals: fake, player });
    input.lockPointer();
    player.dir = [0, 1, 0];
    input.pressed.push('firePrimary');
    g.update(1 / 60);
    expect(fake.calls).toEqual([]);
  });

  it('el rayo ignora al propio jugador: un cuerpo del jugador entre el ojo y el muro no bloquea', () => {
    pw.removeBody(player.body!);
    player.body = pw.createBody({
      type: 'kinematic',
      position: [0, 1.6, 4.5],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { entityId: 'player', kind: 'player' },
    });
    pw.step(1 / 60);
    input.lockPointer();
    input.pressed.push('firePrimary');
    gun.update(1 / 60);
    const st = ps.get('blue');
    expect(st).not.toBeNull();
    expect(st!.hostBody).toBe(wall);
  });

  it('fire devuelve true si coloca y false si no hay impacto', () => {
    expect(gun.fire('blue')).toBe(true);
    expect(ps.get('blue')).not.toBeNull();
    player.dir = [0, 1, 0];
    expect(gun.fire('orange')).toBe(false);
    expect(ps.get('orange')).toBeNull();
  });
});
