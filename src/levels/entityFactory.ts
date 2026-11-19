import type { Entity, EntityBuilder, EntityDef, LevelDeps } from '../types/contracts';

export type { EntityBuilder };

const builders = new Map<string, EntityBuilder>();

export function registerBuilder(type: string, fn: EntityBuilder): void {
  builders.set(type, fn);
}

export function buildEntity(
  def: EntityDef,
  deps: LevelDeps,
  ctx: { levelId: string },
): Entity {
  const fn = builders.get(def.type);
  if (!fn) {
    throw new Error(`Entidad desconocida: ${def.type}`);
  }
  return fn(def, deps, ctx);
}

export function clearBuilders(): void {
  builders.clear();
}
