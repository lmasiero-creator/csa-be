const express = require('express');
const { body, param, query } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { events, involvementSubscriptions, nextId } = require('../mock/data');

const router = express.Router();

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
    const queryText = `
      SELECT e.*,
        CASE WHEN e.type = 'inv' THEN (
          SELECT COUNT(*) FROM involvement_subscriptions s WHERE s.event_id = e.id
        ) ELSE 0 END AS participant_count
      FROM events e
      ${type ? 'WHERE e.type = $1' : ''}
      ORDER BY e.date`;
    const { rows } = await pool.query(queryText, type ? [type] : []);
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
    const { rows } = await pool.query(
      `SELECT e.*,
        CASE WHEN e.type = 'inv' THEN (
          SELECT COUNT(*) FROM involvement_subscriptions s WHERE s.event_id = e.id
        ) ELSE 0 END AS participant_count
       FROM events e WHERE e.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const eventValidation = [
  body('date').isISO8601().toDate(),
  body('type').isIn(['inv', 'del', 'evt']),
  body('description').trim().isLength({ max: 1024 }),
  body('delivery_point').optional({ nullable: true }).isIn(['prt', 'arc', 'mrn', null]),
  body('deadline').optional({ nullable: true }).isISO8601(),
];

function toDateStr(v) {
  return typeof v === 'object' && v instanceof Date ? v.toISOString().split('T')[0] : v;
}

// POST /api/events
router.post('/', eventValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, type, description, delivery_point, deadline } = req.body;
  if (!pool) {
    const newEvent = { id: nextId(events), date: toDateStr(date), type, description, delivery_point: delivery_point ?? null, deadline: deadline ?? null };
    events.push(newEvent);
    return res.status(201).json(enrichMock(newEvent));
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO events (date, type, description, delivery_point, deadline) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [toDateStr(date), type, description, delivery_point ?? null, deadline ?? null]
    );
    res.status(201).json({ ...rows[0], participant_count: 0 });
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
    events[idx] = { ...events[idx], date: toDateStr(date), type, description, delivery_point: delivery_point ?? null, deadline: deadline ?? null };
    return res.json(enrichMock(events[idx]));
  }
  try {
    const { rows } = await pool.query(
      'UPDATE events SET date=$1, type=$2, description=$3, delivery_point=$4, deadline=$5 WHERE id=$6 RETURNING *',
      [toDateStr(date), type, description, delivery_point ?? null, deadline ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ ...rows[0], participant_count: 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
