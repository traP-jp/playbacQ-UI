import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Stamp, AnimatedStampData } from '../models/stamp.model';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class StampService {
  private http = inject(HttpClient);
  private readonly traQApiUrl = '/traq-api/stamps';

  private stampsSignal = signal<Stamp[]>([]);
  private stampMap = new Map<string, string>();
  private stampCache = new Map<string, AnimatedStampData>();
  private loadStamps$?: Observable<Stamp[]>;

  loadStamps(): Observable<Stamp[]> {
    if (this.stampsSignal().length > 0) return of(this.stampsSignal());
    if (this.loadStamps$) return this.loadStamps$;

    this.loadStamps$ = this.http.get<Stamp[]>(this.traQApiUrl).pipe(
      map((stamps) => {
        this.stampMap.clear();
        stamps.forEach((stamp) => {
          this.stampMap.set(stamp.name, stamp.id);
        });
        this.stampsSignal.set(stamps);
        return stamps;
      }),
      catchError((err) => {
        console.error('Failed to load stamps:', err);
        return of([]);
      }),
      shareReplay(1),
    );
    return this.loadStamps$;
  }

  getStamps(): Stamp[] {
    return this.stampsSignal();
  }

  getStampImage(stampName: string): AnimatedStampData | null {
    const stampId = this.stampMap.get(stampName);
    if (!stampId) return null;

    if (this.stampCache.has(stampId)) {
      return this.stampCache.get(stampId)!;
    }

    const cacheEntry: AnimatedStampData = { isAnimated: false };
    this.stampCache.set(stampId, cacheEntry);

    this.http
      .get(`${this.traQApiUrl}/${stampId}/image`, { responseType: 'arraybuffer' })
      .subscribe({
        next: async (buffer) => {
          if (this.isGifFormat(buffer)) {
            try {
              const gif = parseGIF(buffer);
              const frames = decompressFrames(gif, true);

              if (frames.length > 1) {
                const stampFrames = await Promise.all(
                  frames.map(async (frame) => {
                    const imageData = new ImageData(
                      new Uint8ClampedArray(frame.patch),
                      frame.dims.width,
                      frame.dims.height,
                    );
                    const bitmap = await createImageBitmap(imageData);
                    const delay = frame.delay || 200;
                    return { bitmap, delay };
                  }),
                );

                const totalDuration = stampFrames.reduce((sum, f) => sum + f.delay, 0);

                cacheEntry.isAnimated = true;
                cacheEntry.frames = stampFrames;
                cacheEntry.totalDuration = totalDuration;
                return;
              }
            } catch {
              // GIF パースに失敗した場合は静止画処理へGO
            }
          }

          // 静止画(PNG/JPEG等)
          this.createStaticImageFromBuffer(buffer, cacheEntry);
        },
        error: () => {
          this.stampCache.delete(stampId);
        },
      });
    return cacheEntry;
  }

  getStampURL(stampName: string): string | null {
    const stampId = this.stampMap.get(stampName);
    if (!stampId) return null;
    return `${this.traQApiUrl}/${stampId}/image`;
  }

  // バイナリの先頭3バイトが GIF ('G', 'I', 'F') か判定する
  private isGifFormat(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 3) return false;
    const header = new Uint8Array(buffer, 0, 3);
    return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  }

  private createStaticImageFromBuffer(buffer: ArrayBuffer, cacheEntry: AnimatedStampData) {
    const blob = new Blob([buffer]);
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.src = objectUrl;
    cacheEntry.isAnimated = false;
    cacheEntry.staticImage = img;
  }
}
