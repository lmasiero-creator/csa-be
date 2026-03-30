const express = require('express');
const { body, query, param } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { involvementSubscriptions, events, quotaOwners, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/involvement[?event_id=X]
router.get('/', [query('event_id').optional().isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid event_id' });
  const { event_id } = req.query;
  if (!pool) {
    const result = event_id
      ? involvementSubscriptions.filter((s) => s.event_id === event_id)
      : involvementSubscriptions;
    return res.json(result);
  }
  try {
    const queryText = event_id
      ? 'SELECT * FROM involvement_subscriptions WHERE event_id = $1 ORDER BY created_at'
      : 'SELECT * FROM involvement_subscriptions ORDER BY created_at';
    const { rows } = await pool.query(queryText, event_id ? [event_id] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/involvement
router.post('/', [
  body('event_id').isInt({ min: 1 }).toInt(),
  body('quota_owner_id').isInt({ min: 1 }).toInt(),
  body('participants').isArray({ min: 1 }),
  body('participants.*').trim().notEmpty().isLength({ max: 256 }),
  body('duration').optional({ nullable: true }).isLength({ max: 512 }),
  body('pranzo').optional({ nullable: true }).isLength({ max: 512 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { event_id, quota_owner_id, participants, duration, pranzo } = req.body;
  if (!pool) {
    const ev = events.find((e) => e.id === event_id && e.type === 'inv');
    if (!ev) return res.status(404).json({ message: 'Involvement event not found' });
    const owner = quotaOwners.find((o) => o.id === quota_owner_id);
    if (!owner) return res.status(404).json({ message: 'Quota owner not found' });
    const newSub = { id: nextId(involvementSubscriptions), event_id, quota_owner_id, participants, duration: duration ?? null, pranzo: pranzo ?? null };
    involvementSubscriptions.push(newSub);
    return res.status(201).json(newSub);
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO involvement_subscriptions (event_id, quota_owner_id, participants, duration, pranzo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [event_id, quota_owner_id, JSON.stringify(participants), duration ?? null, pranzo ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/involvement/:id
router.delete('/:id', [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  if (!pool) {
    const idx = involvementSubscriptions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Subscription not found' });
    involvementSubscriptions.splice(idx, 1);
    return res.status(204).end();
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM involvement_subscriptions WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Subscription not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
