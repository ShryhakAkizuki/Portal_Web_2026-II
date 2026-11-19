import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from 'three';
import type { Material } from 'three';
import { PORTAL_HEIGHT, PORTAL_WIDTH } from '../config';
import { frameMatrix, makePortalFrame } from '../math/portalMath';
import type { PortalColor, PortalState } from '../types/contracts';

const SURFACE_COLOR = 0x0a0a12;
const BORDER_COLOR: Record<PortalColor, number> = {
  blue: 0x2d7ff9,
  orange: 0xff8a1f,
};

interface PortalParts {
  group: Group;
  surface: Mesh;
  border: Mesh;
}

export class PortalVisual {
  private readonly scene: Scene;
  private readonly parts = new Map<PortalColor, PortalParts>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  show(state: PortalState): void {
    let parts = this.parts.get(state.color);
    if (parts === undefined) {
      parts = this.createParts(state.color);
      this.parts.set(state.color, parts);
    }
    if (parts.group.parent === null) this.scene.add(parts.group);
    parts.group.matrix.copy(frameMatrix(makePortalFrame(state.position, state.normal, state.up)));
    parts.group.visible = true;
  }

  hide(color: PortalColor): void {
    this.parts.get(color)?.group.removeFromParent();
  }

  setSurfaceMaterial(color: PortalColor, material: Material): void {
    const parts = this.parts.get(color);
    if (parts !== undefined) parts.surface.material = material;
  }

  getSurface(color: PortalColor): Mesh | null {
    return this.parts.get(color)?.surface ?? null;
  }

  setVisible(color: PortalColor, visible: boolean): void {
    const parts = this.parts.get(color);
    if (parts !== undefined) parts.group.visible = visible;
  }

  dispose(): void {
    for (const { group, surface, border } of this.parts.values()) {
      group.removeFromParent();
      surface.geometry.dispose();
      disposeMaterial(surface.material);
      border.geometry.dispose();
      disposeMaterial(border.material);
    }
    this.parts.clear();
  }

  private createParts(color: PortalColor): PortalParts {
    const group = new Group();
    group.matrixAutoUpdate = false;

    const circle = new CircleGeometry(0.5, 48);
    const surface = new Mesh(circle, new MeshBasicMaterial({ color: SURFACE_COLOR }));
    surface.scale.set(PORTAL_WIDTH, PORTAL_HEIGHT, 1);

    const ring = new RingGeometry(0.46, 0.5, 48);
    const border = new Mesh(ring, new MeshBasicMaterial({ color: BORDER_COLOR[color] }));
    border.scale.set(PORTAL_WIDTH, PORTAL_HEIGHT, 1);
    border.position.z = 0.001;

    group.add(surface, border);
    return { group, surface, border };
  }
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}
