export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_TIME = 0.25;
export const PORTAL_WIDTH = 1.0;
export const PORTAL_HEIGHT = 2.0;
export const PORTAL_OFFSET = 0.01;
export const PORTAL_ZONE_DEPTH = 1.0;
export const PORTAL_RECURSION = 2;
export const PLAYER = {
  radius: 0.3, halfHeight: 0.6,
  eyeOffset: 0.7,
  walkSpeed: 5, jumpSpeed: 5, gravity: -9.81,
  lookSensitivity: 0.0022, maxPitch: 1.553,
} as const;
export const INTERACT_RANGE = 2.5;
export const HOLD_DISTANCE = 1.5;
export const GROUPS = { WORLD: 0x0001, PLAYER: 0x0002, PROP: 0x0004, SENSOR: 0x0008 } as const;
export const ALL_GROUPS = 0xffff;
export const interactionGroups = (membership: number, filter: number): number => (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
