const express = require('express');
const { body, param, query } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { events, involvementSubscriptions, nextId } = require('../mock/data');

const router = express.Router();

// ── SQL helper: SELECT with dates formatted as Rome local ISO strings ──────────
const EVENT_SELECT = `
  SELECT
    e.id, e.type, e.description, e.delivery_point,
    to_char(e.date     AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI') AS date,
    CASE WHEN e.deadline IS NOT NULL
         THEN to_char(e.deadline AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI')
         ELSE NULL END AS deadline,
    CASE WHEN e.type = 'inv' THEN (
      SELECT COUNT(*)::int FROM involvement_subscriptions s WHERE s.event_id = e.id
    ) ELSE 0 END AS participant_count
  FROM events e`;

// Mock helpers
function participantCount(eventId) {
  return involvementSubscriptions.filter((s) => s.event_id === eventId).length;
}
function enrichMock(ev) {
  return { ...ev, participant_count: ev.type === 'inv' ? participantCount(ev.id) : 0 };
}

// GET /api/events[?type=inv|del|evt]
router.get('/', [query('type').optional().isIn(['inv', 'del', 'evt'])], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid type filter' });
  const { type } = req.query;
  if (!pool) {
    const result = type ? events.filter((e) => e.type === type) : events;
    return res.json(result.map(enrichMock));
  }
  try {
    const { rows } = await pool.query(
      `${EVENT_SELECT} ${type ? 'WHERE e.type = $1' : ''} ORDER BY e.date`,
      type ? [type] : []
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/events/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  if (!pool) {
    const ev = events.find((e) => e.id === req.params.id);
    return ev ? res.json(enrichMock(ev)) : res.status(404).json({ message: 'Not found' });
  }
  try {
    const { rows } = await pool.query(`${EVENT_SELECT} WHERE e.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Validation — dates are ISO strings (with time); no .toDate() so pg gets the raw string
// and interprets it in the session timezone (Europe/Rome set in pool.js).
const eventValidation = [
  body('date').isISO8601(),
  body('type').isIn(['inv', 'del', 'evt']),
  body('description').trim().isLength({ max: 1024 }),
  body('delivery_point').optional({ nullable: true }).isIn(['prt', 'arc', 'mrn', null]),
  body('deadline').optional({ nullable: true }).isISO8601(),
];

// POST /api/events
router.post('/', eventValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, type, description, delivery_point, deadline } = req.body;
  if (!pool) {
    const newEvent = { id: nextId(events), date, type, description, delivery_point: delivery_point ?? null, deadline: deadline ?? null };
    events.push(newEvent);
    return res.status(201).json(enrichMock(newEvent));
  }
  try {
    const { rows } = await pool.query(
      `WITH ins AS (
         INSERT INTO events (date, type, description, delivery_point, deadline)
         VALUES ($1,$2,$3,$4,$5) RETURNING *
       )
       SELECT ins.id, ins.type, ins.description, ins.delivery_point,
         to_char(ins.date     AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI') AS date,
         CASE WHEN ins.deadline IS NOT NULL
              THEN to_char(ins.deadline AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI')
              ELSE NULL END AS deadline,
         0::int AS participant_count
       FROM ins`,
      [date, type, description, delivery_point ?? null, deadline ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/events/:id
router.put('/:id', [param('id').isInt({ min: 1 }).toInt(), ...eventValidation], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, type, description, delivery_point, deadline } = req.body;
  if (!pool) {
    const idx = events.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    events[idx] = { ...events[idx], date, type, description, delivery_point: delivery_point ?? null, deadline: deadline ?? null };
    return res.json(enrichMock(events[idx]));
  }
  try {
    const { rows } = await pool.query(
      `WITH upd AS (
         UPDATE events SET date=$1, type=$2, description=$3, delivery_point=$4, deadline=$5
         WHERE id=$6 RETURNING *
       )
       SELECT upd.id, upd.type, upd.description, upd.delivery_point,
         to_char(upd.date     AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI') AS date,
         CASE WHEN upd.deadline IS NOT NULL
              THEN to_char(upd.deadline AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI')
              ELSE NULL END AS deadline,
         0::int AS participant_count
       FROM upd`,
      [date, type, description, delivery_point ?? null, deadline ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
