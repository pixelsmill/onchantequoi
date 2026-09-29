import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChoraleStore } from './chorale.store';
import { ToastService } from './toast.service';
import { audioDuration } from './audio-duration';
import { guessType, isAudioFile, MAX_SIZE, plural, sha256 } from './utils';

/** Cache où le service worker range les audios partagés depuis une autre app (Android) */
export const SHARED_CACHE = 'shared';

/** Issue de l'envoi d'un fichier ; seul « failed » mérite un nouvel essai */
export type Outcome = 'added' | 'dup' | 'tooBig' | 'ignored' | 'failed';

/** Pendant un envoi, le message reste affiché (Storage peut réessayer plusieurs minutes) */
const PROGRESS_MS = 15 * 60_000;

/** Dépôt d'audios : bouton, glisser-déposer, partage Android */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly store = inject(ChoraleStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private queue: Promise<void> = Promise.resolve();
  readonly busy = signal(false);

  /** Les envois se suivent, même si on redépose pendant un envoi. Renvoie l'issue de chaque fichier. */
  upload(files: Iterable<File>): Promise<Outcome[]> {
    const list = [...files];
    const run = this.queue.then(() => this.run(list));
    this.queue = run.then(
      () => undefined,
      (e) => console.warn(e),
    );
    return run.catch(() => list.map((): Outcome => 'failed'));
  }

  private async run(input: File[]): Promise<Outcome[]> {
    const outcomes: Outcome[] = input.map((f) => (f.size > 0 && isAudioFile(f) ? 'failed' : 'ignored'));
    const todo = input.map((f, i) => ({ f, i })).filter(({ i }) => outcomes[i] === 'failed');
    if (!input.length) return outcomes;
    this.busy.set(true);
    try {
      for (let n = 0; n < todo.length; n++) {
        const { f, i } = todo[n];
        const step = todo.length > 1 ? ` ${n + 1}/${todo.length}` : '';
        this.toast.show(`Envoi${step}…`, PROGRESS_MS);
        if (f.size >= MAX_SIZE) {
          outcomes[i] = 'tooBig';
          continue;
        }
        try {
          const bytes = await f.arrayBuffer();
          const hash = await sha256(bytes);
          if (await this.store.exists(hash)) {
            outcomes[i] = 'dup';
            continue;
          }
          const meta = { name: f.name || 'audio', hash, type: guessType(f), duration: audioDuration(bytes) };
          await this.store.upload(f, meta, (p) => {
            if (p > 0 && p < 1) this.toast.show(`Envoi${step}… ${Math.round(p * 100)} %`, PROGRESS_MS);
          });
          outcomes[i] = 'added';
        } catch (e) {
          console.warn(e);
        }
      }
    } finally {
      this.busy.set(false);
    }
    const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
    const [added, dup, tooBig, ignored, failed] = (
      ['added', 'dup', 'tooBig', 'ignored', 'failed'] as const
    ).map(count);
    const parts: string[] = [];
    if (added) parts.push(`${plural(added, 'audio', 'audios')} à classer`);
    if (dup) parts.push(plural(dup, 'déjà reçu', 'déjà reçus'));
    if (tooBig) parts.push(plural(tooBig, 'trop gros', 'trop gros') + ' (40 Mo max)');
    if (ignored) parts.push(plural(ignored, 'fichier ignoré', 'fichiers ignorés') + ' (pas un audio)');
    if (failed) parts.push(`${failed} en échec`);
    this.toast.show(parts.join(' · ') || 'Rien à envoyer', failed ? 6000 : 3500);
    if (added) await this.router.navigate(['/a-classer']);
    return outcomes;
  }

  /** Récupère les audios partagés depuis une autre app (rangés par le service worker) */
  async takeShared(): Promise<void> {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(SHARED_CACHE);
    const keys = await cache.keys();
    if (!keys.length) return;
    const files: File[] = [];
    const sources: Request[] = [];
    for (const k of keys) {
      const r = await cache.match(k);
      if (!r) continue;
      const b = await r.blob();
      const name = decodeURIComponent(r.headers.get('x-name') || 'audio');
      files.push(new File([b], name, { type: b.type }));
      sources.push(k);
    }
    // On ne retire du cache que ce qui est réglé : en cas d'échec (hors ligne…),
    // l'audio sera renvoyé à la prochaine ouverture de l'app
    const outcomes = await this.upload(files);
    await Promise.all(
      sources.map((k, i) => (outcomes[i] === 'failed' ? undefined : cache.delete(k))),
    );
  }
}
