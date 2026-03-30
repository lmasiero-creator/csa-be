const express = require('express');
const { body, param } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { recipients, nextId } = require('../mock/data');

const router = express.Router();

// GET /api/recipients
router.get('/', async (_req, res) => {
  if (!pool) return res.json(recipients);
  try {
    const { rows } = await pool.query('SELECT * FROM recipients ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/recipients — upsert a single recipient (create if no id, update if id present)
router.post('/', [
  body('email').isEmail().normalizeEmail(),
  body('phone_prefix').trim().notEmpty(),
  body('phone').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { id, email, phone_prefix, phone } = req.body;
  if (!pool) {
    if (id) {
      const idx = recipients.findIndex((r) => r.id === Number(id));
      if (idx !== -1) {
        recipients[idx] = { id: Number(id), email, phone_prefix, phone };
        return res.json(recipients[idx]);
      }
    }
    const newRec = { id: nextId(recipients), email, phone_prefix, phone };
    recipients.push(newRec);
    return res.status(201).json(newRec);
  }
  try {
    let rows;
    if (id) {
      ({ rows } = await pool.query(
        'UPDATE recipients SET email=$1, phone_prefix=$2, phone=$3 WHERE id=$4 RETURNING *',
        [email, phone_prefix, phone, Number(id)]
      ));
      if (!rows.length) {
        ({ rows } = await pool.query(
          'INSERT INTO recipients (email, phone_prefix, phone) VALUES ($1,$2,$3) RETURNING *',
          [email, phone_prefix, phone]
        ));
      }
    } else {
      ({ rows } = await pool.query(
        'INSERT INTO recipients (email, phone_prefix, phone) VALUES ($1,$2,$3) RETURNING *',
        [email, phone_prefix, phone]
      ));
    }
    res.status(id ? 200 : 201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/recipients/:id
router.delete('/:id', [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  if (!pool) {
    const idx = recipients.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    recipients.splice(idx, 1);
    return res.status(204).end();
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM recipients WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
