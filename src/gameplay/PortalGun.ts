import type {
  Controller,
  IInput,
  IPhysicsWorld,
  IPlayer,
  IPortalSystem,
  IRenderer,
  PortalColor,
} from '../types/contracts';
import { PortalGunViewmodel } from './portalGunViewmodel';

const RAY_MAX_DIST = 100;

export interface PortalGunDeps {
  physics: IPhysicsWorld;
  input: IInput;
  portals: IPortalSystem;
  player: IPlayer;
  renderer: IRenderer;
}

export class PortalGun implements Controller {
  private readonly physics: IPhysicsWorld;
  private readonly input: IInput;
  private readonly portals: IPortalSystem;
  private readonly player: IPlayer;
  private readonly viewmodel: PortalGunViewmodel;

  constructor(deps: PortalGunDeps) {
    this.physics = deps.physics;
    this.input = deps.input;
    this.portals = deps.portals;
    this.player = deps.player;
    this.viewmodel = new PortalGunViewmodel(deps.renderer.camera);
  }

  update(dt: number): void {
    this.viewmodel.update(dt);
    if (!this.input.isLocked) return;
    if (this.input.wasPressed('firePrimary')) {
      this.fire('blue');
    } else if (this.input.wasPressed('fireSecondary')) {
      this.fire('orange');
    }
  }

  fire(color: PortalColor): boolean {
    // El retroceso visual se dispara aunque el portal no se coloque (p. ej.
    // superficie no válida): hay disparo igualmente.
    this.viewmodel.fire(color);
    const origin = this.player.eyePosition;
    const dir = this.player.lookDirection();
    const hit = this.physics.raycast(origin, dir, RAY_MAX_DIST, {
      excludeBody: this.player.body,
    });
    if (hit === null) return false;
    return this.portals.place(color, hit, dir);
  }

  dispose(): void {
    this.viewmodel.dispose();
  }
}
