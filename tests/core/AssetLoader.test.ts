import { describe, it, expect, vi } from 'vitest';
import { BufferGeometry, Mesh, MeshBasicMaterial, Texture } from 'three';
import { AssetLoader, type Loaders } from '../../src/core/AssetLoader';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const makeFakeLoaders = (opts: {
  textureErrorFor?: (url: string) => Error | undefined;
  modelErrorFor?: (url: string) => Error | undefined;
  textureDelay?: number;
  modelDelay?: number;
} = {}) => {
  type Call = { kind: 'texture' | 'model'; url: string };
  const calls: Call[] = [];
  const textures = new Map<string, Texture>();
  const models = new Map<string, Mesh<BufferGeometry, MeshBasicMaterial>>();
  const loaders: Loaders = {
    texture: async (url) => {
      calls.push({ kind: 'texture', url });
      if (opts.textureDelay) await delay(opts.textureDelay);
      const err = opts.textureErrorFor?.(url);
      if (err) throw err;
      let tex = textures.get(url);
      if (!tex) {
        tex = new Texture();
        textures.set(url, tex);
      }
      return tex;
    },
    model: async (url) => {
      calls.push({ kind: 'model', url });
      if (opts.modelDelay) await delay(opts.modelDelay);
      const err = opts.modelErrorFor?.(url);
      if (err) throw err;
      let obj = models.get(url);
      if (!obj) {
        obj = new Mesh<BufferGeometry, MeshBasicMaterial>(new BufferGeometry(), new MeshBasicMaterial());
        obj.name = url;
        models.set(url, obj);
      }
      return obj;
    },
  };
  return { loaders, calls, models };
};

describe('AssetLoader.load (carga y caché)', () => {
  it('carga texturas y modelos; el loader se llama una vez por clave aunque load() se llame dos veces', async () => {
    const { loaders, calls } = makeFakeLoaders();
    const al = new AssetLoader(loaders);
    const manifest = { textures: { t1: 't1.png' }, models: { m1: 'm1.glb' } };

    await al.load(manifest);
    await al.load(manifest);

    expect(calls).toEqual([
      { kind: 'texture', url: 't1.png' },
      { kind: 'model', url: 'm1.glb' },
    ]);
    expect(al.has('t1')).toBe(true);
    expect(al.has('m1')).toBe(true);
  });

  it('texture() devuelve la misma instancia cacheada', async () => {
    const { loaders } = makeFakeLoaders();
    const al = new AssetLoader(loaders);
    await al.load({ textures: { t1: 't1.png' } });

    expect(al.texture('t1')).toBe(al.texture('t1'));
  });

  it('manifiesto vacío: no llama a loaders ni avisa progreso', async () => {
    const { loaders, calls } = makeFakeLoaders();
    const al = new AssetLoader(loaders);
    const progress: [number, number][] = [];

    await al.load({}, (l, t) => progress.push([l, t]));

    expect(calls).toEqual([]);
    expect(progress).toEqual([]);
  });
});

describe('AssetLoader.load (progreso)', () => {
  it('onProgress avisa 1/2 y 2/2 tras cada recurso', async () => {
    const { loaders } = makeFakeLoaders({ textureDelay: 10 });
    const al = new AssetLoader(loaders);
    const progress: [number, number][] = [];

    await al.load({ textures: { a: 'a.png', b: 'b.png' } }, (l, t) => progress.push([l, t]));

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe('AssetLoader.model (clones)', () => {
  it('model() devuelve clones distintos (misma estructura, no la misma instancia)', async () => {
    const { loaders, models } = makeFakeLoaders();
    const al = new AssetLoader(loaders);
    await al.load({ models: { m1: 'm1.glb' } });

    const a = al.model('m1');
    const b = al.model('m1');

    expect(a).not.toBe(b);
    expect(a).not.toBe(models.get('m1.glb'));
    expect(a.name).toBe('m1.glb');
  });
});

describe('AssetLoader (clave inexistente)', () => {
  it('texture() y model() lanzan "Asset no cargado: <key>"; has() es false', () => {
    const al = new AssetLoader(makeFakeLoaders().loaders);

    expect(al.has('nope')).toBe(false);
    expect(() => al.texture('nope')).toThrow('Asset no cargado: nope');
    expect(() => al.model('nope')).toThrow('Asset no cargado: nope');
  });
});

describe('AssetLoader.load (fallos)', () => {
  it('si falla un recurso, load() rechaza con clave y URL en el mensaje', async () => {
    const { loaders } = makeFakeLoaders({
      textureErrorFor: (url) => (url === 'bad.png' ? new Error('boom') : undefined),
    });
    const al = new AssetLoader(loaders);
    const manifest = { textures: { bueno: 'bueno.png', malo: 'bad.png' } };

    await expect(al.load(manifest)).rejects.toThrow('Fallo al cargar malo: bad.png');
    expect(al.has('malo')).toBe(false);
  });
});

describe('AssetLoader.dispose (limpieza)', () => {
  it('llama dispose() de texturas y de geometrías/materiales de modelos, y vacía cachés', async () => {
    const { loaders, models } = makeFakeLoaders();
    const al = new AssetLoader(loaders);
    await al.load({ textures: { t1: 't1.png' }, models: { m1: 'm1.glb' } });

    const tex = al.texture('t1');
    const original = models.get('m1.glb')!;
    const texDispose = vi.spyOn(tex, 'dispose');
    const geoDispose = vi.spyOn(original.geometry, 'dispose');
    const matDispose = vi.spyOn(original.material, 'dispose');

    al.dispose();

    expect(texDispose).toHaveBeenCalledTimes(1);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(al.has('t1')).toBe(false);
    expect(al.has('m1')).toBe(false);
    expect(() => al.texture('t1')).toThrow('Asset no cargado: t1');
  });

  it('dispose() sin assets no falla', () => {
    const al = new AssetLoader(makeFakeLoaders().loaders);
    expect(() => al.dispose()).not.toThrow();
  });
});
