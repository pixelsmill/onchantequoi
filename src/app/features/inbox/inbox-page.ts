import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ChoraleStore } from '../../core/chorale.store';
import { plural } from '../../core/utils';
import { InboxItem } from './inbox-item';

/** Audio à ouvrir après celui qui vient d'être traité : le suivant, sinon le précédent */
export function nextAfter(hashes: readonly string[], done: string): string | null {
  const i = hashes.indexOf(done);
  if (i < 0) return hashes[0] ?? null;
  return hashes[i + 1] ?? hashes[i - 1] ?? null;
}

/**
 * Onglet « À classer » : les audios déposés, en attente d'une voix et d'un morceau.
 * Un seul est ouvert à la fois ; une fois classé, le suivant s'ouvre et vient à l'écran.
 */
@Component({
  selector: 'app-inbox-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InboxItem],
  template: `
    @if (!store.inboxLoaded()) {
      <p class="empty" aria-live="polite">Chargement…</p>
    } @else {
      @if (store.sortedInbox().length; as n) {
        <p class="intro" aria-live="polite">
          <b>{{ count(n) }}</b> · écoutez le début, touchez la voix annoncée, choisissez le morceau.
        </p>
      }
      <ul>
        @for (f of store.sortedInbox(); track f.hash) {
          <li [attr.data-hash]="f.hash">
            <app-inbox-item
              [file]="f"
              [expanded]="f.hash === current()"
              (expand)="chosen.set(f.hash)"
              (done)="next(f.hash)"
            />
          </li>
        } @empty {
          <li class="empty">
            <strong>Tout est classé</strong>
            Les nouveaux enregistrements déposés apparaîtront ici.
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .intro {
      margin: 4px 2px 12px;
      font-size: 14px;
      color: var(--muted);
    }
    .intro b {
      color: var(--text);
    }
  `,
})
export class InboxPage {
  protected readonly store = inject(ChoraleStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Audio ouvert à la main (sinon, le premier de la liste) */
  protected readonly chosen = signal<string | null>(null);
  protected readonly current = computed(() => {
    const list = this.store.sortedInbox();
    const c = this.chosen();
    return c && list.some((f) => f.hash === c) ? c : (list[0]?.hash ?? null);
  });
  /** Après un classement : audio qui s'en va, et celui à montrer une fois qu'il est parti */
  private readonly pending = signal<{ leaving: string; show: string | null } | null>(null);

  constructor() {
    afterRenderEffect(() => {
      const p = this.pending();
      const list = this.store.sortedInbox();
      // On attend que l'audio classé ait quitté la liste, sinon tout se décale ensuite
      if (!p || list.some((f) => f.hash === p.leaving)) return;
      this.pending.set(null);
      const li = p.show && this.host.nativeElement.querySelector(`li[data-hash="${p.show}"]`);
      if (!li) return;
      li.scrollIntoView({ block: 'start', behavior: 'smooth' });
      li.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    });
  }

  protected count(n: number): string {
    return plural(n, 'audio à classer', 'audios à classer');
  }

  protected next(hash: string): void {
    const show = nextAfter(
      this.store.sortedInbox().map((f) => f.hash),
      hash,
    );
    this.chosen.set(show);
    this.pending.set({ leaving: hash, show });
  }
}
