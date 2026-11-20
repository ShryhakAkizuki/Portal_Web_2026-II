import { PORTAL_WIDTH, PORTAL_HEIGHT, PORTAL_OFFSET } from '../config';
import { axisOfNormal, portalRect, subtractHoles } from '../math/faceMath';
import type { Axis, Bounds, Rect2 } from '../math/faceMath';
import type {
  BodyUserData,
  IPhysicsWorld,
  PhysicsBody,
  PortalColor,
  PortalState,
  Vec3,
} from '../types/contracts';

interface SurfaceReg {
  original: PhysicsBody;
  bounds: Bounds;
  userData: BodyUserData;
  axis: Axis;
  pieces: PhysicsBody[];
  holes: Map<PortalColor, Rect2>;
}

export class HostWalls {
  private readonly physics: IPhysicsWorld;
  private readonly regs = new Map<string, SurfaceReg>();

  constructor(physics: IPhysicsWorld) {
    this.physics = physics;
  }

  setHole(color: PortalColor, host: PhysicsBody, state: PortalState): void {
    const surfaceId = host.userData.surfaceId;
    const na = axisOfNormal(state.normal);
    if (surfaceId === undefined || na === null) return;

    for (const [sid, reg] of this.regs) {
      if (reg.holes.has(color)) {
        reg.holes.delete(color);
        this.rebuild(sid);
      }
    }

    let reg = this.regs.get(surfaceId);
    if (reg === undefined) {
      const bounds = this.physics.getBoxBounds(host);
      if (bounds === null) return;
      reg = {
        original: host,
        bounds,
        userData: host.userData,
        axis: na.axis,
        pieces: [],
        holes: new Map(),
      };
      this.regs.set(surfaceId, reg);
    }

    const center: Vec3 = [
      state.position[0] - state.normal[0] * PORTAL_OFFSET,
      state.position[1] - state.normal[1] * PORTAL_OFFSET,
      state.position[2] - state.normal[2] * PORTAL_OFFSET,
    ];
    reg.holes.set(color, portalRect(center, na.axis, state.up, PORTAL_WIDTH, PORTAL_HEIGHT));
    this.rebuild(surfaceId);
  }

  clearHole(color: PortalColor): void {
    for (const [sid, reg] of this.regs) {
      if (reg.holes.has(color)) {
        reg.holes.delete(color);
        this.rebuild(sid);
        return;
      }
    }
  }

  dispose(): void {
    for (const reg of this.regs.values()) {
      for (const p of reg.pieces) this.physics.removeBody(p);
      reg.pieces = [];
      this.physics.setBodyEnabled(reg.original, true);
    }
    this.regs.clear();
  }

  private rebuild(surfaceId: string): void {
    const reg = this.regs.get(surfaceId);
    if (reg === undefined) return;
    for (const p of reg.pieces) this.physics.removeBody(p);
    reg.pieces = [];
    if (reg.holes.size === 0) {
      this.physics.setBodyEnabled(reg.original, true);
      return;
    }
    this.physics.setBodyEnabled(reg.original, false);
    const holes = [...reg.holes.values()];
    for (const box of subtractHoles(reg.bounds, reg.axis, holes)) {
      reg.pieces.push(
        this.physics.createBody({
          type: 'fixed',
          position: [
            (box.min[0] + box.max[0]) / 2,
            (box.min[1] + box.max[1]) / 2,
            (box.min[2] + box.max[2]) / 2,
          ],
          shape: {
            kind: 'box',
            halfExtents: [
              (box.max[0] - box.min[0]) / 2,
              (box.max[1] - box.min[1]) / 2,
              (box.max[2] - box.min[2]) / 2,
            ],
          },
          userData: {
            kind: 'world',
            portalable: reg.userData.portalable,
            surfaceId: reg.userData.surfaceId,
          },
        }),
      );
    }
  }
}
