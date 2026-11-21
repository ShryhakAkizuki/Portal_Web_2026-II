import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import type { DoorDef, Vec3 } from '../types/contracts';
import { Mechanism, type MechanismDeps } from './Mechanism';

const OPEN_SPEED = 1 / 0.5;

export class Door extends Mechanism {
  open = false;
  openAmount = 0;

  private readonly size: Vec3;
  private readonly basePosition: Vec3;
  private readonly mode: 'all' | 'any';
  private readonly opensOn: readonly string[];
  private readonly active = new Set<string>();
  private readonly unsubs: Array<() => void> = [];

  constructor(def: DoorDef, deps: MechanismDeps) {
    super(def.id, 'door', deps);
    this.size = def.size;
    this.basePosition = def.position;
    this.mode = def.mode ?? 'all';
    this.opensOn = def.opensOn;

    this.body = deps.physics.createBody({
      type: 'kinematic',
      position: def.position,
      shape: {
        kind: 'box',
        halfExtents: [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2],
      },
      userData: { entityId: def.id, kind: 'door' },
    });

    const mesh = new Mesh(
      new BoxGeometry(def.size[0], def.size[1], def.size[2]),
      new MeshStandardMaterial({ color: 0x7d8aa0, roughness: 0.5, metalness: 0.3 }),
    );
    mesh.position.set(def.position[0], def.position[1], def.position[2]);
    this.attachMesh(mesh);

    this.unsubs.push(
      deps.bus.on('button:pressed', (d) => this.onPressed(d.id)),
      deps.bus.on('button:released', (d) => this.onReleased(d.id)),
    );
  }

  preStep(dt: number): void {
    if (!this.body) {
      return;
    }
    const delta = OPEN_SPEED * dt;
    this.openAmount = this.open
      ? Math.min(1, this.openAmount + delta)
      : Math.max(0, this.openAmount - delta);
    this.deps.physics.moveKinematic(this.body, [
      this.basePosition[0],
      this.basePosition[1] + this.openAmount * this.size[1],
      this.basePosition[2],
    ]);
  }

  override activate(): void {
    this.setOpen(true);
  }

  override deactivate(): void {
    this.setOpen(false);
  }

  override dispose(): void {
    for (const off of this.unsubs) {
      off();
    }
    this.unsubs.length = 0;
    super.dispose();
  }

  private onButton(id: string, pressed: boolean): void {
    if (!this.opensOn.includes(id)) {
      return;
    }
    if (pressed) {
      this.active.add(id);
    } else {
      this.active.delete(id);
    }
    this.setOpen(this.mode === 'any' ? this.active.size > 0 : this.active.size === this.opensOn.length);
  }

  private onPressed(id: string): void {
    this.onButton(id, true);
  }

  private onReleased(id: string): void {
    this.onButton(id, false);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) {
      return;
    }
    this.open = open;
    this.bus.emit('door:changed', { id: this.id, open });
  }
}
