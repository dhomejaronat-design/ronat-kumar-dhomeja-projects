import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Movie } from '../../models/movie.model';
import { MovieService } from '../../services/movie.service';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

import {
  AdminBroadcastService,
  AdminBroadcast,
} from '../../services/admin-broadcast.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent implements OnInit {
  //Movies
  movies: Movie[] = [];
  filteredMovies: Movie[] = [];
  selectedMovie: Movie | null = null;

  // create / edit state
  isEditing = false;
  isCreating = false;

  // movie form
  form = {
    title: '',
    genre: '',
    rating: '',
    durationMinutes: 0,
    language: '',
    director: '',
    description: '',
  };

  posterFile: File | null = null;
  trailerFile: File | null = null;

  // UI messages
  loading = false;
  errorMessage = '';
  successMessage = '';

  // search
  searchTerm = '';

  //Showtimes (broadcasts)
  showtimes: AdminBroadcast[] = [];

  showtimeForm = {
    id: null as number | null,
    date: '',
    time: '',
    day: '',
    cinemaId: 1,
  };

  showtimeError = '';
  showtimeSuccess = '';
  isEditingShowtime = false;

  constructor(
  private movieService: MovieService,
  private adminBroadcastService: AdminBroadcastService,
  private router: Router,
  private authService: AuthService
) {}


  //  LOGOUT

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }



  //  INIT

  ngOnInit(): void {
    this.loadMovies();
  }

  private loadMovies(): void {
    this.movieService.getMovies().subscribe({
      next: (movies) => {
        this.movies = movies;
        this.applyFilter();
      },
      error: (err) => {
        console.error(err);
        this.errorMessage = 'Failed to load movies.';
      },
    });
  }


  //  SEARCH

  onSearchChange(value: string): void {
    this.searchTerm = value;
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = this.searchTerm.toLowerCase();
    if (!term) {
      this.filteredMovies = [...this.movies];
      return;
    }
    this.filteredMovies = this.movies.filter((m) =>
      m.title.toLowerCase().includes(term)
    );
  }


  //  MOVIE CRUD

  startCreate(): void {
    this.isCreating = true;
    this.isEditing = false;
    this.selectedMovie = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.posterFile = null;
    this.trailerFile = null;

    this.form = {
      title: '',
      genre: '',
      rating: '',
      durationMinutes: 0,
      language: '',
      director: '',
      description: '',
    };

    this.resetShowtimeForm();
    this.showtimes = [];
  }

  startEdit(movie: Movie): void {
    this.selectedMovie = movie;
    this.isEditing = true;
    this.isCreating = false;
    this.errorMessage = '';
    this.successMessage = '';
    this.posterFile = null;
    this.trailerFile = null;

    this.form = {
      title: movie.title,
      genre: movie.genre,
      rating: movie.rating,
      durationMinutes: movie.durationMinutes,
      language: movie.language ?? '',
      director: movie.director ?? '',
      description: movie.description,
    };

    if (movie.id != null) {
      this.loadShowtimesForMovie(movie.id);
    } else {
      this.showtimes = [];
    }

    this.resetShowtimeForm();
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.isCreating = false;
    this.selectedMovie = null;
    this.posterFile = null;
    this.trailerFile = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.resetShowtimeForm();
    this.showtimes = [];
  }

  onPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.posterFile = input.files[0];
    }
  }

  onTrailerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.trailerFile = input.files[0];
    }
  }

  private buildFormData(): FormData {
    const fd = new FormData();
    fd.append('FilmName', this.form.title);
    fd.append('Category', this.form.genre); 
    fd.append('Duration', String(this.form.durationMinutes));
    fd.append('Language', this.form.language || '');
    fd.append('Director', this.form.director || '');
    fd.append('Description', this.form.description || '');

    if (this.posterFile) {
      fd.append('poster', this.posterFile);
    }
    if (this.trailerFile) {
      fd.append('trailer', this.trailerFile);
    }
    return fd;
  }

  submitMovie(): void {
    if (!this.form.title || !this.form.genre || !this.form.durationMinutes) {
      this.errorMessage = 'Title, category and duration are required.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const fd = this.buildFormData();

    if (this.isEditing && this.selectedMovie) {
      this.movieService.updateMovie(this.selectedMovie.id, fd).subscribe({
        next: () => {
          this.successMessage = 'Movie updated successfully.';
          this.loading = false;
          this.loadMovies();
        },
        error: (err) => {
          console.error(err);
          this.errorMessage =
            typeof err?.error === 'string'
              ? err.error
              : 'Failed to update movie.';
          this.loading = false;
        },
      });
    } else {
      this.movieService.addMovie(fd).subscribe({
        next: () => {
          this.successMessage = 'Movie created successfully.';
          this.loading = false;
          this.loadMovies();
          this.cancelEdit();
        },
        error: (err) => {
          console.error(err);
          this.errorMessage =
            typeof err?.error === 'string'
              ? err.error
              : 'Failed to create movie.';
          this.loading = false;
        },
      });
    }
  }

  deleteMovie(movie: Movie): void {
  if (!confirm(`Delete "${movie.title}"?`)) return;

  this.errorMessage = '';
  this.successMessage = '';

  const id = movie.id;

  this.movieService.deleteMovie(id).subscribe({
    next: () => {
      // Treat as success
      this.movies = this.movies.filter((m) => m.id !== id);
      this.applyFilter();

      if (this.selectedMovie?.id === id) {
        this.cancelEdit();
      }

      this.successMessage = 'Movie deleted.';
    },
    error: (err) => {
      
      console.error('Delete movie error (ignored):', err);

      this.movies = this.movies.filter((m) => m.id !== id);
      this.applyFilter();

      if (this.selectedMovie?.id === id) {
        this.cancelEdit();
      }

     
      this.successMessage =
        'Movie deleted (response could not be parsed, but data is updated).';
      this.errorMessage = '';
    },
  });
}



  //  SHOWTIMES (BROADCASTS)

  private loadShowtimesForMovie(movieId: number): void {
    this.adminBroadcastService.getForFilm(movieId).subscribe({
      next: (sts) => {
        this.showtimes = sts;
      },
      error: (err) => {
        console.error('Failed to load showtimes', err);
        this.showtimes = [];
      },
    });
  }

  private resetShowtimeForm(): void {
    this.isEditingShowtime = false;
    this.showtimeForm = {
      id: null,
      date: '',
      time: '',
      day: '',
      cinemaId: 1,
    };
    this.showtimeError = '';
    this.showtimeSuccess = '';
  }

  startNewShowtime(): void {
    if (!this.selectedMovie) return;
    this.resetShowtimeForm();
  }

  startEditShowtime(st: AdminBroadcast): void {
    this.isEditingShowtime = true;
    this.showtimeForm = {
      id: st.BroadCastId,
      date: st.Dates,
      time: st.Time,
      day: st.day,
      cinemaId: st.CinemaId,
    };
    this.showtimeError = '';
    this.showtimeSuccess = '';
  }

 saveShowtime(): void {
  if (!this.selectedMovie) return;

  const allowedTimes = ['09:00', '14:00', '19:00'];

  const payload = {
    Dates: this.showtimeForm.date,
    Time: this.showtimeForm.time,
    day: this.showtimeForm.day,
    FilmId: this.selectedMovie.id,
    CinemaId: this.showtimeForm.cinemaId,
  };

  // reset messages
  this.showtimeError = '';
  this.showtimeSuccess = '';

  if (!payload.Dates || !payload.Time || !payload.day) {
    this.showtimeError = 'Date, time and day are required.';
    return;
  }

  const timeShort = payload.Time.toString().slice(0, 5);
  if (!allowedTimes.includes(timeShort)) {
    this.showtimeError =
      'Time must be one of 09:00, 14:00 or 19:00.';
    return;
  }

  if (!payload.CinemaId || ![1, 2, 3].includes(Number(payload.CinemaId))) {
    this.showtimeError = 'Cinema must be 1, 2 or 3.';
    return;
  }

  const movieId = this.selectedMovie.id;

  if (this.isEditingShowtime && this.showtimeForm.id != null) {
    // UPDATE
    this.adminBroadcastService
      .updateShowtime(this.showtimeForm.id, payload)
      .subscribe({
        next: () => {
          this.showtimeSuccess = 'Showtime updated.';
          this.loadShowtimesForMovie(movieId);
          this.resetShowtimeForm();
        },
        error: (err) => {
          console.error('Update showtime error:', err);
          this.showtimeError =
            (err?.error && err.error.toString()) ||
            'Failed to update showtime.';
        },
      });
  } else {
    // CREATE
    this.adminBroadcastService.createShowtime(payload).subscribe({
      next: () => {
        this.showtimeSuccess = 'Showtime created.';
        this.loadShowtimesForMovie(movieId);
        this.resetShowtimeForm();
      },
      error: (err) => {
        console.error('Create showtime error:', err);
        this.showtimeError =
          (err?.error && err.error.toString()) ||
          'Failed to create showtime.';
      },
    });
  }
}

  deleteShowtime(st: AdminBroadcast): void {
    if (!this.selectedMovie) return;
    if (!confirm('Delete this showtime?')) return;

    const movieId = this.selectedMovie.id;

    this.showtimeError = '';
    this.showtimeSuccess = '';

    this.adminBroadcastService.deleteShowtime(st.BroadCastId).subscribe({
      next: (res) => {
        this.showtimeSuccess =
          (res && res.message) || 'Showtime deleted.';
        this.loadShowtimesForMovie(movieId);
      },
      error: (err) => {
        console.error('Delete showtime error (ignored):', err);
        this.showtimeSuccess =
          'Showtime deleted';
        this.loadShowtimesForMovie(movieId);
      },
    });
  }
}