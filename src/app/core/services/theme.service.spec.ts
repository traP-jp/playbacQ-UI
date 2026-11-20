import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ThemeService } from './theme.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ThemeService', () => {
  let service: ThemeService;
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined;

  beforeEach(() => {
    changeListener = undefined;

    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn((event: string, callback: EventListenerOrEventListenerObject) => {
        if (event === 'change') {
          changeListener = callback as (event: MediaQueryListEvent) => void;
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('should update document colorScheme based on isDarkMode', () => {
    service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(document.documentElement.style.colorScheme).toBe('light');

    service.isDarkMode.set(true);
    TestBed.tick();
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('should initialized Light mode', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'theme') return 'light';
      return null;
    });
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(false);
  });
  it('should initialized Dark mode', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'theme') return 'dark';
      return null;
    });
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(true);
  });
  it('should initialized prefers-color-scheme', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(true);
  });
  it('should change theme when OS theme changes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(false);

    changeListener?.({ matches: true } as MediaQueryListEvent);
    expect(service.isDarkMode()).toBe(true);

    changeListener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isDarkMode()).toBe(false);
  });
  it('should not change theme when OS theme changes if user has set a preference', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'theme') return 'light';
      return null;
    });
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(false);

    changeListener?.({ matches: true } as MediaQueryListEvent);
    expect(service.isDarkMode()).toBe(false);
  });
  it('should toggle theme and save preference to localStorage', () => {
    service = TestBed.inject(ThemeService);
    service.isDarkMode.set(false);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    service.toggleTheme();
    expect(service.isDarkMode()).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith('theme', 'dark');

    service.isDarkMode.set(true);
    service.toggleTheme();
    expect(service.isDarkMode()).toBe(false);
    expect(setItemSpy).toHaveBeenCalledWith('theme', 'light');
  });
  it('should reset theme and remove preference from localStorage', () => {
    service = TestBed.inject(ThemeService);
    service.isDarkMode.set(false);
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    service.resetTheme();
    expect(removeItemSpy).toHaveBeenCalledWith('theme');
    expect(service.isDarkMode()).toBe(true);
  });
  it('should reset theme and remove preference from localStorage when OS theme changes', () => {
    service = TestBed.inject(ThemeService);
    service.isDarkMode.set(true);
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    service.resetTheme();
    expect(removeItemSpy).toHaveBeenCalledWith('theme');
    expect(service.isDarkMode()).toBe(false);
  });
});

describe('ThemeService (non-browser)', () => {
  let service: ThemeService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: 'server' }],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('should not access window or localStorage on server', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const matchMediaSpy = vi.spyOn(window, 'matchMedia');
    service = TestBed.inject(ThemeService);
    expect(service.isDarkMode()).toBe(false);
    // ブラウザ固有の API が呼ばれていないことを検証
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });
  it('should not access localStorage on server when toggling theme', () => {
    service = TestBed.inject(ThemeService);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    service.toggleTheme();

    expect(service.isDarkMode()).toBe(true);
    expect(setItemSpy).not.toHaveBeenCalled();
  });
  it('should not access localStorage on server when resetting theme', () => {
    service = TestBed.inject(ThemeService);
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    const matchMediaSpy = vi.spyOn(window, 'matchMedia');
    service.resetTheme();
    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });
});
