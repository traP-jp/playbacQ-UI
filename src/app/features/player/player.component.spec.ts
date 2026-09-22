import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PlayerComponent } from './player.component';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TagService } from '../../core/services/tag.service';
import { VideoService } from '../../core/services/video.service';
import { CommentService } from '../../core/services/comment.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { StampService } from '../../core/services/stamp.service';
import { EditVideoDialogComponent } from './edit-video-dialog.component';
import { Comment } from './comment';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { By } from '@angular/platform-browser';
import Hls from 'hls.js';
import { Video } from '../../core/models/video.model';
import { Stamp } from '../../core/models/stamp.model';
import { environment } from '../../../environments/environment';

let mockPlayingCallback: Function | null = null;
let mockPauseCallback: Function | null = null;
let mockSeekingCallback: Function | null = null;
let mockReadyCallback: Function | null = null;

vi.mock('plyr', () => {
  class MockPlyr {
    loop = false;
    constructor() {}
    on(eventName: string, callback: Function) {
      if (eventName === 'playing') {
        mockPlayingCallback = callback;
      } else if (eventName === 'pause') {
        mockPauseCallback = callback;
      } else if (eventName === 'seeking') {
        mockSeekingCallback = callback;
      } else if (eventName === 'ready') {
        mockReadyCallback = callback;
      }
    }
  }
  return { default: MockPlyr };
});

