import Phaser from 'phaser';

// Escena de arranque: carga los assets antes de entrar al juego.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('tileset', 'assets/sprites/tileset.png');
    this.load.tilemapTiledJSON('test-dual', 'assets/maps/test-dual.json');
  }

  create(): void {
    this.scene.start('PlayScene');
  }
}
