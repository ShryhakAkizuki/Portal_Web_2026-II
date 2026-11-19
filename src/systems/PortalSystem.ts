import { PORTAL_WIDTH, PORTAL_HEIGHT, PORTAL_OFFSET } from '../config';
import { axisOfNormal, snapUp, fitPortalOnFace, rectsOverlap, portalRect } from '../math/faceMath';
import type { Axis } from '../math/faceMath';
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
import type { PerspectiveCamera } from 'three';

export interface PortalSystemDeps {
  physics: IPhysicsWorld;
  bus: IEventBus;
}

type NormalAxis = { axis: Axis; sign: 1 | -1 };

const PLANE_TOL = 1e-3;
const OVERLAP_MARGIN = 0.05;

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
  private readonly portals = new Map<PortalColor, PortalState>();

  constructor(deps: PortalSystemDeps) {
    this.physics = deps.physics;
    this.bus = deps.bus;
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
    this.bus.emit('portal:placed', { color });
    return true;
  }

  remove(color: PortalColor): void {
    this.portals.delete(color);
  }

  get(color: PortalColor): PortalState | null {
    return this.portals.get(color) ?? null;
  }

  isLinked(): boolean {
    return this.portals.has('blue') && this.portals.has('orange');
  }

  track(_e: Entity): void {
  }

  untrack(_e: Entity): void {
  }

  update(_dt: number): void {
  }

  renderViews(_renderer: IRenderer, _camera: PerspectiveCamera): void {
  }

  dispose(): void {
    this.portals.clear();
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
