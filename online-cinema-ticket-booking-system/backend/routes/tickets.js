const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,     
  },
});


function toMysqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}


function formatDateForEmail(value) {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


function formatTimeForEmail(value) {
  const str = String(value);
  const parts = str.split(":");
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}


function rowNumberToLetter(row) {
  const n = Number(row);
  if (!n || n < 1) return "?";
  return String.fromCharCode(64 + n); // 1 -> 'A'
}


function cleanupExpiredHolds(broadcastId, cb) {
  const showSql = "SELECT Dates, Time FROM broadcast WHERE BroadCastId = ?";
  db.query(showSql, [broadcastId], (showErr, rows) => {
    if (showErr) return cb(showErr);

    if (!rows || rows.length === 0) {
     
      const expireAllSql =
        "UPDATE ticket SET Valid = 'EXPIRED' WHERE BroadCastId = ?";
      return db.query(expireAllSql, [broadcastId], (expErr) => cb(expErr));
    }

    const { Dates, Time } = rows[0];
    const timeStr = String(Time).slice(0, 5);
    const showDateTime = new Date(`${Dates}T${timeStr}:00`);
    const now = new Date();

    let sql;
    const params = [broadcastId];

    if (showDateTime.getTime() <= now.getTime()) {
    
      sql = "UPDATE ticket SET Valid = 'EXPIRED' WHERE BroadCastId = ?";
    } else {
     
      sql = `
        UPDATE ticket
        SET Valid = 'EXPIRED'
        WHERE BroadCastId = ?
          AND Valid = 'HELD'
          AND HoldUntil IS NOT NULL
          AND HoldUntil <= NOW()
      `;
    }

    db.query(sql, params, (err) => cb(err));
  });
}


router.get("/", (req, res) => {
  const { broadcast, date, cinema } = req.query;

  let sql = `
    SELECT t.*, b.Dates, b.Time, b.CinemaId 
    FROM ticket t 
    JOIN broadcast b ON t.BroadCastId = b.BroadCastId
  `;
  const conditions = [];
  const values = [];

  if (broadcast) {
    conditions.push("t.BroadCastId = ?");
    values.push(broadcast);
  }
  if (date) {
    conditions.push("b.Dates = ?");
    values.push(date);
  }
  if (cinema) {
    conditions.push("b.CinemaId = ?");
    values.push(cinema);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY b.Dates, b.Time, t.SeatRow, t.SeatCol";

  db.query(sql, values, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results || []);
  });
});


router.get("/:id", (req, res) => {
  const { id } = req.params;
  const sql = "SELECT * FROM ticket WHERE TicketId = ?";
  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).send(err);
    if (!results || results.length === 0) {
      return res.status(404).send("Ticket not found");
    }
    res.json(results[0]);
  });
});


router.get("/user/:userId", (req, res) => {
  const { userId } = req.params;
  const sql = `
    SELECT t.*, f.FilmName, b.Dates, b.Time, b.CinemaId
    FROM ticket t
    JOIN broadcast b ON t.BroadCastId = b.BroadCastId
    JOIN film f ON b.FilmId = f.FilmId
    WHERE t.UserId = ?
    ORDER BY b.Dates DESC, b.Time DESC
  `;
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results || []);
  });
});

router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { Valid } = req.body;
  const sql = "UPDATE ticket SET Valid = ? WHERE TicketId = ?";
  db.query(sql, [Valid, id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) {
      return res.status(404).send("Ticket not found");
    }
    res.send(`Ticket validity updated to ${Valid}`);
  });
});


router.get("/fees/user/:userId", (req, res) => {
  const { userId } = req.params;
  const sql =
    "SELECT SUM(CAST(TicketFee AS DECIMAL(10,2))) AS TotalFees FROM ticket WHERE UserId = ?";
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).send(err);
    const totalFees = Number(results[0].TotalFees) || 0;
    res.json({ UserId: userId, TotalFees: totalFees });
  });
});


router.get("/bookedSeats", (req, res) => {
  const { BroadCastId } = req.query;
  if (!BroadCastId) {
    return res.status(400).send("BroadCastId is required.");
  }

  const broadcastId = Number(BroadCastId);
  if (!broadcastId || Number.isNaN(broadcastId)) {
    return res.status(400).send("BroadCastId must be a number.");
  }

  const sql = `
    SELECT SeatRow, SeatCol
    FROM ticket
    WHERE BroadCastId = ?
      AND Valid = 'YES'
  `;

  db.query(sql, [broadcastId], (err, results) => {
    if (err) {
      console.error("Error in /tickets/bookedSeats:", err);
      return res.status(500).send("Error loading booked seats.");
    }

    res.json(results || []);
  });
});



