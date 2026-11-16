export interface Movie {
  id: number;
  title: string;
  description: string;
  durationMinutes: number;

 
  rating: string;      
  genre: string;       
  posterUrl: string;

  trailerUrl?: string;

  language?: string;
  director?: string;
}
