import { describe, it, expect } from 'vitest';
import { validateLevel, LevelError } from '../../src/levels/levelSchema';
import type { LevelData, Vec3 } from '../../src/types/contracts';

function makeLevel(break_?: (lvl: Record<string, unknown>) => void): Record<string, unknown> {
  const lvl: Record<string, unknown> = {
    id: 'lv1',
    name: 'Sala 1',
    spawn: { position: [0, 0, 0], yaw: 0 },
    geometry: [{ position: [0, 0, 0], size: [1, 1, 1], portalable: false }],
    entities: [{ type: 'exit', id: 'exit1', position: [0, 0, 4], size: [1, 1, 1] }],
  };
  if (break_) break_(lvl);
  return lvl;
}

function errPath(e: unknown): string {
  expect(e).toBeInstanceOf(LevelError);
  return (e as LevelError).message.split(':')[0];
}

function throws(build: () => unknown, expectedPath: string): void {
  let caught: unknown;
  expect(() => validateLevel(build())).toThrow(LevelError);
  try {
    validateLevel(build());
  } catch (e) {
    caught = e;
  }
  expect(caught, 'debe haber lanzado LevelError').toBeTruthy();
  expect(errPath(caught)).toBe(expectedPath);
}

function entity(kind: 'exit' | 'door' | 'cube' | 'button', id: string, pos: Vec3, extra?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { type: kind, id, position: pos };
  if (kind === 'exit') base.size = [1, 1, 1];
  if (kind === 'door') {
    base.size = [1, 1, 1];
    base.opensOn = ['b1'];
  }
  return { ...base, ...extra };
}

