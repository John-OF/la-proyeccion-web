import type { Switch } from '../entities/Switch';

// Puzzle de secuencia (GDD §3.4): varios switches deben activarse en un
// orden específico, normalmente alternando mundos. Reglas:
//   - usar el switch esperado lo enciende y avanza el progreso;
//   - usar uno fuera de orden resetea la secuencia (todos se apagan) — salvo
//     que sea el primer paso, que re-arranca la secuencia desde él;
//   - completada, ejecuta su efecto una vez y queda inerte (el puzzle está
//     resuelto; coherente con el checkpoint tras cada puzzle, GDD §3.5).
export class SwitchSequence {
  readonly label: string;

  private readonly steps: Switch[];
  private readonly onComplete: () => void;
  private progress = 0;
  private completed = false;

  constructor(label: string, steps: Switch[], onComplete: () => void) {
    this.label = label;
    this.steps = steps;
    this.onComplete = onComplete;
  }

  /** El cableado del loader llama esto cuando se usa un switch de la secuencia. */
  notify(used: Switch): void {
    if (this.completed) {
      return;
    }
    if (used === this.steps[this.progress]) {
      used.setOn(true);
      this.progress++;
      if (this.progress === this.steps.length) {
        this.completed = true;
        this.onComplete();
      }
      return;
    }
    // orden roto: reset; si lo usado es el primer paso, re-arranca desde él
    this.resetAll();
    if (used === this.steps[0]) {
      used.setOn(true);
      this.progress = 1;
    }
  }

  /** Estado para el overlay F9: "1/2" o "2/2 ✓". */
  get progressLabel(): string {
    return `${this.progress}/${this.steps.length}${this.completed ? ' ✓' : ''}`;
  }

  private resetAll(): void {
    for (const step of this.steps) {
      step.setOn(false);
    }
    this.progress = 0;
  }
}
