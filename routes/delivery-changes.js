const express = require('express');
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const { deliveryChanges, events, quotaOwners, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/delivery-changes
router.get('/', (_req, res) => res.json(deliveryChanges));

// POST /api/delivery-changes
router.post('/', [
  body('event_id').isInt({ min: 1 }).toInt(),
  body('quota_owner_id').isInt({ min: 1 }).toInt(),
  body('new_delivery_point').isIn(['prt', 'arc', 'mrn']),
  body('description').optional({ nullable: true }).isLength({ max: 1024 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { event_id, quota_owner_id, new_delivery_point, description } = req.body;

  const ev = events.find((e) => e.id === event_id && e.type === 'del');
  if (!ev) return res.status(404).json({ message: 'Delivery event not found' });

  // Enforce deadline check server-side too
  if (ev.deadline && new Date(ev.deadline) < new Date(new Date().toDateString())) {
    return res.status(422).json({ message: 'Il termine per le modifiche è scaduto.' });
  }

  const owner = quotaOwners.find((o) => o.id === quota_owner_id);
  if (!owner) return res.status(404).json({ message: 'Quota owner not found' });

  const newChange = {
    id: nextId(deliveryChanges),
    event_id,
    quota_owner_id,
    new_delivery_point,
    description: description ?? null,
  };
  deliveryChanges.push(newChange);
  res.status(201).json(newChange);
});

module.exports = router;
