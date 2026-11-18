import { Component, inject, ViewChild, ChangeDetectorRef, computed, OnInit } from '@angular/core';
import { VideoService } from '../../core/services/video.service';
import { UploadService } from '../../core/services/upload.service';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';
import {
  FormGroup,
  FormControl,
  FormsModule,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { HttpEventType } from '@angular/common/http';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { switchMap, tap, filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { TraQChannel } from '../../core/models/traQchannel.model';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    MatStepperModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule,
    MatProgressBarModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    MatSliderModule,
    MatExpansionModule,
    MatDialogModule,
    MatIcon,
  ],
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css'],
})
export class UploadComponent implements OnInit {
  private videoService = inject(VideoService);
  private uploadService = inject(UploadService);
  private changeDetector = inject(ChangeDetectorRef);
  isDragging = false;
  isUploadStarted = false;
  isImporting = false;

  selectedFile: File | null = null;
  videoTitle: string = '';
  videoDescription: string = '';
  uploadProgress: number = 0;
  uploadStatusMessage: string = '';
  uploadedVideoUrl: string = '';
  importedVideoTitle: string = '';
  traqChannel: string = '';
  enableTraQ = false;
  enableDelay = false;
  delaySeconds: number = 15.0;
  @ViewChild('stepper') private stepper!: MatStepper;

  steps = ['動画の選択', '基本情報の入力', 'アップロード', '完了'];
  readonly defaultTraqChannel = 'gps/onair';
  readonly defaultTraqChannelId = '89994a57-2f6e-4ce0-a841-226d02369ee3';
  readonly defaultDelaySeconds = 15; // YouTube Liveの標準的な遅延目安
  private defaultChannelObj: TraQChannel | null = null;

