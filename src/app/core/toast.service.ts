import { Injectable, signal } from '@angular/core';

/** Petit message temporaire en haut de l'écran */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(msg: string, ms = 2600): void {
    this.message.set(msg);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), ms);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.message.set(null);
  }
}
