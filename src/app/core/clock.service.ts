import { Injectable, signal } from '@angular/core';

/** Heure courante rafraîchie régulièrement, pour « il y a 5 min » et le badge « Nouveau » */
@Injectable({ providedIn: 'root' })
export class ClockService {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 30_000);
  }
}
