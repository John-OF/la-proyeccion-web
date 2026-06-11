import Phaser from 'phaser';
import { WORLD_SWITCH_GLITCH_DURATION } from '../config/constants';

// Glitch radial del cambio de mundo (GDD §3.1): onda de distorsión que se
// expande desde el jugador durante 0.3 s, sin tocar el control del personaje
// (el efecto es solo de render: no congela input ni física).
//
// Es un PostFX de cámara (WebGL). Anatomía del efecto:
//   - frente de onda: borde definido por delante y cola larga por detrás,
//     con refracción radial, slicing por filas y aberración cromática;
//   - residuo: la zona ya barrida queda glitcheada (slicing + estática
//     suaves) hasta que la transición termina — el efecto llena la pantalla;
//   - granos de luz: celdas que chispean acompañando el frente (la capa de
//     "bolitas" gruesas la ponen las partículas de la escena);
//   - tinte del mundo destino y parpadeo digital (el patrón aleatorio se
//     re-sortea varias veces durante la transición).
// El pulso del radar (F4.P2) reutilizará esta estética en versión sostenida
// (GDD §7).
//
// El epicentro se ancla al punto del MUNDO donde ocurrió el cambio y la
// escena lo reproyecta a pantalla cada frame (la cámara sigue moviéndose
// durante la transición, precisamente porque el control no se pierde).

// ——— Parámetros estéticos (calibrables en playtest) ———
/** Borde delantero del frente de onda (px de la resolución interna). */
const FRONT_EDGE_PX = 14;
/** Cola del frente de onda hacia el interior (px). */
const FRONT_TAIL_PX = 70;
/** Fuerza del glitch residual en la zona ya barrida (0–1). */
const RESIDUE_GAIN = 0.3;
/** Empuje radial máximo de la refracción (px). */
const REFRACTION_PX = 10;
/** Desplazamiento horizontal máximo del slicing por filas (px). */
const SLICE_JITTER_PX = 10;
/** Alto de cada fila del slicing (px). */
const SLICE_ROW_PX = 3;
/** Separación máxima de canales RGB en el frente (px). */
const CHROMATIC_PX = 4;
/** Cantidad de sectores angulares en que se rompe el frente. */
const RING_SECTORS = 28;
/** Re-sorteos del patrón aleatorio durante la transición (parpadeo digital). */
const PATTERN_REROLLS = 8;
/** Mezcla del tinte del mundo destino dentro del frente (0–1). */
const TINT_MIX = 0.22;
/** Amplitud del ruido de estática (0–1). */
const STATIC_NOISE = 0.3;
/** Lado de la celda de los granos de luz (px) — bolitas de ~la mitad. */
const SPARK_CELL_PX = 6;
/** Fracción de celdas encendidas (umbral 0–1; más alto = menos granos). */
const SPARK_THRESHOLD = 0.9;
/** Brillo de los granos de luz (aditivo). */
const SPARK_GAIN = 1.1;
/** Brillo del anillo del frente como luz propia (aditivo). */
const RIM_GAIN = 0.4;

/** Formatea un número como literal float de GLSL ES (siempre con decimales). */
const f = (n: number): string => n.toFixed(4);

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uProgress;
uniform float uSeed;
uniform vec3 uTint;

