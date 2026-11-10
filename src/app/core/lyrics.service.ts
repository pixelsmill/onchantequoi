import { Injectable, signal } from '@angular/core';

const SIZE_STORE = 'chorale-paroles-taille';
export const LYRICS_SIZES = [22, 28, 34] as const;

/** Mode « paroles » plein écran : morceau affiché et taille du texte (retenue) */
@Injectable({ providedIn: 'root' })
export class LyricsService {
  /** Morceau dont on lit les paroles (null = fermé) */
  readonly songId = signal<string | null>(null);
  readonly sizeIndex = signal(this.readSize());

  open(songId: string): void {
    this.songId.set(songId);
  }

  close(): void {
    this.songId.set(null);
  }

  cycleSize(): void {
    this.sizeIndex.update((i) => (i + 1) % LYRICS_SIZES.length);
    try {
      localStorage.setItem(SIZE_STORE, String(this.sizeIndex()));
    } catch {
      // sans importance
    }
  }

  private readSize(): number {
    try {
      const i = Number(localStorage.getItem(SIZE_STORE) ?? 1);
      return Number.isInteger(i) && i >= 0 && i < LYRICS_SIZES.length ? i : 1;
    } catch {
      return 1;
    }
  }
}
