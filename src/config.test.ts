import { describe, it, expect } from 'vitest';
import { PLAYER, GROUPS, interactionGroups } from './config';

describe('config', () => {
  it('interactionGroups(PLAYER, WORLD|PROP) da el grupo esperado de Rapier, sin signo', () => {
    const g = interactionGroups(GROUPS.PLAYER, GROUPS.WORLD | GROUPS.PROP);
    expect(g).toBe((0x0002 << 16 | 0x0005) >>> 0);
    expect(Number.isInteger(g)).toBe(true);
    expect(g).toBeGreaterThanOrEqual(0);
  });

  it('la cápsula del jugador mide 1.8 m de alto total', () => {
    expect(2 * (PLAYER.halfHeight + PLAYER.radius)).toBeCloseTo(1.8);
  });
});
