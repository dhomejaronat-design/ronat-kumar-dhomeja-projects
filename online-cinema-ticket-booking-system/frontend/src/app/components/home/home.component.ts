import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Movie } from '../../models/movie.model';
import { MovieService } from '../../services/movie.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  animations: [
    trigger('slideAnimation', [
      
      transition(':increment', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate(
          '450ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        )
      ]),
    
      transition(':decrement', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate(
          '450ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        )
      ])
    ])
  ]
})
export class HomeComponent implements OnInit, OnDestroy {
  movies: Movie[] = [];
  featuredIndex = 0; 


  private autoSlideTimer: any = null;
  private readonly slideDelayMs = 5000; 

  constructor(
    private movieService: MovieService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.movieService.getMovies().subscribe({
      next: (movies) => {
        this.movies = movies || [];
        this.featuredIndex = 0;
        this.startAutoSlide();   
      },
      error: (err) => {
        console.error('Error loading movies', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopAutoSlide();     
  }

  get featuredMovie(): Movie | null {
    if (!this.movies.length) return null;
    return this.movies[this.featuredIndex];
  }



  private startAutoSlide(): void {
    this.stopAutoSlide(); 

    if (!this.movies || this.movies.length <= 1) {
      return; 
    }

    this.autoSlideTimer = setInterval(() => {
      
      this.nextFeatured(false);
    }, this.slideDelayMs);
  }

  private stopAutoSlide(): void {
    if (this.autoSlideTimer) {
      clearInterval(this.autoSlideTimer);
      this.autoSlideTimer = null;
    }
  }

  private resetAutoSlide(): void {
    
    this.startAutoSlide();
  }

  
  nextFeatured(fromUser: boolean = true): void {
    if (!this.movies.length) return;
    this.featuredIndex = (this.featuredIndex + 1) % this.movies.length;

    if (fromUser) {
      this.resetAutoSlide();
    }
  }

  prevFeatured(): void {
    if (!this.movies.length) return;
    this.featuredIndex =
      (this.featuredIndex - 1 + this.movies.length) % this.movies.length;

    this.resetAutoSlide();
  }

  selectFeatured(index: number): void {
    if (index < 0 || index >= this.movies.length) return;
    this.featuredIndex = index;

    this.resetAutoSlide();
  }



  goToTickets(): void {
    this.router.navigate(['/movies']);
  }

  goToFeaturedShowtimes(): void {
    const fm = this.featuredMovie;
    if (!fm) return;
    this.router.navigate(['/movies', fm.id, 'showtimes']);
  }

  openMovie(movie: Movie): void {
    this.router.navigate(['/movies', movie.id, 'showtimes']);
  }
}
