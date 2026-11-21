import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { Material, Mesh } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';
import { PortalSystem } from '../../src/systems/PortalSystem';
import { Prop } from '../../src/gameplay/Prop';
import { CUBE_RADIUS, clipPlane, straddles } from '../../src/systems/PortalClones';
import { makePortalFrame } from '../../src/math/portalMath';
import { FakeGl, makeRenderer } from '../utils/portalTestFakes';
import type { RenderToCall } from '../utils/portalTestFakes';
import type { EntityDeps } from '../../src/gameplay/Entity';
import type { Entity, GameEvents, IRenderer, Vec3 } from '../../src/types/contracts';

const DT = 1 / 60;

describe('PortalClones: straddles (T29)', () => {
  const F = makePortalFrame([0, 0, 0], [0, 0, 1], [0, 1, 0]);

  it('centro a 0.3 del plano y dentro del rectángulo → true', () => {
    expect(straddles([0, 0, 0.3], 0.52, F, 1, 2)).toBe(true);
  });

  it('centro a 0.6 del plano → false', () => {
    expect(straddles([0, 0, 0.6], 0.52, F, 1, 2)).toBe(false);
  });

  it('a 0.3 del plano pero a 2 m lateral → false', () => {
    expect(straddles([2, 0, 0.3], 0.52, F, 1, 2)).toBe(false);
  });

  it('justo en el plano y a 0.1 del borde lateral (dentro del radio) → true', () => {
    expect(straddles([0.4, 0, 0], 0.52, F, 1, 2)).toBe(true);
  });

  it('CUBE_RADIUS es la semidiagonal del cubo de 0.6 m (0.52)', () => {
    expect(CUBE_RADIUS).toBeCloseTo(0.52, 2);
  });
});

describe('PortalClones: clipPlane (T29)', () => {
  it('posP + normalP evalúa positivo y posP − normalP negativo', () => {
    const F = makePortalFrame([1, 2, 3], [0, 0, 1], [0, 1, 0]);
    const plane = clipPlane(F);
    const plus = F.position.clone().add(F.normal);
    const minus = F.position.clone().sub(F.normal);
    expect(plane.distanceToPoint(plus)).toBeGreaterThan(0);
    expect(plane.distanceToPoint(minus)).toBeLessThan(0);
  });
});

