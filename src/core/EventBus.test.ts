import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recibe datos: el listener recibe el payload emitido', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.on('portal:placed', spy);
    bus.emit('portal:placed', { color: 'blue' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ color: 'blue' });
  });

  it('varios listeners: se ejecutan en orden de suscripción', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on('button:pressed', () => calls.push('a'));
    bus.on('button:pressed', () => calls.push('b'));
    bus.on('button:pressed', () => calls.push('c'));
    bus.emit('button:pressed', { id: 'btn1' });
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('off: retira el listener indicado (los demás se mantienen)', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('door:changed', a);
    bus.on('door:changed', b);
    bus.off('door:changed', a);
    bus.emit('door:changed', { id: 'd1', open: true });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('on devuelve una función de baja idempotente', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    const off = bus.on('prop:grabbed', spy);
    off();
    expect(bus.listenerCount('prop:grabbed')).toBe(0);
    off();
    bus.emit('prop:grabbed', { id: 'p1' });
    expect(spy).not.toHaveBeenCalled();
    expect(bus.listenerCount('prop:grabbed')).toBe(0);
  });

  it('baja durante emit: la ronda actual no se altera (emite a quien estaba suscrito)', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn(() => {
      bus.off('level:completed', b);
    });
    bus.on('level:completed', a);
    bus.on('level:completed', b);
    bus.emit('level:completed', { levelId: 'l1' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    bus.emit('level:completed', { levelId: 'l2' });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('alta durante emit: el nuevo listener NO se ejecuta en la ronda actual', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on('portal:crossed', () => {
      calls.push('primero');
      bus.on('portal:crossed', () => calls.push('segundo'));
    });
    bus.emit('portal:crossed', { entityId: 'e1', entering: 'orange' });
    expect(calls).toEqual(['primero']);
    bus.emit('portal:crossed', { entityId: 'e1', entering: 'orange' });
    expect(calls).toEqual(['primero', 'primero', 'segundo']);
  });

  it('un listener que lanza no corta a los demás y se registra en console.error', () => {
    const bus = new EventBus();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const antes = vi.fn();
    const despues = vi.fn();
    bus.on('button:released', antes);
    bus.on('button:released', () => {
      throw new Error('boom');
    });
    bus.on('button:released', despues);
    bus.emit('button:released', { id: 'btn2' });
    expect(antes).toHaveBeenCalledTimes(1);
    expect(despues).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? '')).toContain('button:released');
  });

  it('listenerCount: por tipo y total', () => {
    const bus = new EventBus();
    bus.on('portal:placed', () => {});
    bus.on('portal:placed', () => {});
    bus.on('portal:placed', () => {});
    bus.on('button:pressed', () => {});
    expect(bus.listenerCount('portal:placed')).toBe(3);
    expect(bus.listenerCount('button:pressed')).toBe(1);
    expect(bus.listenerCount('door:changed')).toBe(0);
    expect(bus.listenerCount()).toBe(4);
  });

  it('clear: vacía todos los listeners', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.on('portal:placed', spy);
    bus.on('button:pressed', () => {});
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
    bus.emit('portal:placed', { color: 'orange' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('emitir sin listeners no falla', () => {
    const bus = new EventBus();
    expect(() => bus.emit('level:completed', { levelId: 'l9' })).not.toThrow();
    expect(() => bus.off('level:completed', () => {})).not.toThrow();
  });

  it('tipado: el payload llega tipado (compila contra GameEvents)', () => {
    const bus = new EventBus();
    let color: 'blue' | 'orange' | undefined;
    let open: boolean | undefined;
    const off1 = bus.on('portal:placed', (d) => {
      color = d.color;
    });
    const off2 = bus.on('door:changed', (d) => {
      open = d.open;
    });
    bus.emit('portal:placed', { color: 'orange' });
    bus.emit('door:changed', { id: 'd9', open: false });
    expect(color).toBe('orange');
    expect(open).toBe(false);
    off1();
    off2();
  });
});
