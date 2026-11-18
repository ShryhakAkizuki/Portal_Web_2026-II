import { Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import type {
  Entity as EntityContract,
  IPhysicsWorld,
  IRenderer,
  PhysicsBody,
  Quat,
  Vec3,
} from '../types/contracts';

export type { Entity } from '../types/contracts';

export interface EntityDeps {
  physics: IPhysicsWorld;
  renderer: IRenderer;
}

export abstract class BaseEntity implements EntityContract {
  body?: PhysicsBody;
  mesh?: Object3D;

  private readonly prevPosition = new Vector3();
  private readonly prevRotation = new Quaternion();
  private readonly tmpPosition = new Vector3();
  private readonly tmpRotation = new Quaternion();

  constructor(
    readonly id: string,
    readonly kind: string,
    protected deps: EntityDeps,
  ) {}

  captureState(): void {
    if (!this.body) {
      return;
    }
    this.storePrev(this.deps.physics.getPose(this.body));
  }

  syncMesh(alpha: number): void {
    if (!this.body || !this.mesh) {
      return;
    }
    const pose = this.deps.physics.getPose(this.body);
    const currPosition = this.tmpPosition.set(pose.position[0], pose.position[1], pose.position[2]);
    const currRotation = this.tmpRotation.set(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    );
    this.mesh.position.lerpVectors(this.prevPosition, currPosition, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevRotation, currRotation, alpha);
  }

  resetInterpolation(): void {
    if (!this.body) {
      return;
    }
    this.storePrev(this.deps.physics.getPose(this.body));
  }

  update(_dt: number): void {
  }

  protected attachMesh(mesh: Object3D): void {
    this.deps.renderer.scene.add(mesh);
    this.mesh = mesh;
  }

  dispose(): void {
    if (this.body) {
      this.deps.physics.removeBody(this.body);
      this.body = undefined;
    }
    if (this.mesh) {
      this.mesh.traverse((child) => {
        const m = child as Partial<Mesh>;
        if (m.isMesh !== true) {
          return;
        }
        m.geometry?.dispose();
        const material = m.material;
        if (Array.isArray(material)) {
          material.forEach((x) => x.dispose());
        } else {
          material?.dispose();
        }
      });
      this.mesh.removeFromParent();
      this.mesh = undefined;
    }
  }

  private storePrev(pose: { position: Vec3; rotation: Quat }): void {
    this.prevPosition.set(pose.position[0], pose.position[1], pose.position[2]);
    this.prevRotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]);
  }
}
