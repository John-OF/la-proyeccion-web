import Phaser from 'phaser';
import { RADAR_REVEAL_SECONDS, RADAR_EXPAND_SECONDS } from '../config/constants';

// Render del pulso del radar (GDD §3.2): PostFX aplicado a la CAPA del mundo
// opuesto mientras dura la revelación. Convierte sus tiles en una silueta
// fantasma pintada con la luz de la Semilla: contorno brillante, interior de
// dither "hirviente", jitter sostenido por filas (la estética del glitch de
// F2.P8 en versión sostenida, GDD §7) y parpadeo orgánico. Una onda desde el
// jugador la revela; lo revelado permanece hasta el fade out final.
//
// Solo es información visual: la capa opuesta nunca colisiona durante el
// pulso, y el control del personaje no se toca (leer y actuar, GDD §3.2).

// ——— Parámetros estéticos (calibrables en playtest) ———
/** Color de la silueta: la luz verde-cyan de la Semilla (0x9fe8c8). */
const SILHOUETTE_R = 0.62;
const SILHOUETTE_G = 0.91;
const SILHOUETTE_B = 0.78;
/** Alpha del interior de la silueta (base + variación de dither). */
const BODY_ALPHA_BASE = 0.16;
const BODY_ALPHA_NOISE = 0.22;
/** Alpha del contorno (base + variación). */
const EDGE_ALPHA_BASE = 0.55;
const EDGE_ALPHA_NOISE = 0.3;
/** Grosor de la detección de contorno (px). */
const EDGE_PX = 2;
/** Lado de la celda del dither (px). */
const DITHER_CELL_PX = 2;
/** Jitter horizontal sostenido por filas (px) y alto de fila (px). */
const ROW_JITTER_PX = 1.5;
const ROW_PX = 3;
/** "Ticks" del hervido por segundo (re-sorteo del ruido). */
const BOIL_TICKS_PER_SECOND = 18;
/** Banda y brillo del frente de onda durante la expansión. */
const RIM_BAND_PX = 14;
const RIM_GAIN = 0.8;
/** Último tramo del pulso dedicado al fade out (fracción 0–1). */
const FADE_OUT_START = 0.85;

/** Fracción de la duración total que dura la expansión de la onda. */
const EXPAND_FRACTION = RADAR_EXPAND_SECONDS / RADAR_REVEAL_SECONDS;
/** Ticks totales de hervido a lo largo del pulso. */
const BOIL_TICKS_TOTAL = BOIL_TICKS_PER_SECOND * RADAR_REVEAL_SECONDS;

/** Formatea un número como literal float de GLSL ES (siempre con decimales). */
const f = (n: number): string => n.toFixed(4);

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uProgress;

varying vec2 outTexCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main () {
  vec2 fragPx = outTexCoord * uResolution;
  float tick = floor(uProgress * ${f(BOIL_TICKS_TOTAL)});

  // jitter sostenido por filas (glitch en versión calmada): desplaza el MUESTREO
  float row = floor(fragPx.y / ${f(ROW_PX)});
  float jitter = (hash(vec2(row, tick)) * 2.0 - 1.0) * ${f(ROW_JITTER_PX)};
  vec2 uv = outTexCoord + vec2(jitter / uResolution.x, 0.0);

  vec4 src = texture2D(uMainSampler, uv);
  if (src.a < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // onda de revelado desde el jugador: lo barrido permanece visible
  float dist = distance(fragPx, uCenter);
  float maxRadius = length(max(uCenter, uResolution - uCenter)) + ${f(RIM_BAND_PX)};
  float radius = maxRadius * clamp(uProgress / ${f(EXPAND_FRACTION)}, 0.0, 1.0);
  float revealed = 1.0 - smoothstep(radius - 10.0, radius, dist);

  // frente brillante solo mientras la onda viaja
  float rim = (1.0 - smoothstep(0.0, ${f(RIM_BAND_PX)}, abs(dist - radius)))
    * (1.0 - step(${f(EXPAND_FRACTION)} + 0.05, uProgress));

  // contorno: algún vecino transparente = borde del tile
  vec2 px = vec2(${f(EDGE_PX)}) / uResolution;
  float aUp = texture2D(uMainSampler, uv + vec2(0.0, px.y)).a;
  float aDn = texture2D(uMainSampler, uv - vec2(0.0, px.y)).a;
  float aLf = texture2D(uMainSampler, uv - vec2(px.x, 0.0)).a;
  float aRt = texture2D(uMainSampler, uv + vec2(px.x, 0.0)).a;
  float edge = 1.0 - min(min(aUp, aDn), min(aLf, aRt));

  // dither que hierve: trazo ruidoso/borroso sin perder lectura (Pilar 3)
  float cellNoise = hash(floor(fragPx / ${f(DITHER_CELL_PX)}) + vec2(tick * 13.0, tick * 7.0));
  float bodyAlpha = ${f(BODY_ALPHA_BASE)} + ${f(BODY_ALPHA_NOISE)} * cellNoise;
  float edgeAlpha = ${f(EDGE_ALPHA_BASE)} + ${f(EDGE_ALPHA_NOISE)} * cellNoise;
  float alpha = mix(bodyAlpha, edgeAlpha, edge);

  // parpadeo global leve + fade out del tramo final
  float flicker = 0.88 + 0.12 * hash(vec2(tick, 1.0));
  float envelope = 1.0 - smoothstep(${f(FADE_OUT_START)}, 1.0, uProgress);
  alpha = (alpha * revealed + rim * 0.4) * flicker * envelope * src.a;

  vec3 color = vec3(${f(SILHOUETTE_R)}, ${f(SILHOUETTE_G)}, ${f(SILHOUETTE_B)})
    * (0.85 + 0.45 * edge + rim * ${f(RIM_GAIN)});

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export class RadarRevealPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** 0→1 a lo largo de RADAR_REVEAL_SECONDS; >= 1 = inactivo. */
  private progress = 1;
  /** Epicentro en pantalla (px internos, Y hacia abajo). */
  private screenX = 0;
  private screenY = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: 'RadarRevealPostFX', fragShader: FRAG_SHADER });
  }

  /** El RadarPulse actualiza el estado cada frame. */
  setEffect(progress: number, screenX: number, screenY: number): void {
    this.progress = progress;
    this.screenX = screenX;
    this.screenY = screenY;
  }

  onPreRender(): void {
    this.set1f('uProgress', this.progress);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    // origen GL abajo-izquierda: Y se invierte (misma convención que el glitch)
    this.set2f('uCenter', this.screenX, this.renderer.height - this.screenY);
  }
}
