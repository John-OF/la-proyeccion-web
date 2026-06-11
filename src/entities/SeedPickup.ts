import Phaser from 'phaser';
import { Interactable } from './Interactable';
import type { SeedInventory } from '../systems/SeedInventory';

// La Semilla (GDD §3.2, §7): objeto pequeño y oscuro con luminiscencia tenue
// pulsante — única luz "viva" de ambos mundos; el lenguaje visual del juego:
// lo que brilla se toca. Recogible con interacción; si el inventario está
// lleno, la semilla permanece en el mundo (rechazo sutil, sin mensaje).
export class SeedPickup {
  readonly label: string;
  readonly interactable: Interactable;

  private readonly scene: Phaser.Scene;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly glow: Phaser.GameObjects.Arc;
  private collected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, inventory: SeedInventory) {
    this.scene = scene;
    this.label = label;

    // halo aditivo pulsante debajo del núcleo oscuro
    this.glow = scene.add.circle(x, y, 5, 0x9fe8c8, 0.28).setDepth(690);
    this.glow.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.14, to: 0.42 },
      scale: { from: 0.8, to: 1.15 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.core = scene.add.circle(x, y, 2.5, 0x1d2126).setDepth(700);
    this.core.setStrokeStyle(1, 0x3d4a44);

    this.interactable = new Interactable({
      x,
      y,
      label,
      onUse: () => this.tryCollect(inventory),
    });
  }

  get isCollected(): boolean {
    return this.collected;
  }

  /** Para WorldPresence (F4.P3): ausente no se ve ni se puede recoger. */
  setPresent(present: boolean): void {
    if (this.collected) {
      return; // ya tomada: no reaparece ni al morir ni al cambiar de mundo (GDD §3.2)
    }
    this.core.setVisible(present);
    this.glow.setVisible(present);
    this.interactable.enabled = present;
  }

  private tryCollect(inventory: SeedInventory): void {
    if (!inventory.tryAdd()) {
      // inventario lleno: la semilla queda; rechazo sutil, sin mensaje (GDD §3.2)
      this.scene.tweens.add({
        targets: [this.core, this.glow],
        x: '+=2',
        duration: 40,
        yoyo: true,
        repeat: 2,
      });
      return;
    }
    this.collected = true;
    this.interactable.enabled = false;
    // la semilla se apaga y asciende levemente al ser tomada
    this.scene.tweens.add({
      targets: [this.core, this.glow],
      alpha: 0,
      y: '-=6',
      duration: 220,
      onComplete: () => {
        this.core.destroy();
        this.glow.destroy();
      },
    });
  }
}
