import RAPIER from '@dimforge/rapier3d-compat';
import type { World, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { FIXED_STEP, GROUPS, ALL_GROUPS, PLAYER, interactionGroups } from '../config';
import type {
  BodyDesc,
  BodyUserData,
  IPhysicsWorld,
  PhysicsBody,
  Quat,
  RayHit,
  Vec3,
} from '../types/contracts';

function defaultGroupForKind(kind: BodyUserData['kind'] | undefined): number {
  switch (kind) {
    case 'player':
      return GROUPS.PLAYER;
    case 'prop':
      return GROUPS.PROP;
    case 'sensor':
      return GROUPS.SENSOR;
    case 'world':
    case 'door':
    default:
      return GROUPS.WORLD;
  }
}

export class PhysicsWorld implements IPhysicsWorld {
  private readonly world: World;
  private readonly characterController: KinematicCharacterController;
  private readonly byCollider = new Map<number, PhysicsBody>();

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: PLAYER.gravity, z: 0 });
    this.world.timestep = FIXED_STEP;

    this.characterController = this.world.createCharacterController(0.01);
    this.characterController.enableAutostep(0.3, 0.1, false);
    this.characterController.enableSnapToGround(0.2);
    this.characterController.setSlideEnabled(true);
    this.characterController.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.characterController.setMinSlopeSlideAngle((60 * Math.PI) / 180);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  createBody(desc: BodyDesc): PhysicsBody {
    const bodyDesc =
      desc.type === 'fixed'
        ? RAPIER.RigidBodyDesc.fixed()
        : desc.type === 'dynamic'
          ? RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(desc.ccd ?? false)
          : RAPIER.RigidBodyDesc.kinematicPositionBased();
    const [x, y, z] = desc.position;
    bodyDesc.setTranslation(x, y, z);
    if (desc.rotation) {
      const [qx, qy, qz, qw] = desc.rotation;
      bodyDesc.setRotation(new RAPIER.Quaternion(qx, qy, qz, qw));
    }

    const s = desc.shape;
    const colliderDesc =
      s.kind === 'box'
        ? RAPIER.ColliderDesc.cuboid(s.halfExtents[0], s.halfExtents[1], s.halfExtents[2])
        : s.kind === 'capsule'
          ? RAPIER.ColliderDesc.capsule(s.halfHeight, s.radius)
          : RAPIER.ColliderDesc.ball(s.radius);
    colliderDesc.setSensor(desc.sensor === true);
    colliderDesc.setFriction(desc.friction ?? 0.7);
    colliderDesc.setRestitution(desc.restitution ?? 0);
    colliderDesc.setDensity(desc.density ?? 1);
    const membership = desc.groups ?? defaultGroupForKind(desc.userData?.kind);
    colliderDesc.setCollisionGroups(interactionGroups(membership, ALL_GROUPS));

    const rb = this.world.createRigidBody(bodyDesc);
    const collider = this.world.createCollider(colliderDesc, rb);
    const body: PhysicsBody = { rb, collider, userData: desc.userData ?? {} };
    this.byCollider.set(collider.handle, body);
    return body;
  }

  removeBody(body: PhysicsBody): void {
    if (!this.byCollider.has(body.collider.handle)) return;
    this.byCollider.delete(body.collider.handle);
    this.world.removeCollider(body.collider, true);
    this.world.removeRigidBody(body.rb);
  }

  bodyCount(): number {
    return this.world.bodies.len();
  }

  raycast(
    origin: Vec3,
    dir: Vec3,
    maxDist: number,
    opts?: { excludeBody?: PhysicsBody },
  ): RayHit | null {
    const ray = new RAPIER.Ray(
      { x: origin[0], y: origin[1], z: origin[2] },
      { x: dir[0], y: dir[1], z: dir[2] },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interactionGroups(ALL_GROUPS, ALL_GROUPS),
      undefined,
      opts?.excludeBody?.rb,
    );
    if (!hit) return null;
    const body = this.byCollider.get(hit.collider.handle) ?? null;
    return {
      point: [
        origin[0] + dir[0] * hit.timeOfImpact,
        origin[1] + dir[1] * hit.timeOfImpact,
        origin[2] + dir[2] * hit.timeOfImpact,
      ],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      distance: hit.timeOfImpact,
      body,
      userData: body?.userData ?? {},
    };
  }

  moveCharacter(body: PhysicsBody, desired: Vec3, _dt: number): { movement: Vec3; grounded: boolean } {
    this.characterController.computeColliderMovement(
      body.collider,
      { x: desired[0], y: desired[1], z: desired[2] },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interactionGroups(ALL_GROUPS, ALL_GROUPS),
    );
    const t = body.rb.translation();
    const m = this.characterController.computedMovement();
    body.rb.setNextKinematicTranslation({
      x: t.x + m.x,
      y: t.y + m.y,
      z: t.z + m.z,
    });
    return {
      movement: [m.x, m.y, m.z],
      grounded: this.characterController.computedGrounded(),
    };
  }

  moveKinematic(body: PhysicsBody, position: Vec3): void {
    body.rb.setNextKinematicTranslation({ x: position[0], y: position[1], z: position[2] });
  }

  getPose(body: PhysicsBody): { position: Vec3; rotation: Quat } {
    const t = body.rb.translation();
    const r = body.rb.rotation();
    return {
      position: [t.x, t.y, t.z],
      rotation: [r.x, r.y, r.z, r.w],
    };
  }

  setPose(body: PhysicsBody, position: Vec3, rotation?: Quat): void {
    body.rb.setTranslation(
      { x: position[0], y: position[1], z: position[2] },
      true,
    );
    if (rotation) {
      body.rb.setRotation(
        new RAPIER.Quaternion(rotation[0], rotation[1], rotation[2], rotation[3]),
        true,
      );
    }
  }

  getVelocity(body: PhysicsBody): { linear: Vec3; angular: Vec3 } {
    const l = body.rb.linvel();
    const a = body.rb.angvel();
    return {
      linear: [l.x, l.y, l.z],
      angular: [a.x, a.y, a.z],
    };
  }

  setVelocity(body: PhysicsBody, linear: Vec3, angular?: Vec3): void {
    body.rb.setLinvel({ x: linear[0], y: linear[1], z: linear[2] }, true);
    if (angular) {
      body.rb.setAngvel({ x: angular[0], y: angular[1], z: angular[2] }, true);
    }
  }

  setGravityScale(body: PhysicsBody, scale: number): void {
    body.rb.setGravityScale(scale, true);
  }

  getBoxBounds(body: PhysicsBody): { min: Vec3; max: Vec3 } | null {
    const shape = body.collider.shape;
    if (!(shape instanceof RAPIER.Cuboid)) return null;
    const t = body.rb.translation();
    const h = shape.halfExtents;
    return {
      min: [t.x - h.x, t.y - h.y, t.z - h.z],
      max: [t.x + h.x, t.y + h.y, t.z + h.z],
    };
  }

  queryOverlaps(sensor: PhysicsBody): PhysicsBody[] {
    const t = sensor.rb.translation();
    const seen = new Set<number>();
    const out: PhysicsBody[] = [];
    this.world.intersectionsWithShape(
      { x: t.x, y: t.y, z: t.z },
      sensor.rb.rotation(),
      sensor.collider.shape,
      (collider) => {
        const body = this.byCollider.get(collider.handle);
        if (!body || body.rb === sensor.rb) {
          return true;
        }
        if (!seen.has(body.rb.handle)) {
          seen.add(body.rb.handle);
          out.push(body);
        }
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interactionGroups(ALL_GROUPS, ALL_GROUPS),
    );
    return out;
  }

  setBodyEnabled(body: PhysicsBody, enabled: boolean): void {
    body.rb.setEnabled(enabled);
  }

  isDynamic(body: PhysicsBody): boolean {
    return body.rb.bodyType() === RAPIER.RigidBodyType.Dynamic;
  }
}
