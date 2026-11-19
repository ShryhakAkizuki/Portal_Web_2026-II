import { describe, expect, it, vi } from 'vitest';
import {
  Color,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { Mesh, WebGLRenderer } from 'three';
import { PortalViews, virtualCameraWorld } from '../../src/systems/portalViews';
import { PortalVisual } from '../../src/systems/PortalVisual';
import { frameMatrix, makePortalFrame } from '../../src/math/portalMath';
import type { IRenderer, PortalColor, PortalState, Vec3 } from '../../src/types/contracts';

const POS_A: Vec3 = [0, 0, 0];
const NOR_A: Vec3 = [0, 0, 1];
const POS_B: Vec3 = [0, 0, 10];
const NOR_B: Vec3 = [0, 0, -1];
const UP: Vec3 = [0, 1, 0];

const M_A = frameMatrix(makePortalFrame(POS_A, NOR_A, UP));
const M_B = frameMatrix(makePortalFrame(POS_B, NOR_B, UP));

const stateOf = (color: PortalColor, position: Vec3, normal: Vec3, up: Vec3): PortalState => ({
  color,
  position,
  normal,
  up,
  right: [
    up[1] * normal[2] - up[2] * normal[1],
    up[2] * normal[0] - up[0] * normal[2],
    up[0] * normal[1] - up[1] * normal[0],
  ],
  hostBody: null,
});

function cameraAt(pos: Vec3, lookAt: Vec3): PerspectiveCamera {
  const cam = new PerspectiveCamera(75, 1, 0.1, 100);
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  cam.updateMatrixWorld(true);
  return cam;
}

class FakeGl {
  private w: number;
  private h: number;
  accesses = 0;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
  setBuffer(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  getDrawingBufferSize(target: Vector2): Vector2 {
    this.accesses++;
    return target.set(this.w, this.h);
  }
}

interface RenderToCall {
  target: WebGLRenderTarget;
  cam: PerspectiveCamera;
}

function makeRenderer(scene: Scene, gl: FakeGl, calls: RenderToCall[]): IRenderer {
  return {
    scene,
    camera: new PerspectiveCamera(75, 1, 0.1, 100),
    get gl() {
      return gl as unknown as WebGLRenderer;
    },
    resize: () => {},
    render: () => {},
    renderTo: (target: WebGLRenderTarget, cam: PerspectiveCamera) => {
      calls.push({ target, cam });
    },
    dispose: () => {},
  };
}

function setup(bufferW = 800, bufferH = 600) {
  const scene = new Scene();
  const visual = new PortalVisual(scene);
  visual.show(stateOf('blue', POS_A, NOR_A, UP));
  visual.show(stateOf('orange', POS_B, NOR_B, UP));
  const gl = new FakeGl(bufferW, bufferH);
  const calls: RenderToCall[] = [];
  const renderer = makeRenderer(scene, gl, calls);
  const views = new PortalViews(renderer, visual);
  const camera = cameraAt([0, 0, 3], [0, 0, 0]);
  return { scene, visual, gl, calls, renderer, views, camera };
}

describe('virtualCameraWorld (T23)', () => {
  it('cámara 3 m delante de A → virtual a 3 m detrás del plano de B mirando +nB', () => {
    const camera = cameraAt([0, 0, 3], [0, 0, 0]);
    const C = camera.matrixWorld.clone();
    const V = virtualCameraWorld(M_A, M_B, C);

    const pos = new Vector3().setFromMatrixPosition(V);
    const expected = new Vector3(POS_B[0], POS_B[1], POS_B[2])
      .addScaledVector(new Vector3(NOR_B[0], NOR_B[1], NOR_B[2]), -3);
    expect(pos.distanceTo(expected)).toBeLessThan(1e-10);

    const dir = new Vector3().setFromMatrixColumn(V, 2).negate().normalize();
    const nB = new Vector3(NOR_B[0], NOR_B[1], NOR_B[2]);
    expect(dir.distanceTo(nB)).toBeLessThan(1e-10);
  });

  it('paralaje: la línea de vista de la cámara virtual pasa por el centro de B', () => {
    const camera = cameraAt([2, 1, 3], [0, 0, 0]);
    const V = virtualCameraWorld(M_A, M_B, camera.matrixWorld);
    const pos = new Vector3().setFromMatrixPosition(V);
    expect(pos.distanceTo(new Vector3(2, 1, 13))).toBeLessThan(1e-10);

    const dir = new Vector3().setFromMatrixColumn(V, 2).negate().normalize();
    const t = (pos.z - POS_B[2]) / -dir.z;
    const through = pos.clone().addScaledVector(dir, t);
    expect(through.distanceTo(new Vector3(POS_B[0], POS_B[1], POS_B[2]))).toBeLessThan(1e-9);
  });

  it('T inversa devuelve la cámara original', () => {
    const camera = cameraAt([1, -2, 4], [0, 0, 0]);
    const C = camera.matrixWorld.clone();
    const back = virtualCameraWorld(M_B, M_A, virtualCameraWorld(M_A, M_B, C));
    C.elements.forEach((v, i) => expect(back.elements[i]).toBeCloseTo(v, 12));
  });

  it('no modifica las entradas', () => {
    const camera = cameraAt([1, 2, 3], [0, 0, 0]);
    const from = M_A.clone();
    const to = M_B.clone();
    const camWorld = camera.matrixWorld.clone();
    const before = [from.elements.slice(), to.elements.slice(), camWorld.elements.slice()];
    virtualCameraWorld(from, to, camWorld);
    expect(from.elements).toEqual(before[0]);
    expect(to.elements).toEqual(before[1]);
    expect(camWorld.elements).toEqual(before[2]);
  });
});

describe('PortalViews (T23 · sin WebGL)', () => {
  it('sin enlace: no llama a renderTo, no toca gl y restaura el color oscuro', () => {
    const { visual, gl, calls, views, camera } = setup();
    const surface = visual.getSurface('blue') as Mesh;
    const marker = new MeshBasicMaterial({ color: 0xffffff });
    visual.setSurfaceMaterial('blue', marker);

    views.render(camera, M_A, null);

    expect(calls).toHaveLength(0);
    expect(gl.accesses).toBe(0);
    expect(surface.material).not.toBe(marker);
    expect((surface.material as MeshBasicMaterial).color.getHex()).toBe(new Color(0x0a0a12).getHex());
    marker.dispose();
  });

  it('enlazado: renderTo dos veces con los targets y cámaras virtuales correctos', () => {
    const { gl, calls, views, camera } = setup();
    views.render(camera, M_A, M_B);

    expect(gl.accesses).toBe(1);
    expect(calls).toHaveLength(2);
    const [blueCall, orangeCall] = calls;
    expect(blueCall.target).toBeInstanceOf(WebGLRenderTarget);
    expect([blueCall.target.width, blueCall.target.height]).toEqual([800, 600]);
    expect(blueCall.target).not.toBe(orangeCall.target);

    const expectedBlue = virtualCameraWorld(M_A, M_B, camera.matrixWorld);
    expect(blueCall.cam.matrixWorld.elements).toEqual(expectedBlue.elements);
    const expectedOrange = virtualCameraWorld(M_B, M_A, camera.matrixWorld);
    expect(orangeCall.cam.matrixWorld.elements).toEqual(expectedOrange.elements);

    const inv = blueCall.cam.matrixWorld.clone().invert();
    inv.elements.forEach((v, i) =>
      expect(blueCall.cam.matrixWorldInverse.elements[i]).toBeCloseTo(v, 12));
  });

  it('la superficie muestra la textura de su target con la resolución del buffer', () => {
    const { visual, calls, views, camera } = setup();
    views.render(camera, M_A, M_B);

    const matBlue = (visual.getSurface('blue') as Mesh).material as ShaderMaterial;
    expect(matBlue).toBeInstanceOf(ShaderMaterial);
    expect(matBlue.uniforms.map.value).toBe(calls[0].target.texture);
    expect([matBlue.uniforms.resolution.value.x, matBlue.uniforms.resolution.value.y]).toEqual([800, 600]);

    const matOrange = (visual.getSurface('orange') as Mesh).material as ShaderMaterial;
    expect(matOrange.uniforms.map.value).toBe(calls[1].target.texture);
  });

  it('las cámaras virtuales se reutilizan y copian la proyección de la principal', () => {
    const { calls, views, camera } = setup();
    views.render(camera, M_A, M_B);
    const cam1 = calls[0].cam;
    views.render(camera, M_A, M_B);
    expect(calls[0].cam).toBe(cam1);
    expect(cam1.matrixAutoUpdate).toBe(false);
    expect(cam1.matrixWorldAutoUpdate).toBe(false);
    expect(cam1.fov).toBe(camera.fov);
    expect(cam1.aspect).toBe(camera.aspect);
    expect(cam1.near).toBe(camera.near);
    expect(cam1.far).toBe(camera.far);
    expect(cam1.projectionMatrix.elements).toEqual(camera.projectionMatrix.elements);
    expect(cam1.projectionMatrixInverse.elements).toEqual(camera.projectionMatrixInverse.elements);
  });

  it('tras el render las superficies vuelven a estar visibles', () => {
    const { scene, views, camera } = setup();
    views.render(camera, M_A, M_B);
    for (const child of scene.children) expect(child.visible).toBe(true);
  });

  it('si cambia el buffer, redimensiona el target sin re-crear el objeto', () => {
    const { gl, calls, views, camera } = setup();
    views.render(camera, M_A, M_B);
    const rt1 = calls[0].target;
    gl.setBuffer(1024, 512);
    views.render(camera, M_A, M_B);
    const rt2 = calls[2].target;
    expect(rt2).toBe(rt1);
    expect([rt1.width, rt1.height]).toEqual([1024, 512]);
  });

  it('perder y recuperar el enlace reutiliza el mismo material de superficie', () => {
    const { visual, calls, views, camera } = setup();
    views.render(camera, M_A, M_B);
    const mat1 = (visual.getSurface('blue') as Mesh).material;
    views.render(camera, M_A, null);
    expect((visual.getSurface('blue') as Mesh).material).not.toBe(mat1);
    views.render(camera, M_A, M_B);
    expect((visual.getSurface('blue') as Mesh).material).toBe(mat1);
    expect(calls).toHaveLength(4);
  });

  it('dispose libera targets y materiales', () => {
    const { visual, calls, views, camera } = setup();
    views.render(camera, M_A, M_B);
    const mat = (visual.getSurface('blue') as Mesh).material as ShaderMaterial;
    const rtSpy = vi.spyOn(calls[0].target, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');
    views.dispose();
    expect(rtSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
