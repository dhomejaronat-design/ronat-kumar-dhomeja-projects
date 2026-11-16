import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Movie } from '../../models/movie.model';
import { MovieService } from '../../services/movie.service';

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './movie-list.component.html',
  styleUrl: './movie-list.component.css'
})
export class MovieListComponent implements OnInit {

  movies: Movie[] = [];
  filteredMovies: Movie[] = [];
  isLoading = true;
  searchQuery: string = '';

  constructor(
    private movieService: MovieService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.movieService.getMovies().subscribe({
      next: (movies) => {
        this.movies = movies || [];
        this.isLoading = false;

        // listen for ?q=... changes from navbar
        this.route.queryParams.subscribe(params => {
          this.searchQuery = params['q'] || '';
          this.applyFilter();
        });
      },
      error: (err) => {
        console.error('Error loading movies', err);
        this.isLoading = false;
      }
    });
  }

  private applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();

    if (!q) {
      this.filteredMovies = this.movies;
      return;
    }

    this.filteredMovies = this.movies.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.genre.toLowerCase().includes(q) ||
      m.rating.toLowerCase().includes(q)
    );
  }

  openMovie(movie: Movie): void {
    this.router.navigate(['/movies', movie.id, 'showtimes']);
  }
}
