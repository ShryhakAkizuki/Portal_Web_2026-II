import { PLAYER } from '../config';
import { BaseEntity, type EntityDeps } from './Entity';
import type { IInput, IPlayer, Vec3 } from '../types/contracts';

export interface PlayerDeps extends EntityDeps {
  input: IInput;
}

export class Player extends BaseEntity implements IPlayer {
  readonly canCross = true;
  yaw: number;
  pitch = 0;

  readonly velocity: Vec3 = [0, 0, 0];
  grounded = false;

  private readonly input: IInput;

  constructor(deps: PlayerDeps, feetPosition: Vec3, yaw = 0) {
    super('player', 'player', deps);
    this.yaw = yaw;
    this.input = deps.input;
    this.body = deps.physics.createBody({
      type: 'kinematic',
      position: [
        feetPosition[0],
        feetPosition[1] + PLAYER.halfHeight + PLAYER.radius,
        feetPosition[2],
      ],
      shape: { kind: 'capsule', halfHeight: PLAYER.halfHeight, radius: PLAYER.radius },
      userData: { entityId: 'player', kind: 'player' },
    });
  }

  preStep(dt: number): void {
    if (!this.body) {
      return;
    }
    const axis = this.input.getMoveAxis();

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.velocity[0] = (cosY * axis.x - sinY * axis.y) * PLAYER.walkSpeed;
    this.velocity[2] = (-sinY * axis.x - cosY * axis.y) * PLAYER.walkSpeed;

    this.velocity[1] += PLAYER.gravity * dt;
    if (this.grounded && this.velocity[1] < 0) {
      this.velocity[1] = 0;
    }
    if (this.input.wasPressed('jump') && this.grounded) {
      this.velocity[1] = PLAYER.jumpSpeed;
    }

    const { movement, grounded } = this.deps.physics.moveCharacter(
      this.body,
      [this.velocity[0] * dt, this.velocity[1] * dt, this.velocity[2] * dt],
      dt,
    );
    this.grounded = grounded;
    if (this.velocity[1] > 0 && movement[1] < this.velocity[1] * dt - 1e-4) {
      this.velocity[1] = 0;
    }
  }

  override update(_dt: number): void {
  }

  get eyePosition(): Vec3 {
    const p = this.deps.physics.getPose(this.body!).position;
    return [p[0], p[1] + PLAYER.eyeOffset, p[2]];
  }

  look(_dx: number, _dy: number): void {
    throw new Error('T13');
  }

  lookDirection(): Vec3 {
    throw new Error('T13');
  }
}
