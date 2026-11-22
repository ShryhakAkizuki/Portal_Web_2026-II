import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene as ThreeScene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { LAYER_AVATAR, LAYER_VIEWMODEL } from '../config';
import type { IRenderer } from '../types/contracts';

export function clampPixelRatio(dpr: number, max = 2): number {
  return Math.min(Math.max(dpr, 1), max);
}

export class Renderer implements IRenderer {
  readonly gl: WebGLRenderer;
  readonly scene: ThreeScene;
  readonly camera: PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: true });
    this.gl.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.localClippingEnabled = true;
    this.gl.shadowMap.enabled = false;

    this.scene = new ThreeScene();
    this.scene.background = new Color(0x1b1e26);

    const ambient = new AmbientLight(0xffffff, 0.6);
    const dir = new DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 3);
    this.scene.add(ambient, dir);

    const aspect = canvas.width / canvas.height || 1;
    this.camera = new PerspectiveCamera(75, aspect, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    // La cámara principal ve la escena (capa 0) + el viewmodel (pistola en
    // primera persona), pero NO el avatar del jugador (estás en primera persona).
    this.camera.layers.enable(LAYER_VIEWMODEL);
    this.camera.layers.disable(LAYER_AVATAR);

    // La cámara se añade a la escena para que sus hijos (el viewmodel de la
    // pistola) se recorran al renderizar: WebGLRenderer.render(scene, camera)
    // solo dibuja lo que cuelga de `scene`, no de la cámara por sí sola.
    this.scene.add(this.camera);
  }

  resize(width: number, height: number): void {
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }

  renderTo(target: WebGLRenderTarget, camera: PerspectiveCamera): void {
    const previous = this.gl.getRenderTarget();
    this.gl.setRenderTarget(target);
    this.gl.render(this.scene, camera);
    this.gl.setRenderTarget(previous);
  }

  dispose(): void {
    this.gl.dispose();
  }
}
