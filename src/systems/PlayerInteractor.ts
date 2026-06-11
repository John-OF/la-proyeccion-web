import Phaser from 'phaser';
import type { PlayerController } from '../entities/PlayerController';
import type { Interactable } from '../entities/Interactable';
import { InteractPrompt } from '../ui/InteractPrompt';

// Selector de interacción (GDD §3.3): cada frame elige el interactuable
// habilitado más cercano cuyo radio alcanza al jugador, le pone el prompt
// encima (uno solo: nunca dos prompts a la vez) y dispara su acción cuando
// la escena le pasa la pulsación de interactuar.
export class PlayerInteractor {
  private readonly player: PlayerController;
  private readonly prompt: InteractPrompt;
  private readonly items: Interactable[] = [];
  private target: Interactable | null = null;
  /** Última interacción disparada (overlay F9). */
  lastUsedLabel = '—';

  constructor(scene: Phaser.Scene, player: PlayerController) {
    this.player = player;
    this.prompt = new InteractPrompt(scene);
  }

  register(item: Interactable): void {
    this.items.push(item);
  }

  unregister(item: Interactable): void {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  /** Interactuable bajo el prompt este frame (overlay F9). */
  get currentTarget(): Interactable | null {
    return this.target;
  }

  /** Llamar una vez por frame; `interactJustPressed` viene del InputManager. */
  update(interactJustPressed: boolean): void {
    const px = this.player.gameObject.x;
    const py = this.player.gameObject.y;

    let best: Interactable | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of this.items) {
      if (!item.enabled) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(px, py, item.x, item.y);
      if (distance <= item.radius && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    this.target = best;

    if (best) {
      this.prompt.show(best.x, best.y + best.promptOffsetY);
      if (interactJustPressed) {
        best.use();
        this.lastUsedLabel = best.label;
      }
    } else {
      this.prompt.hide();
    }
  }
}
