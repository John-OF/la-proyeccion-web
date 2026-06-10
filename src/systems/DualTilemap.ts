import Phaser from 'phaser';
import type { WorldId } from './WorldManager';

// CONVENCIÓN DE AUTORÍA DE MAPAS (Tiled) — vale para todos los mapas del juego:
//
// - Tres capas de tiles obligatorias, con estos nombres exactos:
//     COMMON — geometría que existe en ambos mundos (suelo base, marcos, bordes)
//     SIM    — geometría exclusiva del Mundo Simulado (paleta cyan)
//     REAL   — geometría exclusiva del Mundo Real (paleta gris-azul + óxido)
// - Todo tile no vacío de esas tres capas es SÓLIDO (colisiona). La decoración
//   sin colisión irá en capas adicionales cuando exista (fase F5).
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
export class DualTilemap {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly common: Phaser.Tilemaps.TilemapLayer;
  readonly sim: Phaser.Tilemaps.TilemapLayer;
  readonly real: Phaser.Tilemaps.TilemapLayer;

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

    // Todo tile presente colisiona (índice -1 = celda vacía)
    for (const layer of [this.common, this.sim, this.real]) {
      layer.setCollisionByExclusion([-1]);
    }
  }

  /** Capa de tiles del mundo indicado. */
  layerOf(world: WorldId): Phaser.Tilemaps.TilemapLayer {
    return world === 'SIM' ? this.sim : this.real;
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
