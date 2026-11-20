import { PerspectiveCamera, Scene, Vector2 } from 'three';
import type { Mesh, WebGLRenderer, WebGLRenderTarget } from 'three';
import { PortalVisual } from '../../src/systems/PortalVisual';
import { frameMatrix, makePortalFrame } from '../../src/math/portalMath';
import type { IRenderer, PortalColor, PortalState, Vec3 } from '../../src/types/contracts';

export const POS_A: Vec3 = [0, 0, 0];
export const NOR_A: Vec3 = [0, 0, 1];
export const POS_B: Vec3 = [0, 0, 10];
export const NOR_B: Vec3 = [0, 0, -1];
export const UP: Vec3 = [0, 1, 0];

export const M_A = frameMatrix(makePortalFrame(POS_A, NOR_A, UP));
export const M_B = frameMatrix(makePortalFrame(POS_B, NOR_B, UP));
export const F_A = makePortalFrame(POS_A, NOR_A, UP);
export const F_B = makePortalFrame(POS_B, NOR_B, UP);

export const stateOf = (color: PortalColor, position: Vec3, normal: Vec3, up: Vec3): PortalState => ({
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

export function cameraAt(pos: Vec3, lookAt: Vec3): PerspectiveCamera {
  const cam = new PerspectiveCamera(75, 1, 0.1, 100);
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  cam.updateMatrixWorld(true);
  return cam;
}

export class FakeGl {
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

export interface RenderToCall {
  target: WebGLRenderTarget;
  cam: PerspectiveCamera;
}

export function makeRenderer(scene: Scene, gl: FakeGl, calls: RenderToCall[]): IRenderer {
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

export function setupPortalScene(bufferW = 800, bufferH = 600) {
  const scene = new Scene();
  const visual = new PortalVisual(scene);
  visual.show(stateOf('blue', POS_A, NOR_A, UP));
  visual.show(stateOf('orange', POS_B, NOR_B, UP));
  const gl = new FakeGl(bufferW, bufferH);
  const calls: RenderToCall[] = [];
  const renderer = makeRenderer(scene, gl, calls);
  return { scene, visual, gl, calls, renderer };
}

export const surfaceOf = (visual: PortalVisual, color: PortalColor): Mesh =>
  visual.getSurface(color) as Mesh;
