import Phaser from 'phaser';

// Overlay de depuración para validar mecánicas. Solo existe en el build de
// desarrollo (import.meta.env.DEV): en producción no se crea ni responde.
// F9 lo muestra/oculta.
export class DebugOverlay {
  private text?: Phaser.GameObjects.Text;
  private shown = false;

  constructor(scene: Phaser.Scene) {
    if (!import.meta.env.DEV) {
      return;
    }
    this.text = scene.add
      .text(4, 16, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#9fd49f',
        backgroundColor: '#000000',
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    const keyboard = scene.input.keyboard!;
    keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.F9); // evita la acción del navegador
    keyboard.on('keydown-F9', () => {
      this.shown = !this.shown;
      this.text!.setVisible(this.shown);
    });
  }

  /** Actualiza el contenido; barato cuando está oculto o en producción. */
  setLines(lines: string[]): void {
    if (this.text && this.shown) {
      this.text.setText(lines.join('\n'));
    }
  }
}
