import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

interface RawLoginResponse {
  auth?: boolean;
  token?: string;
  userId?: string;
  UserId?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly baseUrl = 'http://localhost:3000';

  private _isLoggedIn = false;
  private _userId: string | null = null;

  constructor(private http: HttpClient) {
    const token = localStorage.getItem('octbs_admin_token');
    const uid = localStorage.getItem('octbs_admin_userId');

    if (token && uid) {
      this._isLoggedIn = true;
      this._userId = uid;
    }
  }

  
  loginAdmin(userId: string, password: string): Observable<RawLoginResponse> {
    return this.http
      .post<RawLoginResponse>(`${this.baseUrl}/users/login`, {
        userId: userId.trim(),
        password: password.trim(),
      })
      .pipe(
        tap((res) => {
          const token = res.token;
          const uid = res.userId || res.UserId;

          if (token && uid) {
            
            this._isLoggedIn = true;
            this._userId = uid;

            localStorage.setItem('octbs_admin_token', token);
            localStorage.setItem('octbs_admin_userId', uid);
          } else {
            
            console.error('Login success without token/userId payload:', res);
            this._isLoggedIn = false;
            this._userId = null;
          }
        })
      );
  }

  logout(): void {
    this._isLoggedIn = false;
    this._userId = null;
    localStorage.removeItem('octbs_admin_token');
    localStorage.removeItem('octbs_admin_userId');
  }

  isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  get userId(): string | null {
    return this._userId;
  }
}
