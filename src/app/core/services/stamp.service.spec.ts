import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StampService } from './stamp.service';
import { Stamp } from '../models/stamp.model';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import * as gifuctJs from 'gifuct-js';

vi.mock('gifuct-js', () => ({
  parseGIF: vi.fn(),
  decompressFrames: vi.fn(),
}));

describe('StampService', () => {
  let service: StampService;
  let httpTestingController: HttpTestingController;
  const mockStamps: Stamp[] = [
    { id: 'stamp-id-1', name: 'stamp1' },
    { id: 'stamp-id-2', name: 'stamp2' },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      'ImageData',
      class {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockImplementation(async (data: unknown) => ({ image: data }) as unknown as ImageBitmap),
    );

    TestBed.configureTestingModule({
      providers: [StampService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StampService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.getStamps().length).toBe(0);
  });

  it('should load stamps from API and populate stamps signal', () => {
    service.loadStamps().subscribe();

    const req = httpTestingController.expectOne('/traq-api/stamps');
    expect(req.request.method).toBe('GET');
    req.flush(mockStamps);

    expect(service.getStamps().length).toBe(2);
    expect(service.getStamps()[0]).toEqual({ id: 'stamp-id-1', name: 'stamp1' });
    expect(service.getStamps()[1]).toEqual({ id: 'stamp-id-2', name: 'stamp2' });
  });

  it('should not send duplicate request if stamps are already loaded', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    // Call loadStamps again
    service.loadStamps().subscribe();
    httpTestingController.expectNone('/traq-api/stamps');
  });

  it('should handle error when loading stamps', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.loadStamps().subscribe();

    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush('Failed to fetch', { status: 500, statusText: 'Server Error' });

    expect(service.getStamps().length).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null from getStampImage when stamps are not loaded', () => {
    const result = service.getStampImage('stamp1');
    expect(result).toBeNull();
  });

  it('should return null from getStampImage when stamp is not found', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    const result = service.getStampImage('unknown-stamp');
    expect(result).toBeNull();
  });
  it('should return existing observable if request is in-flight', () => {
    let result1: Stamp[] | undefined;
    let result2: Stamp[] | undefined;

    service.loadStamps().subscribe((data) => (result1 = data));
    const req = httpTestingController.expectOne('/traq-api/stamps');
    // 2回目の呼び出しは、まだリクエストが完了していないため、同じObservableを返す
    service.loadStamps().subscribe((data) => (result2 = data));
    httpTestingController.expectNone('/traq-api/stamps');
    req.flush(mockStamps);

    expect(result1?.[0].id).toBe('stamp-id-1');
    expect(result2?.[0].id).toBe('stamp-id-1');
  });

  it('should create and cache Image element when stamp is found', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    const stampData1 = service.getStampImage('stamp1');
    expect(stampData1).toBeTruthy();

    const imageReq = httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
    expect(imageReq.request.method).toBe('GET');
    imageReq.flush(new ArrayBuffer(0));

    expect(stampData1?.staticImage?.src).toMatch(/^blob:/);

    // Second call should return cached instance without additional HTTP request
    const stampData2 = service.getStampImage('stamp1');
    expect(stampData2).toBe(stampData1);
  });

  it('should return proper url for each stamp', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    expect(service.getStampURL('stamp1')).toBe('/traq-api/stamps/stamp-id-1/image');
    expect(service.getStampURL('stamp2')).toBe('/traq-api/stamps/stamp-id-2/image');
    expect(service.getStampURL('unknown-stamp')).toBeNull();
  });

  it('should return static image for non-animated stamp', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    const mockSingleFrame = [
      {
        patch: [0, 0, 0, 255],
        dims: { width: 1, height: 1 },
        delay: 0,
      },
    ];

    vi.mocked(gifuctJs.parseGIF).mockReturnValue({} as any);
    vi.mocked(gifuctJs.decompressFrames).mockReturnValue(mockSingleFrame as any);
    const stampData = service.getStampImage('stamp1');
    expect(stampData).toBeTruthy();
    const imageReq = httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
    const gifBuffer = new Uint8Array([0x47, 0x49, 0x46, 0, 0, 0, 0, 0]).buffer;
    imageReq.flush(gifBuffer);

    expect(stampData?.isAnimated).toBe(false);
    expect(stampData?.staticImage).toBeInstanceOf(HTMLImageElement);
    expect(stampData?.staticImage?.src).toMatch(/^blob:/);
    expect(stampData?.frames).toBeUndefined();
  });

  it('should remove from cache when image HTTP request fails', () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    const stampData = service.getStampImage('stamp1');
    expect(stampData).toBeTruthy();

    const imageReq = httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
    imageReq.flush(new ArrayBuffer(0), { status: 404, statusText: 'Not Found' });

    // キャッシュから削除されたため、次回呼び出し時に新しくリクエストが作成される
    service.getStampImage('stamp1');
    httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
  });

  it('should get animated stamp image when available', async () => {
    service.loadStamps().subscribe();
    const req = httpTestingController.expectOne('/traq-api/stamps');
    req.flush(mockStamps);

    const mockFrames = [
      {
        patch: [0, 0, 0, 255],
        dims: { width: 1, height: 1 },
        delay: 100,
      },
      {
        patch: [255, 0, 0, 255],
        dims: { width: 1, height: 1 },
        delay: 150,
      },
      {
        patch: [0, 255, 0, 255],
        dims: { width: 1, height: 1 },
        delay: undefined,
      },
    ];

    vi.mocked(gifuctJs.parseGIF).mockReturnValue({} as any);
    vi.mocked(gifuctJs.decompressFrames).mockReturnValue(mockFrames as any);

    const stampData = service.getStampImage('stamp1');
    expect(stampData).toBeTruthy();
    expect(stampData?.isAnimated).toBe(false);

    const imageReq = httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
    const gifBuffer = new Uint8Array([0x47, 0x49, 0x46, 0, 0, 0, 0, 0]).buffer;
    imageReq.flush(gifBuffer);

    await vi.waitFor(() => {
      expect(stampData?.isAnimated).toBe(true);
    });

    expect(stampData?.frames?.length).toBe(3);
    expect(stampData?.frames?.[0].delay).toBe(100);
    expect(stampData?.frames?.[1].delay).toBe(150);
    expect(stampData?.frames?.[2].delay).toBe(200); // default delay
    expect(stampData?.totalDuration).toBe(450);
  });

  it('should get blob url and cache it with getStampBlobUrl', () => {
    let url1: string | undefined;
    service.getStampBlobUrl('stamp-id-1').subscribe((url) => (url1 = url));

    const imageReq = httpTestingController.expectOne('/traq-api/stamps/stamp-id-1/image');
    expect(imageReq.request.method).toBe('GET');
    imageReq.flush(new Blob(['test-blob']));

    expect(url1).toMatch(/^blob:/);

    let url2: string | undefined;
    service.getStampBlobUrl('stamp-id-1').subscribe((url) => (url2 = url));
    httpTestingController.expectNone('/traq-api/stamps/stamp-id-1/image');
    expect(url2).toBe(url1);
  });
});
