import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { choirName, shortcutUrl } from '../../config';
import { ChoraleStore } from '../../core/chorale.store';
import { Platform, PwaService } from '../../core/pwa.service';
import { ToastService } from '../../core/toast.service';

/** Aide : installer l'app (Android, iPhone), raccourci iPhone, dépôt depuis un ordinateur */
@Component({
  selector: 'app-install-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TablerIconComponent],
  templateUrl: './install-page.html',
  styleUrl: './install-page.scss',
})
export class InstallPage {
  protected readonly pwa = inject(PwaService);
  protected readonly store = inject(ChoraleStore);
  private readonly toast = inject(ToastService);
  protected readonly shortcutUrl = shortcutUrl;
  protected readonly appName = choirName;
  private readonly origin = globalThis.location?.origin ?? '';

  /** Lien d'invitation de la chorale (avec la clé de ce téléphone) */
  protected readonly choirLink = computed(() => {
    const k = this.store.key();
    return k ? `${this.origin}/?cle=${k}` : '';
  });

  /** Adresse d'envoi utilisée par le raccourci iPhone */
  protected readonly depotUrl = computed(
    () => `${this.origin}/api/depot?cle=${this.store.key() ?? 'CLÉ-DE-LA-CHORALE'}`,
  );

  /** L'appareil utilisé d'abord (ordre visuel = ordre de lecture) */
  protected readonly platforms: Platform[] = [
    this.pwa.platform,
    ...(['ios', 'android', 'desktop'] as const).filter((p) => p !== this.pwa.platform),
  ];

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Copié');
    } catch {
      this.toast.show('Copie impossible : sélectionnez le texte à la main');
    }
  }
}
