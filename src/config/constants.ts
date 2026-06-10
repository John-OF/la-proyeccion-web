// Constantes de diseño del prototipo. Los valores que provienen del GDD
// citan su sección; los provisionales se calibran en playtest. Nada de
// números mágicos sueltos en la lógica.

/** Resolución interna del juego (pixel art, escalado FIT). Decisión de stack F1.P1. */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

/** Tamaño de tile en píxeles. Decisión de stack F1.P1 (mapas de Tiled desde F2.P3). */
export const TILE_SIZE = 16;

/** Lado del cuadrado del jugador (px). Provisional: sprite real en fases de contenido. */
export const PLAYER_SIZE = 14;

/** Gravedad vertical (px/s²). Provisional, a calibrar en playtest. */
export const GRAVITY_Y = 1000;

/** Velocidad horizontal constante (px/s) — GDD §3.3: "velocidad constante, sin aceleración exagerada". */
export const PLAYER_SPEED = 110;

/** Impulso de salto (px/s). Provisional, a calibrar en playtest (altura actual ≈ 3 tiles). */
export const PLAYER_JUMP_VELOCITY = 320;

/** Coyote time (s) — GDD §3.3: 0.1 s para saltar tras dejar el borde. */
export const COYOTE_TIME = 0.1;

/** Jump buffer (s) — GDD §3.3: 0.1 s de memoria de la pulsación antes de aterrizar. */
export const JUMP_BUFFER_TIME = 0.1;

/** Tope de velocidad de caída (px/s) — GDD §3.3: "velocidad de caída limitada". Provisional. */
export const MAX_FALL_SPEED = 360;

/** Cooldown entre cambios de mundo (s) — GDD §3.1: 0.4 s. */
export const WORLD_SWITCH_COOLDOWN = 0.4;

/** Fundidos de muerte (s) — GDD §3.5: muerte barata, recarga rápida, sin pantalla de derrota. */
export const DEATH_FADE_OUT = 0.14;
export const DEATH_FADE_IN = 0.16;

/** Margen bajo el borde inferior del mapa (px) para considerar muerte por caída. */
export const FALL_DEATH_MARGIN = 32;

/** SafePush (GDD §3.1): radio máximo de empuje a una posición válida (px; 2 tiles). */
export const SAFE_PUSH_RADIUS = 32;

/** Cámara: interpolación del seguimiento (fracción por frame a 60 fps). Provisional. */
export const CAMERA_LERP = 0.12;

/** Cámara: deadzone (px) — el jugador se mueve libre dentro sin arrastrar la cámara. */
export const CAMERA_DEADZONE_WIDTH = 80;
export const CAMERA_DEADZONE_HEIGHT = 96;

/** Cámara: lookahead horizontal leve (px) en la dirección de movimiento. Provisional. */
export const CAMERA_LOOKAHEAD = 24;

/** Cámara: velocidad de suavizado del lookahead (1/s). Provisional. */
export const CAMERA_LOOKAHEAD_SMOOTHING = 4;

/** Zona muerta del stick del mando (0–1) para convertirlo en dirección digital. Provisional. */
export const GAMEPAD_DEADZONE = 0.35;

/** Umbral de hombro/gatillo del mando (0–1) para considerarlo pulsado. Provisional. */
export const GAMEPAD_TRIGGER_THRESHOLD = 0.5;