describe('PlayerComponent', () => {
  let component: PlayerComponent;
  let fixture: ComponentFixture<PlayerComponent>;
  let tagService: TagService;
  let videoService: VideoService;
  let commentService: CommentService;
  let authService: AuthService;
  let userService: UserService;
  let stampService: StampService;
  let messagesSubject: Subject<any>;
  beforeEach(async () => {
    messagesSubject = new Subject<any>();
    const mockTagService = {
      getTag: vi.fn().mockReturnValue(of([])),
    };
    const mockVideoService = {
      addVideoTag: vi.fn().mockReturnValue(of(undefined)),
      getVideoById: vi.fn().mockReturnValue(
        of({
          video_id: 'ABCD1234',
          title: 'Test Video',
          user_id: 'user',
          description: 'A test video',
          duration: 40,
          type: 'internal',
        }),
      ),
      removeVideoTag: vi.fn().mockReturnValue(of(undefined)),
      incrementViewCount: vi.fn().mockReturnValue(of({} as any)),
      deleteVideo: vi.fn().mockReturnValue(of({} as any)),
      editVideo: vi.fn().mockReturnValue(of({} as any)),
      getVideoTags: vi.fn().mockReturnValue(of([])),
      getLikes: vi.fn().mockReturnValue(of([])),
      addLike: vi.fn().mockReturnValue(of({} as any)),
      removeLike: vi.fn().mockReturnValue(of({} as any)),
    };
    const mockCommentService = {
      postComment: vi.fn().mockReturnValue(of({})),
      connect: vi.fn().mockReturnValue(of({} as any)),
      disconnect: vi.fn(),
      getComments: vi.fn().mockReturnValue(of([])),
      getEmbedComments: vi.fn().mockReturnValue(of([])),
      messages$: messagesSubject.asObservable(),
    };
    const mockAuthService = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      getUserID: vi.fn().mockReturnValue(of({ userId: 'user' })),
    };
    const mockUserService = {
      getUserIcon: vi.fn().mockReturnValue(of(new Blob())),
    };
    const mockStampService = {
      loadStamps: vi.fn().mockReturnValue(of(new Map<string, string>())),
      getStamps: vi.fn().mockReturnValue([]),
      getStampImage: vi.fn().mockReturnValue(null),
      getStampURL: vi.fn().mockReturnValue(null),
    };
    const mockMatDialog = {
      open: vi.fn(),
    };
    const mockSnackBar = {
      open: vi.fn(),
    };
    const mockActivatedRoute = {
      paramMap: of({ get: (key: string) => (key === 'id' ? 'ABCD1234' : null) }),
      snapshot: {
        data: {},
        queryParamMap: { get: (key: string) => null },
      },
    };
    await TestBed.configureTestingModule({
      imports: [PlayerComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TagService, useValue: mockTagService },
        { provide: VideoService, useValue: mockVideoService },
        { provide: CommentService, useValue: mockCommentService },
        { provide: MatDialog, useValue: mockMatDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: StampService, useValue: mockStampService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerComponent);
    component = fixture.componentInstance;
    videoService = TestBed.inject(VideoService);
    commentService = TestBed.inject(CommentService);
    userService = TestBed.inject(UserService);
    authService = TestBed.inject(AuthService);
    stampService = TestBed.inject(StampService);

    component.videoMetadata = {
      video_id: 'ABCD1234',
      title: 'Test Video',
      user_id: 'user',
      description: 'A test video',
      duration: 40,
      type: 'internal',
    } as any;
    tagService = TestBed.inject(TagService);
    vi.useFakeTimers();
    fixture.detectChanges();
    (component as any).videoId = 'ABCD1234';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  // 初期化テスト
  it('should call initPlayer on ngAfterViewInit when embeded', () => {
    const initPlayerSpy = vi.spyOn(component as any, 'initPlayer').mockImplementation(() => {});
    component.isEmbed = true;
    component.ngAfterViewInit();

    expect(initPlayerSpy).toHaveBeenCalled();
  });
  it('should output error when playerElement is null', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    component.hlsRef.nativeElement = null as any;
    component.initPlayer();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
  it('should skip HLS initialization when it is Youtube video', () => {
    component.videoMetadata = {
      video_id: 'ABCD1234',
      title: 'Test Video',
      user_id: 'user',
      description: 'A test video',
      duration: 40,
      type: 'youtube',
    } as Video;
    const initPlyrSpy = vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});
    const hlsIsSupportedSpy = vi.spyOn(Hls, 'isSupported').mockReturnValue(true);

    component.initPlayer();
    expect(hlsIsSupportedSpy).not.toHaveBeenCalled();
    expect(initPlyrSpy).toHaveBeenCalled();
  });
  // Hls.jsの初期化テスト
  it('should initialize Hls.js when supported', async () => {
    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    const video = component.hlsRef.nativeElement;
    const loadSourceSpy = vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    const attachMediaSpy = vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    const addEventListenerSpy = vi.spyOn(video, 'addEventListener').mockImplementation(() => {});
    const initPlyrSpy = vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    (component as any).initPlayer();

    expect(Hls.isSupported).toHaveBeenCalled();
    expect(loadSourceSpy).toHaveBeenCalledWith(`${environment.apiUrl}/api/videos/ABCD1234/play`);
    expect(attachMediaSpy).toHaveBeenCalledWith(component.hlsRef.nativeElement);
    expect(onSpy).toHaveBeenCalledWith(Hls.Events.MANIFEST_PARSED, expect.any(Function));

    const manifestParsedCalls = onSpy.mock.calls.filter(
      (call) => call[0] === Hls.Events.MANIFEST_PARSED,
    );
    const ourCall = manifestParsedCalls[manifestParsedCalls.length - 1];
    if (ourCall && ourCall[1]) {
      (ourCall[1] as Function).call(component, Hls.Events.MANIFEST_PARSED, {});
    }

    expect(addEventListenerSpy).toHaveBeenCalledWith('loadedmetadata', expect.any(Function), {
      once: true,
    });

    const loadedMetadataCalls = addEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'loadedmetadata',
    );
    const loadedmetadataCallback = loadedMetadataCalls[
      loadedMetadataCalls.length - 1
    ][1] as Function;
    loadedmetadataCallback();

    expect(initPlyrSpy).toHaveBeenCalled();
  });

  it('should refresh the page when Hls encounters a 403 error', () => {
    const mockTime = 1234567890;
    vi.setSystemTime(new Date(mockTime));

    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    const loadSourceSpy = vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    const onceSpy = vi.spyOn(Hls.prototype, 'once').mockImplementation(() => {});
    vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    const video = component.hlsRef.nativeElement;
    video.currentTime = 10;
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(async () => {});

    (component as any).initPlayer();

    const errorCalls = onSpy.mock.calls.filter((call) => call[0] === Hls.Events.ERROR);
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorData = {
      type: Hls.ErrorTypes.NETWORK_ERROR,
      response: { code: 403 },
    };
    errorCallback(Hls.Events.ERROR, errorData);

    const expectedUrl = `${environment.apiUrl}/api/videos/ABCD1234/play?t=${mockTime}`;
    expect(loadSourceSpy).toHaveBeenLastCalledWith(expectedUrl);

    const onceCalls = onceSpy.mock.calls.filter((call) => call[0] === Hls.Events.MANIFEST_PARSED);
    const manifestParsedCallback = onceCalls[onceCalls.length - 1][1] as Function;

    video.currentTime = 0;
    manifestParsedCallback();

    expect(video.currentTime).toBe(10);
    expect(playSpy).toHaveBeenCalled();
  });
  it('should redirect to 404 page when Hls encounters a 404 error', () => {
    const mockRouter = TestBed.inject(Router);
    const navigateSpy = vi
      .spyOn(mockRouter, 'navigate')
      .mockImplementation(() => Promise.resolve(true));
    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    (component as any).initPlayer();

    const errorCalls = onSpy.mock.calls.filter((call) => call[0] === Hls.Events.ERROR);
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorData = {
      type: Hls.ErrorTypes.NETWORK_ERROR,
      response: { code: 404 },
    };
    errorCallback(Hls.Events.ERROR, errorData);
    expect(navigateSpy).toHaveBeenCalledWith(['/404']);
  });
  it('should retry playing when Hls encounters a fatal network error other than 403 or 404', () => {
    const startLoadSpy = vi.spyOn(Hls.prototype, 'startLoad').mockImplementation(() => {});
    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    (component as any).initPlayer();

    const errorCalls = onSpy.mock.calls.filter((call) => call[0] === Hls.Events.ERROR);
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorData = {
      type: Hls.ErrorTypes.NETWORK_ERROR,
      fatal: true,
      response: { code: 500 },
    };
    errorCallback(Hls.Events.ERROR, errorData);
    expect(startLoadSpy).toHaveBeenCalled();
  });
  it('should try to recover when Hls encounters a MEDIA_ERROR', () => {
    const recoverMediaErrorSpy = vi
      .spyOn(Hls.prototype, 'recoverMediaError')
      .mockImplementation(() => {});
    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    (component as any).initPlayer();

    const errorCalls = onSpy.mock.calls.filter((call) => call[0] === Hls.Events.ERROR);
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorData = {
      type: Hls.ErrorTypes.MEDIA_ERROR,
      fatal: true,
    };
    errorCallback(Hls.Events.ERROR, errorData);
    expect(recoverMediaErrorSpy).toHaveBeenCalled();
  });
  it('should suecide when HlS encounters unknown fatal error', () => {
    const destroySpy = vi.spyOn(Hls.prototype, 'destroy').mockImplementation(() => {});
    vi.spyOn(Hls, 'isSupported').mockReturnValue(true);
    vi.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => {});
    vi.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => {});
    const onSpy = vi.spyOn(Hls.prototype, 'on').mockImplementation(() => {});
    vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});

    (component as any).initPlayer();

    const errorCalls = onSpy.mock.calls.filter((call) => call[0] === Hls.Events.ERROR);
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorData = {
      type: 'unknown_error',
      fatal: true,
    };
    errorCallback(Hls.Events.ERROR, errorData);
    expect(destroySpy).toHaveBeenCalled();
  });
  it('should use native HLS if supported', () => {
    const video = component.hlsRef.nativeElement;
    const canPlayTypeSpy = vi.spyOn(video, 'canPlayType').mockReturnValue('probably');
    const addEventListenerSpy = vi.spyOn(video, 'addEventListener').mockImplementation(() => {});
    const initPlyrSpy = vi.spyOn(component as any, 'initPlyr').mockImplementation(() => {});
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);

    (component as any).initPlayer();

    expect(canPlayTypeSpy).toHaveBeenCalledWith('application/vnd.apple.mpegurl');
    expect(video.src).toContain('ABCD1234/play');
    expect(addEventListenerSpy).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));

    const loadedmetadataCalls = addEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'loadedmetadata',
    );
    const loadedmetadataCallback = loadedmetadataCalls[
      loadedmetadataCalls.length - 1
    ][1] as Function;
    loadedmetadataCallback();

    expect(initPlyrSpy).toHaveBeenCalled();
  });
  it('should replay the video when native HLS encounters an error 3 or 4', () => {
    const mockTime = 1234567890;
    vi.setSystemTime(new Date(mockTime));
    const video = component.hlsRef.nativeElement;
    vi.spyOn(video, 'canPlayType').mockReturnValue('probably');
    const addEventListenerSpy = vi.spyOn(video, 'addEventListener').mockImplementation(() => {});
    const playSpy = vi.spyOn(video, 'play').mockImplementation(async () => {});
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);

    (component as any).initPlayer();

    const errorCalls = addEventListenerSpy.mock.calls.filter((call) => call[0] === 'error');
    const errorCallback = errorCalls[errorCalls.length - 1][1] as Function;
    const errorEvent = new Event('error') as any;
    Object.defineProperty(video, 'error', {
      value: { code: 3 },
      writable: true,
      configurable: true,
    });
    errorCallback(errorEvent);
    expect(video.src).toContain('ABCD1234/play?t=' + mockTime);
    expect(playSpy).toHaveBeenCalled();

    Object.defineProperty(video, 'error', {
      value: { code: 4 },
      writable: true,
      configurable: true,
    });
    errorCallback(errorEvent);
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
  it('should alert if HLS is not supported', () => {
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    (component as any).initPlayer();

    expect(alertSpy).toHaveBeenCalledWith(
      'このブラウザはHLS再生に対応していません。最新のブラウザを使用してください。',
    );
  });
  // Plyrの初期化テスト
  it('should initialize Plyr when player is ready', () => {
    const video = component.hlsRef.nativeElement;

    const plyrVideoWrapper = document.createElement('div');
    const controls = document.createElement('div');
    controls.className = 'plyr__controls';
    const settingBtn = document.createElement('button');
    settingBtn.setAttribute('data-plyr', 'settings');
    controls.appendChild(settingBtn);
    const plyrContainer = document.createElement('div');
    plyrContainer.className = 'plyr';
    plyrContainer.appendChild(controls);

    const closestSpy = vi.spyOn(video, 'closest').mockImplementation((selector: string) => {
      if (selector === '.plyr') return plyrContainer;
      if (selector === '.plyr__video-wrapper') return plyrVideoWrapper;
      return null;
    });

    component.initPlyr(video);

    expect(mockReadyCallback).toBeTruthy();

    mockReadyCallback!();

    expect(plyrVideoWrapper.contains(component.commentCanvasRef.nativeElement)).toBe(true);
    const toggleBtn = settingBtn.nextSibling as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.className).toBe('plyr__control');

    expect(component.isCommentVisible).toBe(true);
    toggleBtn.click();
    expect(component.isCommentVisible).toBe(false);
    expect(component.commentCanvasRef.nativeElement.style.opacity).toBe('0');

    toggleBtn.click();
    expect(component.isCommentVisible).toBe(true);
    expect(component.commentCanvasRef.nativeElement.style.opacity).toBe('0.9');

    expect(component.isLoading).toBe(false);

    closestSpy.mockRestore();
  });

  it('should start view counting timer when playing and cancel when seeking', async () => {
    const video = component.hlsRef.nativeElement;
    component.initPlyr(video);
    expect(mockPlayingCallback).toBeTruthy();
    expect(mockSeekingCallback).toBeTruthy();
    const incrementSpy = vi.spyOn(videoService, 'incrementViewCount');

    mockPlayingCallback!();

    await vi.advanceTimersByTimeAsync(5000);
    expect(incrementSpy).not.toHaveBeenCalled();
    mockSeekingCallback!();
    await vi.advanceTimersByTimeAsync(6000);
    expect(incrementSpy).not.toHaveBeenCalled();
    mockPlayingCallback!();
    await vi.advanceTimersByTimeAsync(10000);
    expect(incrementSpy).toHaveBeenCalledWith('ABCD1234');
    expect((component as any).hasCountedView).toBe(true);
  });

  it('should toggle loop when loop button is clicked', () => {
    const video = component.hlsRef.nativeElement;

    const plyrVideoWrapper = document.createElement('div');
    const controls = document.createElement('div');
    controls.className = 'plyr__controls';
    const settingBtn = document.createElement('button');
    settingBtn.setAttribute('data-plyr', 'settings');
    controls.appendChild(settingBtn);
    const plyrContainer = document.createElement('div');
    plyrContainer.className = 'plyr';
    plyrContainer.appendChild(controls);

    const closestSpy = vi.spyOn(video, 'closest').mockImplementation((selector: string) => {
      if (selector === '.plyr') return plyrContainer;
      if (selector === '.plyr__video-wrapper') return plyrVideoWrapper;
      return null;
    });

    component.initPlyr(video);

    expect(mockReadyCallback).toBeTruthy();
    mockReadyCallback!();

    const loopButton = controls.querySelectorAll('.plyr__control')[1] as HTMLButtonElement;
    expect(loopButton).toBeTruthy();

    const plyrInstance = (component as any).player as { loop: boolean };
    expect(plyrInstance.loop).toBe(false);
    loopButton.click();
    expect(plyrInstance.loop).toBe(true);
    loopButton.click();
    expect(plyrInstance.loop).toBe(false);

    closestSpy.mockRestore();
  });
  it('should unload External video captions', () => {
    const video = component.hlsRef.nativeElement;
    component.initPlyr(video);
    const unloadModuleSpy = vi.fn();
    const setOptionSpy = vi.fn();
    (component as any).player.embed = {
      unloadModule: unloadModuleSpy,
      setOption: setOptionSpy,
    };
    component.videoMetadata = {
      video_id: 'ABCD1234',
      title: 'Test Video',
      user_id: 'user',
      description: 'A test video',
      duration: 40,
      type: 'youtube',
    } as Video;
    expect(mockPlayingCallback).toBeTruthy();
    mockPlayingCallback!();

    expect(unloadModuleSpy).toHaveBeenCalledWith('captions');
    expect(unloadModuleSpy).toHaveBeenCalledWith('cc');
    expect(setOptionSpy).toHaveBeenCalledWith('captions', 'track', {});
  });
  it('should unload External video captions when player is ready', () => {
    const video = component.hlsRef.nativeElement;
    component.initPlyr(video);

    const unloadModuleSpy = vi.fn();
    (component as any).player.embed = {
      unloadModule: unloadModuleSpy,
    };
    component.videoMetadata = {
      video_id: 'ABCD1234',
      title: 'Test Video',
      user_id: 'user',
      description: 'A test video',
      duration: 40,
      type: 'youtube',
    } as Video;
    expect(mockReadyCallback).toBeTruthy();
    mockReadyCallback!();

    expect(unloadModuleSpy).toHaveBeenCalledWith('captions');
    expect(unloadModuleSpy).toHaveBeenCalledWith('cc');
  });

  // タグ入力の開閉テスト
  it('Tag input opening and closing test', () => {
    expect(component.isTagInputOpen).toBe(false);
    component.openTagInput();
    expect(component.isTagInputOpen).toBe(true);
    component.openTagInput();
    expect(component.isTagInputOpen).toBe(false);
  });
  it('parseUtcDate function test', () => {
    const utcString = '2026-03-20 14:53:20';
    const date = (component as any).parseUtcDate(utcString);
    expect(date.getUTCFullYear()).toBe(2026);
    // 月は0始まりなので、3月は2になる
    expect(date.getUTCMonth()).toBe(2);
    expect(date.getUTCDate()).toBe(20);
    expect(date.getUTCHours()).toBe(14);
    expect(date.getUTCMinutes()).toBe(53);
    expect(date.getUTCSeconds()).toBe(20);
  });
  it('should return null if parseUtcDate receives empty date string', () => {
    const emptyUtcString = undefined;
    const date = (component as any).parseUtcDate(emptyUtcString);
    expect(date).toBeNull();
  });
  // タグのサジェストテスト
  it('should suggest tags based on input after 300ms', async () => {
    const getTagSpy = vi
      .spyOn(tagService, 'getTag')
      .mockReturnValue(of([{ tag_id: 1, name: 'test', status: 0 }]));
    component.onTagInput({ target: { value: 'test' } } as any);
    await vi.advanceTimersByTimeAsync(299);
    expect(getTagSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(getTagSpy).toHaveBeenCalledTimes(1);
    expect(getTagSpy).toHaveBeenCalledWith('test');
  });
  it('should cancel suggesting tags if input changes before 300ms', async () => {
    const getTagSpy = vi
      .spyOn(tagService, 'getTag')
      .mockReturnValue(of([{ tag_id: 1, name: 'test', status: 0 }]));
    component.onTagInput({ target: { value: 'te' } } as any);
    await vi.advanceTimersByTimeAsync(200);
    component.onTagInput({ target: { value: 'tes' } } as any);
    await vi.advanceTimersByTimeAsync(200);
    expect(getTagSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(getTagSpy).toHaveBeenCalledTimes(1);
    expect(getTagSpy).toHaveBeenCalledWith('tes');
  });
  it('should not suggest tags if input is empty', async () => {
    const getTagSpy = vi
      .spyOn(tagService, 'getTag')
      .mockReturnValue(of([{ tag_id: 1, name: 'test', status: 0 }]));
    component.onTagInput({ target: { value: '   ' } } as any);
    await vi.advanceTimersByTimeAsync(300);
    expect(getTagSpy).not.toHaveBeenCalled();
  });
  it('should return empty array if tag service fails', async () => {
    vi.spyOn(tagService, 'getTag').mockReturnValue(throwError(() => new Error('Failed to fetch')));
    component.onTagInput({ target: { value: 'test' } } as any);
    await vi.advanceTimersByTimeAsync(300);
    expect(component.suggestTags).toEqual([]);
  });
  // タグの追加の確認テスト
  it('confirms tag selection', () => {
    const confirmTagSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const addVideoTagSpy = vi.spyOn(videoService, 'addVideoTag').mockReturnValue(of(undefined));
    component.addTag('test');
    expect(confirmTagSpy).toHaveBeenCalledWith('タグ test を追加しますか？');
    expect(addVideoTagSpy).toHaveBeenCalledWith('ABCD1234', 'test');
  });
  it('should refuse adding too long tag', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.addTag('a'.repeat(41));
    expect(alertSpy).toHaveBeenCalledWith(
      'あり得ないことが起きています。HTMLを改竄していませんか？',
    );
  });
  it('should not add tag if selection is cancelled', () => {
    const confirmTagSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const addVideoTagSpy = vi.spyOn(videoService, 'addVideoTag').mockReturnValue(of(undefined));
    component.addTag('test');
    expect(confirmTagSpy).toHaveBeenCalledWith('タグ test を追加しますか？');
    expect(addVideoTagSpy).not.toHaveBeenCalled();
  });
  it('should alert when failed to add tag', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const addVideoTagSpy = vi
      .spyOn(videoService, 'addVideoTag')
      .mockReturnValue(throwError(() => new Error('Failed to add tag')));
    component.addTag('test');
    expect(addVideoTagSpy).toHaveBeenCalledWith('ABCD1234', 'test');
    expect(alertSpy).toHaveBeenCalledWith('タグの追加に失敗しました。');
  });
  it('should early return if adding tag is empty', () => {
    const confirmTagSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const addVideoTagSpy = vi.spyOn(videoService, 'addVideoTag').mockReturnValue(of(undefined));
    component.addTag('  ');
    expect(confirmTagSpy).not.toHaveBeenCalled();
    expect(addVideoTagSpy).not.toHaveBeenCalled();
  });
  // タグ情報更新テスト
  it('should update tags', () => {
    const getVideoTagsSpy = vi
      .spyOn(videoService, 'getVideoTags')
      .mockReturnValue(of([{ tag_id: 1, name: 'test', status: 0 }]));
    component.updateTags();
    expect(getVideoTagsSpy).toHaveBeenCalledWith('ABCD1234');
    expect(component.tags).toEqual([{ tag_id: 1, name: 'test', status: 0 }]);
  });
  it('should early return if videoMetadata is null when updating tags', () => {
    const getVideoTagsSpy = vi
      .spyOn(videoService, 'getVideoTags')
      .mockReturnValue(of([{ tag_id: 1, name: 'test', status: 0 }]));
    component.videoMetadata = null;
    component.updateTags();
    expect(getVideoTagsSpy).not.toHaveBeenCalled();
    expect(component.tags).toEqual([]);
  });
  // タグの削除の確認テスト
  it('confirms tag deletion', () => {
    const confirmTagSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteVideoTagSpy = vi
      .spyOn(videoService, 'removeVideoTag')
      .mockReturnValue(of(undefined));
    const mockTag = { tag_id: 1, name: 'test', status: 0 };
    component.removeTag(mockTag);
    expect(confirmTagSpy).toHaveBeenCalledWith('タグ test を削除しますか？');
    expect(deleteVideoTagSpy).toHaveBeenCalledWith('ABCD1234', mockTag);
  });
  it('should alert when failed to delete tag', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const deleteVideoTagSpy = vi
      .spyOn(videoService, 'removeVideoTag')
      .mockReturnValue(throwError(() => new Error('Failed to delete tag')));
    const mockTag = { tag_id: 1, name: 'test', status: 0 };
    component.removeTag(mockTag);
    expect(deleteVideoTagSpy).toHaveBeenCalledWith('ABCD1234', mockTag);
    expect(alertSpy).toHaveBeenCalledWith('タグの削除に失敗しました。');
  });
  it('should not delete tag if deletion is cancelled', () => {
    const confirmTagSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteVideoTagSpy = vi
      .spyOn(videoService, 'removeVideoTag')
      .mockReturnValue(of(undefined));
    const mockTag = { tag_id: 1, name: 'test', status: 0 };
    component.removeTag(mockTag);
    expect(confirmTagSpy).toHaveBeenCalledWith('タグ test を削除しますか？');
    expect(deleteVideoTagSpy).not.toHaveBeenCalled();
  });
  // 共有リンクコピーテスト
  it('should copy share link to clipboard', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
    });
    const mockBarSpy = vi
      .spyOn((component as any).snackBar, 'open')
      .mockImplementation(() => null as any);
    component.copyShareUrl();
    await Promise.resolve();
    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/share/ABCD1234`,
    );
    expect(mockBarSpy).toHaveBeenCalled();
  });
  it('should alert when failed to copy share link', async () => {
    const mockClipboard = {
      writeText: vi.fn().mockRejectedValue(new Error('Failed to copy')),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await component.copyShareUrl();
    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/share/ABCD1234`,
    );
    expect(alertSpy).toHaveBeenCalledWith('共有リンクのコピーに失敗しました。');
  });
  // いいねテスト
  it('should toggle like', () => {
    const addLikeSpy = vi.spyOn(videoService, 'addLike').mockReturnValue(of({} as any));
    const removeLikeSpy = vi.spyOn(videoService, 'removeLike').mockReturnValue(of({} as any));
    component.isLiked = false;
    component.toggleLike();
    expect(addLikeSpy).toHaveBeenCalledWith('ABCD1234');
    component.isLiked = true;
    component.toggleLike();
    expect(removeLikeSpy).toHaveBeenCalledWith('ABCD1234');
  });
  it('should alert when failed to toggle like', () => {
    const addLikeSpy = vi
      .spyOn(videoService, 'addLike')
      .mockReturnValue(throwError(() => new Error('Failed to add like')));
    const removeLikeSpy = vi
      .spyOn(videoService, 'removeLike')
      .mockReturnValue(throwError(() => new Error('Failed to remove like')));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.isLiked = false;
    component.toggleLike();
    expect(addLikeSpy).toHaveBeenCalledWith('ABCD1234');
    expect(alertSpy).toHaveBeenCalledWith('いいねの追加に失敗しました。');
    component.isLiked = true;
    component.toggleLike();
    expect(removeLikeSpy).toHaveBeenCalledWith('ABCD1234');
    expect(alertSpy).toHaveBeenCalledWith('いいねの削除に失敗しました。');
  });
  // コメント入力テスト
  it('should update command selection', () => {
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    component.toggleCommand('red', commandInputEl);
    expect(commandInputEl.value).toBe('red');
    component.toggleCommand('blue', commandInputEl);
    expect(commandInputEl.value).toBe('blue');
  });
  it('postComment test', () => {
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    commentInputEl.value = 'Test Comment';
    (component as any).inputCommentValue.set('Test Comment');
    commandInputEl.value = 'ue big red';
    const postCommentSpy = vi.spyOn(commentService, 'postComment').mockReturnValue(of({} as any));
    (component as any).player = { currentTime: 120 };
    component.sendComment();
    expect(postCommentSpy).toHaveBeenCalledWith(
      component['videoId'],
      'Test Comment',
      120,
      'ue big red',
    );
  });
  it('should cancel posting comment when comment or command is too long', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    (component as any).player = { currentTime: 120 };
    // maxlength属性は201文字を許可しないため、テスト用にsignalを直接設定する
    const longComment = 'a'.repeat(201);
    commentInputEl.value = longComment;
    (component as any).inputCommentValue.set(longComment);
    commandInputEl.value = 'red';
    component.sendComment();
    expect(alertSpy).toHaveBeenCalledWith(
      'あり得ないことが起きています。HTMLを改竄していませんか？',
    );
    const testComment = 'Test Comment';
    commentInputEl.value = testComment;
    (component as any).inputCommentValue.set(testComment);
    commandInputEl.value = 'a'.repeat(129);
    component.sendComment();
    expect(alertSpy).toHaveBeenCalledWith(
      'あり得ないことが起きています。HTMLを改竄していませんか？',
    );
  });
  it('should early return when posting empty comment', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    (component as any).player = { currentTime: 120 };
    commentInputEl.value = '   ';
    commandInputEl.value = '';
    (component as any).inputCommentValue.set('   ');
    const sendButton = fixture.debugElement.query(By.css('.send-btn')).nativeElement;
    fixture.detectChanges();
    sendButton.click();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(commentService.postComment).not.toHaveBeenCalled();
  });
  it('should alert when failed to post comment', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    (component as any).player = { currentTime: 120 };
    commentInputEl.value = 'Test Comment';
    (component as any).inputCommentValue.set('Test Comment');
    commandInputEl.value = '';
    const postCommentSpy = vi
      .spyOn(commentService, 'postComment')
      .mockReturnValue(throwError(() => new Error('Failed')));
    component.sendComment();
    expect(postCommentSpy).toHaveBeenCalledWith(component['videoId'], 'Test Comment', 120, '');
    expect(alertSpy).toHaveBeenCalledWith('コメントの投稿に失敗しました。');
  });
  it('should early return if player is not initialized when posting comment', () => {
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    const commandInputEl = fixture.debugElement.query(By.css('.command-input'))
      .nativeElement as HTMLInputElement;
    commentInputEl.value = 'Test Comment';
    commandInputEl.value = '';
    const sendButton = fixture.debugElement.query(By.css('.send-btn')).nativeElement;
    fixture.detectChanges();
    sendButton.click();
    expect(commentService.postComment).not.toHaveBeenCalled();
  });
  it('should toggle command menu', () => {
    expect(component.isCommandMenuOpen).toBe(false);
    component.toggleCommandMenu();
    expect(component.isCommandMenuOpen).toBe(true);
    component.toggleCommandMenu();
    expect(component.isCommandMenuOpen).toBe(false);
  });
  // コメント受信テスト
  it('getComments test', () => {
    const mockApiResponse = [
      { comment: 'テスト', timestamp: 1500, command: 'shita red' },
      { comment: 'test', timestamp: 2000, command: 'big' },
    ];
    vi.spyOn(component, 'initPlayer').mockImplementation(() => {});
    vi.spyOn(component, 'startCommentLoop').mockImplementation(() => {});

    const getCommentsSpy = vi
      .spyOn(commentService, 'getComments')
      .mockReturnValue(of(mockApiResponse as any));
    const decideYPositionSpy = vi.spyOn(component, 'decideYPosition').mockImplementation(() => {});
    component.ngOnInit();
    expect(getCommentsSpy).toHaveBeenCalledWith('ABCD1234');
    const comments = component['comments'];
    expect(comments.length).toBe(2);
    expect(comments[0]).toBeInstanceOf(Comment);
    expect(comments[0].timestamp).toBe(1500);
    expect((comments[0] as any).text).toBe('テスト');
    expect(comments[1]).toBeInstanceOf(Comment);
    expect(comments[1].timestamp).toBe(2000);
    expect((comments[1] as any).text).toBe('test');
    expect(decideYPositionSpy).toHaveBeenCalledTimes(1);
  });
  it('getEmbedComments test', () => {
    const mockApiResponse = [
      { comment: 'テスト', timestamp: 1500, command: 'shita red' },
      { comment: 'test', timestamp: 2000, command: 'big' },
    ];
    vi.spyOn(component, 'initPlayer').mockImplementation(() => {});
    vi.spyOn(component, 'startCommentLoop').mockImplementation(() => {});
    const getEmbedCommentsSpy = vi
      .spyOn(commentService, 'getEmbedComments')
      .mockReturnValue(of(mockApiResponse as any));
    vi.spyOn(component['route'], 'snapshot', 'get').mockReturnValue({
      data: { embed: true },
      queryParamMap: {
        get: (key: string) => (key === 'token' ? 'hogehoge' : null),
      },
    } as any);
    const decideYPositionSpy = vi.spyOn(component, 'decideYPosition').mockImplementation(() => {});
    component.ngOnInit();
    expect(getEmbedCommentsSpy).toHaveBeenCalledWith('ABCD1234', 'hogehoge');
    const comments = component['comments'];
    expect(comments.length).toBe(2);
    expect(comments[0]).toBeInstanceOf(Comment);
    expect(comments[0].timestamp).toBe(1500);
    expect((comments[0] as any).text).toBe('テスト');
    expect(comments[1]).toBeInstanceOf(Comment);
    expect(comments[1].timestamp).toBe(2000);
    expect((comments[1] as any).text).toBe('test');
    expect(decideYPositionSpy).toHaveBeenCalledTimes(1);
  });
  it('should skip comment loop if player or ctx is not initialized', () => {
    let mockCtx = { clearRect: vi.fn() };
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(12345));
    component['player'] = null;
    component.startCommentLoop();

    expect(mockCtx.clearRect).not.toHaveBeenCalled();
    expect(window.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
    expect(component['animationFrameId']).toBe(12345);
  });
  it('should call draw method of comments in comment loop', () => {
    let mockCtx = { clearRect: vi.fn() };
    let callCount = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn().mockImplementation((callback) => {
        // 最初の1回だけコールバックを実行
        if (callCount === 0) {
          callCount++;
          callback();
        }
        return 12345;
      }),
    );
    component['player'] = { currentTime: 1500 } as any;
    component['ctx'] = mockCtx as any;
    const mockComment1 = { draw: vi.fn() } as any;
    const mockComment2 = { draw: vi.fn() } as any;
    component['comments'] = [mockComment1, mockComment2];
    component.startCommentLoop();
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(mockComment1.draw).toHaveBeenCalledWith(mockCtx, 1500);
    expect(mockComment2.draw).toHaveBeenCalledWith(mockCtx, 1500);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });
  // WebSocketからのリアルタイム受信テスト
  it('should receive comments in real-time', () => {
    messagesSubject.next({ content: 'Real-time Comment', timestamp: 123, command: 'red' });
    expect((component as any).comments.length).toBe(1);
    expect((component as any).comments[0].text).toBe('Real-time Comment');
    expect((component as any).comments[0].timestamp).toBe(123);
    expect((component as any).comments[0].fillColor).toBe('#FF0000');
  });
  // 再生数カウントテスト
  it('should count view when video is played', async () => {
    const incrementSpy = vi
      .spyOn(videoService, 'incrementViewCount')
      .mockReturnValue(of({} as any));
    component.initPlyr(document.createElement('video'));
    expect(mockPlayingCallback).not.toBeNull();
    mockPlayingCallback!();
    await vi.advanceTimersByTimeAsync(9999);
    expect(incrementSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(incrementSpy).toHaveBeenCalledTimes(1);
    expect(incrementSpy).toHaveBeenCalledWith('ABCD1234');
  });
  it('should cancel view count if video is seeking before 10 seconds', async () => {
    const incrementSpy = vi
      .spyOn(videoService, 'incrementViewCount')
      .mockReturnValue(of({} as any));
    component.initPlyr(document.createElement('video'));
    expect(mockPlayingCallback).not.toBeNull();
    mockPlayingCallback!();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockSeekingCallback).not.toBeNull();
    mockSeekingCallback!();
    await vi.advanceTimersByTimeAsync(5000);
    expect(incrementSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(incrementSpy).not.toHaveBeenCalled();
  });
  // 動画削除のテスト
  it('should delete video after confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteVideoSpy = vi.spyOn(videoService, 'deleteVideo').mockReturnValue(of({} as any));
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.deleteVideo();
    expect(confirmSpy).toHaveBeenCalledWith(
      '本当にこの動画を削除しますか？\nこの操作は取り消せません。',
    );
    expect(deleteVideoSpy).toHaveBeenCalledWith('ABCD1234');
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
  it('should not delete video if confirmation is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteVideoSpy = vi.spyOn(videoService, 'deleteVideo').mockReturnValue(of({} as any));
    component.deleteVideo();
    expect(confirmSpy).toHaveBeenCalledWith(
      '本当にこの動画を削除しますか？\nこの操作は取り消せません。',
    );
    expect(deleteVideoSpy).not.toHaveBeenCalled();
  });
  it('should alert when failed to delete video', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const deleteVideoSpy = vi
      .spyOn(videoService, 'deleteVideo')
      .mockReturnValue(throwError(() => new Error('Failed to delete')));
    component.deleteVideo();
    expect(deleteVideoSpy).toHaveBeenCalledWith('ABCD1234');
    expect(alertSpy).toHaveBeenCalledWith('動画の削除に失敗しました。');
  });
  // 動画編集のテスト
  it('should early return if videoMetadata is null when editing video', () => {
    const editVideoSpy = vi.spyOn(videoService, 'editVideo').mockReturnValue(of({} as any));
    component.videoMetadata = null;
    component.editVideo();
    expect(editVideoSpy).not.toHaveBeenCalled();
  });
  it('should call dialog with correct parameters when editing video', () => {
    const dialog = TestBed.inject(MatDialog);
    const afterClosedSubject = new Subject();
    vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
    } as any);

    component.editVideo();
    expect(component.isMoreMenuOpen).toBe(false);
    expect(dialog.open).toHaveBeenCalledWith(EditVideoDialogComponent, {
      width: '600px',
      disableClose: true,
      data: {
        title: component.videoMetadata?.title,
        description: component.videoMetadata?.description,
      },
    });
  });
  it('should call editVideo API and update videoMetadata after editing video', () => {
    const dialog = TestBed.inject(MatDialog);
    const editVideoSpy = vi
      .spyOn(videoService, 'editVideo')
      .mockImplementation((videoId: string, title: string, description: string) =>
        of({
          video_id: videoId,
          title,
          description,
          user_id: 'user',
          duration: 40,
        } as Video),
      );
    const afterClosedSubject = new Subject<Video>();
    vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
    } as any);
    component.editVideo();
    afterClosedSubject.next({ title: 'New Title', description: 'New Description' } as Video);
    expect(editVideoSpy).toHaveBeenCalledWith('ABCD1234', 'New Title', 'New Description');
    expect(component.videoMetadata?.title).toBe('New Title');
    expect(component.videoMetadata?.description).toBe('New Description');
  });
  it('should alert when failed to edit video', () => {
    const dialog = TestBed.inject(MatDialog);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const editVideoSpy = vi
      .spyOn(videoService, 'editVideo')
      .mockReturnValue(throwError(() => new Error('Failed to edit video')));
    const afterClosedSubject = new Subject<Video>();
    vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
    } as any);
    component.editVideo();
    afterClosedSubject.next({ title: 'New Title', description: 'New Description' } as Video);
    expect(editVideoSpy).toHaveBeenCalledWith('ABCD1234', 'New Title', 'New Description');
    expect(alertSpy).toHaveBeenCalledWith('動画の編集に失敗しました。');
  });
  it('should not call editVideo API if dialog is closed without data', () => {
    const dialog = TestBed.inject(MatDialog);
    const editVideoSpy = vi.spyOn(videoService, 'editVideo').mockReturnValue(of({} as any));
    const afterClosedSubject = new Subject<Video>();
    vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
    } as any);
    component.editVideo();
    afterClosedSubject.next(null as any);
    expect(editVideoSpy).not.toHaveBeenCalled();
  });
  // スタンプ検索テスト
  it('should return stamp rows based on search input', () => {
    const mockStamps: Stamp[] = [
      { id: 'id-1', name: 'stamp1' },
      { id: 'id-2', name: 'stamp2' },
      { id: 'id-3', name: 'stamp3' },
      { id: 'id-4', name: 'stamp4' },
      { id: 'id-5', name: 'stamp5' },
      { id: 'id-6', name: 'stamp6' },
      { id: 'id-7', name: 'stamp7' },
      { id: 'id-8', name: 'stamp8' },
      { id: 'id-9', name: 'stamp9' },
      { id: 'id-10', name: 'stamp10' },
      { id: 'id-11', name: 'test1' },
      { id: 'id-12', name: 'test2' },
      { id: 'id-13', name: 'test3' },
      { id: 'id-14', name: 'test4' },
      { id: 'id-15', name: 'test5' },
    ];
    vi.spyOn(stampService, 'getStamps').mockReturnValue(mockStamps);
    component.stampSearchQuery = 'stamp';
    expect(component.stampRows).toEqual([mockStamps.slice(0, 8), mockStamps.slice(8, 10)]);
  });
  // スタンプピッカーの開閉テスト
  it('should toggle stamp picker', () => {
    vi.spyOn(stampService, 'getStamps').mockReturnValue([]);
    const mockLoadStampsSpy = vi.spyOn(stampService, 'loadStamps').mockReturnValue(of([]));
    mockLoadStampsSpy.mockClear();
    expect(component.isStampPickerOpen).toBe(false);
    // 開
    component.toggleStampPicker();
    expect(component.isStampPickerOpen).toBe(true);
    expect(mockLoadStampsSpy).toHaveBeenCalledTimes(1);
    // 閉
    mockLoadStampsSpy.mockClear();
    component.toggleStampPicker();
    expect(component.isStampPickerOpen).toBe(false);
    expect(mockLoadStampsSpy).not.toHaveBeenCalled();

    mockLoadStampsSpy.mockClear();
    vi.spyOn(stampService, 'getStamps').mockReturnValue([
      { id: 'id-1', name: 'stamp1' },
      { id: 'id-2', name: 'stamp2' },
    ]);
    // 開
    component.toggleStampPicker();
    expect(component.isStampPickerOpen).toBe(true);
    expect(mockLoadStampsSpy).not.toHaveBeenCalled();
  });
  it('should insert stamp into comment input when stamp is clicked', () => {
    const commentInputEl = fixture.debugElement.query(By.css('.comment-input'))
      .nativeElement as HTMLInputElement;
    commentInputEl.value = 'Hello ';
    component.insertStamp('stamp1');
    expect(commentInputEl.value).toBe('Hello :stamp1:');
  });
  it('should call StampService.getStampURL', () => {
    const getStampURLSpy = vi.spyOn(stampService, 'getStampURL').mockReturnValue('mock-url');
    component.getStampImageUrl('stamp1');
    expect(getStampURLSpy).toHaveBeenCalledWith('stamp1');
  });
  it('should store hovered stamp name when mouse hovered', () => {
    const mockStamp: Stamp = { id: 'stamp-1', name: 'stamp1' };
    component.onStampHover(mockStamp);
    expect(component.hoveredStamp).toEqual(mockStamp);
  });
  it('should trackByRow function return index', () => {
    const index = 5;
    const row: Stamp[] = [
      { id: 'stamp-id-1', name: 'stamp1' },
      { id: 'stamp-id-2', name: 'stamp2' },
    ];
    expect(component.trackByRow(index, row)).toBe('stamp-id-1');

    const index2 = 3;
    const row2: Stamp[] = [];
    expect(component.trackByRow(index2, row2)).toBe('3');
  });
  // 枠外クリックでメニューを閉じるテスト
  it('should close more menu when clicking outside', async () => {
    const wrapperElement = document.createElement('div');
    const outsideElement = document.createElement('button');
    component.isTagInputOpen = true;
    component.tagActionWrapperRef = new ElementRef(wrapperElement);

    const mockEvent = { target: outsideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isTagInputOpen).toBe(false);
  });
  it('should not close more menu when clicking inside', async () => {
    const wrapperElement = document.createElement('div');
    const insideElement = document.createElement('input');
    wrapperElement.appendChild(insideElement);
    component.isTagInputOpen = true;
    component.tagActionWrapperRef = new ElementRef(wrapperElement);

    const mockEvent = { target: insideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isTagInputOpen).toBe(true);
  });
  it('should close more menu when clicking outside of more menu', async () => {
    const moreMenuElement = document.createElement('div');
    const outsideElement = document.createElement('button');
    component.isMoreMenuOpen = true;
    component.moreMenuWrapperRef = new ElementRef(moreMenuElement);
    const mockEvent = { target: outsideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isMoreMenuOpen).toBe(false);
  });
  it('should not close more menu when clicking inside more menu', async () => {
    const moreMenuElement = document.createElement('div');
    const insideElement = document.createElement('input');
    moreMenuElement.appendChild(insideElement);
    component.isMoreMenuOpen = true;
    component.moreMenuWrapperRef = new ElementRef(moreMenuElement);
    const mockEvent = { target: insideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isMoreMenuOpen).toBe(true);
  });
  it('should close stamp picker when clicking outside', async () => {
    const stampPickerElement = document.createElement('div');
    const outsideElement = document.createElement('button');
    component.isStampPickerOpen = true;
    component.stampActionWrapperRef = new ElementRef(stampPickerElement);
    const mockEvent = { target: outsideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isStampPickerOpen).toBe(false);
  });
  it('should not close stamp picker when clicking inside', async () => {
    const stampPickerElement = document.createElement('div');
    const insideElement = document.createElement('input');
    stampPickerElement.appendChild(insideElement);
    component.isStampPickerOpen = true;
    component.stampActionWrapperRef = new ElementRef(stampPickerElement);
    const mockEvent = { target: insideElement } as unknown as MouseEvent;
    component.onDocumentClick(mockEvent);
    expect(component.isStampPickerOpen).toBe(true);
  });
  it('should toggle more menu', () => {
    component.isMoreMenuOpen = false;
    component.toggleMoreMenu();
    expect(component.isMoreMenuOpen).toBe(true);
    component.toggleMoreMenu();
    expect(component.isMoreMenuOpen).toBe(false);
  });
  it('should clean up resources on destroy', () => {
    const disconnectSpy = vi.spyOn(commentService, 'disconnect');
    const hlsDestroySpy = vi.fn();
    (component as any).hls = { destroy: hlsDestroySpy };
    component.ngOnDestroy();
    expect(disconnectSpy).toHaveBeenCalled();
    expect(hlsDestroySpy).toHaveBeenCalled();
  });
});
