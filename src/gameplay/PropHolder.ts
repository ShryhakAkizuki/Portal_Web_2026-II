import { HOLD_DISTANCE, INTERACT_RANGE } from '../config';
import type {
  Controller,
  Entity,
  IEventBus,
  IInput,
  IPhysicsWorld,
  IPlayer,
  IProp,
  RayHit,
} from '../types/contracts';

const FOLLOW_STIFFNESS = 15;
const MAX_HOLD_SPEED = 20;
const STUCK_DISTANCE = 3;

export interface PropHolderDeps {
  physics: IPhysicsWorld;
  input: IInput;
  player: IPlayer;
  bus: IEventBus;
  getEntity: (id: string) => Entity | undefined;
}

export class PropHolder implements Controller {
  private readonly physics: IPhysicsWorld;
  private readonly input: IInput;
  private readonly player: IPlayer;
  private readonly bus: IEventBus;
  private readonly getEntity: (id: string) => Entity | undefined;

  private held: IProp | null = null;
  private canGrabValue = false;

  constructor(deps: PropHolderDeps) {
    this.physics = deps.physics;
    this.input = deps.input;
    this.player = deps.player;
    this.bus = deps.bus;
    this.getEntity = deps.getEntity;
  }

  get canGrab(): boolean {
    return this.canGrabValue;
  }

  update(_dt: number): void {
    if (this.held && this.held.body === undefined) {
      this.held = null;
    }

    let grabRaycast: RayHit | null | undefined;

    if (this.input.wasPressed('interact')) {
      if (this.held) {
        this.releaseHeld();
      } else {
        grabRaycast = this.raycastProp();
        const id = grabRaycast?.userData.entityId;
        if (id !== undefined) {
          const e = this.getEntity(id);
          if (e && e.kind === 'prop') {
            const prop = e as IProp;
            if (!prop.held) {
              prop.grab(this.player);
              this.held = prop;
            }
          }
        }
      }
    }

    if (this.held && this.held.body !== undefined) {
      const body = this.held.body;
      const eye = this.player.eyePosition;
      const dir = this.player.lookDirection();
      const pos = this.physics.getPose(body).position;
      const dx = eye[0] + dir[0] * HOLD_DISTANCE - pos[0];
      const dy = eye[1] + dir[1] * HOLD_DISTANCE - pos[1];
      const dz = eye[2] + dir[2] * HOLD_DISTANCE - pos[2];

      if (Math.hypot(dx, dy, dz) > STUCK_DISTANCE) {
        this.releaseHeld();
      } else {
        let vx = dx * FOLLOW_STIFFNESS;
        let vy = dy * FOLLOW_STIFFNESS;
        let vz = dz * FOLLOW_STIFFNESS;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > MAX_HOLD_SPEED) {
          const k = MAX_HOLD_SPEED / speed;
          vx *= k;
          vy *= k;
          vz *= k;
        }
        this.physics.setVelocity(body, [vx, vy, vz], [0, 0, 0]);
      }
    }

    if (this.held !== null) {
      this.canGrabValue = false;
    } else if (grabRaycast !== undefined) {
      this.canGrabValue = grabRaycast !== null;
    } else {
      this.canGrabValue = this.raycastProp() !== null;
    }
  }

  dispose(): void {
    this.releaseHeld();
  }

  private releaseHeld(): void {
    const prop = this.held;
    if (!prop) {
      return;
    }
    this.held = null;
    prop.release();
  }

  private raycastProp(): RayHit | null {
    const hit = this.physics.raycast(
      this.player.eyePosition,
      this.player.lookDirection(),
      INTERACT_RANGE,
      { excludeBody: this.player.body },
    );
    return hit !== null && hit.userData.kind === 'prop' ? hit : null;
  }
}
