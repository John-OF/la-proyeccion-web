import { CORRUPTION_L1_CHANCE, CORRUPTION_L2_BLOCK_CHANCE } from '../config/constants';

// Protocolo de corrupción de texto (GDD §6.4) — termómetro narrativo sin UI:
//   nivel 0 (sistema estable):    "BIENVENIDO. TODO ESTA BIEN."
//   nivel 1 (Keplin alerta):      "BIENVEN|DO. TODO EST4 B|EN."
//   nivel 2 (corrección activa):  "██████. T██O ES██ B█EN."
// El render es DETERMINISTA por texto y nivel: un letrero corrupto siempre
// corrompe igual (no hierve frame a frame).

export type CorruptionLevel = 0 | 1 | 2;

/** Sustituciones del nivel 1, tomadas de los ejemplos canon del GDD. */
const LEVEL_1_SUBSTITUTIONS: Record<string, string> = {
  A: '4',
  Á: '4',
  I: '|',
  Í: '|',
  O: '0',
  Ó: '0',
};

/** PRNG determinista pequeño (mulberry32). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash simple del texto (djb2) como semilla. */
function hashText(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Aplica el nivel de corrupción a un texto (GDD §6.4). */
export function corruptText(text: string, level: CorruptionLevel): string {
  if (level === 0) {
    return text;
  }
  const random = mulberry32(hashText(text) + level * 7919);

  if (level === 1) {
    // caracteres extraños ocasionales; el resto sobrevive intacto
    return [...text]
      .map((ch) => {
        const substitute = LEVEL_1_SUBSTITUTIONS[ch.toUpperCase()];
        return substitute !== undefined && random() < CORRUPTION_L1_CHANCE ? substitute : ch;
      })
      .join('');
  }

  // nivel 2: bloques █ sobre letras y números; espacios y puntuación sobreviven
  return [...text]
    .map((ch) => {
      if (!/[\p{L}\p{N}]/u.test(ch)) {
        return ch;
      }
      return random() < CORRUPTION_L2_BLOCK_CHANCE ? '█' : ch;
    })
    .join('');
}
