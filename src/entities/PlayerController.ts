import Phaser from 'phaser';
import {
  PLAYER_SIZE,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  MAX_FALL_SPEED,
} from '../config/constants';

/** Intención de movimiento de un frame. Hoy la produce el teclado en la
 *  escena; en F2.P2 la producirá el InputManager (teclado + mando). */
export interface MoveIntent {
  left: boolean;
  right: boolean;
  jumpJustPressed: boolean;
}

/** Estado interno expuesto para el overlay de depuración. */
export interface PlayerDebugState {
  onGround: boolean;
  jumpConsumed: boolean;
  coyoteSeconds: number;
  bufferSeconds: number;
  vx: number;
  vy: number;
}

// Controlador del jugador — GDD §3.3: velocidad horizontal constante,
// salto único con coyote time y jump buffer, velocidad de caída limitada.
// Sin doble salto. Sin combate.
export class PlayerController {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;

  /** Ventana restante para saltar tras dejar el suelo sin haber saltado. */
  private coyoteTimer = 0;
  /** Memoria restante de una pulsación de salto hecha antes de poder saltar. */
  private bufferTimer = 0;
  /** El salto único ya se gastó; se repone al volver a pisar suelo. */
  private jumpConsumed = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.gameObject = scene.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, 0x7fd8d8);
    scene.physics.add.existing(this.gameObject);
    this.body = this.gameObject.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
  }

  get onGround(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  update(intent: MoveIntent, deltaSeconds: number): void {
    // Horizontal: velocidad constante, arranque y parada en seco (GDD §3.3)
    if (intent.left && !intent.right) {
      this.body.setVelocityX(-PLAYER_SPEED);
    } else if (intent.right && !intent.left) {
      this.body.setVelocityX(PLAYER_SPEED);
    } else {
      this.body.setVelocityX(0);
    }

    // Coyote: pisar suelo repone la ventana y el salto único
    if (this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
      this.jumpConsumed = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaSeconds);
    }

    // Buffer: la pulsación se recuerda un instante aunque aún no se pueda saltar
    if (intent.jumpJustPressed) {
      this.bufferTimer = JUMP_BUFFER_TIME;
    } else {
      this.bufferTimer = Math.max(0, this.bufferTimer - deltaSeconds);
    }

    // Salto único: con apoyo o dentro de la ventana de coyote
    const canJump = !this.jumpConsumed && (this.onGround || this.coyoteTimer > 0);
    if (this.bufferTimer > 0 && canJump) {
      this.body.setVelocityY(-PLAYER_JUMP_VELOCITY);
      this.jumpConsumed = true;
      this.bufferTimer = 0;
      this.coyoteTimer = 0; // consumida: el coyote no puede dar un segundo salto
    }

    // Tope de caída (GDD §3.3) — solo hacia abajo: no recorta el impulso de salto
    if (this.body.velocity.y > MAX_FALL_SPEED) {
      this.body.setVelocityY(MAX_FALL_SPEED);
    }
  }

  /** Recoloca al jugador (respawn): resetea cuerpo, velocidad y estado de salto. */
  teleport(x: number, y: number): void {
    this.body.reset(x, y);
    this.coyoteTimer = 0;
    this.bufferTimer = 0;
    this.jumpConsumed = false;
  }

  get debugState(): PlayerDebugState {
    return {
      onGround: this.onGround,
      jumpConsumed: this.jumpConsumed,
      coyoteSeconds: this.coyoteTimer,
      bufferSeconds: this.bufferTimer,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
    };
  }
}
