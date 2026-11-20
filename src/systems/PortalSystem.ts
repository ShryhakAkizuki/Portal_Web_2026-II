import { PORTAL_WIDTH, PORTAL_HEIGHT, PORTAL_OFFSET } from '../config';
import { HostWalls } from './HostWalls';
import { PortalVisual } from './PortalVisual';
import { PortalViews } from './portalViews';
import { axisOfNormal, snapUp, fitPortalOnFace, rectsOverlap, portalRect } from '../math/faceMath';
import type { Axis } from '../math/faceMath';
import {
  crossedPortal,
  frameMatrix,
  makePortalFrame,
  portalTransform,
  transformDirection,
  transformPoint,
} from '../math/portalMath';
import type { PortalFrame } from '../math/portalMath';
import { fromQuat, fromV3, toQuat, toV3 } from '../math/vec';
import type {
  Entity,
  IEventBus,
  IPhysicsWorld,
  IRenderer,
  IPortalSystem,
  PortalColor,
  PortalState,
  RayHit,
  Vec3,
} from '../types/contracts';
import { Quaternion } from 'three';
import type { Matrix4, PerspectiveCamera } from 'three';

export interface PortalSystemDeps {
  physics: IPhysicsWorld;
  bus: IEventBus;
  renderer: IRenderer;
}

type NormalAxis = { axis: Axis; sign: 1 | -1 };

