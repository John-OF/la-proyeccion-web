// La Proyección — prototipo web. Punto de entrada: configuración del motor.
//
// Pixel art nítido: pixelArt + roundPixels evitan el antialiasing borroso;
// la escala FIT mantiene la relación de aspecto con el lienzo centrado.
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY_Y } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { PlayScene } from './scenes/PlayScene';
import { RadialGlitchPostFX } from './systems/RadialGlitchPostFX';
import { RadarRevealPostFX } from './systems/RadarRevealPostFX';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0a0e14',
  pixelArt: true,
  roundPixels: true,
  // Los PostFX propios DEBEN registrarse aquí: setPostPipeline(Clase) ignora
  // EN SILENCIO las clases no registradas en el PipelineManager (Phaser 3.9x).
  // El cast es necesario: los typings declaran (config) pero el boot del
  // PipelineManager construye con (game) en runtime.
  pipeline: {
    RadialGlitchPostFX,
    RadarRevealPostFX,
  } as unknown as Phaser.Types.Core.PipelineConfig,
  input: {
    gamepad: true, // GDD §3.3: soporte completo de teclado y mando
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
    },
  },
  scene: [BootScene, PlayScene],
});
