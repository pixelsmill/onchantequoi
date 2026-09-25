import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChoraleStore } from '../../core/chorale.store';
import { InboxItem } from './inbox-item';

/** Onglet « À classer » : les audios déposés, en attente d'une voix et d'un morceau */
@Component({
  selector: 'app-inbox-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InboxItem],
  template: `
    @if (!store.inboxLoaded()) {
      <p class="empty" aria-live="polite">Chargement…</p>
    } @else {
      <ul>
        @for (f of store.sortedInbox(); track f.hash) {
          <li><app-inbox-item [file]="f" /></li>
        } @empty {
          <li class="empty">
            <strong>Tout est classé</strong>
            Les nouveaux enregistrements déposés apparaîtront ici.
          </li>
        }
      </ul>
    }
  `,
})
export class InboxPage {
  protected readonly store = inject(ChoraleStore);
}
