import Phaser from 'phaser';

// Inventario de Semillas (GDD §3.2): contador con capacidad configurable por
// mapa — default 1; Zona 4 lo amplía a 2 (GDD §4). Lleno, no se puede recoger
// otra: la semilla queda en el mundo. Emite EVENT_CHANGED para el indicador.
export class SeedInventory extends Phaser.Events.EventEmitter {
  static readonly EVENT_CHANGED = 'seeds-changed';

  private count = 0;
  private cap: number;

  constructor(capacity: number) {
    super();
    this.cap = Math.max(1, capacity);
  }

  get seeds(): number {
    return this.count;
  }

  get capacity(): number {
    return this.cap;
  }

  get isFull(): boolean {
    return this.count >= this.cap;
  }

  /** Intenta añadir una semilla; false si el inventario está lleno. */
  tryAdd(): boolean {
    if (this.isFull) {
      return false;
    }
    this.count++;
    this.emit(SeedInventory.EVENT_CHANGED, this.count);
    return true;
  }

  /** Consume una semilla (el pulso del radar); false si no hay ninguna. */
  tryConsume(): boolean {
    if (this.count === 0) {
      return false;
    }
    this.count--;
    this.emit(SeedInventory.EVENT_CHANGED, this.count);
    return true;
  }

  /** Herramienta de calibración/debug: en juego la capacidad la fija el mapa. */
  setCapacity(capacity: number): void {
    this.cap = Math.max(1, capacity);
    if (this.count > this.cap) {
      this.count = this.cap;
    }
    this.emit(SeedInventory.EVENT_CHANGED, this.count);
  }
}
