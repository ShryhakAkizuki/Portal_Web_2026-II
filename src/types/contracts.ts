import type { RigidBody, Collider } from '@dimforge/rapier3d-compat';
import type { Object3D, PerspectiveCamera, Scene as ThreeScene, Texture, WebGLRenderer, WebGLRenderTarget, Matrix4 } from 'three';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type PortalColor = 'blue' | 'orange';

// ---------- Eventos ----------
export type GameEvents = {
  'gun:fired':       { color: PortalColor; placed: boolean };
  'portal:placed':   { color: PortalColor };
  'portal:crossed':  { entityId: string; entering: PortalColor };
  'button:pressed':  { id: string };
  'button:released': { id: string };
  'door:changed':    { id: string; open: boolean };
  'prop:grabbed':    { id: string };
  'prop:released':   { id: string };
  'prop:impact':     { id: string; strength: number };
  'level:completed': { levelId: string };
};
export interface IEventBus<E extends Record<string, unknown> = GameEvents> {
  on<K extends keyof E>(type: K, fn: (data: E[K]) => void): () => void;
  off<K extends keyof E>(type: K, fn: (data: E[K]) => void): void;
  emit<K extends keyof E>(type: K, data: E[K]): void;
  listenerCount(type?: keyof E): number;
  clear(): void;
}

// ---------- Núcleo ----------
export interface Scene { enter(): void | Promise<void>; update(dt: number): void; render(alpha: number): void; exit(): void }
export interface ISceneManager {
  readonly current: Scene | null;
  change(next: Scene): Promise<void>;
  update(dt: number): void;
  render(alpha: number): void;
}
export interface IGame {
  paused: boolean;
  advance(frameTime: number): { steps: number; alpha: number };
  start(): void;
  stop(): void;
}
export interface AssetManifest { textures?: Record<string, string>; models?: Record<string, string> }
export interface IAssetLoader {
  load(manifest: AssetManifest, onProgress?: (loaded: number, total: number) => void): Promise<void>;
  texture(key: string): Texture;
  model(key: string): Object3D;
  has(key: string): boolean;
  dispose(): void;
}

// ---------- Input ----------
export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'interact' | 'firePrimary' | 'fireSecondary' | 'pause';
export interface IInput {
  isDown(a: Action): boolean;
  wasPressed(a: Action): boolean;
  getMoveAxis(): { x: number; y: number };
  consumeLook(): { dx: number; dy: number };
  readonly isLocked: boolean;
  lockPointer(): void;
  endStep(): void;
  dispose(): void;
}

// ---------- Física ----------
export interface BodyUserData { entityId?: string; kind?: 'world' | 'player' | 'prop' | 'sensor' | 'door'; portalable?: boolean; surfaceId?: string }
export type ShapeDesc =
  | { kind: 'box'; halfExtents: Vec3 }
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'ball'; radius: number };
export interface BodyDesc {
  type: 'fixed' | 'dynamic' | 'kinematic';
  position: Vec3; rotation?: Quat; shape: ShapeDesc;
  sensor?: boolean; groups?: number; friction?: number; restitution?: number; density?: number; ccd?: boolean;
  userData?: BodyUserData;
}
export interface PhysicsBody { readonly rb: RigidBody; readonly collider: Collider; readonly userData: BodyUserData }
export interface RayHit { point: Vec3; normal: Vec3; distance: number; body: PhysicsBody | null; userData: BodyUserData }
export interface IPhysicsWorld {
  step(dt: number): void;
  createBody(desc: BodyDesc): PhysicsBody;
  removeBody(body: PhysicsBody): void;
  bodyCount(): number;
  raycast(origin: Vec3, dir: Vec3, maxDist: number, opts?: { excludeBody?: PhysicsBody }): RayHit | null;
  moveCharacter(body: PhysicsBody, desired: Vec3, dt: number): { movement: Vec3; grounded: boolean };
  moveKinematic(body: PhysicsBody, position: Vec3): void;
  getPose(body: PhysicsBody): { position: Vec3; rotation: Quat };
  setPose(body: PhysicsBody, position: Vec3, rotation?: Quat): void;
  getVelocity(body: PhysicsBody): { linear: Vec3; angular: Vec3 };
  setVelocity(body: PhysicsBody, linear: Vec3, angular?: Vec3): void;
  setGravityScale(body: PhysicsBody, scale: number): void;
  getBoxBounds(body: PhysicsBody): { min: Vec3; max: Vec3 } | null;
  queryOverlaps(sensor: PhysicsBody): PhysicsBody[];
  setBodyEnabled(body: PhysicsBody, enabled: boolean): void;
  isDynamic(body: PhysicsBody): boolean; // T27: true si el cuerpo es dinámico
}

