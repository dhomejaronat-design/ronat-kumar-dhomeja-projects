import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ShowtimeService } from '../../services/showtime.service';
import { MovieService } from '../../services/movie.service';
import { BookingService } from '../../services/booking.service';
import { Showtime } from '../../models/showtime.model';
import { Movie } from '../../models/movie.model';
import { Seat } from '../../models/seat.model';

type BookingStep = 'email' | 'payment' | 'complete';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.css'],
})
export class BookingComponent implements OnInit, OnDestroy {
  showtime: Showtime | undefined;
  movie: Movie | undefined;

  seats: Seat[] = [];
  selectedSeats: Seat[] = [];

  // flow state
  step: BookingStep = 'email';

  // customer details
  customerEmail = '';
  cardName = '';
  cardNumber = '';

 
  holdTicketIds: number[] = [];
  holdExpiresAt: string | null = null; 
  holdRemainingSeconds = 0;
  private holdTimerId: any = null;

  // UI messages
  emailError = '';
  paymentError = '';
  successMessage = '';

  constructor(
    private route: ActivatedRoute,
    private showtimeService: ShowtimeService,
    private movieService: MovieService,
    private bookingService: BookingService
  ) {}

  ngOnInit(): void {
    const showtimeId = Number(this.route.snapshot.paramMap.get('showtimeId'));
    if (!showtimeId) {
      return;
    }

    this.showtimeService.getShowtimeById(showtimeId).subscribe((st) => {
      this.showtime = st;

      if (st) {
        this.movieService
          .getMovieById(st.movieId)
          .subscribe((m) => (this.movie = m));

        this.loadSeats(st.id);
      }
    });
  }

  ngOnDestroy(): void {
    this.clearHoldTimer();
  }

