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
  private stampRetryAfter = new Map<string, number>();
  private readonly stampRetryDelayMs = 30_000;
  private loadStamps$?: Observable<Stamp[]>;
  private blobUrlCache = new Map<string, string>();

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

    const cached = this.stampCache.get(stampId);
    if (cached) {
      if (cached.staticImage?.complete && cached.staticImage.naturalWidth === 0) {
        this.evictStamp(stampId, cached);
        return null;
      }
      return cached;
    }
    const retryAt = this.stampRetryAfter.get(stampId);
    if (retryAt && Date.now() < retryAt) return null;
    this.stampRetryAfter.delete(stampId);

    const cacheEntry: AnimatedStampData = { isAnimated: false };
    this.stampCache.set(stampId, cacheEntry);

    this.http
      .get(`${this.traQApiUrl}/${stampId}/image`, {
        responseType: 'arraybuffer',
        observe: 'response',
      })
      .subscribe({
        next: async (response) => {
          const buffer = response.body;
          if (!buffer) {
            this.evictStamp(stampId, cacheEntry);
            return;
          }
          const contentType = response.headers.get('Content-Type') ?? '';
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
          this.createStaticImageFromBuffer(buffer, stampId, cacheEntry, contentType);
        },
        error: () => {
          this.evictStamp(stampId, cacheEntry);
        },
      });
    return cacheEntry;
  }

  getStampBlobUrl(stampId: string): Observable<string> {
    const cached = this.blobUrlCache.get(stampId);
    if (cached) {
      return of(cached);
    }
    return this.http.get(`${this.traQApiUrl}/${stampId}/image`, { responseType: 'blob' }).pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        this.blobUrlCache.set(stampId, url);
        return url;
      }),
      shareReplay(1),
    );
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

  private createStaticImageFromBuffer(
    buffer: ArrayBuffer,
    stampId: string,
    cacheEntry: AnimatedStampData,
    contentType: string,
  ) {
    const blob = new Blob([buffer], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.evictStamp(stampId, cacheEntry);
    };
    img.src = objectUrl;
    cacheEntry.isAnimated = false;
    cacheEntry.staticImage = img;
  }

  private evictStamp(stampId: string, cacheEntry: AnimatedStampData): void {
    if (this.stampCache.get(stampId) === cacheEntry) this.stampCache.delete(stampId);
    if (stampId) this.stampRetryAfter.set(stampId, Date.now() + this.stampRetryDelayMs);
  }
}
