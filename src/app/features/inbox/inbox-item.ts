import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from '../../core/chorale.store';
import { ClockService } from '../../core/clock.service';
import { DialogService } from '../../core/dialog.service';
import { InboxFile, Song, VOICE_NAME, VoiceKey, VOICES } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { ago, dateShort, norm, whatsappLabel } from '../../core/utils';
import { InboxDrafts } from './inbox-drafts.service';

/** Un audio à classer : on écoute, on touche la voix, on choisit ou crée le morceau */
@Component({
  selector: 'app-inbox-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TablerIconComponent],
  templateUrl: './inbox-item.html',
  styleUrl: './inbox-item.scss',
  host: { class: 'card' },
})
export class InboxItem {
  readonly file = input.required<InboxFile>();

  protected readonly store = inject(ChoraleStore);
  protected readonly player = inject(PlayerService);
  private readonly drafts = inject(InboxDrafts);
  private readonly clock = inject(ClockService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('q');

  protected readonly voices = VOICES;
  protected readonly voiceName = VOICE_NAME;
  protected readonly dateShort = dateShort;
  protected readonly open = signal(false);
  protected readonly busy = signal(false);

  protected readonly id = computed(() => 'a' + this.file().hash.slice(0, 16));
  protected readonly received = computed(() => ago(this.file().createdAt, this.clock.now()));
  protected readonly sent = computed(() => whatsappLabel(this.file().name));
  protected readonly draft = computed(() => this.drafts.draft(this.file().hash));
  protected readonly song = computed(() => this.store.songById(this.draft().songId));
  protected readonly chosenTitle = computed(() => this.song()?.title ?? this.draft().newTitle);
  /** Enregistrement actuel de cette voix, qui sera remplacé */
  protected readonly replaces = computed(() => {
    const v = this.draft().voice;
    return v ? this.song()?.voices[v] : undefined;
  });
  protected readonly suggestions = computed(() => {
    const q = norm(this.draft().query);
    return this.store
      .sortedSongs()
      .filter((s) => !q || norm(s.title).includes(q))
      .slice(0, 8);
  });
  protected readonly canCreate = computed(() => {
    const q = norm(this.draft().query);
    return !!q && !this.store.songs().some((s) => norm(s.title) === q);
  });
  protected readonly ready = computed(() => !!this.draft().voice && !!this.chosenTitle());
  protected readonly playing = computed(() => this.player.isPlayingHash(this.file().hash));

  private get hash(): string {
    return this.file().hash;
  }

  protected togglePlay(): void {
    const f = this.file();
    if (this.player.track()?.hash === f.hash) this.player.toggle();
    else
      this.player.play({
        hash: f.hash,
        title: 'À classer',
        sub: 'reçu ' + this.received(),
        songId: null,
        voice: null,
      });
  }

  protected setVoice(voice: VoiceKey): void {
    this.drafts.update(this.hash, { voice });
  }

  protected onQuery(value: string): void {
    this.drafts.update(this.hash, { query: value });
    this.open.set(true);
  }

  protected pick(song: Song): void {
    this.drafts.update(this.hash, { songId: song.id, newTitle: null, cleared: false, query: '' });
    this.open.set(false);
  }

  protected create(): void {
    const title = this.draft().query.trim().slice(0, 120);
    if (!title) return;
    this.drafts.update(this.hash, { newTitle: title, songId: null, cleared: false });
    this.open.set(false);
  }

  protected pickFirst(): void {
    const first = this.suggestions()[0];
    if (first && norm(this.draft().query)) this.pick(first);
    else if (this.canCreate()) this.create();
  }

  protected clearSong(): void {
    this.drafts.update(this.hash, { songId: null, newTitle: null, cleared: true });
    this.open.set(true);
    afterNextRender(() => this.queryInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async classify(): Promise<void> {
    const f = this.file();
    const d = this.draft();
    const title = this.chosenTitle();
    if (!d.voice || !title || this.busy()) return;
    this.busy.set(true);
    const newTitle = d.songId ? null : d.newTitle;
    const res = await this.store.classify({ hash: f.hash, voice: d.voice, songId: d.songId, newTitle });
    if (!res.ok) {
      this.busy.set(false);
      this.toast.show(
        res.reason === 'already' ? "Déjà classé par quelqu'un d'autre" : 'Oups, réessayez',
      );
      return;
    }
    this.toast.show(`Classé : ${title} · ${VOICE_NAME[d.voice]}`);
    if (this.player.track()?.hash === f.hash) this.player.stop();
    this.drafts.classified(f.hash, res.songId, newTitle);
  }

  protected async remove(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Supprimer cet audio ?',
      "À utiliser si ce n'est pas un enregistrement de répétition.",
      'Supprimer',
      true,
    );
    if (!ok) return;
    const f = this.file();
    if (this.player.track()?.hash === f.hash) this.player.stop();
    try {
      await this.store.removeInbox(f.hash);
      this.drafts.remove(f.hash);
      this.toast.show('Audio supprimé');
    } catch (e) {
      console.warn(e);
      this.toast.show('Oups, réessayez');
    }
  }
}
