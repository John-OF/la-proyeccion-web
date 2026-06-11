import Phaser from 'phaser';
import { SeedInventory } from '../systems/SeedInventory';

// Indicador de inventario de Semillas (GDD §7: UI mínima, no permanente):
// una mini-semilla por unidad llevada, en la esquina superior izquierda.
// Aparece solo al llevar al menos una; sin semillas no hay HUD.
export class SeedIndicator {
  private readonly scene: Phaser.Scene;
  private readonly icons: Phaser.GameObjects.Arc[] = [];

  constructor(scene: Phaser.Scene, inventory: SeedInventory) {
    this.scene = scene;
    inventory.on(SeedInventory.EVENT_CHANGED, (count: number) => this.refresh(count));
    this.refresh(inventory.seeds);
  }

  private refresh(count: number): void {
    for (const icon of this.icons) {
      icon.destroy();
    }
    this.icons.length = 0;
    for (let i = 0; i < count; i++) {
      const icon = this.scene.add
        .circle(10 + i * 10, 18, 3, 0x9fe8c8, 0.9)
        .setScrollFactor(0)
        .setDepth(940);
      this.scene.tweens.add({
        targets: icon,
        alpha: { from: 0.55, to: 0.95 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.icons.push(icon);
    }
  }
}
