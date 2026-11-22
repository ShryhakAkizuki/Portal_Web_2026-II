import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { BaseEntity, type EntityDeps } from './Entity';
import { PROP_IMPACT } from '../config';
import type { IEventBus, IPlayer, IProp, Vec3 } from '../types/contracts';

const RELEASE_SPEED_LIMIT = 10;

export class Prop extends BaseEntity implements IProp {
  readonly canCross = true;
  held = false;

  private readonly bus: IEventBus;
  private readonly prevVel: Vec3 = [0, 0, 0];
  private impactCooldown = 0;

  constructor(deps: EntityDeps, bus: IEventBus, id: string, position: Vec3) {
    super(id, 'prop', deps);
    this.bus = bus;
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

    // Sincroniza la velocidad de referencia con el estado inicial del cuerpo
    // (evita un impacto fantasma en el primer paso si nace con velocidad).
    const { linear } = deps.physics.getVelocity(this.body);
    this.prevVel[0] = linear[0];
    this.prevVel[1] = linear[1];
    this.prevVel[2] = linear[2];
  }

  override update(dt: number): void {
    if (this.impactCooldown > 0) {
      this.impactCooldown -= dt;
    }
    if (!this.body || this.held) {
      // Mientras se sostiene, el seguimiento mueve el cubo: no son golpes.
      if (this.body) {
        const { linear } = this.deps.physics.getVelocity(this.body);
        this.prevVel[0] = linear[0];
        this.prevVel[1] = linear[1];
        this.prevVel[2] = linear[2];
      }
      return;
    }
    const { linear } = this.deps.physics.getVelocity(this.body);
    // Un golpe/rebote frena el cubo de golpe: medimos la desaceleración del paso.
    const delta = Math.hypot(
      linear[0] - this.prevVel[0],
      linear[1] - this.prevVel[1],
      linear[2] - this.prevVel[2],
    );
    this.prevVel[0] = linear[0];
    this.prevVel[1] = linear[1];
    this.prevVel[2] = linear[2];

    if (this.impactCooldown <= 0 && delta >= PROP_IMPACT.minDelta) {
      const span = PROP_IMPACT.maxDelta - PROP_IMPACT.minDelta;
      const strength = Math.min(1, (delta - PROP_IMPACT.minDelta) / span + 0.25);
      this.impactCooldown = PROP_IMPACT.cooldown;
      this.bus.emit('prop:impact', { id: this.id, strength });
    }
  }

  onTeleport(): void {
    // Tras cruzar un portal la velocidad cambia de golpe: sincronizamos la
    // referencia y aplicamos cooldown para no disparar un impacto fantasma.
    if (this.body) {
      const { linear } = this.deps.physics.getVelocity(this.body);
      this.prevVel[0] = linear[0];
      this.prevVel[1] = linear[1];
      this.prevVel[2] = linear[2];
    }
    this.impactCooldown = PROP_IMPACT.cooldown;
  }

  grab(_by: IPlayer): void {
    this.held = true;
    if (this.body) {
      this.deps.physics.setGravityScale(this.body, 0);
    }
    this.bus.emit('prop:grabbed', { id: this.id });
  }

  release(): void {
    this.held = false;
    if (this.body) {
      this.deps.physics.setGravityScale(this.body, 1);
      const { linear } = this.deps.physics.getVelocity(this.body);
      const speed = Math.hypot(linear[0], linear[1], linear[2]);
      if (speed > RELEASE_SPEED_LIMIT) {
        const k = RELEASE_SPEED_LIMIT / speed;
        this.deps.physics.setVelocity(this.body, [
          linear[0] * k,
          linear[1] * k,
          linear[2] * k,
        ]);
      }
    }
    this.bus.emit('prop:released', { id: this.id });
  }
}
