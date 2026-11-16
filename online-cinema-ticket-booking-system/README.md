# Online Cinema Ticket Booking System

A full stack web app for booking cinema tickets. Customers browse films, watch trailers, pick showtimes and choose seats on a live seat map. Admins manage films, cinemas and showtimes.


**Stack:** Angular and TypeScript (frontend), Node.js and Express (REST API), MySQL, JWT auth, bcrypt, Multer uploads, Nodemailer

## Features

- Film catalogue with posters, trailers, categories and comments
- Showtimes ("broadcasts") per film and cinema hall
- Seat selection on a row and column seat map, with held, booked and expired seat states
- Ticket confirmation by email
- Admin login (JWT) to add, edit and delete films, halls and showtimes, and upload posters and trailers

## Project layout

```
backend/           Node.js and Express backend (port 3000)
  main.js          server entry point
  db.js            MySQL connection
  db.sql           schema and sample data
  routes/          films, tickets, broadcasts, cinemas, comments, users
  uploads/         posters and trailers uploaded through the admin page
frontend/          Angular frontend (port 4200)
  src/app/components   home, movie list, showtimes, booking, admin
  src/app/services     API calls for films, showtimes, bookings, auth
```

## Run it

You need Node.js (LTS), MySQL and the Angular CLI (`npm install -g @angular/cli`).

**1. Database**

```sql
CREATE DATABASE cinemaverse;
```

Then import `backend/db.sql` into it (MySQL Workbench, phpMyAdmin or `mysql -u root -p cinemaverse < backend/db.sql`).

**2. Backend**

```bash
cd backend
cp .env.example .env     # then fill in your MySQL password and other values
npm install
node --env-file=.env main.js
```

The API runs at http://localhost:3000. (`--env-file` needs Node 20 or newer. On older Node, set the variables in your shell instead.)

**3. Frontend**

```bash
cd frontend
npm install
ng serve
```

Open http://localhost:4200.

**Sample admin login** (from `db.sql`): `admin` / `admin123`

## Notes

- Secrets (database password, JWT secret, email login) are read from environment variables, never from the code.
- Passwords are stored as bcrypt hashes, and logins return a signed JWT that expires after 8 hours.
- Trailer videos and uploaded posters are not stored in the repo. Add your own through the admin page.
- Email confirmations need a Gmail app password in `MAIL_USER` and `MAIL_PASS`. Without them, bookings still work but no email is sent.
