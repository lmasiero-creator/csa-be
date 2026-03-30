const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman) and any localhost / GitHub Pages origin.
    const allowed = !origin
      || origin.startsWith('http://localhost')
      || origin.startsWith('http://127.0.0.1')
      || origin.includes('.github.io');
    cb(null, allowed);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
// Note: multipart/form-data is handled per-route by multer.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/account',          require('./routes/account'));
app.use('/api/quota-owners',     require('./routes/quota-owners'));
app.use('/api/events',           require('./routes/events'));
app.use('/api/recipients',       require('./routes/recipients'));
app.use('/api/involvement',      require('./routes/involvement'));
app.use('/api/delivery-changes', require('./routes/delivery-changes'));
app.use('/api/job',              require('./routes/job'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  mode: process.env.DATABASE_URL ? 'db' : 'mock',
}));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

module.exports = app;
