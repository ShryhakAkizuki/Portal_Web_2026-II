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

// Capas de render (three.js Layers). La capa 0 es la escena normal, visible
// por todas las cámaras. Separamos dos casos especiales:
//  - VIEWMODEL: la pistola en primera persona. Solo la cámara principal la ve;
//    las cámaras virtuales de los portales NO (no quieres ver tu arma dentro
//    del portal).
//  - AVATAR: el cuerpo del jugador. La cámara principal NO lo ve (estás en
//    primera persona), pero las cámaras de portal SÍ (así te ves a ti mismo al
//    mirar por un portal).
export const LAYER_DEFAULT = 0;
export const LAYER_VIEWMODEL = 1;
export const LAYER_AVATAR = 2;

// Viewmodel de la pistola de portales (modelo procedural anclado a la cámara).
export const PORTAL_GUN_VIEWMODEL = {
  // Offset respecto al ojo (cámara): derecha, abajo, delante (−Z = hacia donde mira).
  offset: [0.28, -0.26, -0.55] as const,
  scale: 0.5,
  // Retroceso al disparar: distancia que retrocede en Z y velocidad de recuperación.
  recoilKick: 0.08,
  recoilRecover: 12,
} as const;

// Paleta de la pistola de portales. Punto único para ajustar colores del modelo.
// Los materiales son MeshStandardMaterial (PBR): color base + rugosidad/metal.
export const PORTAL_GUN_COLORS = {
  shell: 0xe9edf2, // carcasa exterior clara (estilo "Aperture")
  shellAccent: 0xced6df, // bisel/panel secundario
  core: 0x20242c, // chasis/estructura oscura
  grip: 0x15171d, // empuñadura
  metal: 0x9aa3af, // piezas metálicas (cañón, tornillos)
  // Color neutro de los anillos/emisor cuando aún no se ha disparado.
  neutral: 0x8fa0b5,
} as const;

// Colores de feedback del emisor/anillos según el último portal disparado.
export const PORTAL_COLORS: Record<'blue' | 'orange', number> = {
  blue: 0x3aa0ff,
  orange: 0xff8a2a,
} as const;
export const GROUPS = { WORLD: 0x0001, PLAYER: 0x0002, PROP: 0x0004, SENSOR: 0x0008 } as const;
export const ALL_GROUPS = 0xffff;
export const interactionGroups = (membership: number, filter: number): number => (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
