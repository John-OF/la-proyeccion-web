import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { PlayerController, type MoveIntent } from '../entities/PlayerController';
import { InputManager } from '../systems/InputManager';
import { DualTilemap } from '../systems/DualTilemap';
import { WorldManager, type WorldId, type SwitchDenyReason } from '../systems/WorldManager';
import { RespawnSystem } from '../systems/RespawnSystem';
import { SafePush } from '../systems/SafePush';
import { CameraRig } from '../systems/CameraRig';
import { RadialGlitchPostFX } from '../systems/RadialGlitchPostFX';
import { PlayerInteractor } from '../systems/PlayerInteractor';
import { buildPuzzleEntities, type PuzzleEntities } from '../systems/puzzleLoader';
import { SeedInventory } from '../systems/SeedInventory';
import { RadarPulse } from '../systems/RadarPulse';
import { SeedIndicator } from '../ui/SeedIndicator';
import { KeplinMessage } from '../ui/KeplinMessage';
import type { CorruptionLevel } from '../ui/textCorruption';
import { DebugOverlay } from '../ui/DebugOverlay';

// Tinte y fondo por mundo: legibilidad inmediata de "¿en qué mundo estoy?"
// (Pilar 3). El post-procesado completo (bloom, vignette, grain…) es de F7.P3.
const WORLD_BACKGROUND: Record<WorldId, string> = {
  SIM: '#0a0e14',
  REAL: '#100c0c',
};
const WORLD_TINT: Record<WorldId, { color: number; alpha: number }> = {
  SIM: { color: 0x4fc3dd, alpha: 0.05 },
  REAL: { color: 0x8a2f23, alpha: 0.1 },
};
// Color del frente del glitch radial por mundo destino (0–255); también es el
// flash del fallback sin WebGL.
const WORLD_GLITCH_TINT: Record<WorldId, [number, number, number]> = {
  SIM: [90, 200, 220],
  REAL: [150, 70, 55],
};
// Chispas del cambio de mundo: bolitas de luz que estallan desde el jugador
// acompañando el frente de la onda (calibrables en playtest).
const SWITCH_SPARK_COUNT = 48;
/** El frente recorre ~530 px en 0.3 s (~1770 px/s): las rápidas lo acompañan. */
const SWITCH_SPARK_SPEED = { min: 700, max: 1800 };
const SWITCH_SPARK_LIFESPAN = { min: 200, max: 320 };

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
  private keplin!: KeplinMessage;
  /** Toggle K (solo dev): fuerza un nivel de corrupción en todos los textos. */
  private corruptionOverride: CorruptionLevel | null = null;
  private debug!: DebugOverlay;
  private dualMap!: DualTilemap;
  private simCollider!: Phaser.Physics.Arcade.Collider;
  private realCollider!: Phaser.Physics.Arcade.Collider;
  private worldTint!: Phaser.GameObjects.Rectangle;
  /** Glitch radial del cambio (F2.P8); undefined sin WebGL (fallback: flash). */
  private glitch?: RadialGlitchPostFX;
  /** Estallido de bolitas de luz: cambio de mundo (tinte del mundo) y pulso del radar (verde semilla). */
  private sparkBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private interactor!: PlayerInteractor;
  private puzzles!: PuzzleEntities;
  private seedInventory!: SeedInventory;
  private radarPulse!: RadarPulse;

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
    this.keplin = new KeplinMessage(this);

    // Glitch radial del cambio (GDD §3.1): PostFX de cámara. Se instala una
    // vez y queda en passthrough cuando no hay transición. Sin WebGL (canvas)
    // no hay PostFX: se conserva el flash de F2.P4 como fallback.
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline(RadialGlitchPostFX);
      const pipeline = this.cameras.main.getPostPipeline(RadialGlitchPostFX);
      if (pipeline instanceof RadialGlitchPostFX) {
        this.glitch = pipeline;
      }
    }

    // Chispas del cambio: textura de bolita de luz (núcleo brillante + halo)
    // generada una vez; el emitter estalla desde el jugador en cada cambio.
    if (!this.textures.exists('glitch-spark')) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      gfx.fillStyle(0xffffff, 0.5).fillCircle(3, 3, 3);
      gfx.fillStyle(0xffffff, 1).fillCircle(3, 3, 1.5);
      gfx.generateTexture('glitch-spark', 6, 6);
      gfx.destroy();
    }
    this.sparkBurst = this.add.particles(0, 0, 'glitch-spark', {
      emitting: false,
      lifespan: SWITCH_SPARK_LIFESPAN,
      speed: SWITCH_SPARK_SPEED,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    });
    this.sparkBurst.setDepth(800);

    this.worldManager = new WorldManager();
    this.worldManager.on(WorldManager.EVENT_CHANGED, (world: WorldId) => {
      this.applyActiveWorld(world);

      // SafePush (GDD §3.1): corregir solapamiento con la geometría destino
      const outcome = this.safePush.resolveAfterSwitch(world);
      this.lastSafePushLabel = outcome;
      if (outcome === 'failed') {
        this.respawn.kill();
        this.keplin.enqueue('Sector reorganizado. Continúe.');
        return; // sin glitch: manda el fundido de la muerte
      }
      // La onda y las chispas nacen del jugador (posición ya corregida por SafePush)
      const px = this.player.gameObject.x;
      const py = this.player.gameObject.y;
      const [r, g, b] = WORLD_GLITCH_TINT[world];
      this.sparkBurst.setParticleTint(Phaser.Display.Color.GetColor(r, g, b));
      this.sparkBurst.setPosition(px, py);
      this.sparkBurst.explode(SWITCH_SPARK_COUNT);
      if (this.glitch) {
        this.glitch.trigger(px, py, r / 255, g / 255, b / 255);
      } else {
        this.cameras.main.flash(120, r, g, b); // fallback sin WebGL
      }
    });
    this.worldManager.on(WorldManager.EVENT_DENIED, (reason: SwitchDenyReason) => {
      if (reason === 'locked') {
        this.cameras.main.shake(60, 0.002); // feedback sutil del bloqueo narrativo
      }
      // el cooldown se ignora en silencio (GDD §3.1)
    });
    this.applyActiveWorld(this.worldManager.activeWorld);

    // Interacción (GDD §3.3): botón único sobre el más cercano en radio
    this.interactor = new PlayerInteractor(this, this.player);

    // Inventario de Semillas (GDD §3.2): capacidad declarada por el mapa
    const capacity = this.dualMap.mapProperty('seedCapacity');
    this.seedInventory = new SeedInventory(typeof capacity === 'number' ? capacity : 1);
    new SeedIndicator(this, this.seedInventory);

    // Piezas declaradas en el mapa: puertas, switches, secuencias, letreros
    // y semillas, con cableado por propiedades y presencia por mundo
    this.puzzles = buildPuzzleEntities({
      scene: this,
      dualMap: this.dualMap,
      worldManager: this.worldManager,
      interactor: this.interactor,
      player: this.player,
      keplin: this.keplin,
      seedInventory: this.seedInventory,
    });

    // Pulso del radar (GDD §3.2). Creado tras el handler de cambio de la
    // escena: su re-enganche de capa debe correr DESPUÉS de applyActiveWorld.
    this.radarPulse = new RadarPulse(this, this.dualMap, this.worldManager, this.player);

    // Atajos de depuración (solo dev):
    //   L — alterna el bloqueo narrativo (el real lo activará Z0/Z5)
    //   K — cicla el override de corrupción: autoría → 0 → 1 → 2 → autoría
    //   M — encola un mensaje de Keplin de prueba con el nivel actual
    //   I — alterna la capacidad del inventario 1↔2 (en juego la fija el mapa)
    if (import.meta.env.DEV) {
      this.input.keyboard!.on('keydown-L', () => {
        this.worldManager.setLocked(!this.worldManager.isLocked);
      });
      this.input.keyboard!.on('keydown-I', () => {
        this.seedInventory.setCapacity(this.seedInventory.capacity === 1 ? 2 : 1);
      });
      this.input.keyboard!.on('keydown-K', () => {
        const cycle: Array<CorruptionLevel | null> = [null, 0, 1, 2];
        const next = cycle[(cycle.indexOf(this.corruptionOverride) + 1) % cycle.length];
        this.corruptionOverride = next;
        this.keplin.setCorruptionLevel(next ?? 0);
        for (const sign of this.puzzles.signs) {
          sign.setCorruptionOverride(next);
        }
      });
      this.input.keyboard!.on('keydown-M', () => {
        this.keplin.enqueue('Tu comportamiento ha sido registrado.');
      });
    }

    // Etiqueta de desarrollo (no es UI del juego: el juego no tendrá HUD)
    this.add
      .text(4, 4, 'F4.P2 · pulso del radar · F9 debug', {
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

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    this.inputManager.update();
    this.worldManager.update(deltaSeconds);

    // durante la muerte se congela la intención (el mundo no se toca: se conserva)
    const frozen = this.respawn.isRespawning;

    if (!frozen && this.inputManager.justPressed('switchWorld')) {
      this.worldManager.requestSwitch();
    }

    // Radar (GDD §3.2): consume una semilla y lanza el pulso; sin semilla,
    // solo un feedback sutil de vacío (sin mensaje)
    if (!frozen && this.inputManager.justPressed('radar')) {
      if (this.seedInventory.tryConsume()) {
        this.sparkBurst.setParticleTint(0x9fe8c8);
        this.sparkBurst.setPosition(this.player.gameObject.x, this.player.gameObject.y);
        this.sparkBurst.explode(36);
        this.radarPulse.fire();
      } else {
        this.radarPulse.fizzle();
      }
    }

    const intent: MoveIntent = frozen
      ? { left: false, right: false, jumpJustPressed: false }
      : {
          left: this.inputManager.isDown('moveLeft'),
          right: this.inputManager.isDown('moveRight'),
          jumpJustPressed: this.inputManager.justPressed('jump'),
        };
    this.player.update(intent, deltaSeconds);
    this.interactor.update(frozen ? false : this.inputManager.justPressed('interact'));
    this.respawn.update();
    this.cameraRig.update(deltaSeconds);
    // tras la cámara: los epicentros se reproyectan con el scroll ya definitivo
    this.glitch?.updateEffect(deltaSeconds, this.cameras.main);
    this.radarPulse.update(deltaSeconds, this.cameras.main);

    const s = this.player.debugState;
    const pad = this.inputManager.connectedPad;
    this.debug.setLines([
      `fps: ${this.game.loop.actualFps.toFixed(0)}`,
      `mundo: ${this.worldManager.activeWorld}   bloqueo: ${this.worldManager.isLocked ? 'SI' : 'no'}   cooldown: ${(this.worldManager.cooldownSeconds * 1000).toFixed(0)} ms`,
      `glitch: ${this.glitch ? (this.glitch.isActive ? `${(this.glitch.elapsedSeconds * 1000).toFixed(0)}/300 ms` : '—') : 'sin WebGL (flash)'}`,
      `checkpoint: ${this.respawn.activeCheckpointLabel}   safepush: ${this.lastSafePushLabel}`,
      `interactuable: ${this.interactor.currentTarget?.label ?? '—'}   última interacción: ${this.interactor.lastUsedLabel}`,
      `puertas: ${this.puzzles.gates.map((g) => `${g.label}=${g.isOpen ? 'abierta' : 'cerrada'}`).join('  ') || '—'}`,
      `switches: ${this.puzzles.switches.map((s) => `${s.label}=${s.isOn ? 'on' : 'off'}`).join('  ') || '—'}`,
      `secuencias: ${this.puzzles.sequences.map((s) => `${s.label}=${s.progressLabel}`).join('  ') || '—'}`,
      `semillas(I): ${this.seedInventory.seeds}/${this.seedInventory.capacity}   radar: ${this.radarPulse.isActive ? `${this.radarPulse.elapsedSeconds.toFixed(1)}/4.0 s` : '—'}`,
      `corrupción(K): ${this.corruptionOverride ?? 'autoría'}   mensaje de prueba: M`,
      `mando: ${pad ? pad.id.slice(0, 36) : 'no conectado (pulsa un botón del mando)'}`,
      `acciones: ${this.inputManager.debugSummary()}`,
      `suelo: ${s.onGround ? 'si' : 'no'}   salto usado: ${s.jumpConsumed ? 'si' : 'no'}`,
      `coyote: ${(s.coyoteSeconds * 1000).toFixed(0)} ms   buffer: ${(s.bufferSeconds * 1000).toFixed(0)} ms`,
      `vel: x=${s.vx.toFixed(0)}  y=${s.vy.toFixed(0)} (tope 360)`,
    ]);
  }
}
