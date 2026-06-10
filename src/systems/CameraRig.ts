import Phaser from 'phaser';
import {
  CAMERA_LERP,
  CAMERA_DEADZONE_WIDTH,
  CAMERA_DEADZONE_HEIGHT,
  CAMERA_LOOKAHEAD,
  CAMERA_LOOKAHEAD_SMOOTHING,
} from '../config/constants';
import type { PlayerController } from '../entities/PlayerController';
import type { DualTilemap } from './DualTilemap';

// Cámara lateral (equivalente web del Cinemachine de la versión Unity):
// seguimiento interpolado con deadzone, lookahead horizontal leve en la
// dirección de movimiento y límites tomados del mapa. roundPixels evita el
// shimmering de píxeles al desplazarse.
export class CameraRig {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly player: PlayerController;
  private lookahead = 0;

  constructor(scene: Phaser.Scene, player: PlayerController, dualMap: DualTilemap) {
    this.player = player;
    this.camera = scene.cameras.main;
    this.camera.setBounds(0, 0, dualMap.widthInPixels, dualMap.heightInPixels);
    this.camera.setRoundPixels(true);
    // startFollow centra de inmediato; el lerp gobierna el seguimiento posterior
    this.camera.startFollow(player.gameObject, true, CAMERA_LERP, CAMERA_LERP);
    this.camera.setDeadzone(CAMERA_DEADZONE_WIDTH, CAMERA_DEADZONE_HEIGHT);
  }

  /** Llamar una vez por frame: suaviza el lookahead según la dirección de movimiento. */
  update(deltaSeconds: number): void {
    const vx = this.player.body.velocity.x;
    const desired = Math.abs(vx) > 1 ? Math.sign(vx) * CAMERA_LOOKAHEAD : 0;
    const t = Math.min(1, CAMERA_LOOKAHEAD_SMOOTHING * deltaSeconds);
    this.lookahead += (desired - this.lookahead) * t;
    // followOffset se resta de la posición del objetivo: el offset negativo
    // desplaza la vista hacia delante en la dirección del movimiento
    this.camera.setFollowOffset(-this.lookahead, 0);
  }
}
