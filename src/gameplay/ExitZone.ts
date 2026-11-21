import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import type { ExitDef, IEventBus } from '../types/contracts';
import { BaseEntity } from './Entity';
import type { MechanismDeps } from './Mechanism';

export class ExitZone extends BaseEntity {
  completed = false;

  private readonly bus: IEventBus;
  private readonly levelId: string;

  constructor(def: ExitDef, deps: MechanismDeps, levelId: string) {
    super(def.id, 'exit', deps);
    this.bus = deps.bus;
    this.levelId = levelId;

    this.body = deps.physics.createBody({
      type: 'fixed',
      position: def.position,
      shape: {
        kind: 'box',
        halfExtents: [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2],
      },
      sensor: true,
      userData: { entityId: def.id, kind: 'sensor' },
    });

    const [x, y, z] = def.position;
    const mesh = new Mesh(
      new BoxGeometry(def.size[0], def.size[1], def.size[2]),
      new MeshBasicMaterial({
        color: 0x57c46b,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, y, z);
    this.attachMesh(mesh);
  }

  override update(_dt: number): void {
    if (this.completed || !this.body) {
      return;
    }
    const playerInside = this.deps.physics
      .queryOverlaps(this.body)
      .some((b) => b.userData.kind === 'player');
    if (playerInside) {
      this.completed = true;
      this.bus.emit('level:completed', { levelId: this.levelId });
    }
  }
}
