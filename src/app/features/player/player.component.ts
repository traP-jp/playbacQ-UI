import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  AfterViewInit,
  HostListener,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import Hls, { ErrorData, Events } from 'hls.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { FormsModule } from '@angular/forms';
import { Subscription, Subject, of, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { VideoService } from '../../core/services/video.service';
import { CommentService } from '../../core/services/comment.service';
import { AuthService } from '../../core/services/auth.service';
import { TagService } from '../../core/services/tag.service';
import { UserService } from '../../core/services/user.service';
import { StampService } from '../../core/services/stamp.service';
import { Video } from '../../core/models/video.model';
import { Tag } from '../../core/models/tag.model';
import { Stamp } from '../../core/models/stamp.model';
import { environment } from '../../../environments/environment';
import { Comment } from './comment';
import { EditVideoDialogComponent } from './edit-video-dialog.component';
import { LinkifyPipe } from '../../shared/pipes/linkify-pipe';
import * as Plyr_ from 'plyr';
import type PlyrType from 'plyr';
const Plyr = (Plyr_ as any).default || Plyr_;
type Plyr = PlyrType;

@Component({
  selector: 'app-video-player',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
    MatIcon,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    ScrollingModule,
    FormsModule,
    LinkifyPipe,
    RouterLink,
    MatSnackBarModule,
  ],
  standalone: true,
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
})
export class PlayerComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('hlsElement', { static: true }) hlsRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('ytElement', { static: true }) ytRef!: ElementRef<HTMLDivElement>;
  @ViewChild('commentInput') commentInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('commandInput') commandInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('commentCanvas') commentCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tagActionWrapper') tagActionWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('moreMenuWrapper') moreMenuWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('stampActionWrapper') stampActionWrapperRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private videoService = inject(VideoService);
  private commentService = inject(CommentService);
  private tagService = inject(TagService);
  private userService = inject(UserService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private authService = inject(AuthService);
  private stampService = inject(StampService);
  private hls: Hls | null = null;
  private videoId: string = '';
  private player: Plyr | null = null;
  private viewTimer: any;
  private hasCountedView = false;
  private commentSubscription: Subscription | null = null;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private comments: Comment[] = [];
  private tagSearchSubject = new Subject<string>();
  private userId: string | null = null;

  readonly StampRowNum = 8;

  isEmbed = false;
  isLoading = true;
  videoMetadata: Video | null = null;
  createdAtUtc: Date | null = null;
  tags: Tag[] = [];
  suggestTags: Tag[] = [];
  isTagInputOpen = false;
  isCommentVisible = true;
  isMoreMenuOpen = false;
  isStampPickerOpen = false;
  isLiked = false;
  likeCount = 0;
  userIconUrl: string | null = null;
  stampSearchQuery = '';
  hoveredStamp: Stamp | null = null;

  inputCommentValue = signal<string>('');

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.videoId = params.get('id') as string;
      this.isEmbed = this.route.snapshot.data['embed'] ?? false;
      if (!this.isEmbed) {
        this.videoService.getVideoById(this.videoId).subscribe((video) => {
          this.videoMetadata = video;
          this.createdAtUtc = this.parseUtcDate(video.created_at);
          if (this.videoMetadata?.user_id) {
            this.userService.getUserIcon(this.videoMetadata.user_id).subscribe((icon: Blob) => {
              if (this.userIconUrl) {
                URL.revokeObjectURL(this.userIconUrl);
              }
              this.userIconUrl = URL.createObjectURL(icon);
              this.cdr.detectChanges();
            });
          }
          this.initPlayer();
        });
      }
      if (this.isEmbed) {
        const token = this.route.snapshot.queryParamMap.get('token') ?? '';
        this.commentService.getEmbedComments(this.videoId, token).subscribe((comments) => {
          comments.map((c) => {
            this.comments.push(new Comment(c.comment, c.timestamp, c.command, this.stampService));
          });
          this.decideYPosition();
        });
      } else {
        forkJoin({
          stamps: this.stampService.loadStamps(),
          comments: this.commentService.getComments(this.videoId),
        }).subscribe(({ comments }) => {
          comments.forEach((c) => {
            this.comments.push(new Comment(c.comment, c.timestamp, c.command, this.stampService));
          });
          this.decideYPosition();
        });
      }

      this.startCommentLoop();
      this.commentService.connect(this.videoId);
      this.commentSubscription = this.commentService.messages$.subscribe((msg) => {
        console.log('Received comment via WebSocket:', msg);
        const text = msg.comment ?? msg.content ?? '';
        const command = msg.command ?? '';
        this.comments.push(new Comment(text, msg.timestamp, command, this.stampService));
        this.decideYPosition();
      });
      // タグのサジェスト機能
      this.tagSearchSubject
        .pipe(
          debounceTime(300), // 入力がピタッと止まってから300ミリ秒待つ（タイピング中の連打防止！）
          distinctUntilChanged(), // 前回の検索キーワードと全く同じなら無視する
          switchMap((keyword) => {
            // キーワードが空っぽならAPIを叩かずに空の配列を返す
            if (!keyword.trim()) {
              return of([]);
            }
            return this.tagService.getTag(keyword).pipe(
              catchError(() => of([])), // エラーが起きてもストリームが死なないように保護する
            );
          }),
        )
        .subscribe((tags) => {
          this.suggestTags = tags;
          this.cdr.detectChanges();
        });
    });

    if (!this.isEmbed) {
      // いいねの状態を取得
      this.videoService.getLikes(this.videoId).subscribe((likes) => {
        this.authService.getUserID().subscribe((userId) => {
          this.userId = userId?.userId ?? null;
          this.isLiked = likes.includes(this.userId ?? '');
          this.likeCount = likes.length;
          this.cdr.detectChanges();
        });
      });
    }
  }

  isVideoOwner(): boolean {
    return this.userId === this.videoMetadata?.user_id;
  }

  private parseUtcDate(value: string): Date | null {
    if (!value) {
      return null;
    }

    const normalized = value.replace(' ', 'T');
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  ngAfterViewInit(): void {
    const canvas = this.commentCanvasRef.nativeElement;
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.ctx = canvas.getContext('2d')!;
    if (this.isEmbed) {
      this.initPlayer();
    }
  }

  startCommentLoop(): void {
    const loop = () => {
      if (!this.ctx || !this.player) {
        this.animationFrameId = requestAnimationFrame(loop);
        return;
      }

      this.ctx.clearRect(0, 0, 1920, 1080);

      for (const comment of this.comments) {
        comment.draw(this.ctx, this.player.currentTime);
      }
      // 次のフレームを予約
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  get isExternalVideo(): boolean {
    return this.videoMetadata != null && this.videoMetadata.type !== 'internal';
  }

  initPlayer(): void {
    const isYouTube = this.isExternalVideo;
    const playerElement = isYouTube ? this.ytRef?.nativeElement : this.hlsRef?.nativeElement;

    if (!playerElement) {
      console.error('Player element not found!');
      return;
    }

    if (isYouTube) {
      // YouTubeの場合はHLSの初期化をスキップして直接Plyrに任せる
      this.initPlyr(playerElement);
      return;
    }

    const video = playerElement as HTMLVideoElement;
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    const manifestUrl = this.isEmbed
      ? `${environment.apiUrl}/unauthApi/embed/${this.videoId}?token=${token}`
      : `${environment.apiUrl}/api/videos/${this.videoId}/play`;

    // Apple系以外のブラウザではHLS.jsを使用して動画を再生
    if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(manifestUrl);
      this.hls.attachMedia(video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.addEventListener(
          'loadedmetadata',
          () => {
            this.initPlyr(video);
          },
          { once: true },
        );
      });

      this.hls.on(Hls.Events.ERROR, (event: Events.ERROR, data: ErrorData) => {
        console.warn('HLS.js error:', data);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // 403エラーは署名付きURLの有効期限切れの可能性が高いため、URLをリフレッシュして再試行
          if (data.response && data.response.code === 403) {
            console.warn(
              'The video URL may have expired. Attempting to refresh the URL and recover...',
            );

            // 現在の再生位置と再生状態（停止中か再生中か）を退避
            const currentTime = video.currentTime;
            const isPlaying = !video.paused;

            const newManifestUrl = `${manifestUrl}?t=${Date.now()}`;
            this.hls?.loadSource(newManifestUrl);

            // 読み込みが終わったら、元の位置から再開
            this.hls?.once(Hls.Events.MANIFEST_PARSED, () => {
              video.currentTime = currentTime;
              if (isPlaying) {
                video.play();
              }
            });
            return;
          } else if (data.response && data.response.code === 404) {
            console.warn('The video file was not found on the server. It may have been deleted.');
            this.router.navigate(['/404']);
            return;
          }

          if (data.fatal) {
            console.log('FATAL error encountered, trying to recover...');
            this.hls?.startLoad();
          }
        } else if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('MEDIA_ERROR encountered, trying to recover...');
              this.hls?.recoverMediaError();
              break;
            default:
              this.hls?.destroy();
              break;
          }
        }
      });
      // Apple系ブラウザではネイティブにHLSがサポートされているため、直接動画URLを設定して再生
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => {
        this.initPlyr(video);
      });

      video.addEventListener('error', (e) => {
        const error = video.error;
        console.warn('Error was occurred on native HLS:', error);
        // エラーコード3 (MEDIA_ERR_DECODE) や 4 (MEDIA_ERR_SRC_NOT_SUPPORTED)
        // これらのエラーは署名付きURLの有効期限切れである可能性が高い
        if (error && (error.code === 3 || error.code === 4)) {
          console.log(
            '動画のURLの有効期限が切れている可能性があります。新しいURLを取得して再試行します。',
          );
          const currentTime = video.currentTime;
          video.src = `${manifestUrl}?t=${Date.now()}`;
          video.currentTime = currentTime;
          video.play();
        }
      });
    } else {
      console.error('HLS is not supported in this browser');
      alert('このブラウザはHLS再生に対応していません。最新のブラウザを使用してください。');
    }
  }

  initPlyr(video: HTMLElement): void {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.player = new Plyr(video, {
      youtube: {
        cc_load_policy: 1,
        cc_lang_pref: 'oyoo', // ダミー言語により字幕を非表示にしている
        rel: 0,
        iv_load_policy: 3,
      },
      captions: { active: false },
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'mute',
        'volume',
        'captions',
        'settings',
        'fullscreen',
      ],
      settings: ['quality', 'speed'],
      keyboard: { focused: true, global: true },
      tooltips: { controls: true, seek: true },
      storage: { enabled: true, key: 'playbacq-plyr' },
      speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 1.75, 2, 3] },
      previewThumbnails: {
        enabled: true,
        src: `${environment.apiUrl}/${this.isEmbed ? 'unauthApi/embed' : 'api/videos'}/${this.videoId}/vtt?token=${token}`,
      },
    });

    if (this.player !== null) {
      const countViewTime = Math.min((this.videoMetadata?.duration ?? 0) / 4, 300) * 1000;
      this.player.on('ready', () => {
        if (this.isExternalVideo) {
          try {
            (this.player as any).embed?.unloadModule('captions');
            (this.player as any).embed?.unloadModule('cc');
          } catch (e) {}
        }

        // Plyrの要素APIを使用して、DOM構造の変更（特にYouTube iframe化）に依存しないようにする
        const plyrContainer = (this.player as any).elements?.container || video.closest('.plyr');
        const plyrVideoWrapper =
          (this.player as any).elements?.wrapper || video.closest('.plyr__video-wrapper');

        if (plyrVideoWrapper && this.commentCanvasRef) {
          plyrVideoWrapper.appendChild(this.commentCanvasRef.nativeElement);
        }

        const controls =
          (this.player as any).elements?.controls ||
          plyrContainer?.querySelector('.plyr__controls');
        const settingBtn = controls?.querySelector('[data-plyr="settings"]');

        if (controls && settingBtn) {
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'plyr__control';
          toggleBtn.title = 'コメントの表示/非表示';
          toggleBtn.style.display = 'flex';
          toggleBtn.style.alignItems = 'center';
          toggleBtn.style.justifyContent = 'center';

          // 初期アイコン（chat）を設定
          toggleBtn.innerHTML = '<span class="material-icons" style="font-size: 18px;">chat</span>';

          // コメント表示/非表示ボタンがクリックされた時の処理
          toggleBtn.addEventListener('click', () => {
            this.isCommentVisible = !this.isCommentVisible;
            if (this.commentCanvasRef) {
              // 元のコメントのopacityが0.9だから、表示時は0.9に戻す
              this.commentCanvasRef.nativeElement.style.opacity = this.isCommentVisible
                ? '0.9'
                : '0';
            }
            toggleBtn.innerHTML = this.isCommentVisible
              ? '<span class="material-icons" style="font-size: 18px;">chat</span>'
              : '<span class="material-icons" style="font-size: 18px;">speaker_notes_off</span>';
          });
          settingBtn.parentNode?.insertBefore(toggleBtn, settingBtn.nextSibling);

          const loopToggleBtn = document.createElement('button');
          loopToggleBtn.type = 'button';
          loopToggleBtn.className = 'plyr__control';
          loopToggleBtn.title = 'ループ再生のON/OFF';
          loopToggleBtn.style.display = 'flex';
          loopToggleBtn.style.alignItems = 'center';
          loopToggleBtn.style.justifyContent = 'center';

          const updateLoopIcon = () => {
            if (this.player) {
              loopToggleBtn.innerHTML = this.player.loop
                ? '<span class="material-icons" style="font-size: 18px; color: var(--plyr-color-main, #00ffa3);">repeat</span>'
                : '<span class="material-icons" style="font-size: 18px; opacity: 0.6;">repeat</span>';
            }
          };
          updateLoopIcon();
          loopToggleBtn.addEventListener('click', () => {
            if (this.player) {
              this.player.loop = !this.player.loop;
              updateLoopIcon();
            }
          });
          settingBtn.parentNode?.insertBefore(loopToggleBtn, toggleBtn.nextSibling);
        }

        this.isLoading = false;
        this.updateTags();
        this.cdr.detectChanges();
      });
      if (!this.isEmbed) {
        this.player.on('playing', () => {
          if (this.isExternalVideo) {
            try {
              (this.player as any).embed?.unloadModule('captions');
              (this.player as any).embed?.unloadModule('cc');
              (this.player as any).embed?.setOption('captions', 'track', {});
            } catch (e) {}
          }

          if (!this.hasCountedView) {
            // 再生が始まったら10秒後にカウントAPIを叩くタイマーをセット！
            this.viewTimer = setTimeout(() => {
              this.videoService.incrementViewCount(this.videoId).subscribe(() => {
                console.log('View count incremented for video ID:', this.videoId);
                this.hasCountedView = true;
              });
            }, countViewTime);
          }
        });

        // シーク（飛ばし）を検知したらタイマーを潰す
        this.player.on('seeking', () => clearTimeout(this.viewTimer));
      }
    }
  }

  decideYPosition(): void {
    this.comments.sort((a, b) => a.timestamp - b.timestamp);
    const experimentTime = Array.from({ length: 3 }, () => new Float64Array(1080));
    const heightOfComment = Array.from({ length: 3 }, () => new Float64Array(1080));
    const vaild = Array.from({ length: 3 }, () => new Int8Array(1080).fill(0));
    for (const comment of this.comments) {
      // 注：上端は4
      let y = 4;
      let breakFlag = false;
      let index = 0;
      if (comment.position === 'ue') {
        index = 1;
      } else if (comment.position === 'shita') {
        index = 2;
      }
      if (comment.position !== 'shita') {
        for (let empty_y = 0; y < 1050; y++) {
          empty_y++;
          if (vaild[index][y]) {
            // 消費期限切れはリセット
            if (experimentTime[index][y] < comment.timestamp) {
              vaild[index][y] = 0;
            } else {
              empty_y = 0;
              y += heightOfComment[index][y] + 1;
            }
          }
          if (empty_y >= comment.height) {
            comment.y = y - comment.height + 1;
            breakFlag = true;
            break;
          }
        }
        if (breakFlag) {
          for (let fill_y = Math.floor(comment.y); fill_y < comment.y + comment.height; fill_y++) {
            experimentTime[index][fill_y] = comment.timestamp + comment.appearTime;
            heightOfComment[index][fill_y] = comment.height - (fill_y - comment.y);
            vaild[index][fill_y] = 1;
          }
        } else {
          comment.y = Math.random() * (1080 - comment.height - 8) + 4;
        }
      } else {
        y = 1076;
        for (let empty_y = 0; y >= 0; y--) {
          empty_y++;
          if (vaild[index][y]) {
            // 消費期限切れはリセット
            if (experimentTime[index][y] < comment.timestamp) {
              vaild[index][y] = 0;
            } else {
              empty_y = 0;
              y -= heightOfComment[index][y] + 1;
            }
          }
          if (empty_y >= comment.height) {
            comment.y = y;
            breakFlag = true;
            break;
          }
        }
        if (breakFlag) {
          for (let fill_y = Math.floor(comment.y); fill_y < comment.y + comment.height; fill_y++) {
            experimentTime[index][fill_y] = comment.timestamp + comment.appearTime;
            heightOfComment[index][fill_y] = fill_y - comment.y;
            vaild[index][fill_y] = 1;
          }
        } else {
          comment.y = Math.random() * (1080 - comment.height - 8) + 4;
        }
      }
    }
  }

  updateTags(): void {
    if (!this.videoMetadata) return;
    this.videoService.getVideoTags(this.videoMetadata.video_id).subscribe((tags) => {
      this.tags = tags;
      this.cdr.detectChanges();
    });
  }

  isCommandMenuOpen = false;
  toggleCommandMenu(): void {
    this.isCommandMenuOpen = !this.isCommandMenuOpen;
  }

  // コマンドの定義一覧
  private readonly CMD_COLORS = [
    'white',
    'black',
    'gray',
    'brown',
    'green',
    'cyan',
    'blue',
    'yellow',
    'orange',
    'red',
  ];
  private readonly CMD_POSITIONS = ['ue', 'shita', 'naka'];
  private readonly CMD_SIZES = ['big', 'medium', 'small'];

  toggleCommand(cmd: string, cmdInput: HTMLInputElement): void {
    let currentCmds = cmdInput.value
      .toLowerCase()
      .split(/\s+/)
      .filter((c) => c !== '');
    const isColor = this.CMD_COLORS.includes(cmd) || cmd.startsWith('#');
    const isPos = this.CMD_POSITIONS.includes(cmd);
    const isSize = this.CMD_SIZES.includes(cmd);

    if (isColor)
      currentCmds = currentCmds.filter((c) => !this.CMD_COLORS.includes(c) && !c.startsWith('#'));
    if (isPos) currentCmds = currentCmds.filter((c) => !this.CMD_POSITIONS.includes(c));
    if (isSize) currentCmds = currentCmds.filter((c) => !this.CMD_SIZES.includes(c));

    currentCmds.push(cmd);
    cmdInput.value = currentCmds.join(' ');
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.inputCommentValue.set(input.value);
  }

  isValidComment(): boolean {
    if (!this.player) {
      return false;
    }
    return this.inputCommentValue().trim().length > 0 && this.inputCommentValue().length <= 140;
  }

  sendComment(): void {
    if (!this.player) {
      console.warn('Player is not initialized yet. Cannot send comment.');
      return;
    }
    const commentText = this.inputCommentValue().trim();
    const commandText = this.commandInputRef.nativeElement.value.trim();
    if (!commentText) {
      return;
    }
    if (commentText.length > 140 || commandText.length > 128) {
      alert('あり得ないことが起きています。HTMLを改竄していませんか？');
      return;
    }
    const currentTime = this.player?.currentTime ?? 0;
    this.comments.push(new Comment(commentText, currentTime, commandText, this.stampService));
    this.decideYPosition();
    this.commentService.postComment(this.videoId, commentText, currentTime, commandText).subscribe({
      next: () => {
        console.log('Comment:', commentText, 'at', currentTime, 'with commands:', commandText);
      },
      error: (err: any) => {
        console.error('Failed to post comment:', err);
        alert('コメントの投稿に失敗しました。');
      },
    });
    this.commentInputRef.nativeElement.value = '';
    this.inputCommentValue.set('');
  }

  commentSize(): number {
    return this.comments.length;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // タグ入力のドロップダウンが開いている状態で、ドロップダウンの外側がクリックされたら閉じる
    if (this.isTagInputOpen && this.tagActionWrapperRef) {
      const clickedInside = this.tagActionWrapperRef.nativeElement.contains(event.target as Node);
      if (!clickedInside) {
        this.isTagInputOpen = false;
      }
    }
    // その他のメニューが開いている状態で、メニューの外側がクリックされたら閉じる
    if (this.isMoreMenuOpen && this.moreMenuWrapperRef) {
      const clickedInside = this.moreMenuWrapperRef.nativeElement.contains(event.target as Node);
      if (!clickedInside) {
        this.isMoreMenuOpen = false;
      }
    }
    // スタンプピッカーが開いている状態で、スタンプピッカーの外側がクリックされたら閉じる
    if (this.isStampPickerOpen && this.stampActionWrapperRef) {
      const clickedInside = this.stampActionWrapperRef.nativeElement.contains(event.target as Node);
      if (!clickedInside) {
        this.isStampPickerOpen = false;
      }
    }
  }

  toggleMoreMenu(): void {
    this.isMoreMenuOpen = !this.isMoreMenuOpen;
  }

  toggleLike(): void {
    this.isLiked = !this.isLiked;
    if (this.isLiked) {
      this.likeCount++;
      this.videoService.addLike(this.videoId).subscribe({
        next: () => {
          console.log('Liked video ID:', this.videoId);
        },
        error: (err) => {
          console.error('Failed to like video:', err);
          alert('いいねの追加に失敗しました。');
        },
      });
    } else {
      this.likeCount = Math.max(0, this.likeCount - 1);
      this.videoService.removeLike(this.videoId).subscribe({
        next: () => {
          console.log('Unliked video ID:', this.videoId);
        },
        error: (err) => {
          console.error('Failed to unlike video:', err);
          alert('いいねの削除に失敗しました。');
        },
      });
    }
  }

  deleteVideo(): void {
    this.isMoreMenuOpen = false;
    if (!this.videoMetadata) return;

    if (confirm('本当にこの動画を削除しますか？\nこの操作は取り消せません。')) {
      console.log('動画削除処理を実行:', this.videoId);
      this.videoService.deleteVideo(this.videoId).subscribe({
        next: () => {
          alert('動画を削除しました。');
          this.router.navigate(['/']);
        },
        error: (err) => {
          console.error('Failed to delete video:', err);
          alert('動画の削除に失敗しました。');
        },
      });
    }
  }

  editVideo(): void {
    this.isMoreMenuOpen = false;
    if (!this.videoMetadata) return;

    const dialogRef = this.dialog.open(EditVideoDialogComponent, {
      width: '600px',
      disableClose: true,
      data: {
        title: this.videoMetadata.title,
        description: this.videoMetadata.description,
      },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: { title: string; description: string } | undefined) => {
        if (result) {
          this.videoService
            .editVideo(this.videoMetadata!.video_id, result.title, result.description)
            .subscribe({
              next: (updatedVideo) => {
                this.videoMetadata = updatedVideo;
                alert('動画情報を更新しました。');
                this.cdr.detectChanges();
              },
              error: (err) => {
                console.error('Failed to edit video:', err);
                alert('動画の編集に失敗しました。');
              },
            });
        }
      });
  }

  openTagInput(): void {
    this.isTagInputOpen = !this.isTagInputOpen;
  }

  onTagInput(event: Event): void {
    const inputKeyword = (event.target as HTMLInputElement).value;
    this.tagSearchSubject.next(inputKeyword);
  }

  addTag(tagName: string): void {
    if (!tagName.trim() || !this.videoMetadata) {
      return;
    }
    if (tagName.length > 40) {
      alert('あり得ないことが起きています。HTMLを改竄していませんか？');
      return;
    }
    if (!confirm('タグ ' + tagName + ' を追加しますか？')) {
      return;
    }
    this.videoService.addVideoTag(this.videoMetadata.video_id, tagName.trim()).subscribe({
      next: () => {
        this.updateTags();
        console.log('Added tag:', tagName);
      },
      error: (err: any) => {
        console.error('Failed to add tag:', err);
        alert('タグの追加に失敗しました。');
      },
    });
    this.isTagInputOpen = false;
  }

  removeTag(tag: Tag): void {
    if (!this.videoMetadata) return;
    if (!confirm('タグ ' + tag.name + ' を削除しますか？')) {
      return;
    }
    this.videoService.removeVideoTag(this.videoMetadata.video_id, tag).subscribe({
      next: () => {
        this.updateTags();
        console.log('Removed tag:', tag.name);
      },
      error: (err: any) => {
        console.error('Failed to remove tag:', err);
        alert('タグの削除に失敗しました。');
      },
    });
  }

  copyShareUrl(): void {
    const shareUrl = `${window.location.origin}/share/${this.videoId}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        console.log('Share URL copied to clipboard:', shareUrl);
        this.snackBar.open('共有リンクをコピーしました！', '閉じる', {
          duration: 3000,
          horizontalPosition: 'left',
          verticalPosition: 'bottom',
        });
      },
      (err) => {
        console.error('Failed to copy share URL:', err);
        alert('共有リンクのコピーに失敗しました。');
      },
    );
  }

  get stampRows(): Stamp[][] {
    const query = this.stampSearchQuery.trim().toLowerCase();
    const stamps = this.stampService.getStamps();
    const filtered = query ? stamps.filter((s) => s.name.toLowerCase().includes(query)) : stamps;
    const rows: Stamp[][] = [];
    for (let i = 0; i < filtered.length; i += this.StampRowNum) {
      rows.push(filtered.slice(i, i + this.StampRowNum));
    }
    return rows;
  }

  toggleStampPicker(): void {
    this.isStampPickerOpen = !this.isStampPickerOpen;
    if (this.isStampPickerOpen && this.stampService.getStamps().length === 0) {
      this.stampService.loadStamps().subscribe();
    }
  }

  insertStamp(stampName: string): void {
    const stampText = `:${stampName}:`;
    const input = this.commentInputRef.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.substring(0, start) + stampText + input.value.substring(end);
    const newPos = start + stampText.length;
    input.focus();
    input.setSelectionRange(newPos, newPos);
    this.inputCommentValue.set(input.value);
  }

  getStampImageUrl(stampName: string): string | null {
    return this.stampService.getStampURL(stampName);
  }

  onStampHover(stamp: Stamp | null): void {
    this.hoveredStamp = stamp;
  }

  trackByRow(index: number, row: Stamp[]): string {
    return row[0]?.id ?? index.toString();
  }

  ngOnDestroy(): void {
    if (this.hls) {
      this.hls.destroy();
    }
    if (this.commentSubscription) {
      this.commentSubscription.unsubscribe();
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.userIconUrl) {
      URL.revokeObjectURL(this.userIconUrl);
    }
    this.commentService.disconnect();
  }
}
