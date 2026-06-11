import Phaser from 'phaser';
import { DualTilemap, getTiledProperty } from './DualTilemap';
import { WorldManager } from './WorldManager';
import { WorldPresence, parsePresenceMode } from './WorldPresence';
import { PlayerInteractor } from './PlayerInteractor';
import { SwitchSequence } from './SwitchSequence';
import { Gate } from '../entities/Gate';
import {
  Switch,
  parseSwitchAction,
  parseSwitchVisual,
  type SwitchAction,
} from '../entities/Switch';
import { DiegeticText } from '../entities/DiegeticText';
import { SeedPickup } from '../entities/SeedPickup';
import { SeedInventory } from './SeedInventory';
import { KeplinMessage } from '../ui/KeplinMessage';
import type { CorruptionLevel } from '../ui/textCorruption';
import type { PlayerController } from '../entities/PlayerController';

/** Colaboradores que necesita el montaje del mapa. */
export interface MapWiringContext {
  scene: Phaser.Scene;
  dualMap: DualTilemap;
  worldManager: WorldManager;
  interactor: PlayerInteractor;
  player: PlayerController;
  keplin: KeplinMessage;
  seedInventory: SeedInventory;
}

/** Entidades montadas desde el mapa (para colliders, debug y toggles). */
export interface PuzzleEntities {
  gates: Gate[];
  switches: Switch[];
  signs: DiegeticText[];
  sequences: SwitchSequence[];
  seeds: SeedPickup[];
}

/** Lee un nivel de corrupción desde una propiedad de Tiled (default 0). */
function parseCorruptionLevel(value: unknown): CorruptionLevel {
  return value === 1 || value === 2 ? value : 0;
}

function applyGateAction(gate: Gate, action: SwitchAction): void {
  if (action === 'open') {
    gate.setOpen(true);
  } else if (action === 'close') {
    gate.setOpen(false);
  } else {
    gate.toggle();
  }
}

