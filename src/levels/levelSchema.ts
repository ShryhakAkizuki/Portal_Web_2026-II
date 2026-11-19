import type { LevelData } from '../types/contracts';

export class LevelError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'LevelError';
    this.path = path;
  }
}


function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireObject(data: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(data)) throw new LevelError(path, 'debe ser un objeto');
  return data;
}

function requireString(v: unknown, path: string, { allowEmpty = false } = {}): string {
  if (typeof v !== 'string') throw new LevelError(path, 'debe ser una cadena');
  if (!allowEmpty && v.length === 0) throw new LevelError(path, 'no puede estar vacía');
  return v;
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new LevelError(path, 'debe ser un número finito');
  }
  return v;
}

function requireBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new LevelError(path, 'debe ser booleano');
  return v;
}

function requireArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new LevelError(path, 'debe ser un array');
  return v;
}

function vec3(v: unknown, path: string, positive = false): [number, number, number] {
  const arr = requireArray(v, path);
  if (arr.length !== 3) throw new LevelError(path, 'debe tener exactamente 3 componentes');
  const out = arr.map((n, i) => requireNumber(n, `${path}[${i}]`));
  if (positive) {
    out.forEach((n, i) => {
      if (n <= 0) throw new LevelError(`${path}[${i}]`, 'debe ser > 0');
    });
  }
  return out as [number, number, number];
}

function uniqueId(v: unknown, path: string, seen: Map<string, string>, label: string): string {
  const id = requireString(v, path);
  const prev = seen.get(id);
  if (prev !== undefined) throw new LevelError(path, `id duplicado (${label}): "${id}"`);
  seen.set(id, path);
  return id;
}


const ENTITY_TYPES = ['cube', 'button', 'door', 'exit'] as const;
const DOOR_MODES = ['all', 'any'] as const;

export function validateLevel(data: unknown): LevelData {
  const root = requireObject(data, '');

  requireString(root.id, 'id');
  requireString(root.name, 'name');

  const spawn = requireObject(root.spawn, 'spawn');
  vec3(spawn.position, 'spawn.position');
  requireNumber(spawn.yaw, 'spawn.yaw');

  const geometryArr = requireArray(root.geometry, 'geometry');
  if (geometryArr.length === 0) throw new LevelError('geometry', 'no puede estar vacío');
  const boxIds = new Map<string, string>();
  geometryArr.forEach((raw, i) => {
    const path = `geometry[${i}]`;
    const box = requireObject(raw, path);
    vec3(box.position, `${path}.position`);
    vec3(box.size, `${path}.size`, true);
    requireBoolean(box.portalable, `${path}.portalable`);
    if (box.id !== undefined) {
      uniqueId(box.id, `${path}.id`, boxIds, 'cajas');
    }
  });

  const entityArr = requireArray(root.entities, 'entities');
  const entityIds = new Map<string, string>();
  const buttons = new Set<string>();
  let exitCount = 0;

  entityArr.forEach((raw, i) => {
    const path = `entities[${i}]`;
    const ent = requireObject(raw, path);

    const type = requireString(ent.type, `${path}.type`, { allowEmpty: true });
    if (!(ENTITY_TYPES as readonly string[]).includes(type)) {
      throw new LevelError(`${path}.type`, `tipo desconocido: "${type}"`);
    }

    const eid = uniqueId(ent.id, `${path}.id`, entityIds, 'entidades');
    vec3(ent.position, `${path}.position`);

    if (type === 'button') {
      buttons.add(eid);
    } else if (type === 'exit') {
      exitCount += 1;
      vec3(ent.size, `${path}.size`, true);
    } else if (type === 'door') {
      vec3(ent.size, `${path}.size`, true);
      const opensOnArr = requireArray(ent.opensOn, `${path}.opensOn`);
      if (opensOnArr.length === 0) throw new LevelError(`${path}.opensOn`, 'no puede estar vacío');
      opensOnArr.forEach((v, j) => requireString(v, `${path}.opensOn[${j}]`));
      if (ent.mode !== undefined) {
        const m = requireString(ent.mode, `${path}.mode`, { allowEmpty: true });
        if (!(DOOR_MODES as readonly string[]).includes(m)) {
          throw new LevelError(`${path}.mode`, `debe ser 'all' o 'any'`);
        }
      }
    }
  });

  entityArr.forEach((raw, i) => {
    const ent = raw as Record<string, unknown>;
    if (ent.type !== 'door') return;
    (requireArray(ent.opensOn, `entities[${i}].opensOn`) as string[]).forEach((ref) => {
      if (!entityIds.has(ref)) {
        throw new LevelError(`entities[${i}].opensOn`, `id inexistente: "${ref}"`);
      }
      if (!buttons.has(ref)) {
        throw new LevelError(`entities[${i}].opensOn`, `"${ref}" no es un button`);
      }
    });
  });

  if (exitCount !== 1) {
    throw new LevelError('entities', `debe haber exactamente un exit (hay ${exitCount})`);
  }

  return data as LevelData;
}
