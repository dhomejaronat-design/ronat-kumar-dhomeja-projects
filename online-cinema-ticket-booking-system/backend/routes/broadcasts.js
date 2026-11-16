const express = require("express");
const router = express.Router();
const db = require("../db");


const FIXED_CINEMA_IDS = [1, 2, 3];
const FIXED_TIMES = ["09:00", "14:00", "19:00"]; 


const baseSelect = `
  SELECT
    b.BroadCastId,
    b.Dates,
    b.Time,
    b.day,
    b.FilmId,
    f.FilmName,
    f.Duration,
    f.Category,
    f.Language,
    f.Director,
    f.Description,
    f.Poster,
    c.CinemaId,
    c.CinRow,
    c.CinCol
  FROM broadcast b
  JOIN film f ON b.FilmId = f.FilmId
  JOIN Cinema c ON b.CinemaId = c.CinemaId
`;


function normalizeTime(time) {
  if (!time) return time;
  
  return time.toString().slice(0, 5);
}

function isFixedTime(time) {
  const t = normalizeTime(time);
  return FIXED_TIMES.includes(t);
}

function isPastShow(Dates, Time) {
  try {
    const t = normalizeTime(Time);
    const iso = `${Dates}T${t}:00`;
    const start = new Date(iso);
    const now = new Date();
    return start.getTime() <= now.getTime();
  } catch {
    return false;
  }
}

router.get("/", (req, res) => {
  const { date, filmId, cinemaId, includePast } = req.query;

  let sql = baseSelect;
  const where = [];
  const params = [];

  if (date) {
    where.push("b.Dates = ?");
    params.push(date);
  }

  if (filmId) {
    where.push("b.FilmId = ?");
    params.push(filmId);
  }

  if (cinemaId) {
    where.push("b.CinemaId = ?");
    params.push(cinemId);
  } else {

    where.push(
      `b.CinemaId IN (${FIXED_CINEMA_IDS.map(() => "?").join(",")})`
    );
    params.push(...FIXED_CINEMA_IDS);
  }

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += " ORDER BY b.Dates, b.Time, b.CinemaId";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).send(err);

    const wantPast =
      String(includePast || "").trim().toLowerCase() === "true";

    const filtered = wantPast
      ? rows
      : rows.filter((r) => !isPastShow(r.Dates, r.Time));

    res.json(filtered);
  });
});


function checkSlotFree(Dates, Time, CinemaId, cb) {
  const t = normalizeTime(Time);
  const sql = `
    SELECT BroadCastId
    FROM broadcast
    WHERE Dates = ? AND Time = ? AND CinemaId = ?
    LIMIT 1
  `;
  db.query(sql, [Dates, t, CinemaId], (err, rows) => {
    if (err) return cb(err);
    cb(null, rows.length === 0);
  });
}


