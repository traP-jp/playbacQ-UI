import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  inject,
  signal,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { StampService } from '../../core/services/stamp.service';

@Component({
  selector: 'app-stamp-image',
  template: `<img
    [src]="imageUrl() || placeholder"
    [alt]="alt"
    class="stamp-img"
  />`,
  styleUrl: './player.component.css',
  standalone: true,
})
export class StampImageComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) stampId!: string;
  @Input() alt = '';
  imageUrl = signal<string | null>(null);
  placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAIAAACR5s1WAAAAQUlEQVR4nO3OMRHAMAwAMTf8gRlWp79AyCIh0Le789p5HZiRuCQiEYlIRCISkYhEJCIRiUhEIhKRiEQkIhGJSOQHlvMCsEC5e6IAAAAASUVORK5CYII=';
  private stampService = inject(StampService);
  private sub?: Subscription;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['stampId']) {
      this.sub?.unsubscribe();
      if (!this.stampId) {
        this.imageUrl.set(null);
        return;
      }
      this.sub = this.stampService.getStampBlobUrl(this.stampId).subscribe({
        next: (url) => {
          this.imageUrl.set(url);
        },
        error: () => {
          this.imageUrl.set(null);
        },
      });
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
