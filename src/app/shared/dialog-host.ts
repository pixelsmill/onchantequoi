import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { DialogService } from '../core/dialog.service';

/** Feuille modale en bas de l'écran (élément <dialog> natif : focus et Échap gérés) */
@Component({
  selector: 'app-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dlg
      class="sheet"
      aria-labelledby="sheet-title"
      (cancel)="$event.preventDefault(); dialog.close(null)"
      (close)="dialog.close(null)"
      (click)="onClick($event)"
    >
      @if (dialog.current(); as d) {
        <div class="body">
          <h2 id="sheet-title">{{ d.title }}</h2>
          @switch (d.kind) {
            @case ('confirm') {
              <p>{{ d.text }}</p>
              <div class="row">
                <button type="button" class="secondary" (click)="dialog.close(false)">
                  Annuler
                </button>
                <button
                  type="button"
                  [class]="d.danger ? 'danger-btn' : 'primary'"
                  (click)="dialog.close(true)"
                >
                  {{ d.ok }}
                </button>
              </div>
            }
            @case ('prompt') {
              <form (submit)="$event.preventDefault(); submit(field.value)">
                <label class="visually-hidden" for="sheet-field">{{ d.title }}</label>
                <input
                  #field
                  id="sheet-field"
                  class="field"
                  maxlength="120"
                  autocomplete="off"
                  autofocus
                  [value]="d.value"
                />
                <div class="row">
                  <button type="button" class="secondary" (click)="dialog.close(null)">
                    Annuler
                  </button>
                  <button type="submit" class="primary">{{ d.ok }}</button>
                </div>
              </form>
            }
            @case ('menu') {
              <div class="menu">
                @for (a of d.actions; track a.id) {
                  <button type="button" [class.danger]="a.danger" (click)="dialog.close(a.id)">
                    {{ a.label }}
                  </button>
                }
                <button type="button" (click)="dialog.close(null)">Fermer</button>
              </div>
              @if (d.note) {
                <p class="note">{{ d.note }}</p>
              }
            }
          }
        </div>
      }
    </dialog>
  `,
  styles: `
    .sheet {
      border: 0;
      padding: 0;
      margin: auto auto 0;
      width: 100%;
      max-width: min(100%, var(--max));
      max-height: 85dvh;
      border-radius: 20px 20px 0 0;
      background: var(--card);
      color: var(--text);
    }
    .sheet::backdrop {
      background: rgba(20, 10, 30, 0.45);
    }
    .body {
      padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
    }
    h2 {
      margin: 0 0 6px;
      font-size: 18px;
    }
    p {
      margin: 0 0 14px;
      color: var(--muted);
    }
    .field {
      margin: 6px 0 14px;
    }
    .row {
      display: flex;
      gap: 10px;
    }
    .row button {
      flex: 1;
    }
    .menu button {
      display: block;
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      padding: 14px 4px;
      border-bottom: 1px solid var(--line);
      font-size: 16px;
    }
    .menu button.danger {
      color: var(--danger);
    }
    .note {
      margin-top: 12px;
      font-size: 13px;
    }
  `,
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    // Après rendu : le contenu est là quand on ouvre (autofocus du champ de saisie)
    // (la feuille peut rester ouverte d'une demande à l'autre : menu puis saisie)
    afterRenderEffect(() => {
      const req = this.dialog.current();
      const el = this.dlg().nativeElement;
      if (!req) {
        if (el.open) el.close();
        return;
      }
      if (!el.open) el.showModal?.();
      const field = el.querySelector<HTMLInputElement>('input[autofocus]');
      if (field) {
        field.focus();
        field.select();
      } else el.querySelector('button')?.focus();
    });
  }

  /** Toucher le fond grisé ferme la feuille */
  protected onClick(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.dialog.close(null);
  }

  protected submit(value: string): void {
    const v = value.trim();
    if (v) this.dialog.close(v);
  }
}
