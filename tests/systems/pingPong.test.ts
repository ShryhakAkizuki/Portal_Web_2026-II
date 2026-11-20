import { describe, expect, it } from 'vitest';
import { pingPong } from '../../src/systems/portalViews';

describe('pingPong (T25 · asignación de buffers por realimentación)', () => {
  it('en cada pasada read ≠ write (nunca se escribe a un RT enlazado como textura)', () => {
    for (let index = 0; index < 2; index++) {
      for (let pass = 0; pass < 5; pass++) {
        const { read, write } = pingPong(index, pass);
        expect(read).not.toBe(write);
        expect(read).toBeGreaterThanOrEqual(0);
        expect(read).toBeLessThanOrEqual(1);
        expect(write).toBeGreaterThanOrEqual(0);
        expect(write).toBeLessThanOrEqual(1);
      }
    }
  });

  it('la lectura de la pasada n+1 es la escritura de la pasada n', () => {
    for (let index = 0; index < 2; index++) {
      for (let pass = 0; pass < 4; pass++) {
        expect(pingPong(index, pass + 1).read).toBe(pingPong(index, pass).write);
      }
    }
  });

  it('en la pasada 0 cada portal lee un buffer nunca escrito (contenido inicial)', () => {
    expect(pingPong(0, 0)).toEqual({ read: 0, write: 1 });
    expect(pingPong(1, 0)).toEqual({ read: 1, write: 0 });
  });

  it('con 1 pasada: una sola lectura/escritura (sin realimentación)', () => {
    expect(pingPong(0, 0)).toEqual({ read: 0, write: 1 });
    expect(pingPong(1, 0)).toEqual({ read: 1, write: 0 });
  });
});
