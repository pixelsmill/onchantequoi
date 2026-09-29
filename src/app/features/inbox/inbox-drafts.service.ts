import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ChoraleStore } from '../../core/chorale.store';
import { VoiceKey } from '../../core/models';
import { norm } from '../../core/utils';

/** Choix en cours pour un audio à classer (gardé quand on change d'onglet) */
export interface Draft {
  voice: VoiceKey | null;
  songId: string | null;
  /** Titre d'un morceau à créer */
  newTitle: string | null;
  query: string;
  /** Morceau retiré à la main : ne pas reprendre le dernier morceau choisi */
  cleared: boolean;
}

const EMPTY: Draft = { voice: null, songId: null, newTitle: null, query: '', cleared: false };

@Injectable({ providedIn: 'root' })
export class InboxDrafts {
  private readonly store = inject(ChoraleStore);
  private readonly drafts = signal<Record<string, Draft>>({});
  /** Dernier morceau choisi : pré-rempli pour les audios suivants */
  readonly lastSongId = signal<string | null>(null);
  /** Audios déjà écoutés pendant cette visite (repère visuel dans la liste) */
  private readonly listenedSet = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // Oublie les brouillons des audios qui ne sont plus à classer
    effect(() => {
      const live = new Set(this.store.inbox().map((f) => f.hash));
      untracked(() => {
        const all = this.drafts();
        if (Object.keys(all).some((h) => !live.has(h))) {
          this.drafts.set(Object.fromEntries(Object.entries(all).filter(([h]) => live.has(h))));
        }
      });
    });
  }

  /** Brouillon affiché : choix faits + dernier morceau choisi par défaut */
  draft(hash: string): Draft {
    const d = this.drafts()[hash] ?? EMPTY;
    if (d.songId || d.newTitle || d.cleared) return d;
    const last = this.lastSongId();
    return last && this.store.songById(last) ? { ...d, songId: last } : d;
  }

  /**
   * Dès qu'on touche un audio, on fige ce qui est affiché (morceau pré-rempli compris) :
   * classer un autre audio ne doit pas changer le morceau sous les yeux de l'utilisateur.
   */
  update(hash: string, patch: Partial<Draft>): void {
    const shown = this.draft(hash);
    this.drafts.update((all) => ({ ...all, [hash]: { ...shown, ...patch } }));
  }

  listened(hash: string): boolean {
    return this.listenedSet().has(hash);
  }

  markListened(hash: string): void {
    if (!this.listenedSet().has(hash)) this.listenedSet.update((s) => new Set(s).add(hash));
  }

  remove(hash: string): void {
    this.drafts.update(({ [hash]: _gone, ...rest }) => rest);
  }

  /** Après un classement : ce morceau devient le choix par défaut des audios pas encore touchés */
  classified(hash: string, songId: string, newTitle: string | null): void {
    this.remove(hash);
    this.lastSongId.set(songId);
    if (!newTitle) return;
    // D'autres audios attendaient le même nouveau morceau : il existe maintenant
    const t = norm(newTitle);
    this.drafts.update((all) =>
      Object.fromEntries(
        Object.entries(all).map(([h, d]) => [
          h,
          d.newTitle && norm(d.newTitle) === t ? { ...d, newTitle: null, songId } : d,
        ]),
      ),
    );
  }
}
