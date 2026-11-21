import { Plane } from 'three';
import type { Material, Mesh, Object3D } from 'three';
import { PORTAL_HEIGHT, PORTAL_WIDTH } from '../config';
import { frameMatrix, makePortalFrame, portalTransform, signedDistance } from '../math/portalMath';
import type { PortalFrame } from '../math/portalMath';
import { fromV3, toV3 } from '../math/vec';
import type { Entity, IRenderer, PortalColor, PortalState, Vec3 } from '../types/contracts';

/** Radio del cubo para el test de solape: semidiagonal del cubo de 0.6 m (T29). */
export const CUBE_RADIUS = 0.52;

const COLORS: readonly PortalColor[] = ['blue', 'orange'];

/**
 * `true` si una esfera de radio `radius` centrada en `center` corta el portal:
 * el centro está a menos de `radius` del plano (estricto) y su proyección
 * lateral/vertical cae dentro del rectángulo `w × h` ampliado en `radius`.
 */
export function straddles(center: Vec3, radius: number, f: PortalFrame, w: number, h: number): boolean {
  if (Math.abs(signedDistance(toV3(center), f)) >= radius) {
    return false;
  }
  const q = toV3(center).sub(f.position);
  return Math.abs(q.dot(f.right)) <= w / 2 + radius && Math.abs(q.dot(f.up)) <= h / 2 + radius;
}

/**
 * Plano de recorte que conserva el lado **delante** del portal (distancia con
 * signo > 0): `posP + normalP` evalúa positivo y `posP − normalP` negativo
 * (convención de three: distancia = normal·p + constante).
 */
export function clipPlane(f: PortalFrame): Plane {
  return new Plane(f.normal, -f.position.dot(f.normal));
}

interface StraddlePair {
  f: PortalFrame; // portal solapado (entrada)
  out: PortalFrame; // salida
}

interface CloneRecord {
  clone: Mesh;
  clonedMaterials: Material[]; // se desposean al retirar (la geometría es compartida: NO)
  originalMaterials: Material[]; // materiales originales: se les vacía clippingPlanes al retirar
}

/**
 * Cuerpo partido (T29): mientras una malla solapa un portal, la parte que ya
 * pasó se ve salir por el otro portal (clon) y la original y el clon se recortan
 * cada una a su lado. Llamar `update` después de `syncMesh` (pose interpolada)
 * y antes de las pasadas de vistas.
 */
export class PortalClones {
  private readonly records = new Map<Entity, CloneRecord>();

  update(entities: readonly Entity[], portals: ReadonlyMap<PortalColor, PortalState>, renderer: IRenderer): void {
    const alive = new Set<Entity>(entities);
    for (const [e, rec] of [...this.records]) {
      if (!alive.has(e)) {
        this.deactivate(e, rec, renderer);
      }
    }
    for (const e of entities) {
      if (!e.mesh || !e.canCross) {
        continue; // el jugador no tiene malla: se omite
      }
      const pair = this.straddled(e, portals);
      const rec = this.records.get(e);
      if (pair === null) {
        if (rec !== undefined) {
          this.deactivate(e, rec, renderer);
        }
      } else if (rec === undefined) {
        this.activate(e, pair, renderer);
      } else {
        this.refresh(rec, e, pair);
      }
    }
  }

  /** Retira todos los clon y desposea los materiales clonados (no las geometrías). */
  dispose(renderer: IRenderer): void {
    for (const [e, rec] of [...this.records]) {
      this.deactivate(e, rec, renderer);
    }
  }

  private straddled(e: Entity, portals: ReadonlyMap<PortalColor, PortalState>): StraddlePair | null {
    for (const color of COLORS) {
      const state = portals.get(color);
      const other = portals.get(color === 'blue' ? 'orange' : 'blue');
      if (state === undefined || other === undefined) {
        continue; // sin ambos portales no hay salida: no hay clon
      }
      const f = makePortalFrame(state.position, state.normal, state.up);
      // la malla es hija directa de la escena: `position` ya es la pose (interpolada tras syncMesh)
      if (straddles(fromV3((e.mesh as Mesh).position), CUBE_RADIUS, f, PORTAL_WIDTH, PORTAL_HEIGHT)) {
        return { f, out: makePortalFrame(other.position, other.normal, other.up) };
      }
    }
    return null;
  }

  private activate(e: Entity, pair: StraddlePair, renderer: IRenderer): void {
    const mesh = e.mesh as Mesh; // en el MVP la malla de la entidad es un Mesh (Prop: cubo)
    mesh.updateMatrixWorld(true); // matrixWorld = pose interpolada (syncMesh ya la escribió)
    const T = portalTransform(frameMatrix(pair.f), frameMatrix(pair.out));

    const clone = mesh.clone() as Mesh; // comparte geometría (y aún material: se reemplaza abajo)
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(T).multiply(mesh.matrixWorld);
    clone.matrixWorldNeedsUpdate = true; // con autoUpdate=false three no lo marca solo

    const { origMeshes, cloneMeshes } = this.meshLists(mesh, clone);
    const clonedMaterials: Material[] = [];
    const originalMaterials = new Set<Material>();
    const seen = new Map<Material, Material>();
    const cloneOfMaterial = (m: Material): Material => {
      let c = seen.get(m);
      if (c === undefined) {
        c = m.clone();
        seen.set(m, c);
        clonedMaterials.push(c);
      }
      return c;
    };
    for (let i = 0; i < cloneMeshes.length; i++) {
      const mat = origMeshes[i].material;
      if (Array.isArray(mat)) {
        cloneMeshes[i].material = mat.map((m) => {
          originalMaterials.add(m);
          return cloneOfMaterial(m);
        });
      } else {
        originalMaterials.add(mat);
        cloneMeshes[i].material = cloneOfMaterial(mat);
      }
    }

    const planeP = clipPlane(pair.f);
    const planeQ = clipPlane(pair.out);
    for (const m of originalMaterials) {
      m.clippingPlanes = [planeP];
      m.needsUpdate = true;
    }
    for (const m of clonedMaterials) {
      m.clippingPlanes = [planeQ];
      m.needsUpdate = true;
    }

    renderer.scene.add(clone);
    this.records.set(e, { clone, clonedMaterials, originalMaterials: [...originalMaterials] });
  }

  private refresh(rec: CloneRecord, e: Entity, pair: StraddlePair): void {
    const mesh = e.mesh as Mesh;
    mesh.updateMatrixWorld(true);
    const T = portalTransform(frameMatrix(pair.f), frameMatrix(pair.out));
    rec.clone.matrix.copy(T).multiply(mesh.matrixWorld);
    rec.clone.matrixWorldNeedsUpdate = true;
  }

  private deactivate(e: Entity, rec: CloneRecord, renderer: IRenderer): void {
    this.records.delete(e);
    for (const m of rec.originalMaterials) {
      m.clippingPlanes = null;
      m.needsUpdate = true;
    }
    renderer.scene.remove(rec.clone);
    for (const m of rec.clonedMaterials) {
      m.dispose();
    }
  }

  private meshLists(root: Object3D, clone: Object3D): { origMeshes: Mesh[]; cloneMeshes: Mesh[] } {
    const collect = (r: Object3D): Mesh[] => {
      const out: Mesh[] = [];
      r.traverse((o) => {
        const m = o as Partial<Mesh>;
        if (m.isMesh === true) {
          out.push(m as Mesh);
        }
      });
      return out;
    };
    return { origMeshes: collect(root), cloneMeshes: collect(clone) };
  }
}
