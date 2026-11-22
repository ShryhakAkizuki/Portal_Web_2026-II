import {
  AUDIO,
  AUDIO_GAIN,
  AUDIO_GAIN_DOOR,
  AUDIO_GAIN_IMPACT,
  AUDIO_GAIN_RELEASE,
  AUDIO_PITCH_VARIATION,
  HOLD_HUM,
  JUMP_PITCH,
  LAND_PITCH,
  PROP_IMPACT,
} from '../config';
import type { IEventBus } from '../types/contracts';

/**
 * Fachada de audio sobre la Web Audio API (sin librerías externas, como pide el
 * plan). Carga clips a `AudioBuffer`, reproduce "one-shots" con ganancia y
 * variación de tono, y mantiene un bucle para el "campo de contención" del cubo
 * mientras se sostiene. Se suscribe al bus para los sonidos de gameplay.
 *
 * Política de autoplay: los navegadores suspenden el `AudioContext` hasta que
 * hay un gesto del usuario; `unlock()` lo reanuda y debe llamarse desde un
 * handler de clic/tecla (ya lo hace el enganche de Pointer Lock).
 */
export class AudioSystem {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly offBus: Array<() => void> = [];
  private ready = false;

  // Nodos del bucle del cubo sostenido (con fade in/out).
  private holdSource: AudioBufferSourceNode | null = null;
  private holdGain: GainNode | null = null;

  constructor(private readonly bus: IEventBus) {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = AUDIO_GAIN.master;
    this.master.connect(this.ctx.destination);
  }

  /** Carga/decodifica todos los clips y suscribe el bus. Idempotente. */
  async load(): Promise<void> {
    const urls = [
      AUDIO.laser,
      ...AUDIO.footsteps,
      ...AUDIO.cubeImpacts,
      AUDIO.doorOpen,
      AUDIO.doorClose,
      AUDIO.cubeHold,
    ];
    await Promise.all(urls.map((url) => this.acquire(url)));
    this.ready = true;
    this.subscribe();
  }

  /** Reanuda el contexto tras un gesto del usuario (política de autoplay). */
  unlock(): void {
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** Láser (disparo de portal) con tono aleatorio. */
  playLaser(): void {
    this.playOneShot(AUDIO.laser, AUDIO_GAIN.laser);
  }

  /** Paso al azar del set, con tono aleatorio (evita monotonía). */
  playFootstep(): void {
    this.playOneShot(this.randomFootstep(), AUDIO_GAIN.footstep);
  }

  /** Salto: paso de concreto con tono más agudo y corto. */
  playJump(): void {
    this.playOneShot(this.randomFootstep(), AUDIO_GAIN.jump, JUMP_PITCH);
  }

  /**
   * Aterrizaje: paso de concreto grave y contundente. `strength` (0..1) escala
   * el volumen según la fuerza de la caída.
   */
  playLand(strength = 1): void {
    const gain = AUDIO_GAIN.land * Math.min(1, Math.max(0.3, strength));
    this.playOneShot(this.randomFootstep(), gain, LAND_PITCH);
  }

  /**
   * Golpe/rebote del cubo contra el mundo. `strength` (0..1), derivada de la
   * velocidad del impacto (y por tanto de la altura de caída), modula tanto el
   * volumen como el tono: suave = agudo/leve, fuerte = grave/contundente.
   */
  playImpact(strength = 1): void {
    const s = Math.min(1, Math.max(0, strength));
    const gain = AUDIO_GAIN_IMPACT * (0.3 + 0.7 * s);
    const pitch = PROP_IMPACT.pitchSoft + (PROP_IMPACT.pitchHard - PROP_IMPACT.pitchSoft) * s;
    this.playOneShot(this.randomCubeImpact(), gain, pitch);
  }

  /** "Clack" corto al soltar el cubo (impacto leve, tono neutro). */
  playRelease(): void {
    this.playOneShot(this.randomCubeImpact(), AUDIO_GAIN_RELEASE, 1.05);
  }

  /** Puerta abriéndose (`open=true`) o cerrándose (`open=false`). */
  playDoor(open: boolean): void {
    this.playOneShot(open ? AUDIO.doorOpen : AUDIO.doorClose, AUDIO_GAIN_DOOR);
  }

  /** Inicia el bucle del campo de contención (cubo agarrado), con fade in. */
  startHold(): void {
    const buffer = this.buffers.get(AUDIO.cubeHold);
    if (!this.ready || buffer === undefined || this.holdSource !== null) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(AUDIO_GAIN.hold, this.ctx.currentTime + HOLD_HUM.fadeIn);

    src.connect(gain).connect(this.master);
    src.start();
    this.holdSource = src;
    this.holdGain = gain;
  }

  /** Detiene el zumbido del campo de contención (cubo soltado), con fade out. */
  stopHold(): void {
    if (this.holdSource === null || this.holdGain === null) {
      return;
    }
    const src = this.holdSource;
    const gain = this.holdGain;
    this.holdSource = null;
    this.holdGain = null;
    const end = this.ctx.currentTime + HOLD_HUM.fadeOut;
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, end);
    src.stop(end + 0.02);
  }

  dispose(): void {
    for (const off of this.offBus) {
      off();
    }
    this.offBus.length = 0;
    this.stopHold();
    void this.ctx.close();
  }

  private subscribe(): void {
    this.offBus.push(this.bus.on('gun:fired', () => this.playLaser()));
    this.offBus.push(this.bus.on('prop:grabbed', () => this.startHold()));
    this.offBus.push(
      this.bus.on('prop:released', () => {
        this.stopHold();
        this.playRelease();
      }),
    );
    this.offBus.push(this.bus.on('prop:impact', (d) => this.playImpact(d.strength)));
    this.offBus.push(this.bus.on('door:changed', (d) => this.playDoor(d.open)));
  }

  private randomFootstep(): string {
    const list = AUDIO.footsteps;
    return list[Math.floor(Math.random() * list.length)];
  }

  private randomCubeImpact(): string {
    const list = AUDIO.cubeImpacts;
    return list[Math.floor(Math.random() * list.length)];
  }

  private playOneShot(url: string, gain: number, pitch = 1): void {
    if (!this.ready) {
      return;
    }
    const buffer = this.buffers.get(url);
    if (buffer === undefined) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * AUDIO_PITCH_VARIATION);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start();
  }

  private async acquire(url: string): Promise<void> {
    if (this.buffers.has(url)) {
      return;
    }
    const res = await fetch(import.meta.env.BASE_URL + url);
    if (!res.ok) {
      throw new Error(`Audio no encontrado: ${url} (${res.status})`);
    }
    const data = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.buffers.set(url, buffer);
  }
}
