import Phaser from 'phaser';

// Prompt de interacción (GDD §7: UI mínima y diegética, solo por proximidad).
// Un grano de luz pulsante sobre el interactuable — sigue el lenguaje visual
// del juego: "lo que brilla se toca". Agnóstico de dispositivo (no muestra
// tecla: el mapeo es único y se aprende en el primer uso).
export class InteractPrompt {
  private static readonly TEXTURE_KEY = 'interact-prompt';

  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    InteractPrompt.ensureTexture(scene);
    this.image = scene.add
      .image(0, 0, InteractPrompt.TEXTURE_KEY)
      .setDepth(850)
      .setVisible(false);
    // pulso suave: presencia visible sin robar atención (Pilar 3)
    scene.tweens.add({
      targets: this.image,
      alpha: { from: 0.45, to: 1 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
  }

  /** Muestra el prompt en una posición del mundo. */
  show(x: number, y: number): void {
    this.image.setPosition(x, y).setVisible(true);
  }

  hide(): void {
    this.image.setVisible(false);
  }

  /** Rombo de luz de 7×7 px dibujado por filas: nítido, sin antialiasing. */
  private static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(InteractPrompt.TEXTURE_KEY)) {
      return;
    }
    const gfx = scene.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0xe8f6f6, 1);
    const rows: Array<[number, number]> = [
      [3, 1],
      [2, 3],
      [1, 5],
      [0, 7],
      [1, 5],
      [2, 3],
      [3, 1],
    ];
    rows.forEach(([start, width], row) => gfx.fillRect(start, row, width, 1));
    gfx.generateTexture(InteractPrompt.TEXTURE_KEY, 7, 7);
    gfx.destroy();
  }
}
