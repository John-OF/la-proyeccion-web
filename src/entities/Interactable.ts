import { INTERACT_RADIUS } from '../config/constants';

/** Configuración de un punto de interacción. */
export interface InteractableConfig {
  /** Centro del interactuable en coordenadas del mundo. */
  x: number;
  y: number;
  /** Radio de detección (px); por defecto INTERACT_RADIUS. */
  radius?: number;
  /** Desplazamiento vertical del prompt respecto al centro (px; negativo = arriba). */
  promptOffsetY?: number;
  /** Nombre para depuración y overlay. */
  label: string;
  /** Acción al usar (disparada por PlayerInteractor con la tecla/botón de interactuar). */
  onUse: (self: Interactable) => void;
}

// Pieza base de interacción (GDD §3.3): botón único sobre el interactuable
// más cercano dentro de su radio. No tiene visual propio: el sprite/forma lo
// pone quien lo crea (switches y semillas en F3.P2/F4.P1); esto es solo la
// lógica de "se puede usar aquí".
export class Interactable {
  x: number;
  y: number;
  readonly radius: number;
  readonly promptOffsetY: number;
  readonly label: string;
  /** Deshabilitado no detecta ni dispara (lo usarán WorldPresence y puzzles). */
  enabled = true;

  private readonly onUse: (self: Interactable) => void;

  constructor(config: InteractableConfig) {
    this.x = config.x;
    this.y = config.y;
    this.radius = config.radius ?? INTERACT_RADIUS;
    this.promptOffsetY = config.promptOffsetY ?? -14;
    this.label = config.label;
    this.onUse = config.onUse;
  }

  /** Dispara la acción si está habilitado. */
  use(): void {
    if (this.enabled) {
      this.onUse(this);
    }
  }
}
