import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { PlayerController, type MoveIntent } from '../entities/PlayerController';
import { InputManager } from '../systems/InputManager';
import { DualTilemap } from '../systems/DualTilemap';
import { WorldManager, type WorldId, type SwitchDenyReason } from '../systems/WorldManager';
import { RespawnSystem } from '../systems/RespawnSystem';
import { SafePush } from '../systems/SafePush';
import { CameraRig } from '../systems/CameraRig';
import { DebugOverlay } from '../ui/DebugOverlay';

// Tinte y fondo por mundo: legibilidad inmediata de "¿en qué mundo estoy?"
// (Pilar 3). El post-procesado completo (bloom, vignette, grain…) es de F7.P3
// y el glitch radial de transición, de F2.P8: esto es el feedback provisional.
const WORLD_BACKGROUND: Record<WorldId, string> = {
  SIM: '#0a0e14',
  REAL: '#100c0c',
};
const WORLD_TINT: Record<WorldId, { color: number; alpha: number }> = {
  SIM: { color: 0x4fc3dd, alpha: 0.05 },
  REAL: { color: 0x8a2f23, alpha: 0.1 },
};
const WORLD_FLASH: Record<WorldId, [number, number, number]> = {
  SIM: [90, 200, 220],
  REAL: [150, 70, 55],
};

