import Phaser from 'phaser';

// Puerta (equivalente del Gate de Unity): bloque sólido que se abre/cierra
// por eventos de uno o varios switches. Visual provisional (arte en F5):
// cerrada = bloque opaco; abierta = marco fantasma sin colisión, para que
// siempre se LEA dónde está la puerta (Pilar 3).
//
// Nota de diseño: cerrar una puerta sobre el jugador no se contempla — los
// puzzles de contenido lo evitan por layout (los switches nunca quedan en el
// hueco de la propia puerta).
export class Gate {
  readonly label: string;
  readonly gameObject: Phaser.GameObjects.Rectangle;

  private readonly body: Phaser.Physics.Arcade.StaticBody;
  private opened = false;
  private present = true;

  /** x,y = esquina superior izquierda del rect de Tiled. */
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, label: string) {
    this.label = label;
    this.gameObject = scene.add
      .rectangle(x + width / 2, y + height / 2, width, height, 0xb8c4d0)
      .setDepth(600);
    scene.physics.add.existing(this.gameObject, true);
    this.body = this.gameObject.body as Phaser.Physics.Arcade.StaticBody;
    this.refresh();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  setOpen(open: boolean): void {
    this.opened = open;
    this.refresh();
  }

  toggle(): void {
    this.setOpen(!this.opened);
  }

  /** Para WorldPresence: una puerta ausente ni se ve ni colisiona. */
  setPresent(present: boolean): void {
    this.present = present;
    this.refresh();
  }

  /** Compone presencia y estado: colisiona solo si está presente Y cerrada. */
  private refresh(): void {
    this.gameObject.setVisible(this.present);
    this.gameObject.setAlpha(this.opened ? 0.15 : 1);
    this.body.enable = this.present && !this.opened;
  }
}
