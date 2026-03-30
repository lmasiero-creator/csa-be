const express = require('express');
const { body, param } = require('express-validator');
const { validationResult } = require('express-validator');
const { recipients, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/recipients
router.get('/', (_req, res) => res.json(recipients));

// POST /api/recipients — upsert a single recipient (create if no id, update if id present)
router.post('/', [
  body('email').isEmail().normalizeEmail(),
  body('phone_prefix').trim().notEmpty(),
  body('phone').trim().notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { id, email, phone_prefix, phone } = req.body;
  if (id) {
    const idx = recipients.findIndex((r) => r.id === Number(id));
    if (idx !== -1) {
      recipients[idx] = { id: Number(id), email, phone_prefix, phone };
      return res.json(recipients[idx]);
    }
  }
  const newRec = { id: nextId(recipients), email, phone_prefix, phone };
  recipients.push(newRec);
  res.status(201).json(newRec);
});

// DELETE /api/recipients/:id
router.delete('/:id', [param('id').isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  const idx = recipients.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  recipients.splice(idx, 1);
  res.status(204).end();
});

module.exports = router;
