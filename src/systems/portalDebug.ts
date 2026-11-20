import { Plane } from 'three';
import type { PerspectiveCamera } from 'three';
import { PORTAL_OFFSET } from '../config';
import type { PortalFrame } from '../math/portalMath';
import type { PortalColor } from '../types/contracts';

let last = 0;

export function debugPortalView(
  color: PortalColor,
  cam: PerspectiveCamera,
  player: PerspectiveCamera,
  out: PortalFrame | null,
): void {
  if (typeof location === 'undefined' || !location.search.includes('portaldbg')) return;
  if (last + 500 > Date.now()) return;
  last = Date.now();
  const p = cam.matrixWorld.elements;
  const pos = [p[12], p[13], p[14]].map((v) => v.toFixed(2)).join(', ');
  const fwd = [-p[8], -p[9], -p[10]].map((v) => v.toFixed(2)).join(', ');
  let clip = 'sin-frame';
  if (out !== null) {
    const posC = out.position.clone().addScaledVector(out.normal, -PORTAL_OFFSET / 2);
    const plane = new Plane()
      .setFromNormalAndCoplanarPoint(out.normal, posC)
      .applyMatrix4(cam.matrixWorldInverse);
    clip = `dest=(${posC.x.toFixed(2)}, ${posC.y.toFixed(2)}, ${posC.z.toFixed(2)}) n=(${out.normal.x.toFixed(
      2,
    )}, ${out.normal.y.toFixed(2)}, ${out.normal.z.toFixed(2)}) c.w=${plane.constant.toFixed(3)} ${
      plane.constant >= 0 ? 'SIN-CLIP' : 'CLIP'
    }`;
  }
  console.log(
    `[portaldbg] ${color} player=(${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(
      2,
    )}) cam=(${pos}) fwd=(${fwd}) ${clip}`,
  );
}
