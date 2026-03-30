const express = require('express');
const { body, query } = require('express-validator');
const { validationResult } = require('express-validator');
const { involvementSubscriptions, events, quotaOwners, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/involvement[?event_id=X]
router.get('/', [query('event_id').optional().isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid event_id' });
  const { event_id } = req.query;
  const result = event_id
    ? involvementSubscriptions.filter((s) => s.event_id === event_id)
    : involvementSubscriptions;
  res.json(result);
});

// POST /api/involvement
router.post('/', [
  body('event_id').isInt({ min: 1 }).toInt(),
  body('quota_owner_id').isInt({ min: 1 }).toInt(),
  body('participants').isArray({ min: 1 }),
  body('participants.*').trim().notEmpty().isLength({ max: 256 }),
  body('duration').optional({ nullable: true }).isLength({ max: 512 }),
  body('pranzo').optional({ nullable: true }).isLength({ max: 512 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { event_id, quota_owner_id, participants, duration, pranzo } = req.body;

  const ev = events.find((e) => e.id === event_id && e.type === 'inv');
  if (!ev) return res.status(404).json({ message: 'Involvement event not found' });

  const owner = quotaOwners.find((o) => o.id === quota_owner_id);
  if (!owner) return res.status(404).json({ message: 'Quota owner not found' });

  const newSub = {
    id: nextId(involvementSubscriptions),
    event_id,
    quota_owner_id,
    participants,
    duration: duration ?? null,
    pranzo:   pranzo   ?? null,
  };
  involvementSubscriptions.push(newSub);
  res.status(201).json(newSub);
});

module.exports = router;
