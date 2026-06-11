// Genera public/assets/sprites/tileset.png: tileset placeholder 16×16 con
// las paletas por capa del GDD §7 — SIM (cyan limpio), REAL (gris-azul +
// óxido), COMMON (neutro). Sin dependencias: codifica el PNG a mano.
//
// Uso: node scripts/generate-tileset.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const TILE = 16;
const COLS = 11;
const WIDTH = TILE * COLS;
const HEIGHT = TILE;

/** '#rrggbb' → [r, g, b, 255] */
const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
  255,
];

/** Oscurece un color multiplicando sus canales. */
const darken = ([r, g, b, a], f) => [Math.round(r * f), Math.round(g * f), Math.round(b * f), a];

const TRANSPARENT = [0, 0, 0, 0];

// ——— Pistas de entorno (F4.P4, GDD §7): tiles con transparencia ———
// Vocabulario al servicio de la regla de oro: el entorno susurra la geometría
// del otro mundo. Deben ser visibles pero NO obvias a primera vista.

// Sombra que no corresponde a nada visible: dither oscuro translúcido.
const SHADOW_COLOR = [8, 10, 14, 88];
function paintShadow(x, y) {
  // tablero irregular: más denso al centro vertical, desflecado en los bordes
  const on = (x + y) % 2 === 0 && (x * 5 + y * 11) % 17 !== 0;
  return on ? SHADOW_COLOR : TRANSPARENT;
}

// Escombros que asoman por el borde inferior: montículos grises en la base.
const DEBRIS_BODY = hex('#4a5260');
const DEBRIS_DARK = hex('#2a2f38');
const DEBRIS_RUST = hex('#6a4438');
function paintDebris(x, y) {
  // tres montículos de alturas distintas (perfil determinista por columna)
  const profile = [3, 5, 6, 4, 2, 1, 3, 6, 8, 6, 3, 1, 2, 4, 5, 3];
  const h = profile[x];
  if (y < TILE - h) {
    return TRANSPARENT;
  }
  if (y === TILE - h) return DEBRIS_DARK; // cresta oscura
  return (x * 7 + y * 13) % 11 === 0 ? DEBRIS_RUST : DEBRIS_BODY;
}

// Marca de desgaste donde "algo" apoya en el otro mundo: rasguños cortos
// sobre el borde superior (la cara que se pisa) del tile de debajo.
const WEAR_COLOR = [40, 44, 52, 215];
function paintWear(x, y) {
  if (y > 2) {
    return TRANSPARENT;
  }
  // guiones horizontales descolocados por fila
  const dash = (x + y * 5) % 7;
  return dash < 3 && (x * 3 + y) % 4 !== 0 ? WEAR_COLOR : TRANSPARENT;
}

// Definición de tiles (índice = GID - 1 en los mapas de Tiled):
//   1 SIM bloque · 2 SIM plataforma · 3 REAL bloque · 4 REAL plataforma
//   5 COMMON bloque · 6 COMMON plataforma · 7 reservado/debug · 8 relleno
//   9 DECOR sombra · 10 DECOR escombros · 11 DECOR desgaste (pistas, F4.P4)
const tiles = [
  { fill: '#1f4e5c', top: '#7fd8d8', speck: null }, // SIM: cyan limpio
  { fill: '#173a45', top: '#5fb8c8', speck: null },
  { fill: '#3a4250', top: '#8a4a3a', speck: '#2a2f38' }, // REAL: gris-azul + óxido
  { fill: '#2e3540', top: '#7a4032', speck: '#242a33' },
  { fill: '#586070', top: '#9aa4b4', speck: null }, // COMMON: neutro
  { fill: '#474f5d', top: '#8a94a2', speck: null },
  { fill: '#5a2a5a', top: '#d860d8', speck: null }, // reservado (magenta debug)
  { fill: '#11151b', top: '#1d242e', speck: null }, // relleno oscuro
  { paint: paintShadow }, // DECOR: sombra sin emisor
  { paint: paintDebris }, // DECOR: escombros que asoman
  { paint: paintWear }, // DECOR: marca de desgaste
];

// --- raster RGBA con byte de filtro 0 por fila (formato PNG) ---
const STRIDE = 1 + WIDTH * 4;
const raw = Buffer.alloc(HEIGHT * STRIDE);

function setPixel(x, y, [r, g, b, a]) {
  const o = y * STRIDE + 1 + x * 4;
  raw[o] = r;
  raw[o + 1] = g;
  raw[o + 2] = b;
  raw[o + 3] = a;
}

tiles.forEach((def, idx) => {
  const ox = idx * TILE;
  if (def.paint) {
    // tile de pista (con transparencia): el pintor decide píxel a píxel
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        setPixel(ox + x, y, def.paint(x, y));
      }
    }
    return;
  }
  const fill = hex(def.fill);
  const top = hex(def.top);
  const speck = def.speck ? hex(def.speck) : null;
  const bottom = darken(fill, 0.7);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let color = fill;
      if (y <= 1) color = top; // borde superior claro: donde se pisa
      else if (y === TILE - 1) color = bottom;
      // moteado determinista (desgaste del mundo Real)
      else if (speck && (x * 7 + y * 13 + idx * 5) % 23 === 0) color = speck;
      setPixel(ox + x, y, color);
    }
  }
});

// --- codificación PNG mínima (IHDR + IDAT + IEND) ---
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // profundidad de bits
ihdr[9] = 6; // tipo de color: RGBA
// compresión, filtro e interlace quedan en 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('../public/assets/sprites/tileset.png', import.meta.url);
writeFileSync(out, png);
console.log(`tileset.png generado (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
