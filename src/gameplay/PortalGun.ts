import type {
  Controller,
  IInput,
  IPhysicsWorld,
  IPlayer,
  IPortalSystem,
  PortalColor,
} from '../types/contracts';

const RAY_MAX_DIST = 100;

export interface PortalGunDeps {
  physics: IPhysicsWorld;
  input: IInput;
  portals: IPortalSystem;
  player: IPlayer;
}

export class PortalGun implements Controller {
  private readonly physics: IPhysicsWorld;
  private readonly input: IInput;
  private readonly portals: IPortalSystem;
  private readonly player: IPlayer;

  constructor(deps: PortalGunDeps) {
    this.physics = deps.physics;
    this.input = deps.input;
    this.portals = deps.portals;
    this.player = deps.player;
  }

  update(_dt: number): void {
    if (!this.input.isLocked) return;
    if (this.input.wasPressed('firePrimary')) {
      this.fire('blue');
    } else if (this.input.wasPressed('fireSecondary')) {
      this.fire('orange');
    }
  }

  fire(color: PortalColor): boolean {
    const origin = this.player.eyePosition;
    const dir = this.player.lookDirection();
    const hit = this.physics.raycast(origin, dir, RAY_MAX_DIST, {
      excludeBody: this.player.body,
    });
    if (hit === null) return false;
    return this.portals.place(color, hit, dir);
  }
}