  private loadSeats(showtimeId: number): void {
  this.bookingService.getBookedSeats(showtimeId).subscribe({
    next: (booked) => {
      console.log('BOOKED SEATS FROM API:', booked);

      const taken = new Set<string>(
        booked.map((b: any) => {
          const row = Number(b.SeatRow ?? b.seatRow);
          const col = Number(b.SeatCol ?? b.seatCol);
          return `${row}-${col}`;
        })
      );

      const rows = ['A', 'B', 'C', 'D', 'E'];
      const seats: Seat[] = [];
      let id = 1;

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const rowLabel = rows[rowIndex];
        const rowNumber = rowIndex + 1; 

        for (let num = 1; num <= 5; num++) {
          const key = `${rowNumber}-${num}`;
          const isTaken = taken.has(key);

          seats.push({
            id: id++,
            row: rowLabel,
            number: num,
            isAvailable: !isTaken,
          });
        }
      }

      this.seats = seats;

     
      this.selectedSeats = this.selectedSeats.filter((sel) =>
        this.seats.some(
          (s) => s.id === sel.id && s.isAvailable === true
        )
      );
    },
    error: (err) => {
      console.error('Error loading booked seats:', err);

        
        const rows = ['A', 'B', 'C', 'D', 'E'];
        const seats: Seat[] = [];
        let id = 1;

        for (const rowLabel of rows) {
          for (let num = 1; num <= 5; num++) {
            seats.push({
              id: id++,
              row: rowLabel,
              number: num,
              isAvailable: true,
            });
          }
        }

        this.seats = seats;
      },
    });
  }



  toggleSeat(seat: Seat): void {
    
    if (this.step !== 'email') return;

  
    if (!seat.isAvailable) return;

    const index = this.selectedSeats.findIndex((s) => s.id === seat.id);
    if (index >= 0) {
      this.selectedSeats.splice(index, 1);
    } else {
      this.selectedSeats.push(seat);
    }
  }

  isSelected(seat: Seat): boolean {
    return this.selectedSeats.some((s) => s.id === seat.id);
  }

  get totalPrice(): number {
    if (!this.showtime) return 0;
    return this.selectedSeats.length * this.showtime.price;
  }

  get selectedSeatLabels(): string {
    if (this.selectedSeats.length === 0) return '';
    return this.selectedSeats.map((s) => `${s.row}${s.number}`).join(', ');
  }

  get holdTimeDisplay(): string {
    if (this.holdRemainingSeconds <= 0) return '';
    const m = Math.floor(this.holdRemainingSeconds / 60);
    const s = this.holdRemainingSeconds % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }



  private startHoldTimer(totalSeconds: number = 15 * 60): void {
    this.clearHoldTimer();
    this.holdRemainingSeconds = totalSeconds;

    const tick = () => {
      this.holdRemainingSeconds--;

      if (this.holdRemainingSeconds <= 0) {
        this.holdRemainingSeconds = 0;
        this.clearHoldTimer();
        this.handleHoldExpired();
      }
    };

 
    this.holdTimerId = setInterval(tick, 1000);
  }

  private clearHoldTimer(): void {
    if (this.holdTimerId) {
      clearInterval(this.holdTimerId);
      this.holdTimerId = null;
    }
  }

  private handleHoldExpired(): void {
    if (this.step === 'payment') {
      this.paymentError =
        'Your 15-minute seat hold has expired. Please choose seats again.';
      this.step = 'email';
      this.selectedSeats = [];
      this.holdTicketIds = [];
      this.holdExpiresAt = null;
      this.holdRemainingSeconds = 0;

      if (this.showtime) {
        this.loadSeats(this.showtime.id);
      }
    }
  }

 
  goToPayment(): void {
    this.emailError = '';
    this.paymentError = '';
    this.successMessage = '';

    if (!this.showtime || !this.movie) {
      this.emailError = 'Invalid showtime.';
      return;
    }

    if (this.selectedSeats.length === 0) {
      this.emailError = 'Please select at least one seat.';
      return;
    }

    if (!this.customerEmail || !this.customerEmail.includes('@')) {
      this.emailError = 'Please enter a valid email address.';
      return;
    }

    this.clearHoldTimer();
    this.holdTicketIds = [];
    this.holdExpiresAt = null;
    this.holdRemainingSeconds = 0;

    this.bookingService
      .createHold({
        showtimeId: this.showtime.id,
        email: this.customerEmail.trim(),
        seats: this.selectedSeats,
        pricePerSeat: this.showtime.price,
      })
      .subscribe({
        next: (res) => {
        
          this.holdTicketIds = res.ticketIds;
          this.holdExpiresAt = res.holdExpiresAt ?? null;

       
          this.startHoldTimer(15 * 60);

          this.step = 'payment';
        },
        error: (err) => {
          const status = err?.status;

          if (status === 409) {
            
            this.emailError =
              'One or more selected seats are no longer available.';
          } else {
            this.emailError =
              (err?.error as string) ||
              'Could not hold seats. They may have just been taken by someone else.';
          }

         
          for (const sel of this.selectedSeats) {
            const match = this.seats.find((s) => s.id === sel.id);
            if (match) {
              match.isAvailable = false;
            }
          }

          this.selectedSeats = [];
          this.holdTicketIds = [];
          this.holdExpiresAt = null;
          this.holdRemainingSeconds = 0;
          this.clearHoldTimer();

         
          if (this.showtime) {
            this.loadSeats(this.showtime.id);
          }
        },
      });
  }

 

  completePayment(): void {
    this.paymentError = '';
    this.successMessage = '';

    if (!this.showtime || this.holdTicketIds.length === 0) {
      this.paymentError = 'No active seat hold to pay for.';
      return;
    }

    this.bookingService
      .confirmPayment({
        ticketIds: this.holdTicketIds,
        cardName: this.cardName,
        cardNumber: this.cardNumber,
      })
      .subscribe({
        next: (res) => {
          this.successMessage =
            'Booking confirmed! A confirmation email has been sent to ' +
            res.email +
            '.';

          this.clearHoldTimer();
          this.holdExpiresAt = null;
          this.holdRemainingSeconds = 0;

          this.step = 'complete';
          this.selectedSeats = [];
          this.holdTicketIds = [];
          this.cardName = '';
          this.cardNumber = '';

          if (this.showtime) {
            this.loadSeats(this.showtime.id);
          }
        },
        error: (err) => {
          this.paymentError =
            (err?.error as string) ||
            'Payment failed. Your seat hold may have expired.';

          this.clearHoldTimer();
          this.holdExpiresAt = null;
          this.holdRemainingSeconds = 0;
          this.holdTicketIds = [];

          if (this.showtime) {
            this.loadSeats(this.showtime.id);
          }
        },
      });
  }



  newBooking(): void {
    this.step = 'email';
    this.selectedSeats = [];
    this.holdTicketIds = [];
    this.holdExpiresAt = null;
    this.holdRemainingSeconds = 0;
    this.clearHoldTimer();
    this.successMessage = '';
    this.paymentError = '';
    this.emailError = '';
  }
}
