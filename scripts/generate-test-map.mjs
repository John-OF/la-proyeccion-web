// Genera public/assets/maps/test-dual.json: mapa de pruebas en formato Tiled
// (abrible en el editor Tiled) con la convención de capas del proyecto:
// COMMON (ambos mundos) / SIM (solo Simulación) / REAL (solo Real) + capa de
// objetos OBJECTS (spawn / checkpoint / kill).
// Ver la convención completa en src/systems/DualTilemap.ts.
//
// Uso: node scripts/generate-test-map.mjs
import { writeFileSync } from 'node:fs';

const W = 60; // 60 × 16 px = 960 px: dos pantallas de ancho, para ejercitar la cámara
const H = 17;

// GIDs del tileset (scripts/generate-tileset.mjs)
const GID = {
  SIM_BLOCK: 1,
  SIM_PLATFORM: 2,
  REAL_BLOCK: 3,
  REAL_PLATFORM: 4,
  COMMON_BLOCK: 5,
  COMMON_PLATFORM: 6,
};

const emptyGrid = () => new Array(W * H).fill(0);

function fillRect(grid, col0, row0, col1, row1, gid) {
  for (let r = row0; r <= row1; r++) {
    for (let c = col0; c <= col1; c++) {
      grid[r * W + c] = gid;
    }
  }
}

// COMMON: suelo completo con un FOSO (cols 18–20) + plataforma central
const common = emptyGrid();
fillRect(common, 0, 15, W - 1, 16, GID.COMMON_BLOCK);
fillRect(common, 18, 15, 20, 16, 0); // el foso: caer aquí mata (kill zone + caída)
fillRect(common, 13, 12, 16, 12, GID.COMMON_PLATFORM);
// mitad derecha (cols 30–59): recorrido largo para validar la cámara
fillRect(common, 42, 15, 44, 16, 0); // segundo foso
fillRect(common, 36, 12, 39, 12, GID.COMMON_PLATFORM);

// SIM: plataforma izquierda + muro bajo saltable — solo en la Simulación
const sim = emptyGrid();
fillRect(sim, 3, 12, 7, 12, GID.SIM_PLATFORM);
fillRect(sim, 22, 13, 22, 14, GID.SIM_BLOCK);
fillRect(sim, 46, 12, 49, 12, GID.SIM_PLATFORM); // plataforma SIM en la mitad derecha

// REAL: muro bajo (se atraviesa con SIM activo) + plataforma derecha — solo en el Real
const real = emptyGrid();
fillRect(real, 9, 13, 9, 14, GID.REAL_BLOCK);
fillRect(real, 23, 12, 27, 12, GID.REAL_PLATFORM);
// masa sólida grande sobre la plataforma central: cambiar a REAL parado en el
// centro de la plataforma no tiene posición válida en el radio → SafePush falla
fillRect(real, 12, 8, 16, 11, GID.REAL_BLOCK);

const tileLayer = (id, name, data) => ({
  id,
  name,
  type: 'tilelayer',
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
  width: W,
  height: H,
  data,
});

// Objetos de juego (coordenadas en píxeles; rects con origen arriba-izquierda)
const objects = [
  // punto de aparición inicial del jugador (centro del personaje)
  { id: 1, name: 'spawn', type: 'spawn', x: 40, y: 216, point: true, visible: true, rotation: 0 },
  // checkpoint junto al spawn (se activa nada más empezar)
  { id: 2, name: 'cp-left', type: 'checkpoint', x: 24, y: 208, width: 16, height: 32, visible: true, rotation: 0 },
  // checkpoint al otro lado del foso y del muro SIM
  { id: 3, name: 'cp-right', type: 'checkpoint', x: 384, y: 208, width: 16, height: 32, visible: true, rotation: 0 },
  // zona de muerte dentro del foso (mata antes de salir del mapa)
  { id: 4, name: 'kill-pit', type: 'kill', x: 288, y: 264, width: 48, height: 24, visible: true, rotation: 0 },
  // mitad derecha: segundo foso y checkpoint lejano
  { id: 5, name: 'kill-pit-2', type: 'kill', x: 672, y: 264, width: 48, height: 24, visible: true, rotation: 0 },
  { id: 6, name: 'cp-far', type: 'checkpoint', x: 800, y: 208, width: 16, height: 32, visible: true, rotation: 0 },
];

const objectLayer = {
  id: 4,
  name: 'OBJECTS',
  type: 'objectgroup',
  visible: true,
  opacity: 1,
  x: 0,
  y: 0,
  draworder: 'topdown',
  objects,
};

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: 16,
  tileheight: 16,
  compressionlevel: -1,
  nextlayerid: 5,
  nextobjectid: 7,
  tilesets: [
    {
      firstgid: 1,
      name: 'tileset',
      image: '../sprites/tileset.png',
      imagewidth: 128,
      imageheight: 16,
      tilewidth: 16,
      tileheight: 16,
      tilecount: 8,
      columns: 8,
      margin: 0,
      spacing: 0,
    },
  ],
  layers: [tileLayer(1, 'COMMON', common), tileLayer(2, 'SIM', sim), tileLayer(3, 'REAL', real), objectLayer],
};

const out = new URL('../public/assets/maps/test-dual.json', import.meta.url);
writeFileSync(out, JSON.stringify(map));
console.log('test-dual.json generado');