router.post("/hold", (req, res) => {
  const { BroadCastId, Email, seats, TicketFee } = req.body;

  if (!BroadCastId || !Email || !Array.isArray(seats) || seats.length === 0) {
    return res
      .status(400)
      .send("BroadCastId, Email and at least one seat are required.");
  }

  if (typeof Email !== "string" || !Email.includes("@")) {
    return res.status(400).send("Invalid email address.");
  }

  const broadcastId = Number(BroadCastId);
  const pricePerSeat = Number(TicketFee) || 0;

  const normalizedSeats = seats.map((s) => ({
    row: Number(s.row),
    col: Number(s.col),
  }));

  cleanupExpiredHolds(broadcastId, (cleanupErr) => {
    if (cleanupErr) return res.status(500).send(cleanupErr);

    const placeholders = normalizedSeats
      .map(() => "(SeatRow = ? AND SeatCol = ?)")
      .join(" OR ");

    const checkSql = `
      SELECT SeatRow, SeatCol
      FROM ticket
      WHERE BroadCastId = ?
        AND (
          Valid = 'YES'
          OR (Valid = 'HELD' AND (HoldUntil IS NULL OR HoldUntil > NOW()))
        )
        AND (${placeholders})
    `;

    const checkParams = [
      broadcastId,
      ...normalizedSeats.flatMap((s) => [s.row, s.col]),
    ];

    db.query(checkSql, checkParams, (checkErr, takenRows) => {
      if (checkErr) return res.status(500).send(checkErr);

      if (takenRows && takenRows.length > 0) {
        return res
          .status(409)
          .send("One or more selected seats are no longer available.");
      }

      const holdUntil = toMysqlDatetime(
        new Date(Date.now() + 15 * 60 * 1000)
      );

      const values = normalizedSeats.map((s) => [
        s.row,
        s.col,
        broadcastId,
        "HELD",
        Email, 
        "Standard",
        pricePerSeat.toFixed(2),
        Email,
        holdUntil,
      ]);

      const insertSql = `
        INSERT INTO ticket
          (SeatRow, SeatCol, BroadCastId, Valid, UserId, TicketType, TicketFee, Email, HoldUntil)
        VALUES ?
      `;

      db.query(insertSql, [values], (insertErr, result) => {
        if (insertErr) return res.status(500).send(insertErr);

        const firstId = result.insertId;
        const ticketIds = values.map((_, idx) => firstId + idx);

        res.status(201).json({
          ticketIds,
          holdExpiresAt: holdUntil,
          email: Email,
        });
      });
    });
  });
});


router.post("/confirm", (req, res) => {
  const { ticketIds, cardName, cardNumber } = req.body;

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).send("ticketIds array is required.");
  }

  
  const placeholders = ticketIds.map(() => "?").join(",");

  const selectSql = `
    SELECT 
      t.TicketId,
      t.Email,
      t.SeatRow,
      t.SeatCol,
      t.TicketFee,
      t.BroadCastId,
      b.Dates,
      b.Time,
      b.CinemaId,
      f.FilmName
    FROM ticket t
    JOIN broadcast b ON t.BroadCastId = b.BroadCastId
    JOIN film f ON b.FilmId = f.FilmId
    WHERE t.TicketId IN (${placeholders})
  `;

  db.query(selectSql, ticketIds, (selectErr, rows) => {
    if (selectErr) return res.status(500).send(selectErr);
    if (!rows || rows.length === 0) {
      return res.status(404).send("Tickets not found.");
    }

    const email = rows[0].Email || "";
    const broadcastId = rows[0].BroadCastId;

    
    cleanupExpiredHolds(broadcastId, (cleanupErr) => {
      if (cleanupErr) return res.status(500).send(cleanupErr);

      const updateSql = `
        UPDATE ticket
        SET Valid = 'YES', HoldUntil = NULL
        WHERE TicketId IN (${placeholders})
          AND Valid = 'HELD'
          AND (HoldUntil IS NULL OR HoldUntil > NOW())
      `;

      db.query(updateSql, ticketIds, (updateErr, updateResult) => {
        if (updateErr) return res.status(500).send(updateErr);

        if (updateResult.affectedRows === 0) {
          return res
            .status(400)
            .send(
              "Tickets are no longer valid (hold expired or showtime passed)."
            );
        }

        
        const filmName = rows[0].FilmName;
        const cinemaId = rows[0].CinemaId;
        const showDate = formatDateForEmail(rows[0].Dates);
        const showTime = formatTimeForEmail(rows[0].Time);

        const seats = rows.map((r) => {
          const seatRow = rowNumberToLetter(r.SeatRow);
          const seatCol = r.SeatCol;
          return `${seatRow}${seatCol}`;
        });

        const seatList = seats.join(", ");
        const prices = rows.map((r) => Number(r.TicketFee) || 0);
        const pricePerSeat = prices[0] || 0;
        const total = prices.reduce((sum, p) => sum + p, 0);

        const mailOptions = {
          from: `OCTBS Cinema <${process.env.MAIL_USER}>`,
          to: email,
          subject: `Your OCTBS Booking for ${filmName}`,
          html: `
          <div style="font-family:Arial,sans-serif;padding:16px;">
            <h2 style="margin-bottom:10px;">Booking Confirmation</h2>
            <p>Thank you for booking with <strong>OCTBS Cinema</strong>.</p>

            <h3 style="margin-top:24px;">Booking Details</h3>
            <ul style="line-height:1.6;">
              <li><strong>Movie:</strong> ${filmName}</li>
              <li><strong>Cinema:</strong> Cinema ${cinemaId}</li>
              <li><strong>Date:</strong> ${showDate}</li>
              <li><strong>Time:</strong> ${showTime}</li>
              <li><strong>Seats:</strong> ${seatList}</li>
              <li><strong>Ticket price:</strong> CA$${pricePerSeat.toFixed(
                2
              )}</li>
              <li><strong>Total paid:</strong> CA$${total.toFixed(2)}</li>
            </ul>

            <p>Your seats are confirmed and reserved under this email address.</p>

            <hr style="margin:24px 0;" />
            <p style="font-size:12px;color:#777;">
              Please arrive at least 10 minutes before showtime. <br/>
              OCTBS Cinema &copy; ${new Date().getFullYear()}
            </p>
          </div>
          `,
        };

        transporter.sendMail(mailOptions, (mailErr, info) => {
          if (mailErr) {
            console.error("Error sending email:", mailErr);
          } else {
            console.log("Confirmation email sent:", info.response);
          }

          res.json({
            message:
              "Payment accepted. Booking confirmed and confirmation email sent.",
            email,
            seats,
            total,
          });
        });
      });
    });
  });
});

module.exports = router;
