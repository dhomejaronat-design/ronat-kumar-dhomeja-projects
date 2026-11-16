import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';

import { ShowtimeService } from './showtime.service';

describe('ShowtimeService', () => {
  let service: ShowtimeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()] });
    service = TestBed.inject(ShowtimeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