// Escena de pruebas de F2. Cambio de mundo (GDD §3.1): visibilidad y colisión
// exclusivas del mundo activo (+COMMON siempre), cooldown 0.4 s, bloqueo
// narrativo, y cambio brutal: nadie comprueba si hay suelo al otro lado.
export class PlayScene extends Phaser.Scene {
  private player!: PlayerController;
  private inputManager!: InputManager;
  private worldManager!: WorldManager;
  private respawn!: RespawnSystem;
  private safePush!: SafePush;
  private cameraRig!: CameraRig;
  private lastSafePushLabel = '—';
  private keplinText?: Phaser.GameObjects.Text;
  private debug!: DebugOverlay;
  private dualMap!: DualTilemap;
  private simCollider!: Phaser.Physics.Arcade.Collider;
  private realCollider!: Phaser.Physics.Arcade.Collider;
  private worldTint!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('PlayScene');
  }

  create(): void {
    this.dualMap = new DualTilemap(this, 'test-dual', 'tileset');
    // borde inferior abierto: caer a un foso saca del mapa y eso es la muerte
    this.physics.world.setBounds(
      0,
      0,
      this.dualMap.widthInPixels,
      this.dualMap.heightInPixels,
      true,
      true,
      true,
      false,
    );

    const spawn = this.dualMap.objectsOfType('spawn')[0];
    this.player = new PlayerController(this, spawn?.x ?? 40, spawn?.y ?? 216);
    this.respawn = new RespawnSystem(this, this.player, this.dualMap);
    this.safePush = new SafePush(this.player, this.dualMap);
    this.cameraRig = new CameraRig(this, this.player, this.dualMap);
    this.physics.add.collider(this.player.gameObject, this.dualMap.common);
    this.simCollider = this.physics.add.collider(this.player.gameObject, this.dualMap.sim);
    this.realCollider = this.physics.add.collider(this.player.gameObject, this.dualMap.real);

    // Tinte fullscreen por mundo (debajo del overlay de debug)
    this.worldTint = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(900);

    this.inputManager = new InputManager(this);
    this.debug = new DebugOverlay(this);

    this.worldManager = new WorldManager();
    this.worldManager.on(WorldManager.EVENT_CHANGED, (world: WorldId) => {
      this.applyActiveWorld(world);

      // SafePush (GDD §3.1): corregir solapamiento con la geometría destino
      const outcome = this.safePush.resolveAfterSwitch(world);
      this.lastSafePushLabel = outcome;
      if (outcome === 'failed') {
        this.respawn.kill();
        this.showKeplinMessage('Sector reorganizado. Continúe.');
        return; // sin flash: manda el fundido de la muerte
      }
      const [r, g, b] = WORLD_FLASH[world];
      this.cameras.main.flash(120, r, g, b); // provisional: glitch radial en F2.P8
    });
    this.worldManager.on(WorldManager.EVENT_DENIED, (reason: SwitchDenyReason) => {
      if (reason === 'locked') {
        this.cameras.main.shake(60, 0.002); // feedback sutil del bloqueo narrativo
      }
      // el cooldown se ignora en silencio (GDD §3.1)
    });
    this.applyActiveWorld(this.worldManager.activeWorld);

    // Atajo de depuración (solo dev): L alterna el bloqueo narrativo para
    // probarlo sin contenido de Zona 0. El bloqueo real lo activará la
    // narrativa (Z0 y Z5) en fases de contenido.
    if (import.meta.env.DEV) {
      this.input.keyboard!.on('keydown-L', () => {
        this.worldManager.setLocked(!this.worldManager.isLocked);
      });
    }

    // Etiqueta de desarrollo (no es UI del juego: el juego no tendrá HUD)
    this.add
      .text(4, 4, 'F2.P7 · cámara · mapa de 2 pantallas · F9 debug', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#56687c',
      })
      .setScrollFactor(0)
      .setDepth(950);
  }

  /** Aplica el mundo activo: visibilidad y colisión exclusivas + tinte de legibilidad. */
  private applyActiveWorld(world: WorldId): void {
    this.dualMap.sim.setVisible(world === 'SIM');
    this.dualMap.real.setVisible(world === 'REAL');
    this.simCollider.active = world === 'SIM';
    this.realCollider.active = world === 'REAL';

    const tint = WORLD_TINT[world];
    this.worldTint.setFillStyle(tint.color, tint.alpha);
    this.cameras.main.setBackgroundColor(WORLD_BACKGROUND[world]);
  }

  /** Mensaje de Keplin provisional (el sistema definitivo con corrupción llega en F3.P3). */
  private showKeplinMessage(text: string): void {
    this.keplinText?.destroy();
    const message = this.add
      .text(GAME_WIDTH / 2, 36, text, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#cfe8ef',
        backgroundColor: '#0a0e14',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(950)
      .setAlpha(0);
    this.keplinText = message;
    this.tweens.add({ targets: message, alpha: 1, duration: 180 });
    this.tweens.add({
      targets: message,
      alpha: 0,
      delay: 2400,
      duration: 600,
      onComplete: () => message.destroy(),
    });
  }

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    this.inputManager.update();
    this.worldManager.update(deltaSeconds);

    // durante la muerte se congela la intención (el mundo no se toca: se conserva)
    const frozen = this.respawn.isRespawning;

    if (!frozen && this.inputManager.justPressed('switchWorld')) {
      this.worldManager.requestSwitch();
    }

    const intent: MoveIntent = frozen
      ? { left: false, right: false, jumpJustPressed: false }
      : {
          left: this.inputManager.isDown('moveLeft'),
          right: this.inputManager.isDown('moveRight'),
          jumpJustPressed: this.inputManager.justPressed('jump'),
        };
    this.player.update(intent, deltaSeconds);
    this.respawn.update();
    this.cameraRig.update(deltaSeconds);

    const s = this.player.debugState;
    const pad = this.inputManager.connectedPad;
    this.debug.setLines([
      `fps: ${this.game.loop.actualFps.toFixed(0)}`,
      `mundo: ${this.worldManager.activeWorld}   bloqueo: ${this.worldManager.isLocked ? 'SI' : 'no'}   cooldown: ${(this.worldManager.cooldownSeconds * 1000).toFixed(0)} ms`,
      `checkpoint: ${this.respawn.activeCheckpointLabel}   safepush: ${this.lastSafePushLabel}`,
      `mando: ${pad ? pad.id.slice(0, 36) : 'no conectado (pulsa un botón del mando)'}`,
      `acciones: ${this.inputManager.debugSummary()}`,
      `suelo: ${s.onGround ? 'si' : 'no'}   salto usado: ${s.jumpConsumed ? 'si' : 'no'}`,
      `coyote: ${(s.coyoteSeconds * 1000).toFixed(0)} ms   buffer: ${(s.bufferSeconds * 1000).toFixed(0)} ms`,
      `vel: x=${s.vx.toFixed(0)}  y=${s.vy.toFixed(0)} (tope 360)`,
    ]);
  }
}
