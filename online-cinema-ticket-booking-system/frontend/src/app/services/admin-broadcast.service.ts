import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminBroadcast {
  BroadCastId: number;
  Dates: string;
  Time: string;
  day: string;
  FilmId: number;
  CinemaId: number;
  CinRow?: string;
  CinCol?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminBroadcastService {
  private baseUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  getForFilm(filmId: number): Observable<AdminBroadcast[]> {
    return this.http.get<AdminBroadcast[]>(`${this.baseUrl}/broadcasts`, {
      params: { filmId: filmId.toString() },
    });
  }

  createShowtime(data: {
    Dates: string;
    Time: string;
    day: string;
    FilmId: number;
    CinemaId: number;
  }): Observable<AdminBroadcast> {
    return this.http.post<AdminBroadcast>(
      `${this.baseUrl}/broadcasts`,
      data
    );
  }

  updateShowtime(
    id: number,
    data: {
      Dates: string;
      Time: string;
      day: string;
      FilmId: number;
      CinemaId: number;
    }
  ): Observable<AdminBroadcast> {
    return this.http.put<AdminBroadcast>(
      `${this.baseUrl}/broadcasts/${id}`,
      data
    );
  }

  
  deleteShowtime(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/broadcasts/${id}`
    );
  }
}
