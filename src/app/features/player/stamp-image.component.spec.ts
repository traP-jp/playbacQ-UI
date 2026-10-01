import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StampImageComponent } from './stamp-image.component';
import { StampService } from '../../core/services/stamp.service';
import { vi } from 'vitest';
import { Subscription } from 'rxjs';

describe('StampImageComponent', () => {
  let component: StampImageComponent;
  let fixture: ComponentFixture<StampImageComponent>;
  let stampService: StampService;

  beforeEach(async () => {
    const mockStampService = {
      getStampBlobUrl: vi.fn().mockReturnValue({
        subscribe: (callbacks: { next: (url: string) => void; error: () => void }) => {
          callbacks.next('http://example.com/stamp.png');
        },
      }),
    };
    await TestBed.configureTestingModule({
      imports: [StampImageComponent],
      providers: [{ provide: StampService, useValue: mockStampService }],
    }).compileComponents();

    fixture = TestBed.createComponent(StampImageComponent);
    component = fixture.componentInstance;
    stampService = TestBed.inject(StampService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should set imageUrl to null when stampId is not provided', () => {
    component.stampId = '';
    component.ngOnChanges({
      stampId: {
        currentValue: '',
        previousValue: 'someId',
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    expect(component.imageUrl()).toBeNull();
  });
  it('should set imageUrl to null when stampId is provided but getStampBlobUrl returns an error', () => {
    component.stampId = 'someId';
    vi.spyOn(stampService, 'getStampBlobUrl').mockReturnValue({
      subscribe: (callbacks: { next: (url: string) => void; error: () => void }) => {
        callbacks.error();
      },
    } as any);
    component.ngOnChanges({
      stampId: {
        currentValue: 'someId',
        previousValue: '',
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    expect(component.imageUrl()).toBeNull();
  });
  it('should set imageUrl to the URL returned by getStampBlobUrl when stampId is provided', () => {
    const mockUrl = 'http://example.com/stamp.png';
    component.stampId = 'someId';
    component.ngOnChanges({
      stampId: {
        currentValue: 'someId',
        previousValue: '',
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    expect(component.imageUrl()).toBe(mockUrl);
  });
  it('should do nothing if stampId does not change', () => {
    const initialUrl = 'http://example.com/initial.png';
    component.imageUrl.set(initialUrl);
    const getStampBlobUrlSpy = vi.spyOn(stampService, 'getStampBlobUrl');
    component.ngOnChanges({
      alt: {
        currentValue: 'new alt',
        previousValue: 'old alt',
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    expect(getStampBlobUrlSpy).not.toHaveBeenCalled();
    expect(component.imageUrl()).toBe(initialUrl);
  });
  it('should unsubscribe from the subscription on ngOnDestroy', () => {
    const realSub = new Subscription();
    const unsubscribeSpy = vi.spyOn(realSub, 'unsubscribe').mockImplementation(() => {
      // Do nothing
    });
    (component as any).sub = realSub;
    fixture.destroy();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });
});
