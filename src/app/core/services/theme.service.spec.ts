import { TestBed } from '@angular/core/testing';
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
