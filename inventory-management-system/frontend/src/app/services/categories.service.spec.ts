import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  it('sends category_name when adding a category', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(CategoriesService);
    const http = TestBed.inject(HttpTestingController);

    service.addCategory({ name: 'Toys' }).subscribe();
    const req = http.expectOne('http://localhost:3000/categories');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ category_name: 'Toys' });
    req.flush({ category_id: 5 });
    http.verify();
  });
});
