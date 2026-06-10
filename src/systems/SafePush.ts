import { PLAYER_SIZE, SAFE_PUSH_RADIUS } from '../config/constants';
import type { PlayerController } from '../entities/PlayerController';
import type { DualTilemap } from './DualTilemap';
import type { WorldId } from './WorldManager';

export type SafePushOutcome = 'clear' | 'pushed' | 'failed';

// SafePush (GDD §3.1): si la geometría del mundo destino ocuparía la posición
// del jugador tras un cambio, se le empuja a la posición válida más cercana
// dentro de un radio razonable; si no existe ninguna, el llamador lo envía al
// último checkpoint con el mensaje de Keplin "Sector reorganizado. Continúe."
export class SafePush {
  /** Margen interior del área de prueba: el contacto de borde no es solapamiento. */
  private static readonly BOUNDS_INSET = 1;
  /** Resolución de la búsqueda de posiciones candidatas (px). */
  private static readonly STEP = 4;

  constructor(
    private readonly player: PlayerController,
    private readonly dualMap: DualTilemap,
  ) {}

  /** Llamar justo después de aplicar un cambio de mundo. */
  resolveAfterSwitch(world: WorldId): SafePushOutcome {
    const body = this.player.body;
    if (!this.isBlocked(body.center.x, body.center.y, world)) {
      return 'clear';
    }

    const free = this.findNearestFree(body.center.x, body.center.y, world);
    if (!free) {
      return 'failed';
    }

    // empuje conservando la velocidad: es una corrección, no un rescate
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    body.reset(free.x, free.y);
    body.setVelocity(vx, vy);
    return 'pushed';
  }

  /** ¿El área del jugador centrada en (cx, cy) pisa tiles sólidos del mundo dado o de COMMON? */
  private isBlocked(cx: number, cy: number, world: WorldId): boolean {
    const half = PLAYER_SIZE / 2 - SafePush.BOUNDS_INSET;
    const size = half * 2;
    const worldLayer = this.dualMap.layerOf(world);
    for (const layer of [worldLayer, this.dualMap.common]) {
      const tiles = layer.getTilesWithinWorldXY(cx - half, cy - half, size, size, {
        isNotEmpty: true,
      });
      if (tiles.length > 0) {
        return true;
      }
    }
    return false;
  }

  /** Posición libre más cercana estrictamente dentro del radio, o null si no hay. */
  private findNearestFree(cx: number, cy: number, world: WorldId): { x: number; y: number } | null {
    const half = PLAYER_SIZE / 2;
    const radiusSq = SAFE_PUSH_RADIUS * SAFE_PUSH_RADIUS;
    const candidates: Array<{ x: number; y: number; distSq: number }> = [];

    for (let dx = -SAFE_PUSH_RADIUS; dx <= SAFE_PUSH_RADIUS; dx += SafePush.STEP) {
      for (let dy = -SAFE_PUSH_RADIUS; dy <= SAFE_PUSH_RADIUS; dy += SafePush.STEP) {
        const distSq = dx * dx + dy * dy;
        if (distSq === 0 || distSq >= radiusSq) {
          continue;
        }
        candidates.push({ x: cx + dx, y: cy + dy, distSq });
      }
    }
    candidates.sort((a, b) => a.distSq - b.distSq);

    for (const c of candidates) {
      // nunca empujar fuera de los límites del mapa
      if (c.x < half || c.x > this.dualMap.widthInPixels - half) {
        continue;
      }
      if (c.y < half || c.y > this.dualMap.heightInPixels - half) {
        continue;
      }
      if (!this.isBlocked(c.x, c.y, world)) {
        return c;
      }
    }
    return null;
  }
}
