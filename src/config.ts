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

// Audio. Rutas relativas a public/ (las resuelve el AssetLoader con BASE_URL).
export const AUDIO = {
  laser: 'audio/laser.ogg',
  footsteps: [
    'audio/footstep_concrete_000.ogg',
    'audio/footstep_concrete_001.ogg',
    'audio/footstep_concrete_002.ogg',
    'audio/footstep_concrete_003.ogg',
    'audio/footstep_concrete_004.ogg',
  ],
  cubeImpacts: [
    'audio/impact_cube_000.ogg',
    'audio/impact_cube_001.ogg',
    'audio/impact_cube_002.ogg',
    'audio/impact_cube_003.ogg',
    'audio/impact_cube_004.ogg',
  ],
  doorOpen: 'audio/door_open.ogg',
  doorClose: 'audio/door_close.ogg',
  cubeHold: 'audio/cube_hold_loop.ogg',
} as const;

// Volumen por tipo de sonido (0..1) y variación de tono (pitch) aleatoria.
export const AUDIO_GAIN = {
  master: 0.9,
  laser: 0.6,
  footstep: 0.5,
  jump: 0.45,
  land: 0.7,
  hold: 0.18, // ruido blanco del campo de contención al sostener el cubo
} as const;
export const AUDIO_PITCH_VARIATION = 0.08; // ±8% de velocidad de reproducción

// Salto y aterrizaje reusan un paso de concreto con tono fijo (sin descargas):
// el salto suena más agudo y corto; el aterrizaje, más grave y contundente.
export const JUMP_PITCH = 1.5;
export const LAND_PITCH = 0.7;

// Cadencia de pasos al caminar (segundos entre pisadas) y velocidad mínima
// horizontal para considerar que el jugador se mueve.
export const FOOTSTEP_INTERVAL = 0.45;
export const FOOTSTEP_MIN_SPEED = 0.5;
// Velocidad de caída (m/s, valor absoluto) a partir de la cual el aterrizaje
// suena; por debajo se ignora (bajar un escalón no "golpea").
export const LAND_MIN_FALL_SPEED = 2.0;

// Campo de contención del cubo: loop de un clip (CC0, Kenney) mientras se
// sostiene, con fade in/out para entrar y salir sin "clic".
export const HOLD_HUM = {
  fadeIn: 0.08, // s
  fadeOut: 0.12, // s
} as const;

// Impacto del cubo (golpe/rebote). Se detecta por desaceleración brusca entre
// pasos de física (sin eventos de contacto en la fachada). `minDelta` es el
// cambio de velocidad (m/s) mínimo para que suene; `maxDelta` satura el volumen;
// `cooldown` evita repetir el sonido durante el mismo golpe.
export const PROP_IMPACT = {
  minDelta: 1.8,
  maxDelta: 9,
  cooldown: 0.09, // s
  // El tono se modula con la fuerza: golpe suave = más agudo/leve; golpe fuerte
  // = más grave/contundente.
  pitchSoft: 1.15,
  pitchHard: 0.78,
} as const;
export const AUDIO_GAIN_IMPACT = 0.7; // volumen base del impacto
export const AUDIO_GAIN_RELEASE = 0.4; // "clack" al soltar el cubo
export const AUDIO_GAIN_DOOR = 0.7; // abrir/cerrar puerta
export const GROUPS = { WORLD: 0x0001, PLAYER: 0x0002, PROP: 0x0004, SENSOR: 0x0008 } as const;
export const ALL_GROUPS = 0xffff;
export const interactionGroups = (membership: number, filter: number): number => (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
