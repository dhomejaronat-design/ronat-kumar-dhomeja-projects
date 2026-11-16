import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { MovieListComponent } from './components/movie-list/movie-list.component';
import { ShowtimesComponent } from './components/showtimes/showtimes.component';
import { BookingComponent } from './components/booking/booking.component';
import { AdminComponent } from './components/admin/admin.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { adminAuthGuard } from './guards/admin-auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'movies', component: MovieListComponent },
  { path: 'movies/:movieId/showtimes', component: ShowtimesComponent },
  { path: 'booking/:showtimeId', component: BookingComponent },

  // Admin login page
  { path: 'admin/login', component: AdminLoginComponent },

  // Admin page – protected
  { path: 'admin', component: AdminComponent, canActivate: [adminAuthGuard] },

  { path: '**', redirectTo: '' },
];
