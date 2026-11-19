import { BaseEntity } from '../gameplay/Entity';
import { registerBuilder } from './entityFactory';
import type { ExitDef, LevelDeps } from '../types/contracts';

export class ExitPlaceholder extends BaseEntity {
  constructor(id: string, def: ExitDef, deps: LevelDeps) {
    super(id, 'exit', deps);
    this.body = deps.physics.createBody({
      type: 'fixed',
      position: def.position,
      shape: {
        kind: 'box',
        halfExtents: [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2],
      },
      sensor: true,
      userData: { entityId: id, kind: 'sensor' },
    });
  }
}

let registered = false;

export function registerAll(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerBuilder('exit', (def, deps) => {
    if (def.type !== 'exit') {
      throw new Error(`Builder de "exit" recibió def de tipo "${def.type}"`);
    }
    return new ExitPlaceholder(def.id, def, deps);
  });

}
