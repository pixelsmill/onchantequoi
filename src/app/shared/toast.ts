import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="toast" role="status" aria-live="polite" [class.show]="!!toast.message()">
    {{ toast.message() }}
  </div>`,
  styles: `
    .toast {
      position: fixed;
      left: 50%;
      top: calc(env(safe-area-inset-top) + 14px);
      z-index: 30;
      width: max-content;
      max-width: calc(100% - 32px);
      background: var(--text);
      color: var(--bg);
      padding: 10px 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
      transform: translate(-50%, -8px);
      opacity: 0;
      pointer-events: none;
      transition:
        opacity 0.15s,
        transform 0.15s;
    }
    .show {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  `,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
