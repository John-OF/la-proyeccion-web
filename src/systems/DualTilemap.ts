import Phaser from 'phaser';
import type { WorldId } from './WorldManager';

/** Valor de una propiedad personalizada de un objeto Tiled (undefined si no existe). */
export function getTiledProperty(
  obj: Phaser.Types.Tilemaps.TiledObject,
  name: string,
): string | number | boolean | undefined {
  const properties = obj.properties as
    | Array<{ name: string; value: string | number | boolean }>
    | undefined;
  return properties?.find((prop) => prop.name === name)?.value;
}

// CONVENCIÓN DE AUTORÍA DE MAPAS (Tiled) — vale para todos los mapas del juego:
//
// - Tres capas de tiles obligatorias, con estos nombres exactos:
//     COMMON — geometría que existe en ambos mundos (suelo base, marcos, bordes)
//     SIM    — geometría exclusiva del Mundo Simulado (paleta cyan)
//     REAL   — geometría exclusiva del Mundo Real (paleta gris-azul + óxido)
// - Todo tile no vacío de esas tres capas es SÓLIDO (colisiona).
// - Capa de tiles opcional DECOR: decoración y pistas de entorno (GDD §7 —
//   sombras, escombros, marcas de desgaste). SIN colisión, visible en ambos
//   mundos, dibujada encima de las otras capas de tiles.
// - El tileset del mapa debe llamarse "tileset" y apunta a
//   public/assets/sprites/tileset.png (regenerable con scripts/generate-tileset.mjs).
// - Los mapas se generan/editan como JSON de Tiled en public/assets/maps/
//   (el de pruebas se regenera con scripts/generate-test-map.mjs).
// - Capa de objetos opcional "OBJECTS"; el campo `type` de cada objeto define su rol:
//     spawn      — punto de aparición inicial del jugador (objeto punto)
//     checkpoint — rectángulo: al tocarlo pasa a ser el punto de respawn.
//                  REGLA: su base debe ser una posición de pie LIBRE EN AMBOS
//                  MUNDOS (al morir se conserva el mundo activo, sea cual sea)
//     kill       — rectángulo: tocarlo mata (fosos, peligros de puzzle)
//     gate       — rectángulo: puerta que se abre/cierra por switches.
//                  Propiedades: world (SIM|REAL|BOTH, default BOTH)
//     switch     — punto: interruptor interactuable. Propiedades:
//                  target (string: name de la gate objetivo — OBLIGATORIA
//                  salvo que una sequence reclame este switch como paso),
//                  action (open|close|toggle, default toggle),
//                  world (SIM|REAL|BOTH, default BOTH),
//                  visual (lever|door, default lever),
//                  keplinOnUse (string opcional: mensaje de Keplin al usarlo)
//     sequence   — punto lógico sin visual: switches en orden obligatorio.
//                  Propiedades: steps (string OBLIGATORIA: names de switches
//                  separados por coma, en orden), target (gate), action
//                  (default open). Orden roto = la secuencia se resetea.
//     sign       — punto: letrero diegético (texto y color según el mundo).
//                  Propiedades: textSim, textReal (string);
//                  corruptionSim, corruptionReal (int 0–2, default 0)
//     seed       — punto: Semilla recogible (GDD §3.2). Propiedades:
//                  world (SIM|REAL|BOTH, default BOTH) — semilla
//                  transdimensional: existe solo en ese mundo
// - Propiedades personalizadas DEL MAPA (Map > Custom properties):
//     seedCapacity (int, default 1) — capacidad del inventario de semillas
//                  en este mapa (GDD §4: Zona 4 la amplía a 2)
// - El cableado de puzzles (switch→puerta, presencia por mundo) se declara
//   SIEMPRE con estas propiedades de Tiled, nunca hardcodeado en escenas.
export class DualTilemap {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly common: Phaser.Tilemaps.TilemapLayer;
  readonly sim: Phaser.Tilemaps.TilemapLayer;
  readonly real: Phaser.Tilemaps.TilemapLayer;
  /** Capa opcional de decoración/pistas (sin colisión, ambos mundos). */
  readonly decor: Phaser.Tilemaps.TilemapLayer | null;

  constructor(scene: Phaser.Scene, mapKey: string, tilesetTextureKey: string) {
    this.map = scene.make.tilemap({ key: mapKey });
    const tileset = this.map.addTilesetImage('tileset', tilesetTextureKey);
    if (!tileset) {
      throw new Error(`El mapa "${mapKey}" no contiene un tileset llamado "tileset"`);
    }
    const common = this.map.createLayer('COMMON', tileset);
    const sim = this.map.createLayer('SIM', tileset);
    const real = this.map.createLayer('REAL', tileset);
    if (!common || !sim || !real) {
      throw new Error(`El mapa "${mapKey}" debe tener las capas COMMON, SIM y REAL`);
    }
    this.common = common;
    this.sim = sim;
    this.real = real;
    // DECOR se crea al final: se dibuja encima de las capas de tiles
    this.decor = this.map.getLayer('DECOR')
      ? this.map.createLayer('DECOR', tileset)
      : null;

    // Todo tile presente colisiona (índice -1 = celda vacía); DECOR nunca
    for (const layer of [this.common, this.sim, this.real]) {
      layer.setCollisionByExclusion([-1]);
    }
  }

  /** Capa de tiles del mundo indicado. */
  layerOf(world: WorldId): Phaser.Tilemaps.TilemapLayer {
    return world === 'SIM' ? this.sim : this.real;
  }

  /** Propiedad personalizada del mapa (undefined si no existe). */
  mapProperty(name: string): string | number | boolean | undefined {
    const properties = this.map.properties as
      | Array<{ name: string; value: string | number | boolean }>
      | undefined;
    if (!Array.isArray(properties)) {
      return undefined;
    }
    return properties.find((prop) => prop.name === name)?.value;
  }

  /** Objetos de la capa OBJECTS con el `type` indicado (lista vacía si no hay capa). */
  objectsOfType(type: string): Phaser.Types.Tilemaps.TiledObject[] {
    const layer = this.map.getObjectLayer('OBJECTS');
    if (!layer) {
      return [];
    }
    return layer.objects.filter((obj) => obj.type === type);
  }

  get widthInPixels(): number {
    return this.map.widthInPixels;
  }

  get heightInPixels(): number {
    return this.map.heightInPixels;
  }
}
