import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShowtimesComponent } from './showtimes.component';

describe('ShowtimesComponent', () => {
  let component: ShowtimesComponent;
  let fixture: ComponentFixture<ShowtimesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShowtimesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ShowtimesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
