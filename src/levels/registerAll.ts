import { Button } from '../gameplay/Button';
import { Door } from '../gameplay/Door';
import { ExitZone } from '../gameplay/ExitZone';
import { Prop } from '../gameplay/Prop';
import { registerBuilder } from './entityFactory';
import type { LevelDeps } from '../types/contracts';

let registered = false;

export function registerAll(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerBuilder('exit', (def, deps, ctx) => {
    if (def.type !== 'exit') {
      throw new Error(`Builder de "exit" recibió def de tipo "${def.type}"`);
    }
    return new ExitZone(def, deps, ctx.levelId);
  });

  registerBuilder('cube', (def, deps) => {
    if (def.type !== 'cube') {
      throw new Error(`Builder de "cube" recibió def de tipo "${def.type}"`);
    }
    return new Prop(deps, deps.bus, def.id, def.position);
  });

  registerBuilder('button', (def, deps) => {
    if (def.type !== 'button') {
      throw new Error(`Builder de "button" recibió def de tipo "${def.type}"`);
    }
    return new Button(deps, def);
  });

  registerBuilder('door', (def, deps) => {
    if (def.type !== 'door') {
      throw new Error(`Builder de "door" recibió def de tipo "${def.type}"`);
    }
    return new Door(def, deps);
  });
}