const PLANE_TOL = 1e-3;
const OVERLAP_MARGIN = 0.05;
const PROP_PUSH = 0.55;

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export class PortalSystem implements IPortalSystem {
  private readonly physics: IPhysicsWorld;
  private readonly bus: IEventBus;
  private readonly visual: PortalVisual;
  private readonly views: PortalViews;
  private readonly hostWalls: HostWalls;
  private readonly portals = new Map<PortalColor, PortalState>();
  private readonly tracked = new Map<Entity, Vec3>();

  constructor(deps: PortalSystemDeps) {
    this.physics = deps.physics;
    this.bus = deps.bus;
    this.visual = new PortalVisual(deps.renderer.scene);
    this.views = new PortalViews(deps.renderer, this.visual);
    this.hostWalls = new HostWalls(deps.physics);
  }

  place(color: PortalColor, hit: RayHit, viewDir: Vec3): boolean {
    if (hit.userData.portalable !== true || hit.body === null) return false;
    const na = axisOfNormal(hit.normal);
    if (na === null) return false;
    const bounds = this.physics.getBoxBounds(hit.body);
    if (bounds === null) return false;
    const up = snapUp(viewDir, hit.normal);
    const { center, ok } = fitPortalOnFace(bounds, hit.point, na, up, PORTAL_WIDTH, PORTAL_HEIGHT);
    if (!ok) return false;
    if (this.overlapsOtherPortal(color, center, na, up)) return false;
    const normal = hit.normal;
    const state: PortalState = {
      color,
      position: [
        center[0] + normal[0] * PORTAL_OFFSET,
        center[1] + normal[1] * PORTAL_OFFSET,
        center[2] + normal[2] * PORTAL_OFFSET,
      ],
      normal,
      up,
      right: cross(up, normal),
      hostBody: hit.body,
      surfaceId: hit.userData.surfaceId,
    };
    this.portals.set(color, state);
    this.visual.show(state);
    this.bus.emit('portal:placed', { color });
    this.syncHoles();
    return true;
  }

  remove(color: PortalColor): void {
    this.portals.delete(color);
    this.visual.hide(color);
    this.syncHoles();
  }

  get(color: PortalColor): PortalState | null {
    return this.portals.get(color) ?? null;
  }

  isLinked(): boolean {
    return this.portals.has('blue') && this.portals.has('orange');
  }

  track(e: Entity): void {
    if (e.body) {
      this.tracked.set(e, this.physics.getPose(e.body).position);
    }
  }

  untrack(e: Entity): void {
    this.tracked.delete(e);
  }

  update(_dt: number): void {
    if (!this.isLinked()) {
      return;
    }
    const blue = this.frameOfFrame('blue');
    const orange = this.frameOfFrame('orange');
    if (!blue || !orange) {
      return;
    }
    for (const [e, last] of [...this.tracked]) {
      if (!e.body) {
        continue;
      }
      const curr = this.physics.getPose(e.body).position;
      if (crossedPortal(toV3(last), toV3(curr), blue, PORTAL_WIDTH, PORTAL_HEIGHT)) {
        this.teleport(e, blue, orange, 'blue');
      } else if (crossedPortal(toV3(last), toV3(curr), orange, PORTAL_WIDTH, PORTAL_HEIGHT)) {
        this.teleport(e, orange, blue, 'orange');
      }
      this.tracked.set(e, this.physics.getPose(e.body).position);
    }
  }

  private teleport(e: Entity, f: PortalFrame, out: PortalFrame, entering: PortalColor): void {
    if (!e.body) {
      return;
    }
    const T = portalTransform(frameMatrix(f), frameMatrix(out));
    const pose = this.physics.getPose(e.body);
    const pos = transformPoint(T, toV3(pose.position));
    const rot = toQuat(pose.rotation);
    rot.premultiply(new Quaternion().setFromRotationMatrix(T));
    pos.addScaledVector(out.normal, PROP_PUSH);

    if (this.physics.isDynamic(e.body)) {
      const vel = this.physics.getVelocity(e.body);
      const lin = transformDirection(T, toV3(vel.linear));
      const ang = transformDirection(T, toV3(vel.angular));
      this.physics.setPose(e.body, fromV3(pos), fromQuat(rot));
      this.physics.setVelocity(e.body, [lin.x, lin.y, lin.z], [ang.x, ang.y, ang.z]);
    } else {
      this.physics.setPose(e.body, fromV3(pos), fromQuat(rot));
    }

    e.resetInterpolation();
    e.onTeleport?.(T);
    this.bus.emit('portal:crossed', { entityId: e.id, entering });
  }

  renderViews(renderer: IRenderer, camera: PerspectiveCamera): void {
    const blue = this.frameOf('blue');
    const orange = this.frameOf('orange');
    const blueOut = this.frameOfFrame('blue');
    const orangeOut = this.frameOfFrame('orange');
    this.views.render(camera, blue, orange, orangeOut, blueOut);
  }

  dispose(): void {
    this.hostWalls.dispose();
    this.views.dispose();
    this.visual.dispose();
    this.portals.clear();
    this.tracked.clear();
  }

  private syncHoles(): void {
    if (!this.isLinked()) {
      this.hostWalls.clearHole('blue');
      this.hostWalls.clearHole('orange');
      return;
    }
    const blue = this.portals.get('blue');
    const orange = this.portals.get('orange');
    if (blue && blue.hostBody) this.hostWalls.setHole('blue', blue.hostBody, blue);
    if (orange && orange.hostBody) this.hostWalls.setHole('orange', orange.hostBody, orange);
  }

  private frameOf(color: PortalColor): Matrix4 | null {
    const f = this.frameOfFrame(color);
    return f === null ? null : frameMatrix(f);
  }

  private frameOfFrame(color: PortalColor): PortalFrame | null {
    const state = this.portals.get(color);
    if (state === undefined) return null;
    return makePortalFrame(state.position, state.normal, state.up);
  }

  private overlapsOtherPortal(
    color: PortalColor,
    center: Vec3,
    na: NormalAxis,
    up: Vec3,
  ): boolean {
    const other = this.portals.get(color === 'blue' ? 'orange' : 'blue');
    if (other === undefined) return false;
    const on = axisOfNormal(other.normal);
    if (on === null || on.axis !== na.axis || on.sign !== na.sign) return false;
    const otherCenter: Vec3 = [
      other.position[0] - other.normal[0] * PORTAL_OFFSET,
      other.position[1] - other.normal[1] * PORTAL_OFFSET,
      other.position[2] - other.normal[2] * PORTAL_OFFSET,
    ];
    if (Math.abs(otherCenter[na.axis] - center[na.axis]) > PLANE_TOL) return false;
    return rectsOverlap(
      portalRect(center, na.axis, up, PORTAL_WIDTH, PORTAL_HEIGHT),
      portalRect(otherCenter, na.axis, other.up, PORTAL_WIDTH, PORTAL_HEIGHT),
      OVERLAP_MARGIN,
    );
  }
}
