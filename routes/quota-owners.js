const express = require('express');
const { body, param } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { quotaOwners, nextId } = require('../mock/data');

const router = express.Router();

const ownerValidation = [
  body('name').trim().notEmpty().isLength({ max: 256 }),
  body('surname').trim().notEmpty().isLength({ max: 256 }),
  body('quota').isIn(['quota_intera', 'mezza_quota']),
  body('email').isEmail().normalizeEmail(),
  body('phone_prefix').trim().notEmpty(),
  body('phone').trim().notEmpty(),
];

// GET /api/quota-owners
router.get('/', async (_req, res) => {
  if (!pool) return res.json(quotaOwners);
  try {
    const { rows } = await pool.query('SELECT * FROM quota_owners ORDER BY surname, name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/quota-owners/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  if (!pool) {
    const owner = quotaOwners.find((o) => o.id === req.params.id);
    return owner ? res.json(owner) : res.status(404).json({ message: 'Not found' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM quota_owners WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/quota-owners
router.post('/', ownerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, surname, quota, email, phone_prefix, phone } = req.body;
  if (!pool) {
    const newOwner = { id: nextId(quotaOwners), name, surname, quota, email, phone_prefix, phone };
    quotaOwners.push(newOwner);
    return res.status(201).json(newOwner);
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO quota_owners (name, surname, quota, email, phone_prefix, phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, surname, quota, email, phone_prefix, phone]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/quota-owners/:id
router.put('/:id', [param('id').isInt({ min: 1 }).toInt(), ...ownerValidation], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, surname, quota, email, phone_prefix, phone } = req.body;
  if (!pool) {
    const idx = quotaOwners.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    quotaOwners[idx] = { ...quotaOwners[idx], name, surname, quota, email, phone_prefix, phone };
    return res.json(quotaOwners[idx]);
  }
  try {
    const { rows } = await pool.query(
      'UPDATE quota_owners SET name=$1, surname=$2, quota=$3, email=$4, phone_prefix=$5, phone=$6 WHERE id=$7 RETURNING *',
      [name, surname, quota, email, phone_prefix, phone, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
