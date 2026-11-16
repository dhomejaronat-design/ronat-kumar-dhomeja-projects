import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Movie } from '../../models/movie.model';
import { Showtime } from '../../models/showtime.model';
import { MovieService } from '../../services/movie.service';
import { ShowtimeService } from '../../services/showtime.service';

@Component({
  selector: 'app-showtimes',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './showtimes.component.html',
  styleUrl: './showtimes.component.css'
})
export class ShowtimesComponent implements OnInit {

  movie: Movie | null = null;
  showtimes: Showtime[] = [];

  // Trailer modal state
  isTrailerOpen = false;
  safeTrailerUrl: SafeResourceUrl | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private movieService: MovieService,
    private showtimeService: ShowtimeService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    const movieIdParam = this.route.snapshot.paramMap.get('movieId');
    const movieId = movieIdParam ? Number(movieIdParam) : NaN;

    if (!movieId || isNaN(movieId)) {
      this.router.navigate(['/movies']);
      return;
    }

    // Load movie details
    this.movieService.getMovieById(movieId).subscribe({
      next: (movie) => {
        if (!movie) {
          this.router.navigate(['/movies']);
          return;
        }

        this.movie = movie;
        this.updateTrailerUrl(movie);
      },
      error: () => {
        this.router.navigate(['/movies']);
      }
    });

    // Load showtimes
    this.showtimeService.getShowtimesForMovie(movieId).subscribe({
      next: (showtimes) => {
        this.showtimes = showtimes ?? [];
      },
      error: () => {
        this.showtimes = [];
      }
    });
  }

  private updateTrailerUrl(movie: Movie): void {
    if (movie.trailerUrl && !movie.trailerUrl.endsWith('.mp4')) {
      this.safeTrailerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        movie.trailerUrl
      );
    } else {
      this.safeTrailerUrl = null;
    }
  }

  get hasTrailer(): boolean {
    return !!this.movie?.trailerUrl;
  }

  openTrailer(): void {
    if (!this.hasTrailer) return;
    this.isTrailerOpen = true;
  }

  closeTrailer(event?: MouseEvent): void {
    if (
      !event ||
      (event.target as HTMLElement).classList.contains('trailer-backdrop')
    ) {
      this.isTrailerOpen = false;
    }
  }
}
