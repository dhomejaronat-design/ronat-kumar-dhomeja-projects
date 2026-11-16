const express = require('express');
const cors = require('cors');
const path = require('path');



const app = express();
const PORT = 3000;
// Load a router whatever way the file exports it
function loadRouter(modulePath, name) {
  try {
    const mod = require(modulePath);

    // Direct export: module.exports = router
    if (typeof mod === 'function') {
      console.log(`[router] ${name} loaded (direct function export)`);
      return mod;
    }
    // Common pattern: module.exports = { router, ... }
    if (mod && typeof mod.router === 'function') {
      console.log(`[router] ${name} loaded (mod.router)`);
      return mod.router;
    }
    // Default export: module.exports = { default: router }
    if (mod && typeof mod.default === 'function') {
      console.log(`[router] ${name} loaded (mod.default)`);
      return mod.default;
    }

    console.error(`[router] ${name} is invalid:`, mod);
    return null;
  } catch (err) {
    console.error(`[router] Failed to load ${name} from ${modulePath}:`, err);
    return null;
  }
}

const filmsRouter = loadRouter('./routes/films', 'films');
const ticketsRouter = loadRouter('./routes/tickets', 'tickets');
const broadcastsRouter = loadRouter('./routes/broadcasts', 'broadcasts');
const cinemasRouter = loadRouter('./routes/cinemas', 'cinemas');
const commentsRouter = loadRouter('./routes/comments', 'comments');
const usersModule = require('./routes/users'); // exports { router, verifyToken }
const usersRouter =
  usersModule && typeof usersModule.router === 'function'
    ? usersModule.router
    : null;
if (!usersRouter) {
  console.error('[router] users router is invalid:', usersModule);
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount only the routers that loaded
function attach(path, router, name) {
  if (!router) {
    console.error(`[router] Skipping ${name} – router is null/invalid`);
    return;
  }
  app.use(path, router);
  console.log(`[router] Mounted ${name} at ${path}`);
}

attach('/films', filmsRouter, 'films');
attach('/tickets', ticketsRouter, 'tickets');
attach('/broadcasts', broadcastsRouter, 'broadcasts');
attach('/cinemas', cinemasRouter, 'cinemas');
attach('/comments', commentsRouter, 'comments');
attach('/users', usersRouter, 'users');

// Health check
app.get('/', (_req, res) => {
  res.send('OCTBS API is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;
