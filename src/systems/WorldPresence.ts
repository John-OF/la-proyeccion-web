import { WorldManager, type WorldId } from './WorldManager';

/** Dónde existe una entidad: en un solo mundo o en ambos (GDD §3.1). */
export type PresenceMode = WorldId | 'BOTH';

/** ¿El modo de presencia incluye este mundo? */
export function isPresentIn(mode: PresenceMode, world: WorldId): boolean {
  return mode === 'BOTH' || mode === world;
}

/** Lee un modo de presencia desde texto de Tiled (default BOTH si falta o es inválido). */
export function parsePresenceMode(value: unknown): PresenceMode {
  return value === 'SIM' || value === 'REAL' ? value : 'BOTH';
}

// Existencia por mundo (equivalente del WorldExclusivePresence de Unity):
// hace que cualquier entidad exista — visible, colisionable, interactuable —
// solo en SIM, solo en REAL o en ambos. La entidad define qué significa
// "estar presente" mediante el callback `apply`; este componente solo decide
// cuándo, escuchando el cambio de mundo.
export class WorldPresence {
  constructor(
    worldManager: WorldManager,
    readonly mode: PresenceMode,
    apply: (present: boolean) => void,
  ) {
    worldManager.on(WorldManager.EVENT_CHANGED, (world: WorldId) => {
      apply(isPresentIn(mode, world));
    });
    apply(isPresentIn(mode, worldManager.activeWorld));
  }
}
