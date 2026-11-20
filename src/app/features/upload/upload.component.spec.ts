import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UploadComponent } from './upload.component';
import { VideoService } from '../../core/services/video.service';
import { UploadService } from '../../core/services/upload.service';
import { vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpResponse, HttpEventType } from '@angular/common/http';
import { FormControl } from '@angular/forms';

describe('UploadComponent', () => {
  let component: UploadComponent;
  let fixture: ComponentFixture<UploadComponent>;
  let videoService: VideoService;
  let uploadService: UploadService;
  beforeEach(async () => {
    const mockVideoService = {
      createVideo: vi.fn(),
      pollUploadProgress: vi.fn(),
      uploadExVideo: vi.fn(),
    };
    const mockUploadService = {
      uploadToMinio: vi.fn(),
      getTraQChannels: vi.fn().mockReturnValue(of([])),
    };
    await TestBed.configureTestingModule({
      imports: [UploadComponent],
      providers: [
        { provide: VideoService, useValue: mockVideoService },
        { provide: UploadService, useValue: mockUploadService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadComponent);
    component = fixture.componentInstance;
    videoService = TestBed.inject(VideoService);
    uploadService = TestBed.inject(UploadService);
    vi.useFakeTimers();
    fixture.detectChanges();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('Form test', () => {
    // 初期状態ではフォームは無効(空)であることを確認
    expect(component.videoForm.valid).not.toBeTruthy();
    // タイトルを入力してフォームが有効になることを確認
    component.videoForm.controls['title'].setValue('Test Video');
    expect(component.videoForm.valid).toBeTruthy();
    // タイトルが空の状態で投稿できないことを確認
    const createVideoSpy = vi.spyOn(videoService, 'createVideo');
    component.videoForm.controls['title'].setValue('');
    component.startUpload();
    expect(createVideoSpy).not.toHaveBeenCalled();
  });
  it('DOM UI test', () => {
    const mockDragEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent;
    component.onDragOver(mockDragEvent);
    expect(component.isDragging).toBe(true);
    expect(mockDragEvent.preventDefault).toHaveBeenCalled();
    expect(mockDragEvent.stopPropagation).toHaveBeenCalled();
    component.onDragLeave(mockDragEvent);
    expect(component.isDragging).toBe(false);
    expect(mockDragEvent.preventDefault).toHaveBeenCalledTimes(2);
    expect(mockDragEvent.stopPropagation).toHaveBeenCalledTimes(2);
  });
  it('Pass the file to the service test', () => {
    const mockVideoFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const mockDropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [mockVideoFile],
      },
    } as unknown as DragEvent;
    component.onDrop(mockDropEvent);
    expect(component.selectedFile).toBe(mockVideoFile);
    expect(component.hasFile).toBe(true);
  });
  it('Pass the file through file input test', () => {
    const mockVideoFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const mockInputEvent = {
      target: {
        files: [mockVideoFile],
      },
    } as unknown as Event;
    component.onFileSelected(mockInputEvent);
    expect(component.selectedFile).toBe(mockVideoFile);
    expect(component.hasFile).toBe(true);
  });
  it('should not call handleFile if no files are selected', () => {
    const handleFileSpy = vi.spyOn(component as any, 'handleFile');
    const mockInputEvent = {
      target: {
        files: [],
      },
    } as unknown as Event;
    component.onFileSelected(mockInputEvent);
    expect(handleFileSpy).not.toHaveBeenCalled();
    component.onDrop({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [],
      },
    } as unknown as DragEvent);
    expect(handleFileSpy).not.toHaveBeenCalled();
  });
  it('Pass invalid file test', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const mockImageFile = new File(['dummy content'], 'test.png', { type: 'image/png' });
    (component as any).handleFile(mockImageFile);
    expect(alertSpy).toHaveBeenCalledWith('動画ファイルを選択してください。');
    expect(component.selectedFile).toBeNull();
    alertSpy.mockRestore();
  });
  it('Process video test', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });

    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    const createVideoSpy = vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 200 })));
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(of({ status: 2, progress: 100 }));
    component.startUpload();
    await vi.runAllTimersAsync();
    expect(createVideoSpy).toHaveBeenCalledWith('Test Video', 'Test Description', 'video/mp4');
  });
  it('Progress polling test', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });

    const mockUploadSubject = new Subject<any>();

    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(mockUploadSubject.asObservable());
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(of({ status: 2, progress: 100 }));

    component.startUpload();
    await vi.runAllTimersAsync();

    mockUploadSubject.next({
      type: HttpEventType.UploadProgress,
      loaded: 128,
      total: 512,
    });
    expect(component.uploadProgress).toBe(25);
    mockUploadSubject.next({ type: HttpEventType.Response });
    mockUploadSubject.complete();
  });
  it('should replace undefined progress with 0% in status message', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 200 })));
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(
      of({ status: 1, progress: undefined }),
    );
    component.startUpload();
    await vi.runAllTimersAsync();
    expect(component.uploadStatusMessage).toContain('エンコード処理中... (0%)');
  });
  it('should return early if form is invalid on upload', () => {
    const createVideoSpy = vi.spyOn(videoService, 'createVideo');
    component.startUpload();
    expect(createVideoSpy).not.toHaveBeenCalled();
  });
  it('should return early if no file is selected on upload', () => {
    component.videoForm.controls.title.setValue('Test Video');
    const createVideoSpy = vi.spyOn(videoService, 'createVideo');
    component.startUpload();
    expect(createVideoSpy).not.toHaveBeenCalled();
  });
  it('should show error message if failed to encode video', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 200 })));
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(of({ status: 3, progress: 100 }));
    component.startUpload();
    await vi.runAllTimersAsync();
    expect(component.uploadStatusMessage).toBe('エンコードに失敗しました。');
  });
  it('should alert if received 500 error from MinIO', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 500 })));
    component.startUpload();
    await vi.runAllTimersAsync();
    expect(alertSpy).toHaveBeenCalledWith('動画の作成に失敗しました。もう一度お試しください。');
    alertSpy.mockRestore();
  });
  // HTML側のテスト
  it('upload button should be disabled when form is invalid', () => {
    const uploadButtonElement = fixture.debugElement.query(By.css('button[color="primary"]'))
      .nativeElement as HTMLButtonElement;
    expect(uploadButtonElement.disabled).toBeTruthy();
    component.videoForm.controls['title'].setValue('Test Video');
    fixture.detectChanges();
    expect(uploadButtonElement.disabled).toBeFalsy();
  });
  it('Display uploaded file name', () => {
    const mockVideoFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    component.selectedFile = mockVideoFile;
    fixture.detectChanges();
    const dropZoneElement = fixture.debugElement.query(By.css('.drop-zone')).nativeElement;
    expect(dropZoneElement.textContent).toContain('test.mp4');
  });
  it('detects select file button click and opens file dialog', () => {
    const fileInput = fixture.debugElement.query(By.css('input[type="file"]')).nativeElement;
    const selectButton = fixture.debugElement.query(
      By.css('button[matButton="elevated"]'),
    ).nativeElement;
    const inputClickSpy = vi.spyOn(fileInput, 'click');
    selectButton.click();
    expect(inputClickSpy).toHaveBeenCalled();
  });
  it('step to next after file selection', async () => {
    const mockVideoFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    const fileInput = fixture.debugElement.query(By.css('input[type="file"]')).nativeElement;
    const changeEvent = new Event('change');
    Object.defineProperty(changeEvent, 'target', { value: { files: [mockVideoFile] } });
    fileInput.dispatchEvent(changeEvent);
    fixture.detectChanges();
    expect(component.selectedFile).toBe(mockVideoFile);
    expect(component.hasFile).toBe(true);
    // ステップが次に進んでいることを確認
    await vi.runAllTimersAsync();
    expect((component as any).stepper.selectedIndex).toBe(1);
  });
  // Step 2 -> Step 3
  it('after pushed button, step to next', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.selectedFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    (component as any).handleFile(component.selectedFile);
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const uploadButton = fixture.debugElement.query(
      By.css('button[color="primary"]'),
    ).nativeElement;
    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 200 })));
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(of({ status: 1, progress: 50 }));
    uploadButton.click();
    await vi.runAllTimersAsync();
    expect((component as any).stepper.selectedIndex).toBe(2);
  });
  // Step 3 -> Step 4
  it('after upload complete, step to next', async () => {
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    const mockFile = new File(['dummy content'], 'test.mp4', { type: 'video/mp4' });
    (component as any).handleFile(mockFile);
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect((component as any).stepper.selectedIndex).toBe(1);

    const mockResponse = {
      uploadUrl: 'http://dummy.url',
      video_id: 'ABCD1234',
      user_id: 'user1',
      title: 'Test Video',
      description: 'Test Description',
      video_url: 'http://example.com/video.mp4',
    } as any;
    vi.spyOn(videoService, 'createVideo').mockReturnValue(of(mockResponse));
    vi.spyOn(uploadService, 'uploadToMinio').mockReturnValue(of(new HttpResponse({ status: 200 })));
    vi.spyOn(videoService, 'pollUploadProgress').mockReturnValue(of({ status: 2, progress: 100 }));
    const uploadButton = fixture.debugElement.query(
      By.css('button[color="primary"]'),
    ).nativeElement;
    uploadButton.click();

    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect((component as any).stepper.selectedIndex).toBe(3);
  });
  // import from external URL
  it('should step to next after entering video info', async () => {
    component.isImporting = true;
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.videoForm.controls.url.setValue('http://example.com/video.mp4');
    component.importFromYouTube();
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect((component as any).stepper.selectedIndex).toBe(1);
    expect(component.isImporting).toBe(true);
    expect(component.selectedFile).toBeNull();
  });
  it('should fast upload external video and step to next', async () => {
    component.isImporting = true;
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.videoForm.controls.url.setValue('http://example.com/video.mp4');
    vi.spyOn(videoService, 'uploadExVideo').mockReturnValue(
      of({
        title: 'Test Video',
        description: 'Test Description',
        video_url: 'http://example.com/video.mp4',
      } as any),
    );
    const createVideoSpy = vi.spyOn(videoService, 'createVideo');
    component.startUpload();
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect(component.isUploadStarted).toBe(true);
    expect(component.importedVideoTitle).toBe('Test Video');
    expect(component.uploadStatusMessage).toBe('アップロードが完了しました！');
    expect((component as any).stepper.selectedIndex).toBe(2);
    expect(createVideoSpy).not.toHaveBeenCalled();
  });
  it('should alert if failed to create external video', async () => {
    component.isImporting = true;
    component.videoForm.controls.title.setValue('Test Video');
    component.videoForm.controls.description.setValue('Test Description');
    component.videoForm.controls.url.setValue('http://example.com/video.mp4');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(videoService, 'uploadExVideo').mockReturnValue(
      throwError(() => new Error('Failed to create external video')),
    );
    component.startUpload();
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect(alertSpy).toHaveBeenCalledWith('動画の作成に失敗しました。もう一度お試しください。');
    expect((component as any).stepper.selectedIndex).toBe(1);
    alertSpy.mockRestore();
  });

  describe('isValidChannel', () => {
    it('should return null if channels signal is not available', () => {
      (component as any).channels = null;
      const control = new FormControl('test-channel');
      expect((component as any).isValidChannel(control)).toBeNull();
    });

    it('should return null if enableTraQ is false', () => {
      component.enableTraQ = false;
      const control = new FormControl('unknown-channel');
      expect((component as any).isValidChannel(control)).toBeNull();
    });

    it('should return null if value is empty or only whitespace', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [{ id: '1', name: 'gps/onair' }];
      expect((component as any).isValidChannel(new FormControl(''))).toBeNull();
      expect((component as any).isValidChannel(new FormControl('   '))).toBeNull();
      expect((component as any).isValidChannel(new FormControl(null))).toBeNull();
    });

    it('should return null if value exists in channels (string value)', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [
        { id: '1', name: 'general' },
        { id: '2', name: 'gps/onair' },
      ];
      const control = new FormControl('general');
      expect((component as any).isValidChannel(control)).toBeNull();
    });

    it('should return null if value exists in channels (object value with name)', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [
        { id: '1', name: 'general' },
        { id: '2', name: 'gps/onair' },
      ];
      const control = new FormControl({ id: '2', name: 'gps/onair' });
      expect((component as any).isValidChannel(control)).toBeNull();
    });

    it('should return { invalidChannel: true } if channel does not exist in channels list (string value)', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [
        { id: '1', name: 'general' },
        { id: '2', name: 'gps/onair' },
      ];
      const control = new FormControl('unknown-channel');
      expect((component as any).isValidChannel(control)).toEqual({ invalidChannel: true });
    });

    it('should return { invalidChannel: true } if channel does not exist in channels list (object value)', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [{ id: '1', name: 'general' }];
      const control = new FormControl({ id: '99', name: 'nonexistent' });
      expect((component as any).isValidChannel(control)).toEqual({ invalidChannel: true });
    });
  });

  describe('TraQ controls and channels coverage', () => {
    it('displayChannel should return correct string', () => {
      expect(component.displayChannel(null)).toBe('');
      expect(component.displayChannel('general')).toBe('general');
      expect(component.displayChannel({ id: '1', name: 'gps/onair' })).toBe('gps/onair');
    });

    it('syncTraqControlStates should toggle controls based on enableTraQ and enableDelay', () => {
      component.videoForm.controls.enableTraQ.setValue(false);
      expect(component.videoForm.controls.traqChannel.disabled).toBe(true);
      expect(component.videoForm.controls.enableDelay.disabled).toBe(true);
      expect(component.videoForm.controls.delaySeconds.disabled).toBe(true);

      component.videoForm.controls.enableTraQ.setValue(true);
      component.videoForm.controls.enableDelay.setValue(true);
      expect(component.videoForm.controls.traqChannel.enabled).toBe(true);
      expect(component.videoForm.controls.enableDelay.enabled).toBe(true);
      expect(component.videoForm.controls.delaySeconds.enabled).toBe(true);

      component.videoForm.controls.enableDelay.setValue(false);
      expect(component.videoForm.controls.delaySeconds.disabled).toBe(true);
    });

    it('filteredChannels should filter channels by keyword', () => {
      (component as any).channels = () => [
        { id: '1', name: 'general' },
        { id: '2', name: 'gps/onair' },
        { id: '3', name: 'random/chat' },
      ];

      component.videoForm.controls.traqChannel.setValue('');
      expect(component.filteredChannels().length).toBe(3);

      component.videoForm.controls.traqChannel.setValue('#gps onair');
      expect(component.filteredChannels()).toEqual([{ id: '2', name: 'gps/onair' }]);
    });

    it('validator set on traqChannel in handleFile should be called', () => {
      component.enableTraQ = true;
      (component as any).channels = () => [{ id: '1', name: 'general' }];
      const mockFile = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
      (component as any).handleFile(mockFile);

      component.videoForm.controls.traqChannel.setValue('invalid-channel');
      expect(component.videoForm.controls.traqChannel.errors).toEqual({ invalidChannel: true });
    });

    it('fast upload external video with enableTraQ false and enableDelay false', async () => {
      component.isImporting = true;
      component.videoForm.controls.title.setValue('Test Video');
      component.videoForm.controls.description.setValue('Test Description');
      component.videoForm.controls.url.setValue('http://example.com/video.mp4');
      component.videoForm.controls.enableTraQ.setValue(false);
      component.videoForm.controls.enableDelay.setValue(false);

      const uploadExSpy = vi.spyOn(videoService, 'uploadExVideo').mockReturnValue(
        of({
          title: 'Test Video',
          description: 'Test Description',
          video_url: 'http://example.com/video.mp4',
        } as any),
      );

      component.startUpload();
      await vi.runAllTimersAsync();

      expect(uploadExSpy).toHaveBeenCalledWith(
        'Test Video',
        'Test Description',
        'http://example.com/video.mp4',
        (component as any).defaultTraqChannelId,
        15.0,
      );
      expect((component as any).traqChannel).toBe('');
      expect((component as any).delaySeconds).toBe(0);
    });

    it('fast upload external video with matched traq channel', async () => {
      component.isImporting = true;
      component.videoForm.controls.title.setValue('Test Video');
      component.videoForm.controls.description.setValue('Test Description');
      component.videoForm.controls.url.setValue('http://example.com/video.mp4');
      component.videoForm.controls.enableTraQ.setValue(true);
      component.videoForm.controls.enableDelay.setValue(true);
      (component as any).channels = () => [{ id: 'custom-id', name: 'custom-ch' }];
      component.videoForm.controls.traqChannel.setValue('custom-ch');

      const uploadExSpy = vi.spyOn(videoService, 'uploadExVideo').mockReturnValue(
        of({
          title: 'Test Video',
          description: 'Test Description',
          video_url: 'http://example.com/video.mp4',
        } as any),
      );

      component.startUpload();
      await vi.runAllTimersAsync();

      expect(uploadExSpy).toHaveBeenCalledWith(
        'Test Video',
        'Test Description',
        'http://example.com/video.mp4',
        'custom-id',
        15.0,
      );
    });

    it('should set default channel when empty and channel list arrives', () => {
      const channelSubject = new Subject<any[]>();
      const mockUploadService = {
        uploadToMinio: vi.fn(),
        getTraQChannels: vi.fn().mockReturnValue(channelSubject.asObservable()),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [UploadComponent],
        providers: [
          { provide: VideoService, useValue: { createVideo: vi.fn(), pollUploadProgress: vi.fn(), uploadExVideo: vi.fn() } },
          { provide: UploadService, useValue: mockUploadService },
        ],
      });
      const fix = TestBed.createComponent(UploadComponent);
      fix.componentInstance.videoForm.controls.traqChannel.setValue('');
      channelSubject.next([{ id: 'ch-gps', name: 'gps/onair' }]);
      expect(fix.componentInstance.videoForm.controls.traqChannel.value).toBe('gps/onair');
    });

    it('should not set default channel if channel list does not contain default channel', () => {
      const channelSubject = new Subject<any[]>();
      const mockUploadService = {
        uploadToMinio: vi.fn(),
        getTraQChannels: vi.fn().mockReturnValue(channelSubject.asObservable()),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [UploadComponent],
        providers: [
          { provide: VideoService, useValue: { createVideo: vi.fn(), pollUploadProgress: vi.fn(), uploadExVideo: vi.fn() } },
          { provide: UploadService, useValue: mockUploadService },
        ],
      });
      const fix = TestBed.createComponent(UploadComponent);
      fix.componentInstance.videoForm.controls.traqChannel.setValue('');
      channelSubject.next([{ id: 'ch-other', name: 'other' }]);
      expect(fix.componentInstance.videoForm.controls.traqChannel.value).toBe('');
    });
  });
});
