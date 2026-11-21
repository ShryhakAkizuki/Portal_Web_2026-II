import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderTarget, WebGLRenderer } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import type {
  GameEvents,
  IRenderer,
  PhysicsBody,
  RayHit,
  Vec3,
} from '../../src/types/contracts';

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

const VIEW: Vec3 = [0, 0, -1];

describe('PortalSystem: agujeros en la pared (T26)', () => {
  let pw: PhysicsWorld;
  let ps: PortalSystem;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    ps = new PortalSystem({ physics: pw, bus: new EventBus<GameEvents>(), renderer: new FakeRenderer() });
  });

  const hitFront = (x: number, y: number, z = 1.5): RayHit | null => {
    pw.step(1 / 60);
    return pw.raycast([x, y, z], [0, 0, -1], 5);
  };

  const twoWalls = (): [PhysicsBody, PhysicsBody] => {
    const w1 = pw.createBody({
      type: 'fixed',
      position: [0, 2, 0],
      shape: { kind: 'box', halfExtents: [5, 2, 0.25] },
      userData: { kind: 'world', portalable: true, surfaceId: 'muro-a' },
    });
    const w2 = pw.createBody({
      type: 'fixed',
      position: [0, 2, -10],
      shape: { kind: 'box', halfExtents: [5, 2, 0.25] },
      userData: { kind: 'world', portalable: true, surfaceId: 'muro-b' },
    });
    pw.step(1 / 60);
    return [w1, w2];
  };

  const hitWall2 = (x: number, y: number): RayHit | null =>
    pw.raycast([x, y, -8], [0, 0, -1], 5);

  it('con un solo portal no hay agujeros', () => {
    const [w1] = twoWalls();
    const base = pw.bodyCount();
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(pw.bodyCount()).toBe(base);
    expect(w1.rb.isEnabled()).toBe(true);
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).not.toBeNull();
  });

  it('al colocar el segundo se abren los dos agujeros', () => {
    const [w1, w2] = twoWalls();
    const base = pw.bodyCount();
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitWall2(0, 2)!, VIEW)).toBe(true);
    pw.step(1 / 60);

    expect(pw.bodyCount()).toBe(base + 8);
    expect(w1.rb.isEnabled()).toBe(false);
    expect(w2.rb.isEnabled()).toBe(false);
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).toBeNull();
    expect(pw.raycast([0, 2, -8], [0, 0, -1], 5)).toBeNull();
  });

  it('remove cierra los agujeros y bodyCount vuelve a la línea base', () => {
    const [w1, w2] = twoWalls();
    const base = pw.bodyCount();
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitWall2(0, 2)!, VIEW)).toBe(true);
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base + 8);

    ps.remove('blue');
    expect(pw.bodyCount()).toBe(base);
    expect(w1.rb.isEnabled()).toBe(true);
    expect(w2.rb.isEnabled()).toBe(true);
    pw.step(1 / 60);
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).not.toBeNull();
    expect(pw.raycast([0, 2, -8], [0, 0, -1], 5)).not.toBeNull();

    ps.remove('orange');
    expect(pw.bodyCount()).toBe(base);
  });

  it('recolocar un portal en otra pared cierra el agujero antiguo', () => {
    const [w1, w2] = twoWalls();
    const base = pw.bodyCount();
    expect(ps.place('blue', hitFront(0, 2)!, VIEW)).toBe(true);
    expect(ps.place('orange', hitWall2(0, 2)!, VIEW)).toBe(true);
    pw.step(1 / 60);
    expect(pw.bodyCount()).toBe(base + 8);

    const hit2 = pw.raycast([4, 2, -8], [0, 0, -1], 5);
    expect(hit2).not.toBeNull();
    expect(hit2!.userData.surfaceId).toBe('muro-b');
    expect(hit2!.body).not.toBe(w2);
    expect(ps.place('blue', hit2!, VIEW)).toBe(true);
    pw.step(1 / 60);

    expect(pw.bodyCount()).toBe(base + 7);
    expect(w1.rb.isEnabled()).toBe(true);
    expect(w2.rb.isEnabled()).toBe(false);
    expect(pw.raycast([0, 2, 1], [0, 0, -1], 5)).not.toBeNull();
    expect(pw.raycast([4, 2, -8], [0, 0, -1], 5)).toBeNull();
    expect(pw.raycast([0, 2, -8], [0, 0, -1], 5)).toBeNull();
  });
});
