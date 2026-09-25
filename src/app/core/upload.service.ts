import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChoraleStore } from './chorale.store';
import { ToastService } from './toast.service';
import { guessType, isAudioFile, MAX_SIZE, plural, sha256 } from './utils';

/** Cache où le service worker range les audios partagés depuis WhatsApp (Android) */
export const SHARED_CACHE = 'shared';

/** Dépôt d'audios : bouton, glisser-déposer, partage Android */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly store = inject(ChoraleStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private queue: Promise<void> = Promise.resolve();
  readonly busy = signal(false);

  /** Les envois se suivent, même si on redépose pendant un envoi */
  upload(files: Iterable<File>): Promise<void> {
    const list = [...files];
    this.queue = this.queue.then(() => this.run(list)).catch((e) => console.warn(e));
    return this.queue;
  }

  private async run(input: File[]): Promise<void> {
    const all = input.filter((f) => f.size > 0);
    const files = all.filter(isAudioFile);
    if (!all.length) return;
    let added = 0;
    let dup = 0;
    let failed = 0;
    let tooBig = 0;
    const ignored = all.length - files.length;
    this.busy.set(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const step = files.length > 1 ? ` ${i + 1}/${files.length}` : '';
        this.toast.show(`Envoi${step}…`, 120_000);
        if (f.size >= MAX_SIZE) {
          tooBig++;
          continue;
        }
        try {
          const hash = await sha256(f);
          if (await this.store.exists(hash)) {
            dup++;
            continue;
          }
          await this.store.upload(f, f.name || 'audio', hash, guessType(f), (p) => {
            if (p > 0 && p < 1) this.toast.show(`Envoi${step}… ${Math.round(p * 100)} %`, 120_000);
          });
          added++;
        } catch (e) {
          console.warn(e);
          failed++;
        }
      }
    } finally {
      this.busy.set(false);
    }
    const parts: string[] = [];
    if (added) parts.push(`${plural(added, 'audio', 'audios')} à classer`);
    if (dup) parts.push(plural(dup, 'déjà reçu', 'déjà reçus'));
    if (tooBig) parts.push(plural(tooBig, 'trop gros', 'trop gros') + ' (40 Mo max)');
    if (ignored) parts.push(plural(ignored, 'fichier ignoré', 'fichiers ignorés') + ' (pas un audio)');
    if (failed) parts.push(`${failed} en échec`);
    this.toast.show(parts.join(' · ') || 'Rien à envoyer', 3500);
    if (added) await this.router.navigate(['/a-classer']);
  }

  /** Récupère les audios partagés depuis WhatsApp (rangés par le service worker) */
  async takeShared(): Promise<void> {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(SHARED_CACHE);
    const keys = await cache.keys();
    if (!keys.length) return;
    const files: File[] = [];
    for (const k of keys) {
      const r = await cache.match(k);
      if (r) {
        const b = await r.blob();
        const name = decodeURIComponent(r.headers.get('x-name') || 'audio');
        files.push(new File([b], name, { type: b.type }));
      }
      await cache.delete(k);
    }
    await this.upload(files);
  }
}