varying vec2 outTexCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main () {
  vec2 uv = outTexCoord;

  // inactivo: passthrough (rama uniforme: todo el quad la toma a la vez)
  if (uProgress >= 1.0) {
    gl_FragColor = texture2D(uMainSampler, uv);
    return;
  }

  vec2 fragPx = uv * uResolution;
  vec2 toFrag = fragPx - uCenter;
  float dist = length(toFrag);
  vec2 dir = dist > 0.001 ? toFrag / dist : vec2(0.0, 0.0);

  // frente de onda: alcanza la esquina más lejana justo al terminar
  float maxRadius = length(max(uCenter, uResolution - uCenter)) + ${f(FRONT_EDGE_PX)};
  float radius = uProgress * maxRadius;

  // envolvente temporal: plena casi toda la transición, cae solo al final
  // (así el frente llega VISIBLE a los bordes de la pantalla)
  float envelope = 1.0 - smoothstep(0.65, 1.0, uProgress);

  // frente asimétrico: borde definido por delante, cola larga por detrás
  float dr = dist - radius;
  float front = 1.0 - smoothstep(0.0, ${f(FRONT_EDGE_PX)}, dr);
  float tail = 1.0 - smoothstep(0.0, ${f(FRONT_TAIL_PX)}, -dr);
  float ring = front * tail;

  // residuo: toda la zona ya barrida queda perturbada hasta el final
  float inside = 1.0 - smoothstep(0.0, ${f(FRONT_EDGE_PX)}, dr);

  // frente roto en sectores re-sorteados durante la transición (parpadeo digital)
  float reroll = floor(uProgress * ${f(PATTERN_REROLLS)});
  float angle = atan(toFrag.y, toFrag.x);
  float sector = floor((angle / 6.2831853 + 0.5) * ${f(RING_SECTORS)});
  float sectorGain = 0.55 + 0.45 * hash(vec2(sector, uSeed + reroll));

  float strength = min(ring * sectorGain + inside * ${f(RESIDUE_GAIN)}, 1.0) * envelope;

  // 1) refracción radial del frente
  vec2 offsetPx = dir * (strength * ${f(REFRACTION_PX)});

  // 2) slicing horizontal por filas, re-sorteado con el mismo parpadeo
  float row = floor(fragPx.y / ${f(SLICE_ROW_PX)});
  float jitter = hash(vec2(row, uSeed + reroll)) * 2.0 - 1.0;
  offsetPx.x += jitter * strength * ${f(SLICE_JITTER_PX)};

  vec2 sampleUv = uv - offsetPx / uResolution;

  // 3) aberración cromática radial
  vec2 ca = dir * (strength * ${f(CHROMATIC_PX)}) / uResolution;
  float r = texture2D(uMainSampler, sampleUv + ca).r;
  float g = texture2D(uMainSampler, sampleUv).g;
  float b = texture2D(uMainSampler, sampleUv - ca).b;
  vec3 color = vec3(r, g, b);

  // 4) tinte del mundo destino + estática
  color = mix(color, uTint, strength * ${f(TINT_MIX)});
  color += (hash(fragPx + uSeed * 251.0) - 0.5) * (strength * ${f(STATIC_NOISE)});

  // 5) granos de luz: celdas que chispean en el frente (y algo en el residuo)
  vec2 cell = floor(fragPx / ${f(SPARK_CELL_PX)});
  float sparkSeed = hash(cell + vec2(uSeed, reroll * 7.0));
  float sparkOn = step(${f(SPARK_THRESHOLD)}, sparkSeed);
  vec2 cellUv = fract(fragPx / ${f(SPARK_CELL_PX)}) - 0.5;
  float sparkDot = 1.0 - smoothstep(0.1, 0.5, length(cellUv));
  float spark = sparkOn * sparkDot * (ring + inside * 0.25) * envelope;
  vec3 sparkColor = mix(uTint, vec3(1.0), 0.55);
  color += sparkColor * (spark * ${f(SPARK_GAIN)});

  // 6) el frente brilla como anillo de luz propio
  color += uTint * (ring * envelope * ${f(RIM_GAIN)});

  gl_FragColor = vec4(color, 1.0);
}
`;

export class RadialGlitchPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** 0→1 durante la transición; >= 1 significa inactivo (passthrough). */
  private progress = 1;
  /** Epicentro en coordenadas del mundo (donde estaba el jugador al cambiar). */
  private originWorldX = 0;
  private originWorldY = 0;
  /** Epicentro reproyectado a pantalla (px internos, Y hacia abajo). */
  private screenX = 0;
  private screenY = 0;
  /** Semilla aleatoria por disparo: cada cambio glitchea distinto. */
  private seed = 0;
  private tintR = 1;
  private tintG = 1;
  private tintB = 1;

  constructor(game: Phaser.Game) {
    super({ game, name: 'RadialGlitchPostFX', fragShader: FRAG_SHADER });
  }

  get isActive(): boolean {
    return this.progress < 1;
  }

  /** Segundos transcurridos de la transición actual (para el overlay de debug). */
  get elapsedSeconds(): number {
    return this.progress * WORLD_SWITCH_GLITCH_DURATION;
  }

  /** Dispara la onda desde un punto del mundo, con el tinte (0–1) del mundo destino. */
  trigger(worldX: number, worldY: number, r: number, g: number, b: number): void {
    this.originWorldX = worldX;
    this.originWorldY = worldY;
    this.tintR = r;
    this.tintG = g;
    this.tintB = b;
    this.seed = Math.random() * 1000;
    this.progress = 0;
  }

  /** Avanza la transición y reproyecta el epicentro con el scroll de la cámara. */
  updateEffect(deltaSeconds: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.isActive) {
      return;
    }
    this.progress = Math.min(1, this.progress + deltaSeconds / WORLD_SWITCH_GLITCH_DURATION);
    // zoom = 1 en este prototipo (480×270 nativos): basta restar el scroll
    this.screenX = this.originWorldX - camera.scrollX;
    this.screenY = this.originWorldY - camera.scrollY;
  }

  onPreRender(): void {
    this.set1f('uProgress', this.progress);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    // El render target de la cámara usa origen GL (abajo-izquierda): Y se invierte
    this.set2f('uCenter', this.screenX, this.renderer.height - this.screenY);
    this.set1f('uSeed', this.seed);
    this.set3f('uTint', this.tintR, this.tintG, this.tintB);
  }
}