describe('validateLevel', () => {
  it('acepta un nivel válido mínimo y devuelve la misma referencia (no copia)', () => {
    const lvl = makeLevel();
    const out = validateLevel(lvl);
    expect(out).toBe(lvl);
    expect(out.id).toBe('lv1');
    expect(out.entities).toHaveLength(1);
  });

  it('acepta un nivel completo (cubo, botón, puerta con mode, exit)', () => {
    const lvl = makeLevel((l) => {
      l.entities = [
        entity('cube', 'c1', [0, 0, 0]),
        entity('button', 'b1', [0, 0, -1]),
        entity('door', 'd1', [0, 0, 2], { mode: 'all' }),
        entity('exit', 'exit1', [0, 0, 4]),
      ];
    });
    expect(validateLevel(lvl)).toBe(lvl);
  });

  it('rechaza una entrada que no es objeto', () => {
    throws(() => null, '');
  });

  it('rechaza una entrada que es un array', () => {
    throws(() => [1, 2, 3], '');
  });

  it('id faltante', () => {
    throws(() => {
      const l = makeLevel();
      delete l.id;
      return l;
    }, 'id');
  });

  it('id vacío', () => {
    throws(() => makeLevel((l) => (l.id = '')), 'id');
  });

  it('name no es cadena', () => {
    throws(() => makeLevel((l) => (l.name = 5)), 'name');
  });

  it('spawn faltante', () => {
    throws(() => {
      const l = makeLevel();
      delete l.spawn;
      return l;
    }, 'spawn');
  });

  it('spawn.position faltante', () => {
    throws(() => {
      const l = makeLevel();
      delete (l.spawn as Record<string, unknown>).position;
      return l;
    }, 'spawn.position');
  });

  it('spawn.position con NaN', () => {
    throws(() => makeLevel((l) => (l.spawn = { position: [NaN, 0, 0], yaw: 0 })), 'spawn.position[0]');
  });

  it('spawn.position con solo 2 componentes', () => {
    throws(() => makeLevel((l) => (l.spawn = { position: [0, 0], yaw: 0 })), 'spawn.position');
  });

  it('spawn.yaw no es número finito', () => {
    throws(() => makeLevel((l) => (l.spawn = { position: [0, 0, 0], yaw: Infinity })), 'spawn.yaw');
  });

  it('geometry faltante', () => {
    throws(() => {
      const l = makeLevel();
      delete l.geometry;
      return l;
    }, 'geometry');
  });

  it('geometry vacío', () => {
    throws(() => makeLevel((l) => (l.geometry = [])), 'geometry');
  });

  it('geometry no es array', () => {
    throws(() => makeLevel((l) => (l.geometry = { 0: 1 })), 'geometry');
  });

  it('caja sin size', () => {
    throws(() =>
      makeLevel((l) => (l.geometry = [{ position: [0, 0, 0], portalable: false }])),
    'geometry[0].size');
  });

  it('caja con size ≤ 0', () => {
    throws(() =>
      makeLevel((l) => (l.geometry = [{ position: [0, 0, 0], size: [1, 0, 1], portalable: false }])),
    'geometry[0].size[1]');
  });

  it('caja sin portalable', () => {
    throws(() =>
      makeLevel((l) => (l.geometry = [{ position: [0, 0, 0], size: [1, 1, 1] }])),
    'geometry[0].portalable');
  });

  it('cajas con id duplicado', () => {
    throws(() =>
      makeLevel((l) => (l.geometry = [
        { id: 'a', position: [0, 0, 0], size: [1, 1, 1], portalable: false },
        { id: 'a', position: [1, 0, 0], size: [1, 1, 1], portalable: true },
      ])),
    'geometry[1].id');
  });

  it('entidad con id vacío', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [{ type: 'cube', id: '', position: [0, 0, 0] }])),
    'entities[0].id');
  });

  it('entidades con id duplicado', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [
        { type: 'cube', id: 'x', position: [0, 0, 0] },
        { type: 'cube', id: 'x', position: [1, 0, 0] },
      ])),
    'entities[1].id');
  });

  it('tipo de entidad desconocido', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [{ type: 'cubo', id: 'c1', position: [0, 0, 0] }])),
    'entities[0].type');
  });

  it('entidad sin position', () => {
    throws(() => makeLevel((l) => (l.entities = [{ type: 'cube', id: 'c1' }])), 'entities[0].position');
  });

  it('door sin size', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [{ type: 'door', id: 'd1', position: [0, 0, 0], opensOn: ['b1'] }])),
    'entities[0].size');
  });

  it('door con size ≤ 0', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [entity('door', 'd1', [0, 0, 0], { size: [0, 1, 1] })])),
    'entities[0].size[0]');
  });

  it('door con opensOn vacío', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [entity('door', 'd1', [0, 0, 0], { opensOn: [] })])),
    'entities[0].opensOn');
  });

  it('door con opensOn no array', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [entity('door', 'd1', [0, 0, 0], { opensOn: 'b1' })])),
    'entities[0].opensOn');
  });

  it("door con mode inválido", () => {
    throws(() =>
      makeLevel((l) => (l.entities = [entity('door', 'd1', [0, 0, 0], { mode: 'some' })])),
    'entities[0].mode');
  });

  it('opensOn apuntando a un id inexistente', () => {
    throws(() =>
      makeLevel((l) => {
        l.entities = [entity('button', 'b1', [0, 0, -1]), entity('door', 'd1', [0, 0, 2], { opensOn: ['nope'] })];
      }),
    'entities[1].opensOn');
  });

  it('opensOn apuntando a un no-botón', () => {
    throws(() =>
      makeLevel((l) => {
        l.entities = [entity('cube', 'c1', [0, 0, 0]), entity('door', 'd1', [0, 0, 2], { opensOn: ['c1'] })];
      }),
    'entities[1].opensOn');
  });

  it('sin exit (cero)', () => {
    throws(() => makeLevel((l) => (l.entities = [entity('cube', 'c1', [0, 0, 0])])), 'entities');
  });

  it('con dos exit', () => {
    throws(() =>
      makeLevel((l) => (l.entities = [entity('exit', 'e1', [0, 0, 4]), entity('exit', 'e2', [0, 0, 5])])),
    'entities');
  });
});
