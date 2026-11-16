import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('turns the API totals into numbers', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(DashboardService);
    const http = TestBed.inject(HttpTestingController);

    let stats: any;
    service.getStats().subscribe((s) => (stats = s));
    http.expectOne('http://localhost:3000/dashboard/stats').flush({
      totalProducts: '4', totalStock: '320', totalSuppliers: 3, totalCategories: null,
    });

    expect(stats).toEqual({ totalProducts: 4, totalStock: 320, totalSuppliers: 3, totalCategories: 0 });
    http.verify();
  });
});
