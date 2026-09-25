import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  IconCheck,
  IconCopy,
  IconDeviceMobile,
  IconDots,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconUpload,
  IconX,
  provideTablerIcons,
} from '@tabler/icons-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideTablerIcons({
      IconCheck,
      IconCopy,
      IconDeviceMobile,
      IconDots,
      IconPlayerPauseFilled,
      IconPlayerPlayFilled,
      IconPlus,
      IconUpload,
      IconX,
    }),
    // sw.js = service worker Angular + réception des partages WhatsApp (Android)
    provideServiceWorker('sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
