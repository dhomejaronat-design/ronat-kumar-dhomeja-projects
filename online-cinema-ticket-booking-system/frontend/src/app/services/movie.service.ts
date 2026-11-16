import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Movie } from '../models/movie.model';


interface FilmFromApi {
  FilmId: number;
  FilmName: string;
  Duration: string;
  Category: string;
  Language: string;
  Director: string;
  Description: string;
  Poster: string | null;
  Trailer?: string | null;
  Rating?: string | null; 
}

@Injectable({
  providedIn: 'root',
})
export class MovieService {
  private baseUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  private mapFilmToMovie(film: FilmFromApi): Movie {
    const parsedDuration = parseInt(film.Duration, 10);
    const durationMinutes = isNaN(parsedDuration) ? 0 : parsedDuration;

   
    let posterUrl = 'assets/posters/default.jpg';
    if (film.Poster && film.Poster.trim() !== '') {
      const p = film.Poster.trim();
      if (p.startsWith('http')) {
        posterUrl = p;
      } else if (p.startsWith('/uploads/')) {
        posterUrl = `${this.baseUrl}${p}`;
      } else {
     
        posterUrl = `assets/posters/${p}`;
      }
    }

    
    let trailerUrl: string | undefined;
    if (film.Trailer && film.Trailer.trim() !== '') {
      const t = film.Trailer.trim();
      if (t.startsWith('http')) {
   
        trailerUrl = t;
      } else if (t.startsWith('/uploads/')) {
      
        trailerUrl = `${this.baseUrl}${t}`;
      } else {
        
        trailerUrl = `assets/trailers/${t}`;
      }
    }

  
    const rating =
      film.Rating && film.Rating.trim() !== ''
        ? film.Rating.trim()
        : 'PG'; 

    return {
      id: film.FilmId,
      title: film.FilmName,
      description: film.Description,
      durationMinutes,
      genre: film.Category,
      rating,                 
      language: film.Language,
      director: film.Director,
      posterUrl,
      trailerUrl,
    };
  }

  getMovies(): Observable<Movie[]> {
    return this.http
      .get<FilmFromApi[]>(`${this.baseUrl}/films`)
      .pipe(map((films) => films.map((f) => this.mapFilmToMovie(f))));
  }

  getMovieById(id: number): Observable<Movie | undefined> {
    return this.http
      .get<FilmFromApi>(`${this.baseUrl}/films/${id}`)
      .pipe(map((film) => this.mapFilmToMovie(film)));
  }

  addMovie(formData: FormData): Observable<Movie> {
    return this.http
      .post<any>(`${this.baseUrl}/films`, formData)
      .pipe(
        map((res) =>
          this.mapFilmToMovie((res.film ?? res) as FilmFromApi)
        )
      );
  }

  updateMovie(id: number, formData: FormData): Observable<Movie> {
    return this.http
      .put<any>(`${this.baseUrl}/films/${id}`, formData)
      .pipe(
        map((res) =>
          this.mapFilmToMovie((res.film ?? res) as FilmFromApi)
        )
      );
  }

  deleteMovie(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/films/${id}`
    );
  }
}
