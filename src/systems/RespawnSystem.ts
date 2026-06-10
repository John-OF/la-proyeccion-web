import Phaser from 'phaser';
import { PLAYER_SIZE, DEATH_FADE_OUT, DEATH_FADE_IN, FALL_DEATH_MARGIN } from '../config/constants';
import type { PlayerController } from '../entities/PlayerController';
import type { DualTilemap } from './DualTilemap';

interface CheckpointZone {
  rect: Phaser.Geom.Rectangle;
  marker?: Phaser.GameObjects.Rectangle;
}

// Muerte y checkpoints (GDD §3.5): la muerte es barata — fundido rápido,
// reaparición en el último checkpoint, sin pantalla de derrota ni contador.
// El estado del mundo activo NO se toca al morir. El control vuelve nada más
// recolocar al jugador (el fundido de entrada es cosmético).
//
// kill() es público: lo usarán SafePush (F2.P6) y los peligros de puzzle.
export class RespawnSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: PlayerController;
  private readonly checkpoints: CheckpointZone[] = [];
  private readonly killZones: Phaser.Geom.Rectangle[] = [];
  private readonly respawnPoint: Phaser.Math.Vector2;
  private readonly fallLimitY: number;
  private respawning = false;
  private activeIndex = -1;

  constructor(scene: Phaser.Scene, player: PlayerController, dualMap: DualTilemap) {
    this.scene = scene;
    this.player = player;
    this.fallLimitY = dualMap.heightInPixels + FALL_DEATH_MARGIN;

    // El punto inicial de respawn es el spawn del mapa (hasta tocar un checkpoint)
    const spawn = dualMap.objectsOfType('spawn')[0];
    this.respawnPoint = new Phaser.Math.Vector2(spawn?.x ?? 40, spawn?.y ?? 0);

    for (const obj of dualMap.objectsOfType('checkpoint')) {
      const rect = new Phaser.Geom.Rectangle(obj.x ?? 0, obj.y ?? 0, obj.width ?? 16, obj.height ?? 16);
      let marker: Phaser.GameObjects.Rectangle | undefined;
      if (import.meta.env.DEV) {
        // visual de depuración: en el juego real los checkpoints son invisibles
        marker = scene.add
          .rectangle(rect.centerX, rect.centerY, rect.width, rect.height, 0x4fc3dd, 0.12)
          .setDepth(5);
      }
      this.checkpoints.push({ rect, marker });
    }

    for (const obj of dualMap.objectsOfType('kill')) {
      this.killZones.push(
        new Phaser.Geom.Rectangle(obj.x ?? 0, obj.y ?? 0, obj.width ?? 16, obj.height ?? 16),
      );
    }
  }

  /** Punto de aparición inicial (objeto 'spawn' del mapa). */
  get spawnPoint(): Phaser.Math.Vector2 {
    return this.respawnPoint.clone();
  }

  /** Hay una muerte en curso (fundido): la escena congela la intención del jugador. */
  get isRespawning(): boolean {
    return this.respawning;
  }

  get activeCheckpointLabel(): string {
    return this.activeIndex >= 0 ? `${this.activeIndex + 1}/${this.checkpoints.length}` : `spawn`;
  }

  /** Llamar una vez por frame: activa checkpoints tocados y detecta muertes. */
  update(): void {
    if (this.respawning) {
      return;
    }
    const bounds = this.player.gameObject.getBounds();

    this.checkpoints.forEach((cp, index) => {
      if (index !== this.activeIndex && Phaser.Geom.Intersects.RectangleToRectangle(bounds, cp.rect)) {
        this.setActiveCheckpoint(index);
      }
    });

    const fellOut = this.player.body.center.y > this.fallLimitY;
    const inKillZone = this.killZones.some((zone) =>
      Phaser.Geom.Intersects.RectangleToRectangle(bounds, zone),
    );
    if (fellOut || inKillZone) {
      this.kill();
    }
  }

  /** Mata al jugador: fundido de salida, respawn en el último checkpoint, fundido de entrada. */
  kill(): void {
    if (this.respawning) {
      return;
    }
    this.respawning = true;
    const camera = this.scene.cameras.main;
    camera.fadeOut(DEATH_FADE_OUT * 1000, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.teleport(this.respawnPoint.x, this.respawnPoint.y);
      // recolocar la cámara bajo el fundido: sin paneo visible hasta el checkpoint
      camera.centerOn(this.respawnPoint.x, this.respawnPoint.y);
      camera.fadeIn(DEATH_FADE_IN * 1000, 0, 0, 0);
      this.respawning = false; // control inmediato: el fade de entrada es cosmético
    });
  }

  private setActiveCheckpoint(index: number): void {
    this.activeIndex = index;
    const cp = this.checkpoints[index];
    // respawn de pie sobre la base del checkpoint
    this.respawnPoint.set(cp.rect.centerX, cp.rect.bottom - PLAYER_SIZE / 2);
    this.checkpoints.forEach((zone, i) => {
      zone.marker?.setFillStyle(0x4fc3dd, i === index ? 0.35 : 0.12);
    });
  }
}
