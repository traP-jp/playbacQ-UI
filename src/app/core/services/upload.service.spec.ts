import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UploadService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UploadService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should upload file to Minio using presigned URL', () => {
    const presignedUrl = 'https://minio.example.com/upload';
    const file = new File(['file content'], 'test.mp4', { type: 'video/mp4' });
    service.uploadToMinio(presignedUrl, file).subscribe((event) => {
      expect(event).toBeTruthy();
    });

    const req = httpTestingController.expectOne(presignedUrl);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(file);
    expect(req.request.headers.get('Content-Type')).toBe('video/mp4');
    req.flush({}, { status: 200, statusText: 'OK' });
  });

  it('should fetch TraQ channels', () => {
    const mockChannels = [
      { id: '1', name: 'Channel 1' },
      { id: '2', name: 'Channel 2' },
    ];
    service.getTraQChannels().subscribe((channels) => {
      expect(channels).toEqual(mockChannels);
    });

    const req = httpTestingController.expectOne(`${service['apiUrl']}/traq-api/channels`);
    expect(req.request.method).toBe('GET');
    req.flush(mockChannels);
  });

  it('should return empty array if TraQ channels API returns null', () => {
    service.getTraQChannels().subscribe((channels) => {
      expect(channels).toEqual([]);
    });

    const req = httpTestingController.expectOne(`${service['apiUrl']}/traq-api/channels`);
    expect(req.request.method).toBe('GET');
    req.flush(null);
  });
});