router.post("/", (req, res) => {
  let { Dates, Time, day, FilmId, CinemaId } = req.body;

  if (!Dates || !Time || !day || !FilmId || !CinemaId) {
    return res.status(400).send("Missing required fields");
  }

  CinemaId = parseInt(CinemaId, 10);

  if (!FIXED_CINEMA_IDS.includes(CinemaId)) {
    return res
      .status(400)
      .send("Invalid cinema. Only cinemas 1, 2 and 3 are allowed.");
  }

  Time = normalizeTime(Time);

  if (!isFixedTime(Time)) {
    return res
      .status(400)
      .send("Invalid time. Allowed times are 09:00, 14:00, 19:00.");
  }

  if (isPastShow(Dates, Time)) {
    return res.status(400).send("Cannot create a showtime in the past.");
  }

  checkSlotFree(Dates, Time, CinemaId, (err, isFree) => {
    if (err) return res.status(500).send(err);
    if (!isFree) {
      return res
        .status(400)
        .send(
          "This cinema/time slot on that date is already taken (max 1 movie per slot)."
        );
    }

    const insertSql = `
      INSERT INTO broadcast (Dates, Time, FilmId, CinemaId, day)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
      insertSql,
      [Dates, Time, FilmId, CinemaId, day],
      (err2, result) => {
        if (err2) return res.status(500).send(err2);

        const id = result.insertId;
        db.query(
          baseSelect + " WHERE b.BroadCastId = ?",
          [id],
          (err3, rows2) => {
            if (err3) return res.status(500).send(err3);
            res.status(201).json(rows2[0]);
          }
        );
      }
    );
  });
});


router.put("/:id", (req, res) => {
  const id = req.params.id;
  let { Dates, Time, day, FilmId, CinemaId } = req.body;

  if (!Dates || !Time || !day || !FilmId || !CinemaId) {
    return res.status(400).send("Missing required fields");
  }

  CinemaId = parseInt(CinemaId, 10);

  if (!FIXED_CINEMA_IDS.includes(CinemaId)) {
    return res
      .status(400)
      .send("Invalid cinema. Only cinemas 1, 2 and 3 are allowed.");
  }

  Time = normalizeTime(Time);

  if (!isFixedTime(Time)) {
    return res
      .status(400)
      .send("Invalid time. Allowed times are 09:00, 14:00, 19:00.");
  }

  if (isPastShow(Dates, Time)) {
    return res.status(400).send("Cannot move a showtime into the past.");
  }

  const sqlCheck = `
    SELECT BroadCastId
    FROM broadcast
    WHERE Dates = ?
      AND Time = ?
      AND CinemaId = ?
      AND BroadCastId <> ?
    LIMIT 1
  `;

  db.query(
    sqlCheck,
    [Dates, Time, CinemaId, id],
    (err, rows) => {
      if (err) return res.status(500).send(err);
      if (rows.length > 0) {
        return res
          .status(400)
          .send(
            "This cinema/time slot on that date is already taken (max 1 movie per slot)."
          );
      }

      const updateSql = `
        UPDATE broadcast
        SET Dates = ?, Time = ?, FilmId = ?, CinemaId = ?, day = ?
        WHERE BroadCastId = ?
      `;

      db.query(
        updateSql,
        [Dates, Time, FilmId, CinemaId, day, id],
        (err2) => {
          if (err2) return res.status(500).send(err2);

          db.query(
            baseSelect + " WHERE b.BroadCastId = ?",
            [id],
            (err3, rows2) => {
              if (err3) return res.status(500).send(err3);
              if (!rows2.length) {
                return res.status(404).send("Showtime not found");
              }
              res.json(rows2[0]);
            }
          );
        }
      );
    }
  );
});


router.get("/slots/:date?", (req, res) => {
  const date = req.params.date || req.query.date;

  if (!date) {
    return res.status(400).send("Date is required.");
  }

  const sql = `
    SELECT BroadCastId, Dates, Time, FilmId, CinemaId
    FROM broadcast
    WHERE Dates = ?
      AND CinemaId IN (${FIXED_CINEMA_IDS.map(() => "?").join(",")})
  `;

  db.query(sql, [date, ...FIXED_CINEMA_IDS], (err, rows) => {
    if (err) return res.status(500).send(err);

    const slots = [];

    FIXED_CINEMA_IDS.forEach((cinemaId) => {
      FIXED_TIMES.forEach((t) => {
        const existing = rows.find(
          (r) =>
            r.CinemaId === cinemaId &&
            normalizeTime(r.Time) === t
        );

        const statusBase = isPastShow(date, t) ? "past" : "upcoming";

        if (existing) {
          slots.push({
            cinemaId,
            time: t,
            BroadCastId: existing.BroadCastId,
            FilmId: existing.FilmId,
            status: `booked-${statusBase}`,
          });
        } else {
          slots.push({
            cinemaId,
            time: t,
            status: `empty-${statusBase}`,
          });
        }
      });
    });

    res.json(slots);
  });
});


router.get("/:id", (req, res) => {
  const id = req.params.id;

  db.query(baseSelect + " WHERE b.BroadCastId = ?", [id], (err, rows) => {
    if (err) return res.status(500).send(err);
    if (!rows.length) return res.status(404).send("Showtime not found");
    res.json(rows[0]);
  });
});


router.delete("/:id", (req, res) => {
  const id = req.params.id;
  const sql = "DELETE FROM broadcast WHERE BroadCastId = ?";

  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) {
      return res.status(404).send("Showtime not found");
    }
    res.json({ message: "Showtime deleted successfully!" });
  });
});

module.exports = router;
