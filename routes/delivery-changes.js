const express = require('express');
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { deliveryChanges, events, quotaOwners, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/delivery-changes
router.get('/', async (_req, res) => {
  if (!pool) return res.json(deliveryChanges);
  try {
    const { rows } = await pool.query('SELECT * FROM delivery_changes ORDER BY created_at');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/delivery-changes
router.post('/', [
  body('event_id').isInt({ min: 1 }).toInt(),
  body('quota_owner_id').isInt({ min: 1 }).toInt(),
  body('new_delivery_point').isIn(['prt', 'arc', 'mrn']),
  body('description').optional({ nullable: true }).isLength({ max: 1024 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { event_id, quota_owner_id, new_delivery_point, description } = req.body;

  if (!pool) {
    const ev = events.find((e) => e.id === event_id && e.type === 'del');
    if (!ev) return res.status(404).json({ message: 'Delivery event not found' });
    if (ev.deadline && new Date(ev.deadline) < new Date(new Date().toDateString())) {
      return res.status(422).json({ message: 'Il termine per le modifiche è scaduto.' });
    }
    const owner = quotaOwners.find((o) => o.id === quota_owner_id);
    if (!owner) return res.status(404).json({ message: 'Quota owner not found' });
    const newChange = { id: nextId(deliveryChanges), event_id, quota_owner_id, new_delivery_point, description: description ?? null };
    deliveryChanges.push(newChange);
    return res.status(201).json(newChange);
  }

  try {
    // Verify event exists and deadline not passed
    const { rows: evRows } = await pool.query("SELECT * FROM events WHERE id = $1 AND type = 'del'", [event_id]);
    if (!evRows.length) return res.status(404).json({ message: 'Delivery event not found' });
    const ev = evRows[0];
    if (ev.deadline && new Date(ev.deadline) < new Date(new Date().toDateString())) {
      return res.status(422).json({ message: 'Il termine per le modifiche è scaduto.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO delivery_changes (event_id, quota_owner_id, new_delivery_point, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [event_id, quota_owner_id, new_delivery_point, description ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
