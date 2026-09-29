import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  IconCheck,
  IconChevronDown,
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
import { App } from './app';
import { routes } from './app.routes';
import { ChoraleStore } from './core/chorale.store';
import { detectPlatform } from './core/pwa.service';

describe('App (mode démo)', () => {
  beforeEach(async () => {
    // Le store démarre tout seul avec l'URL : on force le mode démo
    const init = ChoraleStore.prototype.init;
    vi.spyOn(ChoraleStore.prototype, 'init').mockImplementation(function (this: ChoraleStore) {
      return init.call(this, '?demo');
    });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideServiceWorker('sw.js', { enabled: false }),
        provideTablerIcons({
          IconCheck,
          IconChevronDown,
          IconCopy,
          IconDeviceMobile,
          IconDots,
          IconPlayerPauseFilled,
          IconPlayerPlayFilled,
          IconPlus,
          IconUpload,
          IconX,
        }),
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('affiche le titre, les onglets, le badge « À classer » et le bouton Déposer', async () => {
    const fixture = TestBed.createComponent(App);
    const el: HTMLElement = fixture.nativeElement;
    // Le mode démo se charge à la demande : on attend l'affichage plutôt qu'un délai fixe
    await vi.waitFor(
      async () => {
        await fixture.whenStable();
        expect(el.querySelector('.badge')?.textContent).toContain('4');
      },
      { timeout: 5000, interval: 50 },
    );
    expect(el.querySelector('h1')?.textContent).toContain('On chante quoi');
    expect(el.querySelectorAll('nav.tabs a').length).toBe(2);
    expect(el.querySelector('.badge')?.textContent).toContain('4');
    expect(el.textContent).toContain('Mode démo');
    expect(el.querySelector('.fab')?.textContent).toContain('Déposer');
  });
});

describe('detectPlatform', () => {
  it('reconnaît iPhone, iPad, Android et ordinateur', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });
});
