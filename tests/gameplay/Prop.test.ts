import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { Prop } from '../../src/gameplay/Prop';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { IPlayer, IRenderer, Vec3 } from '../../src/types/contracts';

const FAKE_PLAYER = {} as IPlayer;

describe('Prop (T27)', () => {
  let pw: PhysicsWorld;
  let scene: Scene;
  let deps: EntityDeps;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    scene = new Scene();
    deps = { physics: pw, renderer: { scene } as unknown as IRenderer };
  });

  const make = (position: Vec3 = [1, 2, 3]): Prop => new Prop(deps, 'cubo-1', position);

  it('cuerpo `dynamic` cubo 0.3 de halfExtents, friction 0.6, ccd y userData { entityId, kind: prop }', () => {
    const p = make();
    expect(p.kind).toBe('prop');
    expect(p.canCross).toBe(true);
    expect(p.body).toBeDefined();
    expect(pw.isDynamic(p.body!)).toBe(true);
    expect(p.body!.rb.bodyType()).toBe(RigidBodyType.Dynamic);
    expect(p.body!.rb.isCcdEnabled()).toBe(true);
    expect(p.body!.collider.friction()).toBeCloseTo(0.6, 5);
    expect(p.body!.userData).toEqual({ entityId: 'cubo-1', kind: 'prop' });
  });

  it('la malla es un BoxGeometry(0.6) de color 0xf2a03d posicionada en el cuerpo', () => {
    const p = make([2, 0.3, -1]);
    const mesh = p.mesh as Mesh;
    expect(mesh).toBeInstanceOf(Mesh);
    expect(mesh.geometry).toBeInstanceOf(BoxGeometry);
    expect((mesh.geometry as BoxGeometry).parameters).toMatchObject({ width: 0.6, height: 0.6, depth: 0.6 });
    const mat = mesh.material as MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xf2a03d);
    expect(mesh.position.toArray()).toEqual([2, 0.3, -1]);
    expect(scene.children).toContain(mesh);
  });

  it('grab/release cambian solo `held` (T30 los completa)', () => {
    const p = make();
    expect(p.held).toBe(false);
    p.grab(FAKE_PLAYER);
    expect(p.held).toBe(true);
    p.release();
    expect(p.held).toBe(false);
  });

  it('dispose quita el cuerpo y la malla, libera recursos; es idempotente', () => {
    const p = make();
    const mesh = p.mesh as Mesh;
    const geom = mesh.geometry as BoxGeometry;
    const mat = mesh.material as MeshStandardMaterial;
    const geomDispose = vi.spyOn(geom, 'dispose');
    const matDispose = vi.spyOn(mat, 'dispose');
    const antes = pw.bodyCount();

    p.dispose();
    expect(scene.children).not.toContain(mesh);
    expect(pw.bodyCount()).toBe(antes - 1);
    expect(p.body).toBeUndefined();
    expect(p.mesh).toBeUndefined();
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();

    expect(() => p.dispose()).not.toThrow();
    expect(pw.bodyCount()).toBe(antes - 1);
  });
});
