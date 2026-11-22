import {
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
} from 'three';
import { LAYER_AVATAR, PLAYER } from '../../config';

/**
 * Avatar simple del jugador: una cápsula (cuerpo) con un pequeño "morro" cónico
 * y dos ojos que marcan hacia dónde mira. Marcador de posición primitivo; luego
 * se puede sustituir por un modelo glTF CC0 sin tocar la lógica.
 *
 * Vive en la capa `LAYER_AVATAR`: la cámara principal NO lo ve (primera
 * persona), pero las cámaras de los portales SÍ, de modo que el jugador se ve a
 * sí mismo al mirar por un portal.
 */
export function createPlayerAvatar(): Group {
  const group = new Group();

  const bodyMat = new MeshStandardMaterial({ color: new Color(0x3a7bd5), roughness: 0.6 });
  // CapsuleGeometry usa (radius, length), donde length es la parte cilíndrica;
  // la altura total es length + 2*radius, que coincide con la cápsula física.
  const body = new Mesh(new CapsuleGeometry(PLAYER.radius, PLAYER.halfHeight * 2), bodyMat);
  group.add(body);

  // "Morro" al frente para ver la orientación al cruzar el portal.
  const faceMat = new MeshStandardMaterial({ color: new Color(0xffd166), roughness: 0.5 });
  const nose = new Mesh(new ConeGeometry(PLAYER.radius * 0.35, PLAYER.radius * 0.9, 12), faceMat);
  nose.rotation.x = Math.PI / 2; // apunta hacia -Z (frente del jugador)
  nose.position.set(0, PLAYER.eyeOffset - PLAYER.halfHeight - PLAYER.radius, -PLAYER.radius);
  group.add(nose);

  const eyeMat = new MeshStandardMaterial({ color: new Color(0x11131a), roughness: 0.4 });
  const eyeY = PLAYER.eyeOffset - PLAYER.halfHeight - PLAYER.radius;
  for (const x of [-PLAYER.radius * 0.35, PLAYER.radius * 0.35]) {
    const eye = new Mesh(new SphereGeometry(PLAYER.radius * 0.12, 10, 10), eyeMat);
    eye.position.set(x, eyeY, -PLAYER.radius * 0.95);
    group.add(eye);
  }

  group.traverse((o) => o.layers.set(LAYER_AVATAR));
  return group;
}

/** Libera geometrías y materiales del avatar. */
export function disposePlayerAvatar(group: Group): void {
  group.traverse((o) => {
    const m = o as Partial<Mesh>;
    if (m.isMesh !== true) {
      return;
    }
    m.geometry?.dispose();
    const material = m.material as Material | Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((x) => x.dispose());
    } else {
      material?.dispose();
    }
  });
}
