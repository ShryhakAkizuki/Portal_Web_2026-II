import {
  DoubleSide,
  Matrix4,
  PerspectiveCamera,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { PORTAL_HEIGHT, PORTAL_OFFSET, PORTAL_RECURSION, PORTAL_WIDTH } from '../config';
import { obliqueNearProjection, portalTransform } from '../math/portalMath';
import type { PortalFrame } from '../math/portalMath';
import type { IRenderer, PortalColor } from '../types/contracts';
import type { PortalVisual } from './PortalVisual';
import { debugPortalView } from './portalDebug';

export function virtualCameraWorld(from: Matrix4, to: Matrix4, cameraWorld: Matrix4): Matrix4 {
  const cam = portalTransform(from, to).multiply(cameraWorld);
  const pos = new Vector3().setFromMatrixPosition(cam);
  const toPos = new Vector3().setFromMatrixPosition(to);
  const toNormal = new Vector3().setFromMatrixColumn(to, 2).normalize();
  const d = pos.clone().sub(toPos).dot(toNormal);
  pos.addScaledVector(toNormal, -2 * d);
  cam.elements[12] = pos.x;
  cam.elements[13] = pos.y;
  cam.elements[14] = pos.z;
  return cam;
}

export function pingPong(index: number, pass: number): { read: 0 | 1; write: 0 | 1 } {
  const read: 0 | 1 = ((index + pass) % 2) as 0 | 1;
  return { read, write: read === 0 ? 1 : 0 };
}

export function clipFrame(out: PortalFrame): PortalFrame {
  return { ...out, position: out.position.clone().addScaledVector(out.normal, -PORTAL_OFFSET / 2) };
}

const SURFACE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(map, vUv);
  #include <colorspace_fragment>
}
`;

const COLORS: readonly PortalColor[] = ['blue', 'orange'];

export const PORTAL_ASPECT = PORTAL_WIDTH / PORTAL_HEIGHT;

export class PortalViews {
  private readonly renderer: IRenderer;
  private readonly visual: PortalVisual;
  private readonly targets = new Map<PortalColor, WebGLRenderTarget[]>();
  private readonly cameras = new Map<PortalColor, PerspectiveCamera>();
  private readonly materials = new Map<PortalColor, ShaderMaterial>();
  private rtWidth = 0;
  private rtHeight = 0;

  constructor(renderer: IRenderer, visual: PortalVisual) {
    this.renderer = renderer;
    this.visual = visual;
  }

  render(
    camera: PerspectiveCamera,
    blue: Matrix4 | null,
    orange: Matrix4 | null,
    blueClip: PortalFrame | null,
    orangeClip: PortalFrame | null,
    passes = PORTAL_RECURSION,
  ): void {
    if (blue === null || orange === null) {
      this.resetSurfaces();
      return;
    }
    const totalPasses = Math.max(passes, 1);
    const size = this.renderer.gl.getDrawingBufferSize(new Vector2());
    this.rtWidth = Math.max(2, Math.round(size.x / 2));
    this.rtHeight = this.rtWidth * 2;
    const frames: Record<PortalColor, Matrix4> = { blue, orange };
    const clips: Record<PortalColor, PortalFrame | null> = { blue: blueClip, orange: orangeClip };

    for (let pass = 0; pass < totalPasses; pass++) {
      for (let index = 0; index < COLORS.length; index++) {
        const color = COLORS[index];
        const pair = this.ensureTargetPair(color);
        if (pass === 0) {
          this.visual.resetSurfaceMaterial(color);
        } else {
          const readTarget = pair[pingPong(index, pass).read];
          this.ensureMaterial(color, readTarget);
          this.visual.setSurfaceMaterial(color, this.materials.get(color)!);
        }
      }
      for (let index = 0; index < COLORS.length; index++) {
        const color = COLORS[index];
        const other = COLORS[1 - index];
        const writeTarget = this.targets.get(color)![pingPong(index, pass).write];
        this.renderInto(writeTarget, color, frames[color], frames[other], clips[color], camera);
      }
    }

    const lastPass = totalPasses - 1;
    for (let index = 0; index < COLORS.length; index++) {
      const color = COLORS[index];
      const finalTarget = this.targets.get(color)![pingPong(index, lastPass).write];
      this.ensureMaterial(color, finalTarget);
      this.visual.setSurfaceMaterial(color, this.materials.get(color)!);
    }
  }

  resetSurfaces(): void {
    for (const color of COLORS) this.visual.resetSurfaceMaterial(color);
  }

  dispose(): void {
    for (const pair of this.targets.values()) for (const rt of pair) rt.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.targets.clear();
    this.cameras.clear();
    this.materials.clear();
  }

  private ensureTargetPair(color: PortalColor): WebGLRenderTarget[] {
    let pair = this.targets.get(color);
    if (pair === undefined) {
      pair = [
        new WebGLRenderTarget(this.rtWidth, this.rtHeight, { depthBuffer: true }),
        new WebGLRenderTarget(this.rtWidth, this.rtHeight, { depthBuffer: true }),
      ];
      this.targets.set(color, pair);
    } else {
      for (const rt of pair) {
        if (rt.width !== this.rtWidth || rt.height !== this.rtHeight) {
          rt.setSize(this.rtWidth, this.rtHeight);
        }
      }
    }
    return pair;
  }

  private ensureMaterial(color: PortalColor, rt: WebGLRenderTarget): void {
    let material = this.materials.get(color);
    if (material === undefined) {
      material = new ShaderMaterial({
        uniforms: {
          map: { value: rt.texture },
        },
        vertexShader: SURFACE_VERTEX,
        fragmentShader: SURFACE_FRAGMENT,
        side: DoubleSide,
      });
      this.materials.set(color, material);
    } else {
      material.uniforms.map.value = rt.texture;
    }
  }

  private renderInto(
    target: WebGLRenderTarget,
    color: PortalColor,
    from: Matrix4,
    to: Matrix4,
    out: PortalFrame | null,
    camera: PerspectiveCamera,
  ): void {
    const cam = this.cameras.get(color) ?? this.createCamera(color);
    cam.fov = camera.fov;
    cam.aspect = PORTAL_ASPECT;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.matrixWorld.copy(virtualCameraWorld(from, to, camera.matrixWorld));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    if (out !== null) {
      cam.projectionMatrix.copy(
        obliqueNearProjection(cam.projectionMatrix, cam.matrixWorldInverse, clipFrame(out)),
      );
    }
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    debugPortalView(color, cam, camera, out);
    this.renderer.renderTo(target, cam);
  }

  private createCamera(color: PortalColor): PerspectiveCamera {
    const cam = new PerspectiveCamera();
    cam.matrixAutoUpdate = false;
    cam.matrixWorldAutoUpdate = false;
    this.cameras.set(color, cam);
    return cam;
  }
}
