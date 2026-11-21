import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { ButtonDef, PhysicsBody } from '../types/contracts';
import { Mechanism, type MechanismDeps } from './Mechanism';

const PRESS_DROP = 0.05;

export class Button extends Mechanism {
  pressed = false;

  private readonly sensorBody: PhysicsBody;
  private readonly plate: Mesh;
  private readonly plateRestY: number;

  constructor(deps: MechanismDeps, def: ButtonDef) {
    super(def.id, 'button', deps);

    this.body = deps.physics.createBody({
      type: 'fixed',
      position: def.position,
      shape: { kind: 'box', halfExtents: [0.5, 0.05, 0.5] },
      userData: { entityId: def.id, kind: 'world' },
    });

    this.sensorBody = deps.physics.createBody({
      type: 'fixed',
      position: [def.position[0], def.position[1] + 0.2, def.position[2]],
      shape: { kind: 'box', halfExtents: [0.4, 0.15, 0.4] },
      sensor: true,
      userData: { entityId: def.id, kind: 'sensor' },
    });

    const [x, y, z] = def.position;
    const group = new Group();
    const base = new Mesh(
      new BoxGeometry(1.0, 0.1, 1.0),
      new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.6, metalness: 0.2 }),
    );
    this.plate = new Mesh(
      new CylinderGeometry(0.3, 0.32, 0.06, 24),
      new MeshStandardMaterial({ color: 0xd24a43, roughness: 0.4, metalness: 0.1 }),
    );
    this.plateRestY = 0.08;
    this.plate.position.y = this.plateRestY;
    group.add(base, this.plate);
    group.position.set(x, y, z);
    this.attachMesh(group);
  }

  override update(_dt: number): void {
    const overlaps = this.deps.physics.queryOverlaps(this.sensorBody);
    const pressed = overlaps.some((b) => b.userData.kind === 'prop' || b.userData.kind === 'player');
    if (pressed && !this.pressed) {
      this.activate();
    } else if (!pressed && this.pressed) {
      this.deactivate();
    }
  }

  override activate(): void {
    this.pressed = true;
    (this.plate.material as MeshStandardMaterial).color.setHex(0x57c46b);
    this.plate.position.y = this.plateRestY - PRESS_DROP;
    this.bus.emit('button:pressed', { id: this.id });
  }

  override deactivate(): void {
    this.pressed = false;
    (this.plate.material as MeshStandardMaterial).color.setHex(0xd24a43);
    this.plate.position.y = this.plateRestY;
    this.bus.emit('button:released', { id: this.id });
  }

  override dispose(): void {
    this.deps.physics.removeBody(this.sensorBody);
    super.dispose();
  }
}
