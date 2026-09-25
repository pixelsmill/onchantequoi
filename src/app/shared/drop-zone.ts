import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { UploadService } from '../core/upload.service';

/** Sur ordinateur : on glisse des fichiers n'importe où sur la page pour les déposer */
@Component({
  selector: 'app-drop-zone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TablerIconComponent],
  host: {
    '(window:dragenter)': 'enter($event)',
    '(window:dragover)': 'over($event)',
    '(window:dragleave)': 'leave($event)',
    '(window:drop)': 'drop($event)',
  },
  template: `
    @if (active()) {
      <div class="drop">
        <div class="box">
          <tabler-icon icon="upload" [size]="40" />
          <strong>Déposez les audios ici</strong>
          <span>Ils arriveront dans « À classer »</span>
        </div>
      </div>
    }
  `,
  styles: `
    .drop {
      position: fixed;
      inset: 0;
      z-index: 25;
      display: grid;
      place-items: center;
      padding: 16px;
      background: color-mix(in srgb, var(--bg) 80%, transparent);
      backdrop-filter: blur(2px);
      pointer-events: none;
    }
    .box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: min(100%, 420px);
      padding: 40px 24px;
      border: 3px dashed var(--accent);
      border-radius: 24px;
      background: var(--card);
      color: var(--accent);
      text-align: center;
    }
    strong {
      font-size: 19px;
    }
    span {
      color: var(--muted);
    }
  `,
})
export class DropZone {
  private readonly uploads = inject(UploadService);
  protected readonly active = signal(false);
  private depth = 0;

  private static hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  }

  protected enter(e: DragEvent): void {
    if (!DropZone.hasFiles(e)) return;
    e.preventDefault();
    this.depth++;
    this.active.set(true);
  }

  protected over(e: DragEvent): void {
    if (!DropZone.hasFiles(e)) return;
    e.preventDefault(); // sinon le navigateur ouvrirait le fichier
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    this.active.set(true);
  }

  protected leave(e: DragEvent): void {
    if (!DropZone.hasFiles(e)) return;
    this.depth = Math.max(0, this.depth - 1);
    if (!this.depth || !e.relatedTarget) {
      this.depth = 0;
      this.active.set(false);
    }
  }

  protected drop(e: DragEvent): void {
    if (!DropZone.hasFiles(e)) return;
    e.preventDefault();
    this.depth = 0;
    this.active.set(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) this.uploads.upload(files);
  }
}
