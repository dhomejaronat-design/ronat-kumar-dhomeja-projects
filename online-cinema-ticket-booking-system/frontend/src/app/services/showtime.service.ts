import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Showtime } from '../models/showtime.model';


interface BroadcastFromApi {
  BroadCastId: number;
  Dates: string;      
  Time: string;       
  day: string;
  FilmId: number;
  FilmName: string;
  Duration: string;
  Category: string;
  Poster: string;
  CinemaId: number;
  CinRow: string;     
  CinCol: string;     
}

@Injectable({
  providedIn: 'root'
})
export class ShowtimeService {
  
  private readonly baseUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

 
  private mapBroadcastToShowtime(b: BroadcastFromApi): Showtime {
    
    const datePart = b.Dates?.toString().substring(0, 10);  
    const timePart = b.Time?.toString().substring(0, 5);   
    const startTime =
      datePart && timePart ? `${datePart}T${timePart}:00` : '';

   
    const rows = Number(b.CinRow) || 0;
    const cols = Number(b.CinCol) || 0;
    const totalSeats = rows * cols;

    return {
      id: b.BroadCastId,
      movieId: b.FilmId,
      startTime,
      screen: `Cinema ${b.CinemaId}`,
      availableSeats: totalSeats,
      price: 12.5 
    };
  }

 
  getShowtimesForMovie(movieId: number): Observable<Showtime[]> {
  return this.http
    .get<BroadcastFromApi[]>(`${this.baseUrl}/broadcasts`, {
      params: { filmId: movieId.toString() }
    })
    .pipe(
      
      map(list => list.map(b => this.mapBroadcastToShowtime(b))),
     
      map(showtimes => {
        const now = new Date();

        return showtimes.filter(st => {
          if (!st.startTime) return false;

         
          const start = new Date(st.startTime);

        
          return start.getTime() > now.getTime();
        });
      })
    );
}


  getShowtimeById(id: number): Observable<Showtime | undefined> {
    return this.http
      .get<BroadcastFromApi>(`${this.baseUrl}/broadcasts/${id}`)
      .pipe(map(b => this.mapBroadcastToShowtime(b)));
  }
}
