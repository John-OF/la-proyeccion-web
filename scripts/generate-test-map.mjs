// Genera public/assets/maps/test-dual.json: mapa de pruebas en formato Tiled
// (abrible en el editor Tiled) con la convención de capas del proyecto:
// COMMON (ambos mundos) / SIM (solo Simulación) / REAL (solo Real) + capa de
// objetos OBJECTS (spawn / checkpoint / kill).
// Ver la convención completa en src/systems/DualTilemap.ts.
//
// Uso: node scripts/generate-test-map.mjs
import { writeFileSync } from 'node:fs';

const W = 78; // 78 × 16 px = 1248 px; cols 60+ son el testbed de la regla de oro (F4.P4)
const H = 17;

// GIDs del tileset (scripts/generate-tileset.mjs)
const GID = {
  SIM_BLOCK: 1,
  SIM_PLATFORM: 2,
  REAL_BLOCK: 3,
  REAL_PLATFORM: 4,
  COMMON_BLOCK: 5,
  COMMON_PLATFORM: 6,
  DECOR_SHADOW: 9,
  DECOR_DEBRIS: 10,
  DECOR_WEAR: 11,
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
// testbed de la regla de oro (F4.P4): FOSO ANCHO (cols 64–69 = 96 px,
// insaltable de un tirón) cuya plataforma intermedia existe SOLO en el Real
fillRect(common, 64, 15, 69, 16, 0);
fillRect(common, 77, 11, 77, 14, GID.COMMON_BLOCK); // tope del mapa

// SIM: plataforma izquierda + PARED solo-Simulación (puzzle de existencia
// dual, F3.P4: 4 tiles — no saltable; se pasa cambiando al Real)
const sim = emptyGrid();
fillRect(sim, 3, 12, 7, 12, GID.SIM_PLATFORM);
fillRect(sim, 22, 11, 22, 14, GID.SIM_BLOCK);
fillRect(sim, 46, 12, 49, 12, GID.SIM_PLATFORM); // plataforma SIM en la mitad derecha

// REAL: muro bajo (se atraviesa con SIM activo) + plataforma derecha — solo en el Real
const real = emptyGrid();
fillRect(real, 9, 13, 9, 14, GID.REAL_BLOCK);
fillRect(real, 23, 12, 27, 12, GID.REAL_PLATFORM);
// masa sólida grande sobre la plataforma central: cambiar a REAL parado en el
// centro de la plataforma no tiene posición válida en el radio → SafePush falla
fillRect(real, 12, 8, 16, 11, GID.REAL_BLOCK);
// plataforma intermedia del foso de la regla de oro: solo en el Real, a un
// tile del suelo (salto cómodo desde cualquiera de los dos labios)
fillRect(real, 66, 14, 67, 14, GID.REAL_PLATFORM);

// DECOR: pistas de entorno (F4.P4, GDD §7) — capa SIN colisión, visible en
// ambos mundos. Susurra la plataforma del Real a quien mira desde la
// Simulación: desgaste en los labios, sombra sin emisor, escombros abajo.
const decor = emptyGrid();
fillRect(decor, 63, 15, 63, 15, GID.DECOR_WEAR); // labio izquierdo: despegue
fillRect(decor, 70, 15, 70, 15, GID.DECOR_WEAR); // labio derecho: aterrizaje
fillRect(decor, 66, 15, 67, 15, GID.DECOR_SHADOW); // sombra bajo la plataforma fantasma
fillRect(decor, 65, 16, 68, 16, GID.DECOR_DEBRIS); // escombros asoman por el borde inferior

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
  // mitad derecha: segundo foso y checkpoint lejano (tras la decisión falsa)
  { id: 5, name: 'kill-pit-2', type: 'kill', x: 672, y: 264, width: 48, height: 24, visible: true, rotation: 0 },
  { id: 6, name: 'cp-far', type: 'checkpoint', x: 896, y: 208, width: 16, height: 32, visible: true, rotation: 0 },
  // puzzle 2 — posicionamiento (F3.P2): puerta común (4 tiles: no saltable)
  // entre dos switches de mundos opuestos — el del Real abre, el de la
  // Simulación cierra. Cableado por propiedades (convención en DualTilemap).
  { id: 10, name: 'gate-a', type: 'gate', x: 528, y: 176, width: 16, height: 64, visible: true, rotation: 0 },
  {
    id: 11, name: 'sw-open-real', type: 'switch', x: 496, y: 235, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'world', type: 'string', value: 'REAL' },
      { name: 'target', type: 'string', value: 'gate-a' },
      { name: 'action', type: 'string', value: 'open' },
    ],
  },
  {
    id: 12, name: 'sw-close-sim', type: 'switch', x: 576, y: 235, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'world', type: 'string', value: 'SIM' },
      { name: 'target', type: 'string', value: 'gate-a' },
      { name: 'action', type: 'string', value: 'close' },
    ],
  },
  // letrero diegético canon de Z1 (F3.P3): limpio en la Simulación, su
  // versión rota y en rojo en el Real (la corrupción del Real es de autoría)
  {
    id: 13, name: 'sign-bien', type: 'sign', x: 236, y: 176, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'textSim', type: 'string', value: 'TODO ESTÁ BIEN' },
      { name: 'textReal', type: 'string', value: 'T0DO ES B|EN.' },
    ],
  },
  // puzzle 3 — secuencia (F3.P4): seq-1 (solo SIM) y luego seq-2 (solo REAL)
  // abren gate-c; en orden incorrecto la secuencia se resetea
  { id: 14, name: 'gate-c', type: 'gate', x: 656, y: 176, width: 16, height: 64, visible: true, rotation: 0 },
  {
    id: 15, name: 'seq-1', type: 'switch', x: 608, y: 235, point: true, visible: true, rotation: 0,
    properties: [{ name: 'world', type: 'string', value: 'SIM' }],
  },
  {
    id: 16, name: 'seq-2', type: 'switch', x: 632, y: 235, point: true, visible: true, rotation: 0,
    properties: [{ name: 'world', type: 'string', value: 'REAL' }],
  },
  {
    id: 17, name: 'seq-gate-c', type: 'sequence', x: 620, y: 220, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'steps', type: 'string', value: 'seq-1,seq-2' },
      { name: 'target', type: 'string', value: 'gate-c' },
      { name: 'action', type: 'string', value: 'open' },
    ],
  },
  // puzzle 4 — decisión falsa (F3.P4): dos puertas idénticas, mismo destino
  // (ambas abren gate-d) y Keplin aprueba cualquiera: "Buena elección."
  { id: 18, name: 'gate-d', type: 'gate', x: 832, y: 176, width: 16, height: 64, visible: true, rotation: 0 },
  {
    id: 19, name: 'door-1', type: 'switch', x: 776, y: 235, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'visual', type: 'string', value: 'door' },
      { name: 'target', type: 'string', value: 'gate-d' },
      { name: 'action', type: 'string', value: 'open' },
      { name: 'keplinOnUse', type: 'string', value: 'Buena elección.' },
    ],
  },
  {
    id: 20, name: 'door-2', type: 'switch', x: 800, y: 235, point: true, visible: true, rotation: 0,
    properties: [
      { name: 'visual', type: 'string', value: 'door' },
      { name: 'target', type: 'string', value: 'gate-d' },
      { name: 'action', type: 'string', value: 'open' },
      { name: 'keplinOnUse', type: 'string', value: 'Buena elección.' },
    ],
  },
  // semillas de prueba (F4.P1): tres en el tramo inicial para ejercitar el
  // inventario (capacidad 1 del mapa; toggle dev I la alterna a 2).
  // seed-3 es transdimensional (F4.P3): existe solo en el Real
  { id: 21, name: 'seed-1', type: 'seed', x: 64, y: 233, point: true, visible: true, rotation: 0 },
  { id: 22, name: 'seed-2', type: 'seed', x: 168, y: 233, point: true, visible: true, rotation: 0 },
  {
    id: 23, name: 'seed-3', type: 'seed', x: 280, y: 233, point: true, visible: true, rotation: 0,
    properties: [{ name: 'world', type: 'string', value: 'REAL' }],
  },
  // testbed de la regla de oro (F4.P4): checkpoint AL BORDE del foso (prueba
  // y error de bajo costo), muerte en el foso y semilla para la ruta cómoda
  { id: 24, name: 'cp-radar', type: 'checkpoint', x: 992, y: 208, width: 16, height: 32, visible: true, rotation: 0 },
  { id: 25, name: 'kill-pit-3', type: 'kill', x: 1024, y: 264, width: 96, height: 24, visible: true, rotation: 0 },
  { id: 26, name: 'seed-4', type: 'seed', x: 968, y: 233, point: true, visible: true, rotation: 0 },
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
  nextlayerid: 6,
  nextobjectid: 27,
  properties: [
    // capacidad del inventario de semillas en este mapa (GDD §4: Z4 usa 2)
    { name: 'seedCapacity', type: 'int', value: 1 },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'tileset',
      image: '../sprites/tileset.png',
      imagewidth: 176,
      imageheight: 16,
      tilewidth: 16,
      tileheight: 16,
      tilecount: 11,
      columns: 11,
      margin: 0,
      spacing: 0,
    },
  ],
  layers: [
    tileLayer(1, 'COMMON', common),
    tileLayer(2, 'SIM', sim),
    tileLayer(3, 'REAL', real),
    tileLayer(5, 'DECOR', decor),
    objectLayer,
  ],
};

const out = new URL('../public/assets/maps/test-dual.json', import.meta.url);
writeFileSync(out, JSON.stringify(map));
console.log('test-dual.json generado');
