import { Injectable, signal } from '@angular/core';

export interface MenuAction {
  id: string;
  label: string;
  danger?: boolean;
}

export type DialogRequest =
  | {
      kind: 'confirm';
      title: string;
      text: string;
      ok: string;
      danger: boolean;
      resolve: (v: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      value: string;
      ok: string;
      resolve: (v: string | null) => void;
    }
  | {
      kind: 'menu';
      title: string;
      actions: MenuAction[];
      note: string;
      resolve: (v: string | null) => void;
    };

/** Feuilles modales (confirmation, saisie, menu) affichées par DialogHost */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogRequest | null>(null);

  confirm(title: string, text: string, ok: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => this.open({ kind: 'confirm', title, text, ok, danger, resolve }));
  }

  prompt(title: string, value: string, ok = 'Enregistrer'): Promise<string | null> {
    return new Promise((resolve) => this.open({ kind: 'prompt', title, value, ok, resolve }));
  }

  menu(title: string, actions: MenuAction[], note = ''): Promise<string | null> {
    return new Promise((resolve) => this.open({ kind: 'menu', title, actions, note, resolve }));
  }

  /** Ferme avec un résultat (false / null = annulé) */
  close(result: boolean | string | null): void {
    const c = this.current();
    if (!c) return;
    this.current.set(null);
    if (c.kind === 'confirm') c.resolve(result === true);
    else c.resolve(typeof result === 'string' ? result : null);
  }

  private open(req: DialogRequest): void {
    this.close(null);
    this.current.set(req);
  }
}
