import { Seat } from './seat.model';

export interface Booking {
  id: number;
  showtimeId: number;
  movieTitle: string;
  customerName: string;
  seats: Seat[];
  totalPrice: number;
}
