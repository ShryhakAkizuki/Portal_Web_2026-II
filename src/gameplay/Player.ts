import { PLAYER } from '../config';
import { Vector3 } from 'three';
import type { Matrix4 } from 'three';
import { BaseEntity, type EntityDeps } from './Entity';
import { createPlayerAvatar } from './models/playerModel';
import { transformDirection, yawPitchFromDirection } from '../math/portalMath';
import { fromV3, toV3 } from '../math/vec';
import type { IInput, IPlayer, Vec3 } from '../types/contracts';

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

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
  private readonly tmpCurrent = new Vector3();

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

    // Avatar placeholder (solo visible a través de los portales, capa AVATAR).
    this.attachMesh(createPlayerAvatar());
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

  onTeleport(T: Matrix4): void {
    const v = fromV3(transformDirection(T, toV3(this.velocity)));
    this.velocity[0] = v[0];
    this.velocity[1] = v[1];
    this.velocity[2] = v[2];
    const d = transformDirection(T, toV3(this.lookDirection()));
    const { yaw, pitch } = yawPitchFromDirection(d);
    this.yaw = yaw;
    this.pitch = pitch;
    this.grounded = false;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * PLAYER.lookSensitivity;
    this.pitch = clamp(
      this.pitch - dy * PLAYER.lookSensitivity,
      -PLAYER.maxPitch,
      PLAYER.maxPitch,
    );
  }

  lookDirection(): Vec3 {
    const cp = Math.cos(this.pitch);
    return [
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    ];
  }

  override syncMesh(alpha: number): void {
    const look = this.input.consumeLook();
    this.look(look.dx, look.dy);
    if (!this.body) {
      return;
    }
    const pose = this.deps.physics.getPose(this.body);
    const curr = this.tmpCurrent.set(
      pose.position[0],
      pose.position[1],
      pose.position[2],
    );
    this.deps.renderer.camera.position.lerpVectors(
      this.prevPosition,
      curr,
      alpha,
    );
    this.deps.renderer.camera.position.y += PLAYER.eyeOffset;
    this.deps.renderer.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // El avatar (visible solo en los portales) sigue al cuerpo interpolado y
    // rota solo en yaw: el cuerpo no se inclina al mirar arriba/abajo.
    if (this.mesh) {
      this.mesh.position.lerpVectors(this.prevPosition, curr, alpha);
      this.mesh.rotation.set(0, this.yaw, 0, 'YXZ');
    }
  }
}
