import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(ua: string, touchPoints = 0): Platform {
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Installation sur l'écran d'accueil et mises à jour de l'app */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly doc = inject(DOCUMENT);
  private readonly swUpdate = inject(SwUpdate);
  private deferred: BeforeInstallPromptEvent | null = null;

  readonly platform: Platform = detectPlatform(
    globalThis.navigator?.userAgent ?? '',
    globalThis.navigator?.maxTouchPoints ?? 0,
  );
  readonly canInstall = signal(false);
  readonly installed = signal(
    !!globalThis.matchMedia?.('(display-mode: standalone)').matches ||
      (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true,
  );
  readonly updateReady = signal(false);

  constructor() {
    const win = this.doc.defaultView;
    win?.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    win?.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
      this.installed.set(true);
    });
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') this.updateReady.set(true);
      });
    }
  }

  async install(): Promise<void> {
    const d = this.deferred;
    if (!d) return;
    await d.prompt();
    await d.userChoice;
    this.deferred = null;
    this.canInstall.set(false);
  }

  reload(): void {
    this.doc.location.reload();
  }
}
