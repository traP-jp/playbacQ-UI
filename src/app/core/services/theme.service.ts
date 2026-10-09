import { Injectable, Inject, PLATFORM_ID, signal, effect } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDarkMode = signal(false);

  constructor(
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        this.isDarkMode.set(savedTheme === 'dark');
      } else {
        this.isDarkMode.set(mediaQuery.matches);
      }
      mediaQuery.addEventListener('change', (event) => {
        if (!localStorage.getItem('theme')) {
          this.isDarkMode.set(event.matches);
        }
      });
    }
    effect(() => {
      const theme = this.isDarkMode() ? 'dark' : 'light';
      this.document.documentElement.style.colorScheme = theme;
    });
  }

  toggleTheme() {
    this.isDarkMode.update((current) => {
      const newTheme = !current;
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('theme', newTheme ? 'dark' : 'light');
      }
      return newTheme;
    });
  }

  resetTheme() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('theme');
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.isDarkMode.set(mediaQuery.matches);
    }
  }
}