describe('PortalClones: cuerpo partido (T29)', () => {
  let pw: PhysicsWorld;
  let bus: EventBus<GameEvents>;
  let scene: Scene;
  let renderer: IRenderer;
  let ps: PortalSystem;
  let deps: EntityDeps;
  let cam: PerspectiveCamera;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
    bus = new EventBus();
    scene = new Scene();
    const gl = new FakeGl(800, 600);
    const calls: RenderToCall[] = [];
    renderer = makeRenderer(scene, gl, calls);
    ps = new PortalSystem({ physics: pw, bus, renderer });
    deps = { physics: pw, renderer };
    cam = new PerspectiveCamera(75, 1, 0.05, 200);
  });

  const box = (position: Vec3, halfExtents: Vec3, id: string): void => {
    pw.createBody({
      type: 'fixed',
      position,
      shape: { kind: 'box', halfExtents },
      userData: { kind: 'world', portalable: true, surfaceId: id },
    });
  };

  const referenceWorld = (): void => {
    box([0, -0.5, 0], [15, 0.5, 15], 'suelo');
    box([0, 2, -0.25], [5, 2, 0.25], 'muro-a');
    box([5.25, 2, 3], [0.25, 2, 5], 'muro-b');
    pw.step(DT);
  };

  const placeBoth = (): void => {
    const hb = pw.raycast([0, 1.5, 3], [0, 0, -1], 5);
    expect(hb).not.toBeNull();
    expect(ps.place('blue', hb!, [0, 0, -1])).toBe(true);
    const ho = pw.raycast([2, 1.5, 3], [1, 0, 0], 5);
    expect(ho).not.toBeNull();
    expect(ps.place('orange', ho!, [1, 0, 0])).toBe(true);
    pw.step(DT);
  };

  const frozenCube = (position: Vec3): Prop => {
    const cube = new Prop(deps, bus, 'cubo-1', position);
    pw.setGravityScale(cube.body!, 0);
    pw.step(DT);
    ps.track(cube);
    return cube;
  };

  const moveTo = (cube: Prop, position: Vec3): void => {
    pw.setPose(cube.body!, position);
    cube.syncMesh(1);
  };

  const render = (): void => {
    ps.renderViews(renderer, cam);
  };

  const findClone = (): Mesh | undefined =>
    scene.children.find((c) => (c as Partial<Mesh>).isMesh === true && c.matrixAutoUpdate === false) as
      | Mesh
      | undefined;

  it('cubo solapando el azul: aparece el clon por la salida naranja con recortes', () => {
    referenceWorld();
    placeBoth();
    const cube = frozenCube([0, 1.5, 2]);
    moveTo(cube, [0, 1.5, -0.1]);
    render();

    const orig = cube.mesh as Mesh;
    const clone = findClone();
    expect(clone).toBeDefined();
    expect(clone!.geometry).toBe(orig.geometry);
    expect(clone!.material).not.toBe(orig.material);

    const blue = ps.get('blue')!;
    const orange = ps.get('orange')!;
    const planeP = clipPlane(makePortalFrame(blue.position, blue.normal, blue.up));
    const planeQ = clipPlane(makePortalFrame(orange.position, orange.normal, orange.up));
    const origMat = orig.material as Material;
    expect(origMat.clippingPlanes).toHaveLength(1);
    expect(origMat.clippingPlanes![0].normal).toEqual(planeP.normal);
    expect(origMat.clippingPlanes![0].constant).toBeCloseTo(planeP.constant);
    const cloneMat = clone!.material as Material;
    expect(cloneMat.clippingPlanes).toHaveLength(1);
    expect(cloneMat.clippingPlanes![0].normal).toEqual(planeQ.normal);
    expect(cloneMat.clippingPlanes![0].constant).toBeCloseTo(planeQ.constant);

    clone!.updateWorldMatrix(true, true);
    const pos = new Vector3().setFromMatrixPosition(clone!.matrixWorld);
    expect(pos.x).toBeCloseTo(4.88, 2);
    expect(pos.y).toBeCloseTo(1.5, 2);
    expect(pos.z).toBeCloseTo(3, 2);
  });

  it('cubo lejos de los portales: sin clon y sin recortes', () => {
    referenceWorld();
    placeBoth();
    const cube = frozenCube([0, 1.5, 2]);
    render();
    expect(findClone()).toBeUndefined();
    expect(((cube.mesh as Mesh).material as Material).clippingPlanes).toBeNull();
  });

  it('al salir del solape: se retira el clon, se limpia el recorte y se desposea su material', () => {
    referenceWorld();
    placeBoth();
    const cube = frozenCube([0, 1.5, 2]);
    moveTo(cube, [0, 1.5, -0.1]);
    render();
    const clone = findClone()!;
    const spy = vi.spyOn(clone.material as Material, 'dispose');
    moveTo(cube, [0, 1.5, 2]);
    render();
    expect(findClone()).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(scene.children).not.toContain(clone);
    expect(((cube.mesh as Mesh).material as Material).clippingPlanes).toBeNull();
  });

  it('entidad untrackeada (quitada del nivel): se retira también su clon', () => {
    referenceWorld();
    placeBoth();
    const cube = frozenCube([0, 1.5, 2]);
    moveTo(cube, [0, 1.5, -0.1]);
    render();
    expect(findClone()).toBeDefined();
    ps.untrack(cube);
    render();
    expect(findClone()).toBeUndefined();
    expect(((cube.mesh as Mesh).material as Material).clippingPlanes).toBeNull();
  });

  it('entidad trackeada sin malla (jugador): se omite, no hay clon', () => {
    referenceWorld();
    placeBoth();
    const body = pw.createBody({
      type: 'kinematic',
      position: [0, 1.5, -0.1],
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { kind: 'player' },
    });
    const player: Entity = {
      id: 'player',
      kind: 'player',
      canCross: true,
      body,
      captureState: () => {},
      update: () => {},
      syncMesh: () => {},
      resetInterpolation: () => {},
      dispose: () => {},
    };
    ps.track(player);
    render();
    expect(findClone()).toBeUndefined();
  });

  it('dispose: se retira el clon activo y se desposea su material clonado', () => {
    referenceWorld();
    placeBoth();
    const cube = frozenCube([0, 1.5, 2]);
    moveTo(cube, [0, 1.5, -0.1]);
    render();
    const clone = findClone()!;
    const spy = vi.spyOn(clone.material as Material, 'dispose');
    ps.dispose();
    expect(findClone()).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
