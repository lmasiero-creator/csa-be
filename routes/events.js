const express = require('express');
const { body, param, query } = require('express-validator');
const { validationResult } = require('express-validator');
const { events, involvementSubscriptions, nextId } = require('../mock/data');

const router = express.Router();

/** Count involvement subscriptions for an event. */
function participantCount(eventId) {
  return involvementSubscriptions.filter((s) => s.event_id === eventId).length;
}

/** Enrich an event object with participant_count (for inv type). */
function enrich(ev) {
  return { ...ev, participant_count: ev.type === 'inv' ? participantCount(ev.id) : 0 };
}

// GET /api/events[?type=inv|del|evt]
router.get('/', [query('type').optional().isIn(['inv', 'del', 'evt'])], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid type filter' });
  const { type } = req.query;
  const result = type ? events.filter((e) => e.type === type) : events;
  res.json(result.map(enrich));
});

// GET /api/events/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  const ev = events.find((e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ message: 'Not found' });
  res.json(enrich(ev));
});

const eventValidation = [
  body('date').isISO8601().toDate(),
  body('type').isIn(['inv', 'del', 'evt']),
  body('description').trim().notEmpty().isLength({ max: 1024 }),
  body('delivery_point').optional({ nullable: true }).isIn(['prt', 'arc', 'mrn', null]),
  body('deadline').optional({ nullable: true }).isISO8601(),
];

// POST /api/events
router.post('/', eventValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, type, description, delivery_point, deadline } = req.body;
  const newEvent = {
    id: nextId(events),
    date: typeof date === 'object' ? date.toISOString().split('T')[0] : date,
    type,
    description,
    delivery_point: delivery_point ?? null,
    deadline: deadline ?? null,
  };
  events.push(newEvent);
  res.status(201).json(enrich(newEvent));
});

// PUT /api/events/:id
router.put('/:id', [param('id').isInt({ min: 1 }).toInt(), ...eventValidation], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idx = events.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const { date, type, description, delivery_point, deadline } = req.body;
  events[idx] = {
    ...events[idx],
    date: typeof date === 'object' ? date.toISOString().split('T')[0] : date,
    type,
    description,
    delivery_point: delivery_point ?? null,
    deadline: deadline ?? null,
  };
  res.json(enrich(events[idx]));
});

module.exports = router;
