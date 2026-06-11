import Phaser from 'phaser';
import { WorldManager, type WorldId } from '../systems/WorldManager';
import { corruptText, type CorruptionLevel } from '../ui/textCorruption';

/** Colores canon del texto diegético: limpio en la Simulación, rojo en el Real (GDD §4 Z1). */
const SIGN_COLOR_SIM = '#cfe8ef';
const SIGN_COLOR_REAL = '#d8453c';

export interface DiegeticTextConfig {
  x: number;
  y: number;
  /** Texto de autoría por mundo (pueden diferir: la verdad corrupta vive en el Real). */
  textSim: string;
  textReal: string;
  /** Nivel de corrupción de render por mundo (GDD §6.4: pueden ser distintos). */
  corruptionSim: CorruptionLevel;
  corruptionReal: CorruptionLevel;
}

// Letrero del mundo (GDD §6.3: Keplin existe como texto en pantallas y
// letreros). Su contenido, color y nivel de corrupción dependen del mundo
// activo: el mismo cartel miente en la Simulación y se rompe en el Real.
export class DiegeticText {
  private readonly textObject: Phaser.GameObjects.Text;
  private readonly config: DiegeticTextConfig;
  private world: WorldId;
  /** Override de depuración (toggle K): fuerza un nivel en ambos mundos. */
  private corruptionOverride: CorruptionLevel | null = null;

  constructor(scene: Phaser.Scene, worldManager: WorldManager, config: DiegeticTextConfig) {
    this.config = config;
    this.textObject = scene.add
      .text(config.x, config.y, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
      })
      .setOrigin(0.5)
      .setDepth(650);
    worldManager.on(WorldManager.EVENT_CHANGED, (world: WorldId) => {
      this.world = world;
      this.render();
    });
    this.world = worldManager.activeWorld;
    this.render();
  }

  /** Toggle de depuración: null vuelve a los niveles de autoría del mapa. */
  setCorruptionOverride(level: CorruptionLevel | null): void {
    this.corruptionOverride = level;
    this.render();
  }

  private render(): void {
    const isReal = this.world === 'REAL';
    const baseText = isReal ? this.config.textReal : this.config.textSim;
    const level =
      this.corruptionOverride ?? (isReal ? this.config.corruptionReal : this.config.corruptionSim);
    this.textObject.setText(corruptText(baseText, level));
    this.textObject.setColor(isReal ? SIGN_COLOR_REAL : SIGN_COLOR_SIM);
  }
}
