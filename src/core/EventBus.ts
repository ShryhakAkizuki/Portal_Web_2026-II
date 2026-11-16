import type { GameEvents, IEventBus } from '../types/contracts';

export class EventBus<E extends Record<string, unknown> = GameEvents> implements IEventBus<E> {
  private readonly listeners = new Map<keyof E, Set<(data: unknown) => void>>();

  on<K extends keyof E>(type: K, fn: (data: E[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as (data: unknown) => void);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: (data: E[K]) => void): void {
    this.listeners.get(type)?.delete(fn as (data: unknown) => void);
  }

  emit<K extends keyof E>(type: K, data: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (data: E[K]) => void)(data);
      } catch (err) {
        console.error(`EventBus: error en listener de "${String(type)}"`, err);
      }
    }
  }

  listenerCount(type?: keyof E): number {
    if (type !== undefined) {
      return this.listeners.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  clear(): void {
    this.listeners.clear();
  }
}
