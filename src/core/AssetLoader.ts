import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mesh, Object3D, Texture } from 'three';
import type { AssetManifest, IAssetLoader } from '../types/contracts';

export interface Loaders {
  texture(url: string): Promise<Texture>;
  model(url: string): Promise<Object3D>;
}

const defaultLoaders: Loaders = {
  texture: async (url) => (await new TextureLoader().loadAsync(import.meta.env.BASE_URL + url)),
  model: async (url) => (await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + url)).scene,
};

export class AssetLoader implements IAssetLoader {
  private readonly loaders: Loaders;
  private readonly textures = new Map<string, Texture>();
  private readonly models = new Map<string, Object3D>();

  constructor(loaders?: Loaders) {
    this.loaders = loaders ?? defaultLoaders;
  }

  async load(manifest: AssetManifest, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    type Job = { key: string; url: string; run: () => Promise<void> };
    const jobs: Job[] = [];
    for (const [key, url] of Object.entries(manifest.textures ?? {})) {
      jobs.push({ key, url, run: () => this.acquireTexture(key, url) });
    }
    for (const [key, url] of Object.entries(manifest.models ?? {})) {
      jobs.push({ key, url, run: () => this.acquireModel(key, url) });
    }

    const total = jobs.length;
    let loaded = 0;

    await Promise.all(
      jobs.map(async (job) => {
        try {
          await job.run();
        } catch (err) {
          throw new Error(`Fallo al cargar ${job.key}: ${job.url}`, { cause: err });
        }
        loaded += 1;
        onProgress?.(loaded, total);
      }),
    );
  }

  texture(key: string): Texture {
    const tex = this.textures.get(key);
    if (!tex) {
      throw new Error(`Asset no cargado: ${key}`);
    }
    return tex;
  }

  model(key: string): Object3D {
    const obj = this.models.get(key);
    if (!obj) {
      throw new Error(`Asset no cargado: ${key}`);
    }
    return obj.clone(true);
  }

  has(key: string): boolean {
    return this.textures.has(key) || this.models.has(key);
  }

  dispose(): void {
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    for (const obj of this.models.values()) {
      obj.traverse((child) => {
        const mesh = child as Partial<Mesh>;
        if (mesh.isMesh !== true) {
          return;
        }
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material?.dispose();
        }
      });
    }
    this.textures.clear();
    this.models.clear();
  }

  private async acquireTexture(key: string, url: string): Promise<void> {
    if (this.textures.has(key)) {
      return;
    }
    this.textures.set(key, await this.loaders.texture(url));
  }

  private async acquireModel(key: string, url: string): Promise<void> {
    if (this.models.has(key)) {
      return;
    }
    this.models.set(key, await this.loaders.model(url));
  }
}
