import { FOOTSTEP_INTERVAL, FOOTSTEP_MIN_SPEED, LAND_MIN_FALL_SPEED } from '../config';
import type { Controller, IPlayer } from '../types/contracts';

export interface LocomotionAudio {
  playFootstep(): void;
  playJump(): void;
  playLand(strength?: number): void;
}

export interface FootstepDeps {
  player: IPlayer;
  audio: LocomotionAudio;
}

/**
 * Sonido de locomoción del jugador, derivado de su estado (sin tocar la firma
 * del Player ni añadirle el bus):
 *   - Pasos: cadencia fija mientras camina en el suelo; cada paso elige un clip
 *     aleatorio (lo decide el AudioSystem).
 *   - Salto: transición suelo → aire con velocidad vertical hacia arriba.
 *   - Aterrizaje: transición aire → suelo; el volumen escala con la velocidad
 *     de caída previa (ignora caídas suaves, p. ej. bajar un escalón).
 */
export class FootstepController implements Controller {
  private readonly player: IPlayer;
  private readonly audio: LocomotionAudio;
  private acc = FOOTSTEP_INTERVAL; // listo para sonar al primer paso
  private prevGrounded = true;
  private fallSpeed = 0; // |velocidad vertical| mientras cae (para el aterrizaje)

  constructor(deps: FootstepDeps) {
    this.player = deps.player;
    this.audio = deps.audio;
  }

  update(dt: number): void {
    const v = this.player.velocity;
    const grounded = this.player.grounded;

    // Recordar la mayor velocidad de caída durante el vuelo.
    if (!grounded && v[1] < 0) {
      this.fallSpeed = Math.max(this.fallSpeed, -v[1]);
    }

    // Transiciones suelo <-> aire.
    if (this.prevGrounded && !grounded && v[1] > 0) {
      this.audio.playJump();
    } else if (!this.prevGrounded && grounded) {
      if (this.fallSpeed >= LAND_MIN_FALL_SPEED) {
        // Normaliza la fuerza (~2..12 m/s) a 0..1 para el volumen.
        const strength = Math.min(1, (this.fallSpeed - LAND_MIN_FALL_SPEED) / 10 + 0.4);
        this.audio.playLand(strength);
      }
      this.fallSpeed = 0;
      this.acc = FOOTSTEP_INTERVAL; // el próximo paso suena al reanudar la marcha
    }
    this.prevGrounded = grounded;

    // Pasos al caminar.
    const horizontalSpeed = Math.hypot(v[0], v[2]);
    const walking = grounded && horizontalSpeed >= FOOTSTEP_MIN_SPEED;
    if (!walking) {
      this.acc = FOOTSTEP_INTERVAL;
      return;
    }
    this.acc += dt;
    if (this.acc >= FOOTSTEP_INTERVAL) {
      this.acc -= FOOTSTEP_INTERVAL;
      this.audio.playFootstep();
    }
  }
}
