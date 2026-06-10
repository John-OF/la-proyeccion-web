// Genera public/assets/sprites/tileset.png: tileset placeholder 16×16 con
// las paletas por capa del GDD §7 — SIM (cyan limpio), REAL (gris-azul +
// óxido), COMMON (neutro). Sin dependencias: codifica el PNG a mano.
//
// Uso: node scripts/generate-tileset.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const TILE = 16;
const COLS = 8;
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

// Definición de tiles (índice = GID - 1 en los mapas de Tiled):
//   1 SIM bloque · 2 SIM plataforma · 3 REAL bloque · 4 REAL plataforma
//   5 COMMON bloque · 6 COMMON plataforma · 7 reservado/debug · 8 relleno
const tiles = [
  { fill: '#1f4e5c', top: '#7fd8d8', speck: null }, // SIM: cyan limpio
  { fill: '#173a45', top: '#5fb8c8', speck: null },
  { fill: '#3a4250', top: '#8a4a3a', speck: '#2a2f38' }, // REAL: gris-azul + óxido
  { fill: '#2e3540', top: '#7a4032', speck: '#242a33' },
  { fill: '#586070', top: '#9aa4b4', speck: null }, // COMMON: neutro
  { fill: '#474f5d', top: '#8a94a2', speck: null },
  { fill: '#5a2a5a', top: '#d860d8', speck: null }, // reservado (magenta debug)
  { fill: '#11151b', top: '#1d242e', speck: null }, // relleno oscuro
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
  const fill = hex(def.fill);
  const top = hex(def.top);
  const speck = def.speck ? hex(def.speck) : null;
  const bottom = darken(fill, 0.7);
  const ox = idx * TILE;
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
