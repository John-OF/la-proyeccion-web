import Phaser from 'phaser';
import { Interactable } from './Interactable';

/** Qué hace un switch directo sobre su puerta al ser usado. */
export type SwitchAction = 'open' | 'close' | 'toggle';

/** Lee una acción desde texto de Tiled (default toggle si falta o es inválida). */
export function parseSwitchAction(value: unknown): SwitchAction {
  return value === 'open' || value === 'close' ? value : 'toggle';
}

/** Placeholder visual: palanca (cambia de color con el estado) o marco de puerta. */
export type SwitchVisual = 'lever' | 'door';

export function parseSwitchVisual(value: unknown): SwitchVisual {
  return value === 'door' ? 'door' : 'lever';
}

// Interruptor (equivalente del DualSwitch de Unity): palanca interactuable
// con estado on/off visible. No decide qué provoca: el cableado (acción
// directa sobre una puerta, paso de una secuencia, mensaje de Keplin…) lo
// monta el puzzleLoader desde las propiedades de Tiled, nunca hardcodeado.
export class Switch {
  readonly label: string;
  readonly interactable: Interactable;

  private readonly visual: Phaser.GameObjects.Rectangle;
  private readonly visualKind: SwitchVisual;
  private readonly scene: Phaser.Scene;
  private on = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    visualKind: SwitchVisual,
    onUsed: (self: Switch) => void,
  ) {
    this.scene = scene;
    this.label = label;
    this.visualKind = visualKind;
    this.visual =
      visualKind === 'door'
        ? scene.add.rectangle(x, y - 4, 14, 22, 0x8a98a8).setDepth(700)
        : scene.add.rectangle(x, y, 6, 14, 0x56687c).setDepth(700);
    this.interactable = new Interactable({
      x,
      y,
      label,
      onUse: () => {
        this.blink();
        onUsed(this);
      },
    });
    this.applyStateColor();
  }

  get isOn(): boolean {
    return this.on;
  }

  /** Estado visual on/off; lo gobierna el cableado (directo o secuencia). */
  setOn(on: boolean): void {
    this.on = on;
    this.applyStateColor();
  }

  /** Para WorldPresence: ausente no se ve ni se puede usar. */
  setPresent(present: boolean): void {
    this.visual.setVisible(present);
    this.interactable.enabled = present;
  }

  /** Confirmación visual de uso. */
  private blink(): void {
    this.scene.tweens.add({
      targets: this.visual,
      scaleX: { from: 1.5, to: 1 },
      scaleY: { from: 1.5, to: 1 },
      duration: 120,
    });
  }

  /** El color de estado es de la palanca; el marco de puerta no es un indicador. */
  private applyStateColor(): void {
    if (this.visualKind === 'lever') {
      this.visual.setFillStyle(this.on ? 0x7fe8c8 : 0x56687c);
    }
  }
}
