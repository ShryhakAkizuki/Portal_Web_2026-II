import {
  DoubleSide,
  Matrix4,
  PerspectiveCamera,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { portalTransform } from '../math/portalMath';
import type { IRenderer, PortalColor } from '../types/contracts';
import type { PortalVisual } from './PortalVisual';

export function virtualCameraWorld(from: Matrix4, to: Matrix4, cameraWorld: Matrix4): Matrix4 {
  return portalTransform(from, to).multiply(cameraWorld);
}

const SURFACE_VERTEX = /* glsl */ `
gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
`;

const SURFACE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = texture2D(map, uv);
  #include <colorspace_fragment>
}
`;

const COLORS: readonly PortalColor[] = ['blue', 'orange'];

export class PortalViews {
  private readonly renderer: IRenderer;
  private readonly visual: PortalVisual;
  private readonly rts = new Map<PortalColor, WebGLRenderTarget>();
  private readonly cameras = new Map<PortalColor, PerspectiveCamera>();
  private readonly materials = new Map<PortalColor, ShaderMaterial>();
  private bufferWidth = 0;
  private bufferHeight = 0;

  constructor(renderer: IRenderer, visual: PortalVisual) {
    this.renderer = renderer;
    this.visual = visual;
  }

  render(camera: PerspectiveCamera, blue: Matrix4 | null, orange: Matrix4 | null): void {
    if (blue === null || orange === null) {
      for (const color of COLORS) this.visual.resetSurfaceMaterial(color);
      return;
    }
    const size = this.renderer.gl.getDrawingBufferSize(new Vector2());
    this.bufferWidth = size.x;
    this.bufferHeight = size.y;
    this.renderThrough('blue', blue, orange, camera);
    this.renderThrough('orange', orange, blue, camera);
  }

  dispose(): void {
    for (const rt of this.rts.values()) rt.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.rts.clear();
    this.cameras.clear();
    this.materials.clear();
  }

  private renderThrough(
    color: PortalColor,
    from: Matrix4,
    to: Matrix4,
    camera: PerspectiveCamera,
  ): void {
    const rt = this.ensureTarget(color);
    this.ensureMaterial(color, rt);
    const cam = this.ensureCamera(color, camera);
    cam.matrixWorld.copy(virtualCameraWorld(from, to, camera.matrixWorld));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    const other: PortalColor = color === 'blue' ? 'orange' : 'blue';
    this.visual.setVisible(color, false);
    this.visual.setVisible(other, false);
    this.renderer.renderTo(rt, cam);
    this.visual.setVisible(color, true);
    this.visual.setVisible(other, true);
  }

  private ensureTarget(color: PortalColor): WebGLRenderTarget {
    const rt = this.rts.get(color);
    if (rt !== undefined) {
      if (rt.width !== this.bufferWidth || rt.height !== this.bufferHeight) {
        rt.setSize(this.bufferWidth, this.bufferHeight);
      }
      return rt;
    }
    const created = new WebGLRenderTarget(this.bufferWidth, this.bufferHeight, { depthBuffer: true });
    this.rts.set(color, created);
    return created;
  }

  private ensureMaterial(color: PortalColor, rt: WebGLRenderTarget): ShaderMaterial {
    const material = this.materials.get(color) ?? this.createMaterial(color, rt);
    material.uniforms.resolution.value.set(this.bufferWidth, this.bufferHeight);
    const surface = this.visual.getSurface(color);
    if (surface !== null && surface.material !== material) {
      this.visual.setSurfaceMaterial(color, material);
    }
    return material;
  }

  private ensureCamera(color: PortalColor, camera: PerspectiveCamera): PerspectiveCamera {
    const cam = this.cameras.get(color) ?? this.createCamera(color);
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    return cam;
  }

  private createMaterial(color: PortalColor, rt: WebGLRenderTarget): ShaderMaterial {
    const material = new ShaderMaterial({
      uniforms: {
        map: { value: rt.texture },
        resolution: { value: new Vector2(this.bufferWidth, this.bufferHeight) },
      },
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      side: DoubleSide,
    });
    this.materials.set(color, material);
    return material;
  }

  private createCamera(color: PortalColor): PerspectiveCamera {
    const cam = new PerspectiveCamera();
    cam.matrixAutoUpdate = false;
    cam.matrixWorldAutoUpdate = false;
    this.cameras.set(color, cam);
    return cam;
  }
}
