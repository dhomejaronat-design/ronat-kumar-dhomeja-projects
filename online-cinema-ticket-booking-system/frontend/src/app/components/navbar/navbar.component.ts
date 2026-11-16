import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Movie } from '../../models/movie.model';
import { MovieService } from '../../services/movie.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit {

  searchQuery: string = '';


  private allMovies: Movie[] = [];


  suggestions: Movie[] = [];
  showSuggestions = false;
  isLoadingMovies = false;

  constructor(
    private router: Router,
    private movieService: MovieService
  ) {}

  ngOnInit(): void {
  
    this.isLoadingMovies = true;
    this.movieService.getMovies().subscribe({
      next: (movies) => {
        this.allMovies = movies || [];
        this.isLoadingMovies = false;
      },
      error: (err) => {
        console.error('Error loading movies for navbar search', err);
        this.isLoadingMovies = false;
      }
    });
  }


  onSearchChange(value: string): void {
    this.searchQuery = value;

    const term = value.toLowerCase().trim();

    if (!term) {
      this.suggestions = [];
      this.showSuggestions = false;
      return;
    }

    this.suggestions = this.allMovies
      .filter(m => m.title.toLowerCase().includes(term))
      .slice(0, 6);

    this.showSuggestions = this.suggestions.length > 0;
  }

  onSearchFocus(): void {
    if (this.searchQuery.trim() && this.suggestions.length > 0) {
      this.showSuggestions = true;
    }
  }


  onSearchBlur(): void {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 150);
  }

  openMovie(movie: Movie): void {

    this.router.navigate(['/movies', movie.id, 'showtimes']);
    this.resetSearch();
  }

  resetSearch(): void {
    this.searchQuery = '';
    this.suggestions = [];
    this.showSuggestions = false;
  }
}
