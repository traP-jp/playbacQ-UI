import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { Router, provideRouter, NavigationEnd } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';
import { App } from './app';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let authService: AuthService;
  let userService: UserService;

  beforeEach(async () => {
    const mockAuthService = {
      getUserID: vi.fn().mockReturnValue(of({ userId: 'test-user-id' })),
    };
    const mockUserService = {
      getUserIcon: vi.fn().mockReturnValue(of(new Blob())),
    };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    userService = TestBed.inject(UserService);
    vi.useFakeTimers();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('playbacQ');
  });
  // 各種関数のテスト
  it('should toggle user menu', () => {
    expect(app.isOpenUserMenu).toBe(false);
    app.toggleUserMenu();
    expect(app.isOpenUserMenu).toBe(true);
    app.toggleUserMenu();
    expect(app.isOpenUserMenu).toBe(false);
  });
  it('should close user menu when clicking outside', async () => {
    const wrapperElement = document.createElement('div');
    const outsideElment = document.createElement('button');
    app.isOpenUserMenu = true;
    app.userMenuWrapperRef = new ElementRef(wrapperElement);

    const mockEvent = { target: outsideElment } as unknown as MouseEvent;
    app.onDocumentClick(mockEvent);
    expect(app.isOpenUserMenu).toBe(false);
  });
  it('should not close user menu when clicking inside', async () => {
    const wrapperElement = document.createElement('div');
    app.isOpenUserMenu = true;
    app.userMenuWrapperRef = new ElementRef(wrapperElement);

    const mockEvent = { target: wrapperElement } as unknown as MouseEvent;
    app.onDocumentClick(mockEvent);
    expect(app.isOpenUserMenu).toBe(true);
  });
  it('should not close user menu when userMenuWrapperRef is not set', async () => {
    const outsideElment = document.createElement('button');
    app.isOpenUserMenu = true;
    app.userMenuWrapperRef = undefined as any;

    const mockEvent = { target: outsideElment } as unknown as MouseEvent;
    app.onDocumentClick(mockEvent);
    expect(app.isOpenUserMenu).toBe(true);
  });
  // ダイアログのテスト
  it('should open upload dialog', async () => {
    const dialogSpy = vi.spyOn(app.dialog, 'open').mockReturnValue({
      afterClosed: () => of(),
    } as any);
    app.openUploadDialog();
    expect(dialogSpy).toHaveBeenCalled();
    expect(dialogSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        disableClose: true,
        autoFocus: false,
      }),
    );
  });
  // 検索のテスト
  it('should navigate with search query', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    app.onSearch('test keyword');
    expect(navigateSpy).toHaveBeenCalledWith(['/'], { queryParams: { search: 'test keyword' } });
  });
  it('should navigate without search query when keyword is empty', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    app.onSearch('   '); // 空白のみ
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
  it('should alert when search keyword is too long', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    app.onSearch('a'.repeat(1025)); // 1025文字のキーワード
    expect(alertSpy).toHaveBeenCalledWith(
      'あり得ないことが起きています。HTMLを改竄していませんか？',
    );
  });
  // 初期化関連のテスト
  it('should check if user is authenticated on init and load user icon when the URL is not embedded', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const getUserIDSpy = vi
      .spyOn(authService, 'getUserID')
      .mockReturnValue(of({ userId: 'test-user-id' }));
    const getUserIconSpy = vi.spyOn(userService, 'getUserIcon').mockReturnValue(of(new Blob()));
    const router = TestBed.inject(Router);

    createObjectURLSpy.mockClear();
    getUserIDSpy.mockClear();
    getUserIconSpy.mockClear();

    (router.events as any).next(new NavigationEnd(1, '/home', '/home'));
    fixture.detectChanges();
    expect(app.isEmbed).toBe(false);
    expect(getUserIDSpy).toHaveBeenCalled();
    expect(getUserIconSpy).toHaveBeenCalledWith('test-user-id');
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(app.iconUrl).toBe('blob:mock-url');
  });
  it('should set isEmbed to true when navigated to an embedded URL', () => {
    const getUserIDSpy = vi
      .spyOn(authService, 'getUserID')
      .mockReturnValue(of({ userId: 'test-user-id' }));
    const router = TestBed.inject(Router);

    getUserIDSpy.mockClear();

    (router.events as any).next(new NavigationEnd(1, '/embed/video123', '/embed/video123'));
    expect(app.isEmbed).toBe(true);
    expect(getUserIDSpy).not.toHaveBeenCalled();
  });
  it('should not set user icon when failed to fetch user ID', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const getUserIDSpy = vi.spyOn(authService, 'getUserID').mockReturnValue(of(null));
    const getUserIconSpy = vi.spyOn(userService, 'getUserIcon').mockReturnValue(of(new Blob()));

    createObjectURLSpy.mockClear();
    getUserIDSpy.mockClear();
    getUserIconSpy.mockClear();

    const router = TestBed.inject(Router);
    (router.events as any).next(new NavigationEnd(1, '/home', '/home'));
    fixture.detectChanges();
    expect(getUserIDSpy).toHaveBeenCalled();
    expect(getUserIconSpy).not.toHaveBeenCalled();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(app.iconUrl).toBeNull();
  });
  // DOMのテスト
  it('should have search input and upload button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const searchInput = compiled.querySelector('input[type="text"]');
    const uploadButton = compiled.querySelector('button[mat-icon-button]');
    expect(searchInput).toBeTruthy();
    expect(uploadButton).toBeTruthy();
  });
  it('should call onSearch when enter key is pressed', () => {
    const searchInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    const onSearchSpy = vi.spyOn(app, 'onSearch');
    searchInput.value = 'test';
    const searchInputDebug = fixture.debugElement.query(By.css('input[type="text"]'));
    searchInputDebug.triggerEventHandler('keyup.enter', {});
    expect(onSearchSpy).toHaveBeenCalledWith('test');
  });
  it('should call onSearch when search button is clicked', () => {
    const searchInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    const onSearchSpy = vi.spyOn(app, 'onSearch');
    searchInput.value = 'test';
    const searchButtonDebug = fixture.debugElement.query(By.css('button[mat-icon-button]'));
    searchButtonDebug.triggerEventHandler('click', null);
    expect(onSearchSpy).toHaveBeenCalledWith('test');
  });
  it('should call openUploadDialog when upload button is clicked', () => {
    const openDialogSpy = vi.spyOn(app, 'openUploadDialog');
    const uploadButtonDebug = fixture.debugElement.query(By.css('button[mat-flat-button]'));
    uploadButtonDebug.triggerEventHandler('click', null);
    expect(openDialogSpy).toHaveBeenCalled();
  });

  it('should close user menu when home-btn or uploaded-videos-btn is clicked', () => {
    app.iconUrl = 'blob:mock-url';
    app.isOpenUserMenu = true;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const homeButtonDebug = fixture.debugElement.query(By.css('.home-btn'));
    homeButtonDebug.triggerEventHandler('click', { button: 0 });
    expect(app.isOpenUserMenu).toBe(false);

    app.isOpenUserMenu = true;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const uploadedVideosButtonDebug = fixture.debugElement.query(By.css('.uploaded-videos-btn'));
    uploadedVideosButtonDebug.triggerEventHandler('click', { button: 0 });
    expect(app.isOpenUserMenu).toBe(false);
  });
});
