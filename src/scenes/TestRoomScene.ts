import { StaticBox } from '../gameplay/StaticBox';
import { Player } from '../gameplay/Player';
import type { Entity } from '../gameplay/Entity';
import type {
  BoxDef,
  IInput,
  IPhysicsWorld,
  IRenderer,
  Scene,
} from '../types/contracts';

export interface TestRoomDeps {
  physics: IPhysicsWorld;
  renderer: IRenderer;
  input: IInput;
}

const ROOM: BoxDef[] = [
  { position: [0, -0.5, 0], size: [20, 1, 20], portalable: false }, // suelo
  { position: [0, 2, -10], size: [20, 4, 0.5], portalable: true }, // muro norte
  { position: [0, 2, 10], size: [20, 4, 0.5], portalable: true }, // muro sur
  { position: [-10, 2, 0], size: [0.5, 4, 20], portalable: true }, // muro oeste
  { position: [10, 2, 0], size: [0.5, 4, 20], portalable: true }, // muro este
  { position: [0, 0.125, -3], size: [2, 0.25, 2], portalable: false }, // escalón
  { position: [0, 0.35, -5], size: [2, 0.2, 2], portalable: false }, // peldaño 1
  { position: [0, 0.6, -7], size: [2, 0.4, 2], portalable: false }, // peldaño 2
  { position: [0, 0.25, -10.5], size: [2, 0.5, 2], portalable: false }, // saliente (solo con salto)
];

export class TestRoomScene implements Scene {
  private readonly physics: IPhysicsWorld;
  private readonly renderer: IRenderer;
  private readonly input: IInput;

  player: Player | null = null;
  private boxes: StaticBox[] = [];

  constructor(deps: TestRoomDeps) {
    this.physics = deps.physics;
    this.renderer = deps.renderer;
    this.input = deps.input;
  }

  async enter(): Promise<void> {
    for (const def of ROOM) {
      this.boxes.push(new StaticBox(def.position.join(','), def, this.deps));
    }
    this.player = new Player(this.playerDeps, [0, 0, 5], 0);
  }

  update(dt: number): void {
    const all = this.entities();
    for (const e of all) e.captureState();
    for (const e of all) e.preStep?.(dt);
    this.physics.step(dt);
    for (const e of all) e.update(dt);
    this.input.endStep();
  }

  render(alpha: number): void {
    for (const e of this.entities()) e.syncMesh(alpha);
    this.renderer.render();
  }

  exit(): void {
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    for (const b of this.boxes) b.dispose();
    this.boxes = [];
  }

  private entities(): Entity[] {
    return this.player ? [this.player, ...this.boxes] : [...this.boxes];
  }

  private get deps() {
    return { physics: this.physics, renderer: this.renderer };
  }

  private get playerDeps() {
    return { physics: this.physics, renderer: this.renderer, input: this.input };
  }
}