// ---------- Render ----------
export interface IRenderer {
  readonly gl: WebGLRenderer;
  readonly scene: ThreeScene;
  readonly camera: PerspectiveCamera;
  resize(width: number, height: number): void;
  render(): void;
  renderTo(target: WebGLRenderTarget, camera: PerspectiveCamera): void;
  dispose(): void;
}

// ---------- Entidades ----------
export interface Entity {
  readonly id: string;
  readonly kind: string;
  readonly canCross?: boolean;
  body?: PhysicsBody;
  mesh?: Object3D;
  captureState(): void;
  preStep?(dt: number): void;
  update(dt: number): void;
  syncMesh(alpha: number): void;
  resetInterpolation(): void;
  onTeleport?(T: Matrix4): void;
  dispose(): void;
}
export interface IPlayer extends Entity {
  yaw: number; pitch: number;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  readonly eyePosition: Vec3;
  look(dx: number, dy: number): void;
  lookDirection(): Vec3;
}
export interface IProp extends Entity { readonly held: boolean; grab(by: IPlayer): void; release(): void }

// ---------- Portales ----------
export interface PortalState {
  color: PortalColor; position: Vec3; normal: Vec3; up: Vec3; right: Vec3;
  hostBody: PhysicsBody | null; surfaceId?: string;
}
export interface IPortalSystem {
  place(color: PortalColor, hit: RayHit, viewDir: Vec3): boolean;
  remove(color: PortalColor): void;
  get(color: PortalColor): PortalState | null;
  isLinked(): boolean;
  track(e: Entity): void; untrack(e: Entity): void;
  update(dt: number): void;
  renderViews(renderer: IRenderer, camera: PerspectiveCamera): void;
  dispose(): void;
}

// ---------- Niveles ----------
export interface BoxDef { id?: string; position: Vec3; size: Vec3; portalable: boolean; color?: string }
export interface CubeDef   { type: 'cube';   id: string; position: Vec3 }
export interface ButtonDef { type: 'button'; id: string; position: Vec3 }
export interface DoorDef   { type: 'door';   id: string; position: Vec3; size: Vec3; opensOn: string[]; mode?: 'all' | 'any' }
export interface ExitDef   { type: 'exit';   id: string; position: Vec3; size: Vec3 }
export type EntityDef = CubeDef | ButtonDef | DoorDef | ExitDef;
export interface LevelData {
  id: string; name: string;
  spawn: { position: Vec3; yaw: number };
  geometry: BoxDef[];
  entities: EntityDef[];
}
export interface LevelDeps { physics: IPhysicsWorld; renderer: IRenderer; bus: IEventBus; input: IInput; portals?: IPortalSystem }
export interface Controller { update(dt: number): void; dispose?(): void }
export interface ILevel extends Scene {
  readonly entities: readonly Entity[];
  load(data: LevelData): void;
  add(e: Entity): void; remove(e: Entity): void;
  addController(c: Controller): void;
  getEntity(id: string): Entity | undefined;
  dispose(): void;
}
export type EntityBuilder = (def: EntityDef, deps: LevelDeps, ctx: { levelId: string }) => Entity;
