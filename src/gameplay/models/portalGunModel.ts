import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import { PORTAL_GUN_COLORS } from '../../config';

/**
 * Partes del modelo cuyo color cambia según el portal disparado (feedback).
 * El resto de la pistola usa la paleta fija de `PORTAL_GUN_COLORS`.
 */
export interface PortalGunParts {
  group: Group;
  /** Materiales que se tiñen del color del portal (anillos + emisor). */
  tintMaterials: MeshStandardMaterial[];
  /** Luz de estado en la punta; su color sigue al del portal disparado. */
  statusLight: PointLight;
}

function std(color: number, roughness: number, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness, metalness });
}

/**
 * Modelo procedural de la pistola de portales (homenaje estilizado, geometría
 * propia). Composición por capas:
 *   - chasis oscuro (core) con empuñadura,
 *   - carcasa exterior clara (shell) con un panel de acento,
 *   - dos "garras"/cañones al frente con anillos de color,
 *   - emisor central y una luz de estado que da el glow.
 *
 * Orientación: el frente apunta a −Z (hacia donde mira la cámara). Devuelve las
 * piezas tintables para el feedback de color al disparar.
 */
export function buildPortalGunModel(): PortalGunParts {
  const group = new Group();
  const tintMaterials: MeshStandardMaterial[] = [];

  // --- Chasis / estructura oscura ---
  const coreMat = std(PORTAL_GUN_COLORS.core, 0.55, 0.25);
  const core = new Mesh(new BoxGeometry(0.14, 0.15, 0.46), coreMat);
  group.add(core);

  // Empuñadura inclinada.
  const grip = new Mesh(new BoxGeometry(0.1, 0.24, 0.12), std(PORTAL_GUN_COLORS.grip, 0.8));
  grip.position.set(0, -0.19, 0.1);
  grip.rotation.x = -0.28;
  group.add(grip);

  // Gatillo (pequeño detalle).
  const trigger = new Mesh(new BoxGeometry(0.03, 0.07, 0.03), std(PORTAL_GUN_COLORS.metal, 0.4, 0.6));
  trigger.position.set(0, -0.08, 0.02);
  group.add(trigger);

  // --- Carcasa exterior clara (shell) ---
  const shellMat = std(PORTAL_GUN_COLORS.shell, 0.4, 0.05);
  const shellTop = new Mesh(new BoxGeometry(0.2, 0.12, 0.5), shellMat);
  shellTop.position.set(0, 0.06, -0.02);
  group.add(shellTop);

  // Panel de acento lateral.
  const accentMat = std(PORTAL_GUN_COLORS.shellAccent, 0.45, 0.1);
  for (const x of [-0.101, 0.101]) {
    const panel = new Mesh(new BoxGeometry(0.01, 0.1, 0.34), accentMat);
    panel.position.set(x, 0.06, -0.04);
    group.add(panel);
  }

  // Cresta superior (lomo).
  const crest = new Mesh(new BoxGeometry(0.06, 0.05, 0.3), shellMat);
  crest.position.set(0, 0.14, -0.02);
  group.add(crest);

  // --- Garras / cañones frontales ---
  const metalMat = std(PORTAL_GUN_COLORS.metal, 0.35, 0.7);
  const prongLen = 0.26;
  const prongOffsets: [number, number][] = [
    [0, 0.08],
    [-0.07, -0.05],
    [0.07, -0.05],
  ];
  for (const [px, py] of prongOffsets) {
    const prong = new Mesh(new CylinderGeometry(0.018, 0.026, prongLen, 12), metalMat);
    prong.rotation.x = Math.PI / 2;
    prong.position.set(px, 0.04 + py, -0.42);
    group.add(prong);
  }

  // Boca del cañón central.
  const muzzle = new Mesh(new CylinderGeometry(0.07, 0.085, 0.12, 20), metalMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.04, -0.34);
  group.add(muzzle);

  // --- Anillos de color (tintables) ---
  const ringMat = std(PORTAL_GUN_COLORS.neutral, 0.3, 0.1);
  ringMat.emissive = new Color(PORTAL_GUN_COLORS.neutral);
  ringMat.emissiveIntensity = 0.6;
  tintMaterials.push(ringMat);
  for (const z of [-0.3, -0.4]) {
    const ring = new Mesh(new TorusGeometry(0.075, 0.016, 12, 28), ringMat);
    ring.position.set(0, 0.04, z);
    group.add(ring);
  }

  // --- Emisor central (tintable) ---
  const emitterMat = std(PORTAL_GUN_COLORS.neutral, 0.2, 0);
  emitterMat.emissive = new Color(PORTAL_GUN_COLORS.neutral);
  emitterMat.emissiveIntensity = 1.4;
  tintMaterials.push(emitterMat);
  const emitter = new Mesh(new SphereGeometry(0.05, 20, 16), emitterMat);
  emitter.position.set(0, 0.04, -0.46);
  group.add(emitter);

  // --- Luz de estado (da el glow del emisor) ---
  const statusLight = new PointLight(new Color(PORTAL_GUN_COLORS.neutral), 0.6, 1.2, 2);
  statusLight.position.set(0, 0.04, -0.5);
  group.add(statusLight);

  return { group, tintMaterials, statusLight };
}

/** Libera geometrías y materiales de un modelo construido con `buildPortalGunModel`. */
export function disposePortalGunModel(group: Group): void {
  group.traverse((o) => {
    const m = o as Partial<Mesh>;
    if (m.isMesh !== true) {
      return;
    }
    m.geometry?.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach((x) => x.dispose());
    } else {
      mat?.dispose();
    }
  });
}
