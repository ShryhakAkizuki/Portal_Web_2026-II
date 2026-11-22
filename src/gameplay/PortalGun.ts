import type {
  Controller,
  IEventBus,
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
  bus?: IEventBus;
}

export class PortalGun implements Controller {
  private readonly physics: IPhysicsWorld;
  private readonly input: IInput;
  private readonly portals: IPortalSystem;
  private readonly player: IPlayer;
  private readonly viewmodel: PortalGunViewmodel;
  private readonly bus?: IEventBus;

  constructor(deps: PortalGunDeps) {
    this.physics = deps.physics;
    this.input = deps.input;
    this.portals = deps.portals;
    this.player = deps.player;
    this.bus = deps.bus;
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
    const placed = hit !== null && this.portals.place(color, hit, dir);
    // Hay disparo (y sonido) siempre, se coloque o no el portal.
    this.bus?.emit('gun:fired', { color, placed });
    return placed;
  }

  dispose(): void {
    this.viewmodel.dispose();
  }
}
