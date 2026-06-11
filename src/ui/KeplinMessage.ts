import Phaser from 'phaser';
import {
  GAME_WIDTH,
  KEPLIN_FADE_IN,
  KEPLIN_HOLD_DEFAULT,
  KEPLIN_FADE_OUT,
} from '../config/constants';
import { corruptText, type CorruptionLevel } from './textCorruption';

/** Opciones de un mensaje encolado. */
export interface KeplinMessageOptions {
  /** Segundos sostenido en pantalla (default KEPLIN_HOLD_DEFAULT). */
  holdSeconds?: number;
  /** Fuerza un nivel de corrupción para este mensaje (default: el nivel actual del sistema). */
  corruption?: CorruptionLevel;
}

// El canal de Keplin (GDD §6.3): sin cuerpo ni voz, existe como texto en
// pantalla. Mensajes encolables por eventos — si llega uno mientras otro está
// visible, espera su turno (Keplin nunca se pisa a sí mismo: habla con la
// calma de quien tiene el control). El nivel de corrupción del sistema
// (termómetro narrativo, GDD §6.4) se aplica al render salvo override.
export class KeplinMessage {
  private readonly scene: Phaser.Scene;
  private readonly queue: Array<{ text: string; holdSeconds: number; corruption?: CorruptionLevel }> =
    [];
  private current: Phaser.GameObjects.Text | null = null;
  private level: CorruptionLevel = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Nivel de corrupción del sistema (lo fija la zona; GDD §6.4). */
  setCorruptionLevel(level: CorruptionLevel): void {
    this.level = level;
  }

  get corruptionLevel(): CorruptionLevel {
    return this.level;
  }

  /** Encola un mensaje; se muestra ya si no hay otro en pantalla. */
  enqueue(text: string, options?: KeplinMessageOptions): void {
    this.queue.push({
      text,
      holdSeconds: options?.holdSeconds ?? KEPLIN_HOLD_DEFAULT,
      corruption: options?.corruption,
    });
    if (!this.current) {
      this.showNext();
    }
  }

  private showNext(): void {
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    // el nivel se resuelve al MOSTRAR, no al encolar: si la zona cambió
    // mientras esperaba en cola, el mensaje habla con la voz actual
    const rendered = corruptText(next.text, next.corruption ?? this.level);
    const message = this.scene.add
      .text(GAME_WIDTH / 2, 36, rendered, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#cfe8ef',
        backgroundColor: '#0a0e14',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(950)
      .setAlpha(0);
    this.current = message;

    this.scene.tweens.add({
      targets: message,
      alpha: 1,
      duration: KEPLIN_FADE_IN * 1000,
    });
    this.scene.tweens.add({
      targets: message,
      alpha: 0,
      delay: (KEPLIN_FADE_IN + next.holdSeconds) * 1000,
      duration: KEPLIN_FADE_OUT * 1000,
      onComplete: () => {
        message.destroy();
        this.current = null;
        this.showNext();
      },
    });
  }
}
