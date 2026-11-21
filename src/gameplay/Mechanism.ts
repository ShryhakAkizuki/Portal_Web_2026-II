import { BaseEntity, type EntityDeps } from './Entity';
import type { IEventBus } from '../types/contracts';

export interface MechanismDeps extends EntityDeps {
  bus: IEventBus;
}

export abstract class Mechanism extends BaseEntity {
  protected readonly bus: IEventBus;

  constructor(id: string, kind: string, deps: MechanismDeps) {
    super(id, kind, deps);
    this.bus = deps.bus;
  }

  abstract activate(): void;
  abstract deactivate(): void;
}
