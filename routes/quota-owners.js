const express = require('express');
const { body, param } = require('express-validator');
const { validationResult } = require('express-validator');
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
router.get('/', (_req, res) => res.json(quotaOwners));

// GET /api/quota-owners/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  const owner = quotaOwners.find((o) => o.id === req.params.id);
  if (!owner) return res.status(404).json({ message: 'Not found' });
  res.json(owner);
});

// POST /api/quota-owners
router.post('/', ownerValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, surname, quota, email, phone_prefix, phone } = req.body;
  const newOwner = { id: nextId(quotaOwners), name, surname, quota, email, phone_prefix, phone };
  quotaOwners.push(newOwner);
  res.status(201).json(newOwner);
});

// PUT /api/quota-owners/:id
router.put('/:id', [param('id').isInt({ min: 1 }).toInt(), ...ownerValidation], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idx = quotaOwners.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const { name, surname, quota, email, phone_prefix, phone } = req.body;
  quotaOwners[idx] = { ...quotaOwners[idx], name, surname, quota, email, phone_prefix, phone };
  res.json(quotaOwners[idx]);
});

module.exports = router;
