import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { StaticBox } from '../../src/gameplay/StaticBox';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { BoxDef, IRenderer } from '../../src/types/contracts';

function def(position: [number, number, number], size: [number, number, number], portalable = false): BoxDef {
  return { position, size, portalable };
}

describe('StaticBox (T14)', () => {
  let pw: PhysicsWorld;
  let scene: Scene;
  let deps: EntityDeps;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    scene = new Scene();
    deps = { physics: pw, renderer: { scene } as unknown as IRenderer };
  });

  it('crea un cuerpo `fixed` con el `userData` { kind: world, portalable, surfaceId }', () => {
    const box = new StaticBox('piso-1', def([0, -0.5, 0], [20, 1, 20], true), deps);
    expect(box.kind).toBe('static');
    expect(box.body).toBeDefined();
    expect(box.body!.rb.bodyType()).toBe(RigidBodyType.Fixed);
    expect(box.body!.userData).toEqual({
      kind: 'world',
      portalable: true,
      surfaceId: 'piso-1',
    });
  });

  it('getBoxBounds coincide con position ± size/2', () => {
    const box = new StaticBox('b', def([1, 2.5, -3], [2, 0.5, 4]), deps);
    const bounds = pw.getBoxBounds(box.body!);
    expect(bounds).not.toBeNull();
    expect(bounds!.min).toEqual([0, 2.25, -5]);
    expect(bounds!.max).toEqual([2, 2.75, -1]);
  });

  it('la malla es un Mesh con BoxGeometry de las dimensiones del def, posicionada una vez', () => {
    const box = new StaticBox('b', def([1, 0.125, -3], [2, 0.25, 2]), deps);
    const mesh = box.mesh as Mesh;
    expect(mesh).toBeInstanceOf(Mesh);
    const geom = mesh.geometry as BoxGeometry;
    expect(geom).toBeInstanceOf(BoxGeometry);
    expect(geom.parameters).toMatchObject({ width: 2, height: 0.25, depth: 2 });
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(0.125);
    expect(mesh.position.z).toBe(-3);
    expect(scene.children).toContain(mesh);
  });

  it('el color por defecto depende de portalable (0xd9dde6 portalable, 0x4a4f5c no)', () => {
    const portalable = new StaticBox('p', def([0, 0, -10], [2, 4, 0.5], true), deps);
    const normal = new StaticBox('n', def([0, 0, 0], [2, 1, 2]), deps);
    const colorP = (portalable.mesh as Mesh).material as MeshStandardMaterial;
    const colorN = (normal.mesh as Mesh).material as MeshStandardMaterial;
    expect(colorP.color.getHex()).toBe(0xd9dde6);
    expect(colorN.color.getHex()).toBe(0x4a4f5c);
  });

  it('dispose quita el cuerpo y la malla, libera geometría y material; es idempotente', () => {
    const box = new StaticBox('b', def([0, 0.5, 0], [1, 1, 1]), deps);
    const mesh = box.mesh as Mesh;
    const geom = mesh.geometry as BoxGeometry;
    const mat = mesh.material as MeshStandardMaterial;
    const geomDispose = vi.spyOn(geom, 'dispose');
    const matDispose = vi.spyOn(mat, 'dispose');
    const antes = pw.bodyCount();

    box.dispose();
    expect(scene.children).not.toContain(mesh);
    expect(pw.bodyCount()).toBe(antes - 1);
    expect(box.body).toBeUndefined();
    expect(box.mesh).toBeUndefined();
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();

    expect(() => box.dispose()).not.toThrow();
    expect(pw.bodyCount()).toBe(antes - 1);
  });
});
