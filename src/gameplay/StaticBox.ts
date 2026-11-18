import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { BaseEntity, type EntityDeps } from './Entity';
import type { BoxDef } from '../types/contracts';

export class StaticBox extends BaseEntity {
  constructor(id: string, def: BoxDef, deps: EntityDeps) {
    super(id, 'static', deps);
    this.body = deps.physics.createBody({
      type: 'fixed',
      position: def.position,
      shape: {
        kind: 'box',
        halfExtents: [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2],
      },
      userData: { kind: 'world', portalable: def.portalable, surfaceId: id },
    });

    const [w, h, d] = def.size;
    const color = def.color ?? (def.portalable ? 0xd9dde6 : 0x4a4f5c);
    const mesh = new Mesh(
      new BoxGeometry(w, h, d),
      new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 }),
    );
    mesh.position.set(def.position[0], def.position[1], def.position[2]);
    this.attachMesh(mesh);
  }
}
