import Phaser from 'phaser';
import { WORLD_SWITCH_COOLDOWN } from '../config/constants';

/** Identificador de mundo (GDD §3.1). La capa COMMON no es un mundo: existe siempre. */
export type WorldId = 'SIM' | 'REAL';

/** Motivo por el que un cambio de mundo fue rechazado. */
export type SwitchDenyReason = 'cooldown' | 'locked';

// Estado central del cambio de mundo (GDD §3.1): mundo activo, cooldown de
// 0.4 s y bloqueo narrativo (el cambio empieza bloqueado y se desbloquea al
// final de la Zona 0; en Z5 vuelve a bloquearse como castigo).
//
// No aplica efectos por sí mismo: emite eventos y los consumidores (capas,
// tinte, audio, SafePush…) reaccionan.
//   EVENT_CHANGED → (world: WorldId)            el cambio se ejecutó
//   EVENT_DENIED  → (reason: SwitchDenyReason)  el cambio fue rechazado
export class WorldManager extends Phaser.Events.EventEmitter {
  static readonly EVENT_CHANGED = 'world-changed';
  static readonly EVENT_DENIED = 'switch-denied';

  private active: WorldId = 'SIM';
  private cooldownRemaining = 0;
  private locked = false;

  get activeWorld(): WorldId {
    return this.active;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get cooldownSeconds(): number {
    return this.cooldownRemaining;
  }

  /** Activa/desactiva el bloqueo narrativo del cambio. */
  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  /** Intenta alternar el mundo. Devuelve true si el cambio se ejecutó. */
  requestSwitch(): boolean {
    if (this.locked) {
      this.emit(WorldManager.EVENT_DENIED, 'locked' satisfies SwitchDenyReason);
      return false;
    }
    if (this.cooldownRemaining > 0) {
      this.emit(WorldManager.EVENT_DENIED, 'cooldown' satisfies SwitchDenyReason);
      return false;
    }
    this.active = this.active === 'SIM' ? 'REAL' : 'SIM';
    this.cooldownRemaining = WORLD_SWITCH_COOLDOWN;
    this.emit(WorldManager.EVENT_CHANGED, this.active);
    return true;
  }

  /** Avanza el cooldown; llamar una vez por frame. */
  update(deltaSeconds: number): void {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaSeconds);
  }
}
