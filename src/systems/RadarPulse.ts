import Phaser from 'phaser';
import { RADAR_REVEAL_SECONDS } from '../config/constants';
import { DualTilemap } from './DualTilemap';
import { WorldManager, type WorldId } from './WorldManager';
import { RadarRevealPostFX } from './RadarRevealPostFX';
import type { PlayerController } from '../entities/PlayerController';

// El pulso del radar (GDD §3.2): muestra durante ~4 s la silueta de la
// geometría del mundo OPUESTO superpuesta al actual, sin quitar el control y
// sin tocar colisiones (información, no plataforma). La onda nace del punto
// del mundo donde se usó la Semilla (reproyectado con la cámara).
//
// Si el jugador cambia de mundo durante el pulso, la silueta salta a la capa
// que acaba de dejar: el radar siempre enseña "el otro lado" del actual.

// Fallback sin WebGL (canvas, como el flash de F2.P8): sin PostFX, la capa
// opuesta se muestra translúcida — sin silueta ni onda, pero distinguible.
const FALLBACK_ALPHA = 0.35;
/** Fracción del pulso donde empieza el fade out (espejo de FADE_OUT_START del shader). */
const FALLBACK_FADE_START = 0.85;

export class RadarPulse {
  private readonly scene: Phaser.Scene;
  private readonly dualMap: DualTilemap;
  private readonly worldManager: WorldManager;
  private readonly player: PlayerController;

  private pipeline?: RadarRevealPostFX;
  private revealedLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private progress = 1;
  private originWorldX = 0;
  private originWorldY = 0;

  constructor(
    scene: Phaser.Scene,
    dualMap: DualTilemap,
    worldManager: WorldManager,
    player: PlayerController,
  ) {
    this.scene = scene;
    this.dualMap = dualMap;
    this.worldManager = worldManager;
    this.player = player;
    // registrado DESPUÉS del handler de la escena: cuando applyActiveWorld ya
    // fijó visibilidades, este re-engancha la silueta a la nueva capa opuesta
    worldManager.on(WorldManager.EVENT_CHANGED, (world: WorldId) => {
      if (this.isActive) {
        this.attachToOppositeOf(world);
      }
    });
  }

  get isActive(): boolean {
    return this.progress < 1;
  }

  /** Segundos transcurridos del pulso (overlay F9). */
  get elapsedSeconds(): number {
    return this.progress * RADAR_REVEAL_SECONDS;
  }

  /** Lanza el pulso desde el jugador (la semilla ya fue consumida por quien llama). */
  fire(): void {
    this.originWorldX = this.player.gameObject.x;
    this.originWorldY = this.player.gameObject.y;
    this.progress = 0;
    this.attachToOppositeOf(this.worldManager.activeWorld);
  }

  /** Feedback sutil de "vacío" al usar el radar sin semilla (sin mensaje, GDD §3.2). */
  fizzle(): void {
    const ring = this.scene.add
      .circle(this.player.gameObject.x, this.player.gameObject.y, 3, 0x000000, 0)
      .setStrokeStyle(1, 0x6a7480, 0.5)
      .setDepth(800);
    this.scene.tweens.add({
      targets: ring,
      radius: 10,
      alpha: 0,
      duration: 180,
      onComplete: () => ring.destroy(),
    });
  }

  /** Llamar una vez por frame, después de que la cámara fije su scroll. */
  update(deltaSeconds: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.isActive) {
      return;
    }
    this.progress = Math.min(1, this.progress + deltaSeconds / RADAR_REVEAL_SECONDS);
    if (this.progress >= 1) {
      this.detach();
      return;
    }
    if (this.pipeline) {
      this.pipeline.setEffect(
        this.progress,
        this.originWorldX - camera.scrollX,
        this.originWorldY - camera.scrollY,
      );
    } else if (this.revealedLayer) {
      // fallback sin WebGL: solo alpha translúcido con fade out final
      const fade = Math.min(1, (1 - this.progress) / (1 - FALLBACK_FADE_START));
      this.revealedLayer.setAlpha(FALLBACK_ALPHA * fade);
    }
  }

  /** Engancha la silueta a la capa opuesta al mundo indicado. */
  private attachToOppositeOf(activeWorld: WorldId): void {
    this.detach();
    const opposite = activeWorld === 'SIM' ? this.dualMap.real : this.dualMap.sim;
    opposite.setVisible(true);
    opposite.setPostPipeline(RadarRevealPostFX);
    const pipeline = opposite.getPostPipeline(RadarRevealPostFX);
    this.pipeline = pipeline instanceof RadarRevealPostFX ? pipeline : undefined;
    this.revealedLayer = opposite;
  }

  /** Suelta la capa revelada y restaura su visibilidad según el mundo activo. */
  private detach(): void {
    if (!this.revealedLayer) {
      return;
    }
    // por instancia: el PipelineManager renombra el pipeline con el nombre de
    // la clase (minificado en el build), así que remover por string no es fiable
    if (this.pipeline) {
      this.revealedLayer.removePostPipeline(this.pipeline);
    }
    this.revealedLayer.setAlpha(1); // deshace el fallback sin WebGL
    const isActiveLayer =
      this.revealedLayer === this.dualMap.layerOf(this.worldManager.activeWorld);
    this.revealedLayer.setVisible(isActiveLayer);
    this.revealedLayer = null;
    this.pipeline = undefined;
  }
}
