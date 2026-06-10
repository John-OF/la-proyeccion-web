import Phaser from 'phaser';
import { GAMEPAD_DEADZONE, GAMEPAD_TRIGGER_THRESHOLD } from '../config/constants';

/** Acciones abstractas del juego. El resto del código consume estas
 *  acciones, nunca teclas o botones directos (regla de F2.P2). */
export type GameAction =
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'interact'
  | 'switchWorld'
  | 'radar';

export type InputSource = 'teclado' | 'mando';

const ALL_ACTIONS: readonly GameAction[] = [
  'moveLeft',
  'moveRight',
  'jump',
  'interact',
  'switchWorld',
  'radar',
];

// Capa única de entrada (GDD §3.3: soporte completo de teclado y mando).
// Mapa confirmado por el autor (PLAN.md Q3):
//   teclado: ←→/A-D mover · Espacio saltar · E interactuar · Shift cambiar mundo · Q radar
//   mando:   stick/cruceta mover · Sur saltar · Oeste interactuar · hombro/gatillo der. cambiar · Norte radar
// update() debe llamarse una vez por frame ANTES de consumir isDown/justPressed.
export class InputManager {
  private readonly keysByAction: Record<GameAction, Phaser.Input.Keyboard.Key[]>;
  private readonly padPlugin: Phaser.Input.Gamepad.GamepadPlugin | null;

  private down = {} as Record<GameAction, boolean>;
  private prevDown = {} as Record<GameAction, boolean>;
  private sources = {} as Record<GameAction, InputSource | null>;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keysByAction = {
      moveLeft: [keyboard.addKey(K.LEFT), keyboard.addKey(K.A)],
      moveRight: [keyboard.addKey(K.RIGHT), keyboard.addKey(K.D)],
      jump: [keyboard.addKey(K.SPACE)],
      interact: [keyboard.addKey(K.E)],
      switchWorld: [keyboard.addKey(K.SHIFT)],
      radar: [keyboard.addKey(K.Q)],
    };
    this.padPlugin = scene.input.gamepad ?? null;

    for (const action of ALL_ACTIONS) {
      this.down[action] = false;
      this.prevDown[action] = false;
      this.sources[action] = null;
    }
  }

  /** Muestrea teclado y mando y refresca el estado de todas las acciones. */
  update(): void {
    const pad = this.connectedPad;
    for (const action of ALL_ACTIONS) {
      this.prevDown[action] = this.down[action];
      const keyboardDown = this.keysByAction[action].some((key) => key.isDown);
      const padDown = pad !== null && this.readPad(pad, action);
      this.down[action] = keyboardDown || padDown;
      this.sources[action] = keyboardDown ? 'teclado' : padDown ? 'mando' : null;
    }
  }

  /** La acción está mantenida este frame. */
  isDown(action: GameAction): boolean {
    return this.down[action];
  }

  /** La acción pasó de suelta a pulsada en este frame. */
  justPressed(action: GameAction): boolean {
    return this.down[action] && !this.prevDown[action];
  }

  /** Origen de la acción activa este frame (depuración). */
  sourceOf(action: GameAction): InputSource | null {
    return this.sources[action];
  }

  /** Primer mando conectado, si lo hay (el navegador lo expone tras pulsar un botón). */
  get connectedPad(): Phaser.Input.Gamepad.Gamepad | null {
    if (!this.padPlugin) {
      return null;
    }
    const pad = this.padPlugin.gamepads.find((p) => p && p.connected);
    return pad ?? null;
  }

  /** Resumen de acciones activas con su origen, para el overlay F9. */
  debugSummary(): string {
    const active = ALL_ACTIONS.filter((action) => this.down[action]).map(
      (action) => `${action}@${this.sources[action]}`,
    );
    return active.length > 0 ? active.join('  ') : '—';
  }

  private readPad(pad: Phaser.Input.Gamepad.Gamepad, action: GameAction): boolean {
    switch (action) {
      case 'moveLeft':
        return pad.left || pad.leftStick.x < -GAMEPAD_DEADZONE;
      case 'moveRight':
        return pad.right || pad.leftStick.x > GAMEPAD_DEADZONE;
      case 'jump':
        return pad.A; // botón Sur (A en Xbox, ✕ en PlayStation)
      case 'interact':
        return pad.X; // botón Oeste (X en Xbox, □ en PlayStation)
      case 'switchWorld':
        // hombro o gatillo derecho (R1/RB o R2/RT); los getters devuelven 0–1
        return pad.R1 > GAMEPAD_TRIGGER_THRESHOLD || pad.R2 > GAMEPAD_TRIGGER_THRESHOLD;
      case 'radar':
        return pad.Y; // botón Norte (Y en Xbox, △ en PlayStation)
    }
  }
}
