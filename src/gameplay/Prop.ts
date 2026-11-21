import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { BaseEntity, type EntityDeps } from './Entity';
import type { IPlayer, IProp, Vec3 } from '../types/contracts';

export class Prop extends BaseEntity implements IProp {
  readonly canCross = true;
  held = false;

  constructor(deps: EntityDeps, id: string, position: Vec3) {
    super(id, 'prop', deps);
    this.body = deps.physics.createBody({
      type: 'dynamic',
      position,
      shape: { kind: 'box', halfExtents: [0.3, 0.3, 0.3] },
      friction: 0.6,
      ccd: true,
      userData: { entityId: id, kind: 'prop' },
    });

    const mesh = new Mesh(
      new BoxGeometry(0.6, 0.6, 0.6),
      new MeshStandardMaterial({ color: 0xf2a03d, roughness: 0.6, metalness: 0.1 }),
    );
    mesh.position.set(position[0], position[1], position[2]);
    this.attachMesh(mesh);
  }

  grab(_by: IPlayer): void {
    this.held = true;
  }

  release(): void {
    this.held = false;
  }
}