// Monta las piezas de puzzle declaradas en Tiled (convención en DualTilemap):
// puertas, switches (directos o pasos de secuencia), secuencias y letreros,
// con presencia por mundo y mensajes de Keplin opcionales. La escena no
// conoce ningún puzzle concreto: todo sale del mapa, y los errores de
// autoría (cableado roto) fallan ruidoso al cargar.
export function buildPuzzleEntities(context: MapWiringContext): PuzzleEntities {
  const { scene, dualMap, worldManager, interactor, player, keplin, seedInventory } = context;
  const gatesByName = new Map<string, Gate>();
  const gates: Gate[] = [];
  const signs: DiegeticText[] = [];
  const sequences: SwitchSequence[] = [];
  const seeds: SeedPickup[] = [];

  const requireGate = (name: unknown, owner: string): Gate => {
    const gate = typeof name === 'string' ? gatesByName.get(name) : undefined;
    if (!gate) {
      throw new Error(`"${owner}" apunta a una gate inexistente: "${String(name)}"`);
    }
    return gate;
  };

  for (const obj of dualMap.objectsOfType('gate')) {
    const gate = new Gate(
      scene,
      obj.x ?? 0,
      obj.y ?? 0,
      obj.width ?? 16,
      obj.height ?? 48,
      obj.name ?? 'gate',
    );
    scene.physics.add.collider(player.gameObject, gate.gameObject);
    new WorldPresence(worldManager, parsePresenceMode(getTiledProperty(obj, 'world')), (present) =>
      gate.setPresent(present),
    );
    gatesByName.set(gate.label, gate);
    gates.push(gate);
  }

  // Los switches se construyen primero y se cablean después: su efecto puede
  // ser directo (target propio) o decidirlo una secuencia que los reclame.
  const switchesByName = new Map<string, Switch>();
  const switchObjects = new Map<Switch, Phaser.Types.Tilemaps.TiledObject>();
  const wirings = new Map<Switch, (self: Switch) => void>();

  for (const obj of dualMap.objectsOfType('switch')) {
    const label = obj.name ?? 'switch';
    const sw = new Switch(
      scene,
      obj.x ?? 0,
      obj.y ?? 0,
      label,
      parseSwitchVisual(getTiledProperty(obj, 'visual')),
      (self) => wirings.get(self)?.(self),
    );
    interactor.register(sw.interactable);
    new WorldPresence(worldManager, parsePresenceMode(getTiledProperty(obj, 'world')), (present) =>
      sw.setPresent(present),
    );
    switchesByName.set(label, sw);
    switchObjects.set(sw, obj);
  }

  // Compone el mensaje opcional de Keplin con el efecto del switch
  const withKeplin = (
    obj: Phaser.Types.Tilemaps.TiledObject,
    effect: (self: Switch) => void,
  ): ((self: Switch) => void) => {
    const message = getTiledProperty(obj, 'keplinOnUse');
    if (typeof message === 'string' && message.length > 0) {
      return (self) => {
        keplin.enqueue(message);
        effect(self);
      };
    }
    return effect;
  };

  // Secuencias: reclaman sus switches por nombre (esos pierden cableado directo)
  for (const obj of dualMap.objectsOfType('sequence')) {
    const label = obj.name ?? 'sequence';
    const stepsRaw = getTiledProperty(obj, 'steps');
    if (typeof stepsRaw !== 'string' || stepsRaw.length === 0) {
      throw new Error(`La secuencia "${label}" no declara la propiedad steps`);
    }
    const steps = stepsRaw.split(',').map((name) => {
      const sw = switchesByName.get(name.trim());
      if (!sw) {
        throw new Error(`La secuencia "${label}" referencia un switch inexistente: "${name.trim()}"`);
      }
      return sw;
    });
    const gate = requireGate(getTiledProperty(obj, 'target'), label);
    const action = parseSwitchAction(getTiledProperty(obj, 'action'));
    const sequence = new SwitchSequence(label, steps, () => applyGateAction(gate, action));
    sequences.push(sequence);

    for (const step of steps) {
      if (wirings.has(step)) {
        throw new Error(`El switch "${step.label}" está reclamado por más de un cableado`);
      }
      wirings.set(
        step,
        withKeplin(switchObjects.get(step)!, (self) => sequence.notify(self)),
      );
    }
  }

  // Switches directos: los no reclamados por secuencias necesitan target propio
  for (const [sw, obj] of switchObjects) {
    if (wirings.has(sw)) {
      if (getTiledProperty(obj, 'target') !== undefined) {
        throw new Error(`El switch "${sw.label}" es de secuencia y no debe declarar target propio`);
      }
      continue;
    }
    const gate = requireGate(getTiledProperty(obj, 'target'), sw.label);
    const action = parseSwitchAction(getTiledProperty(obj, 'action'));
    wirings.set(
      sw,
      withKeplin(obj, (self) => {
        self.setOn(!self.isOn);
        applyGateAction(gate, action);
      }),
    );
  }

  for (const obj of dualMap.objectsOfType('sign')) {
    const textSim = getTiledProperty(obj, 'textSim');
    const textReal = getTiledProperty(obj, 'textReal');
    signs.push(
      new DiegeticText(scene, worldManager, {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        textSim: typeof textSim === 'string' ? textSim : '',
        textReal: typeof textReal === 'string' ? textReal : '',
        corruptionSim: parseCorruptionLevel(getTiledProperty(obj, 'corruptionSim')),
        corruptionReal: parseCorruptionLevel(getTiledProperty(obj, 'corruptionReal')),
      }),
    );
  }

  for (const obj of dualMap.objectsOfType('seed')) {
    const seed = new SeedPickup(scene, obj.x ?? 0, obj.y ?? 0, obj.name ?? 'seed', seedInventory);
    interactor.register(seed.interactable);
    // semilla transdimensional (GDD §3.2): puede existir solo en un mundo
    new WorldPresence(worldManager, parsePresenceMode(getTiledProperty(obj, 'world')), (present) =>
      seed.setPresent(present),
    );
    seeds.push(seed);
  }

  return { gates, switches: [...switchesByName.values()], signs, sequences, seeds };
}
