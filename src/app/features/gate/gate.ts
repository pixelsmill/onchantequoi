import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ChoraleStore } from '../../core/chorale.store';
import { keyFromText } from '../../core/utils';

/** Accueil sans clé : on colle le lien de la chorale reçu sur WhatsApp */
@Component({
  selector: 'app-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gate card">
      <h2>Bienvenue</h2>
      <p>
        {{
          store.gateMessage() ||
            'Ouvrez le lien de la chorale reçu sur WhatsApp, ou collez-le ici :'
        }}
      </p>
      <form (submit)="$event.preventDefault(); submit()">
        <label class="visually-hidden" for="gate-key">Lien ou clé de la chorale</label>
        <input
          id="gate-key"
          class="field"
          type="text"
          placeholder="Lien ou clé"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
        />
        <button type="submit" class="primary" [disabled]="busy() || !text().trim()">
          {{ busy() ? 'Vérification…' : 'Entrer' }}
        </button>
        @if (canPaste) {
          <button type="button" class="secondary" [disabled]="busy()" (click)="paste()">
            Coller le lien
          </button>
        }
      </form>
    </div>
  `,
  styles: `
    .gate {
      margin: 24px auto 0;
      max-width: 420px;
      padding: 24px 20px;
      border-radius: 20px;
    }
    h2 {
      margin: 0 0 8px;
    }
    p {
      color: var(--muted);
      margin: 0 0 16px;
    }
    form {
      display: grid;
      gap: 10px;
    }
  `,
})
export class Gate {
  protected readonly store = inject(ChoraleStore);
  protected readonly text = signal('');
  protected readonly busy = signal(false);
  protected readonly canPaste = !!globalThis.navigator?.clipboard?.readText;

  protected async submit(): Promise<void> {
    if (!keyFromText(this.text()) || this.busy()) return;
    this.busy.set(true);
    try {
      await this.store.submitKey(this.text());
    } finally {
      this.busy.set(false);
    }
  }

  protected async paste(): Promise<void> {
    try {
      this.text.set((await navigator.clipboard.readText()).trim());
      await this.submit();
    } catch {
      // collage refusé : on tape ou colle à la main
    }
  }
}
