import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDeviceMobile,
  IconDots,
  IconMicrophone2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
  IconPlus,
  IconRepeat,
  IconRepeatOnce,
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
      IconChevronDown,
      IconCopy,
      IconDeviceMobile,
      IconDots,
      IconMicrophone2,
      IconPlayerPauseFilled,
      IconPlayerPlayFilled,
      IconPlayerSkipForwardFilled,
      IconPlus,
      IconRepeat,
      IconRepeatOnce,
      IconUpload,
      IconX,
    }),
    // sw.js = service worker Angular + réception des partages (Android)
    provideServiceWorker('sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
