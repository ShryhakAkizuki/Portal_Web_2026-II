import {
  Group,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type PointLight,
} from 'three';
import { LAYER_VIEWMODEL, PORTAL_COLORS, PORTAL_GUN_VIEWMODEL } from '../config';
import type { PortalColor } from '../types/contracts';
import { buildPortalGunModel, disposePortalGunModel } from './models/portalGunModel';

const BASE_EMISSIVE = 1.0; // intensidad emisiva en reposo
const FLASH_EMISSIVE = 3.0; // pico de intensidad justo al disparar
const BASE_LIGHT = 0.6; // intensidad de la luz de estado en reposo
const FLASH_LIGHT = 2.4; // pico de la luz al disparar

/**
 * Viewmodel de la pistola anclado a la cámara (primera persona). Se mueve con
 * la vista por ser hijo de la cámara; aplica un retroceso corto al disparar,
 * tiñe los anillos/emisor del color del portal lanzado y hace un "flash" de luz
 * que decae suavemente.
 *
 * Vive en la capa `LAYER_VIEWMODEL`: visible solo por la cámara principal, no
 * por las cámaras de los portales.
 */
export class PortalGunViewmodel {
  readonly object: Group;
  private readonly tintMaterials: MeshStandardMaterial[];
  private readonly statusLight: PointLight;
  private readonly restZ: number;
  private recoil = 0;
  private flash = 0;
  private tinted = false; // ¿ya se disparó alguna vez? (para no brillar en reposo inicial)

  constructor(camera: PerspectiveCamera) {
    const { group, tintMaterials, statusLight } = buildPortalGunModel();
    this.object = group;
    this.tintMaterials = tintMaterials;
    this.statusLight = statusLight;

    const [x, y, z] = PORTAL_GUN_VIEWMODEL.offset;
    group.position.set(x, y, z);
    group.scale.setScalar(PORTAL_GUN_VIEWMODEL.scale);
    this.restZ = z;

    group.traverse((o: Object3D) => o.layers.set(LAYER_VIEWMODEL));
    camera.add(group);
  }

  /** Dispara el retroceso + flash y tiñe anillos/emisor/luz del color del portal. */
  fire(color: PortalColor): void {
    this.recoil = PORTAL_GUN_VIEWMODEL.recoilKick;
    this.flash = 1;
    this.tinted = true;
    const hex = PORTAL_COLORS[color];
    for (const mat of this.tintMaterials) {
      mat.color.setHex(hex);
      mat.emissive.setHex(hex);
    }
    this.statusLight.color.setHex(hex);
  }

  /** Relaja retroceso y flash hacia el reposo cada frame. */
  update(dt: number): void {
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - this.recoil * PORTAL_GUN_VIEWMODEL.recoilRecover * dt);
      // El retroceso empuja la pistola hacia atrás (+Z, hacia el jugador).
      this.object.position.z = this.restZ + this.recoil;
    }

    if (this.flash > 0 || this.tinted) {
      this.flash = Math.max(0, this.flash - PORTAL_GUN_VIEWMODEL.recoilRecover * dt);
      const emissive = BASE_EMISSIVE + (FLASH_EMISSIVE - BASE_EMISSIVE) * this.flash;
      for (const mat of this.tintMaterials) {
        mat.emissiveIntensity = emissive;
      }
      this.statusLight.intensity = BASE_LIGHT + (FLASH_LIGHT - BASE_LIGHT) * this.flash;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    disposePortalGunModel(this.object);
  }
}
