import { StaticBox } from '../gameplay/StaticBox';
import { Player } from '../gameplay/Player';
import { validateLevel } from './levelSchema';
import { buildEntity } from './entityFactory';
import type {
  Controller,
  Entity,
  ILevel,
  LevelData,
  LevelDeps,
} from '../types/contracts';

export class Level implements ILevel {
  private readonly deps: LevelDeps;
  private readonly data: LevelData;
  private readonly byId = new Map<string, Entity>();
  private readonly list: Entity[] = [];
  private readonly controllers: Controller[] = [];
  private player: Player | null = null;

  constructor(deps: LevelDeps, data: LevelData) {
    this.deps = deps;
    this.data = data;
  }

  get entities(): readonly Entity[] {
    return this.list;
  }

  enter(): void {
    this.load(this.data);
  }

  exit(): void {
    this.dispose();
  }

  load(data: LevelData): void {
    const d = validateLevel(data);

    d.geometry.forEach((def, i) => {
      this.add(new StaticBox(def.id ?? `box-${i}`, def, this.deps));
    });

    const player = new Player(this.deps, d.spawn.position, d.spawn.yaw);
    this.player = player;
    this.add(player);

    for (const def of d.entities) {
      this.add(buildEntity(def, this.deps, { levelId: d.id }));
    }
  }

  add(e: Entity): void {
    this.byId.set(e.id, e);
    this.list.push(e);
    if (e.canCross && this.deps.portals) {
      this.deps.portals.track(e);
    }
  }

  remove(e: Entity): void {
    const i = this.list.indexOf(e);
    if (i !== -1) {
      this.list.splice(i, 1);
    }
    this.byId.delete(e.id);
    if (e.canCross && this.deps.portals) {
      this.deps.portals.untrack(e);
    }
    e.dispose();
  }

  getEntity(id: string): Entity | undefined {
    return this.byId.get(id);
  }

  addController(c: Controller): void {
    this.controllers.push(c);
  }

  update(dt: number): void {
    const all = this.list;
    for (const e of all) e.captureState();
    for (const e of all) e.preStep?.(dt);
    this.deps.physics.step(dt);
    this.deps.portals?.update(dt);
    for (const e of all) e.update(dt);
    for (const c of this.controllers) c.update(dt);
    this.deps.input.endStep();
  }

  render(alpha: number): void {
    for (const e of this.list) e.syncMesh(alpha);
    this.deps.renderer.camera.updateMatrixWorld(true);
    this.deps.portals?.renderViews(this.deps.renderer, this.deps.renderer.camera);
    this.deps.renderer.render();
  }

  dispose(): void {
    for (const c of [...this.controllers].reverse()) {
      c.dispose?.();
    }
    this.controllers.length = 0;
    for (const e of [...this.list].reverse()) {
      this.remove(e);
    }
    this.player = null;
  }
}