  videoForm = new FormGroup({
    url: new FormControl('', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    enableTraQ: new FormControl(true, { nonNullable: true }),
    traqChannel: new FormControl(this.defaultTraqChannel, { nonNullable: true }),
    enableDelay: new FormControl(true, { nonNullable: true }),
    delaySeconds: new FormControl(15.0, { nonNullable: true }),
  });

  private channels = toSignal(
    this.uploadService.getTraQChannels().pipe(
      tap((list) => {
        const defaultCh = list.find((ch) => ch.path === this.defaultTraqChannel) ?? null;
        if (!this.videoForm.controls.traqChannel.value && defaultCh) {
          this.videoForm.controls.traqChannel.setValue(defaultCh.path);
        }
      }),
    ),
    { initialValue: [] as TraQChannel[] },
  );

  private channelQuery = toSignal(this.videoForm.controls.traqChannel.valueChanges, {
    initialValue: this.videoForm.controls.traqChannel.value,
  });

  filteredChannels = computed(() => {
    const list = this.channels();
    const query = this.channelQuery();

    const keyword = (query ?? '').trim().replace(/^#/, '').toLowerCase();

    if (!keyword) {
      return list.slice(0, 50);
    }
    const terms = keyword.split(/\s+/);
    return list
      .filter((ch) => {
        const lowerName = ch.path.toLowerCase();
        return terms.every((term) => lowerName.includes(term));
      })
      .slice(0, 50);
  });

  private syncTraqControlStates() {
    const traqEnabled = this.videoForm.controls.enableTraQ.value;
    const delayEnabled = this.videoForm.controls.enableDelay.value;

    if (!traqEnabled) {
      this.videoForm.controls.traqChannel.disable({ emitEvent: false });
      this.videoForm.controls.enableDelay.disable({ emitEvent: false });
      this.videoForm.controls.delaySeconds.disable({ emitEvent: false });
      return;
    }

    this.videoForm.controls.traqChannel.enable({ emitEvent: false });
    this.videoForm.controls.enableDelay.enable({ emitEvent: false });

    if (delayEnabled) {
      this.videoForm.controls.delaySeconds.enable({ emitEvent: false });
    } else {
      this.videoForm.controls.delaySeconds.disable({ emitEvent: false });
    }
  }

  ngOnInit() {
    this.videoForm.controls.enableTraQ.valueChanges.subscribe(() => this.syncTraqControlStates());
    this.videoForm.controls.enableDelay.valueChanges.subscribe(() => this.syncTraqControlStates());
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  get hasFile(): boolean {
    return this.selectedFile !== null;
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('video/')) {
      alert('動画ファイルを選択してください。');
      return;
    }
    this.selectedFile = file;
    this.isImporting = false;
    console.log('selectedFile:', file.name);
    // ファイルアップロード時は title を必須、url を任意にする
    this.videoForm.controls.url.clearValidators();
    this.videoForm.controls.url.updateValueAndValidity();
    this.videoForm.controls.title.setValidators([Validators.required]);
    this.videoForm.controls.title.updateValueAndValidity();

    // 画面の更新を待ってから次のステップに進む
    setTimeout(() => {
      this.stepper.next();
    });
  }

  displayChannel(channel: TraQChannel | string | null): string {
    if (!channel) return '';
    return typeof channel === 'string' ? channel : channel.path;
  }

  importFromYouTube() {
    this.isImporting = true;
    this.selectedFile = null;
    // インポート時は url を必須、title を任意にする
    this.videoForm.controls.title.clearValidators();
    this.videoForm.controls.title.updateValueAndValidity();
    this.videoForm.controls.url.setValidators([Validators.required]);
    this.videoForm.controls.url.updateValueAndValidity();

    setTimeout(() => {
      this.stepper.next();
    });
  }

  startUpload() {
    if (this.videoForm.invalid) {
      return;
    }
    // 外部からインポート
    if (this.isImporting) {
      this.isUploadStarted = true;
      const { title, description, url, enableTraQ, traqChannel, enableDelay, delaySeconds } =
        this.videoForm.getRawValue();
      // TODO: Channel ID取得
      if (!enableTraQ) {
        this.traqChannel = '';
        this.delaySeconds = 0;
      }
      if (!enableDelay) {
        this.delaySeconds = 0;
      }
      setTimeout(() => {
        this.stepper.next();
        this.videoService
          .uploadExVideo(title, description, url, traqChannel, delaySeconds)
          .subscribe({
            next: (video) => {
              this.importedVideoTitle = video.title;
              this.uploadStatusMessage = 'アップロードが完了しました！';
              this.stepper.next();
            },
            error: (err) => {
              console.error('通信エラーが発生しました…', err);
              alert('動画の作成に失敗しました。もう一度お試しください。');
              this.stepper.previous();
            },
          });
      });
      return;
    }
    if (!this.selectedFile) {
      alert('動画ファイルが選択されていません。');
      return;
    }
    const { title, description } = this.videoForm.getRawValue();
    this.isUploadStarted = true;
    setTimeout(() => {
      this.stepper.next();
      this.videoService
        .createVideo(title, description, this.selectedFile!.type)
        .pipe(
          switchMap((videos) => {
            this.uploadStatusMessage = 'MinIOへアップロード中...';
            return this.uploadService.uploadToMinio(videos.uploadUrl, this.selectedFile!).pipe(
              tap((event) => {
                if (event.type === HttpEventType.UploadProgress && event.total) {
                  this.uploadProgress = Math.round((100 * event.loaded) / event.total);
                }
                this.changeDetector.detectChanges();
              }),
              // アップロード中(Progress)のイベントはここで堰き止め、完了(Response)だけを下へ流す
              filter((event) => event.type === HttpEventType.Response),
              switchMap(() => {
                this.uploadStatusMessage = 'バックエンドでエンコード処理中...';
                this.uploadProgress = 0;
                return this.videoService.pollUploadProgress(videos.video_id).pipe(
                  tap((progress) => {
                    this.uploadStatusMessage = `エンコード処理中... (${progress.progress ?? 0}%)\n処理には時間がかかることがあります。(画面を閉じても大丈夫ですがエンコードの進捗が見れなくなりますよ？)`;
                    this.uploadProgress = progress.progress;
                    this.changeDetector.detectChanges();
                    if (progress.status === 2) {
                      this.uploadStatusMessage = 'アップロードとエンコードが完了しました！';
                    } else if (progress.status === 3) {
                      this.uploadStatusMessage = 'エンコードに失敗しました。';
                    }
                  }),
                  // completedまたはfailedのステータスが返るまでポーリングを続ける
                  filter((progress) => progress.status === 2 || progress.status === 3),
                );
              }),
            );
          }),
        )
        .subscribe({
          next: () => {
            // 全てが完了
            this.stepper.next();
          },
          error: (err) => {
            console.error('通信エラーが発生しました…', err);
            alert('動画の作成に失敗しました。もう一度お試しください。');
            this.stepper.previous();
          },
        });
    });
  }
}
