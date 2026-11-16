import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Seat } from '../models/seat.model';

interface BookedSeatDto {
  SeatRow: number;
  SeatCol: number;
}

interface HoldResponse {
  ticketIds: number[];
  holdExpiresAt: string;
  email: string;
}

interface ConfirmResponse {
  message: string;
  email: string;
  seats: string[];
  total: number;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly baseUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  getBookedSeats(showtimeId: number): Observable<BookedSeatDto[]> {
    return this.http.get<BookedSeatDto[]>(
      `${this.baseUrl}/tickets/bookedSeats`,
      {
        params: { BroadCastId: showtimeId.toString() },
      }
    );
  }

 
  createHold(params: {
    showtimeId: number;
    email: string;
    seats: Seat[];
    pricePerSeat: number;
  }): Observable<HoldResponse> {
    const payload = {
      BroadCastId: params.showtimeId,
      Email: params.email,
      TicketFee: params.pricePerSeat,
      seats: params.seats.map((s) => ({
        row: this.rowLabelToNumber(s.row),
        col: s.number,
      })),
    };

    return this.http.post<HoldResponse>(
      `${this.baseUrl}/tickets/hold`,
      payload
    );
  }

  
  confirmPayment(params: {
    ticketIds: number[];
    cardName: string;
    cardNumber: string;
  }): Observable<ConfirmResponse> {
    const body = {
      ticketIds: params.ticketIds,
      cardName: params.cardName,
      cardNumber: params.cardNumber,
    };

    return this.http.post<ConfirmResponse>(
      `${this.baseUrl}/tickets/confirm`,
      body
    );
  }

  
  private rowLabelToNumber(row: string): number {
    return row.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  }
}
