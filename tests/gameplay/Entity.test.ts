import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  type Object3D,
} from 'three';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { BaseEntity, type EntityDeps } from '../../src/gameplay/Entity';
import type { IRenderer, Vec3 } from '../../src/types/contracts';

const STEP = 1 / 60;

class TestEntity extends BaseEntity {
  constructor(id: string, deps: EntityDeps) {
    super(id, 'test', deps);
  }

  attach(mesh: Object3D): void {
    this.attachMesh(mesh);
  }

  override update(_dt: number): void {
  }
}

function expectV3(v: { x: number; y: number; z: number }, target: Vec3, digits = 6): void {
  expect(v.x).toBeCloseTo(target[0], digits);
  expect(v.y).toBeCloseTo(target[1], digits);
  expect(v.z).toBeCloseTo(target[2], digits);
}

describe('BaseEntity (T11)', () => {
  let pw: PhysicsWorld;
  let scene: Scene;
  let deps: EntityDeps;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    scene = new Scene();
    deps = { physics: pw, renderer: { scene } as unknown as IRenderer };
  });

  function makeFallingCube(): TestEntity {
    const e = new TestEntity('cube-1', deps);
    e.body = pw.createBody({
      type: 'dynamic',
      position: [0, 5, 0],
      shape: { kind: 'box', halfExtents: [0.3, 0.3, 0.3] },
      userData: { kind: 'prop' },
    });
    e.attach(new Mesh(new BoxGeometry(0.6, 0.6, 0.6), new MeshBasicMaterial()));
    return e;
  }

  it('attachMesh añade la malla a la escena del renderer y la guarda en `mesh`', () => {
    const e = new TestEntity('sin-cuerpo', deps);
    expect(e.mesh).toBeUndefined();
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    e.attach(m);
    expect(e.mesh).toBe(m);
    expect(scene.children).toContain(m);
  });

  it('syncMesh(0) deja la malla en la pose previa y syncMesh(1) en la actual', () => {
    const e = makeFallingCube();
    e.captureState();
    for (let i = 0; i < 10; i++) pw.step(STEP);
    const curr = pw.getPose(e.body!);
    expect(curr.position[1]).toBeLessThan(4.9);

    e.syncMesh(0);
    expectV3(e.mesh!.position, [0, 5, 0]);

    e.syncMesh(1);
    expectV3(e.mesh!.position, curr.position);
  });

  it('syncMesh(0.5) interpola a mitad de camino (posición con lerp y cuaternión con slerp)', () => {
    const e = makeFallingCube();
    pw.setVelocity(e.body!, [0, 0, 0], [0, 0.5, 0.2]);
    e.captureState();
    for (let i = 0; i < 10; i++) pw.step(STEP);
    const curr = pw.getPose(e.body!);
    expect(curr.rotation[1] + curr.rotation[2]).not.toBeCloseTo(0, 5);

    e.syncMesh(0.5);
    expect(e.mesh!.position.x).toBeCloseTo(0, 6);
    expect(e.mesh!.position.y).toBeCloseTo((5 + curr.position[1]) / 2, 6);
    expect(e.mesh!.position.z).toBeCloseTo(0, 6);

    const expected = new Quaternion().slerpQuaternions(
      new Quaternion(0, 0, 0, 1),
      new Quaternion(curr.rotation[0], curr.rotation[1], curr.rotation[2], curr.rotation[3]),
      0.5,
    );
    const q = e.mesh!.quaternion;
    expect(q.x).toBeCloseTo(expected.x, 5);
    expect(q.y).toBeCloseTo(expected.y, 5);
    expect(q.z).toBeCloseTo(expected.z, 5);
    expect(q.w).toBeCloseTo(expected.w, 5);
  });

  it('resetInterpolation iguala previa y actual: syncMesh(0) da la pose actual', () => {
    const e = makeFallingCube();
    e.captureState();
    for (let i = 0; i < 10; i++) pw.step(STEP);
    e.resetInterpolation();
    const curr = pw.getPose(e.body!);
    e.syncMesh(0);
    expectV3(e.mesh!.position, curr.position);
  });

  it('captureState/syncMesh/resetInterpolation no hacen nada sin cuerpo ni sin malla', () => {
    const sinCuerpo = new TestEntity('a', deps);
    sinCuerpo.attach(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    expect(() => {
      sinCuerpo.captureState();
      sinCuerpo.syncMesh(0.5);
      sinCuerpo.resetInterpolation();
    }).not.toThrow();
    const p = sinCuerpo.mesh!.position;
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);

    const sinMalla = makeFallingCube();
    sinMalla.mesh = undefined;
    expect(() => {
      sinMalla.captureState();
      sinMalla.syncMesh(0.5);
      sinMalla.resetInterpolation();
    }).not.toThrow();
  });

  it('dispose quita la malla de la escena, libera recursos y reduce bodyCount; es idempotente', () => {
    const e = makeFallingCube();
    const mesh = e.mesh! as Mesh;
    const geom = mesh.geometry as BoxGeometry;
    const mat = mesh.material as MeshBasicMaterial;
    const geomDispose = vi.spyOn(geom, 'dispose');
    const matDispose = vi.spyOn(mat, 'dispose');
    const antes = pw.bodyCount();

    e.dispose();
    expect(scene.children).not.toContain(mesh);
    expect(pw.bodyCount()).toBe(antes - 1);
    expect(e.body).toBeUndefined();
    expect(e.mesh).toBeUndefined();
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();

    expect(() => e.dispose()).not.toThrow();
    expect(pw.bodyCount()).toBe(antes - 1);
  });

  it('dispose funciona con solo malla o solo cuerpo', () => {
    const soloMalla = new TestEntity('m', deps);
    soloMalla.attach(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    const m = soloMalla.mesh!;
    expect(() => soloMalla.dispose()).not.toThrow();
    expect(scene.children).not.toContain(m);

    const soloCuerpo = new TestEntity('c', deps);
    soloCuerpo.body = pw.createBody({
      type: 'dynamic',
      position: [9, 5, 0],
      shape: { kind: 'box', halfExtents: [0.3, 0.3, 0.3] },
    });
    const antes = pw.bodyCount();
    soloCuerpo.dispose();
    expect(pw.bodyCount()).toBe(antes - 1);
  });
});
