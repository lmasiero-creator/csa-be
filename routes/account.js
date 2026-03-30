const express = require('express');
const multer  = require('multer');
const { param } = require('express-validator');
const { validationResult } = require('express-validator');
const { accounts, quotaOwners, nextId } = require('../mock/data');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/account/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });

  const owner = quotaOwners.find((o) => o.id === req.params.id);
  if (!owner) return res.status(404).json({ message: 'Quota owner not found' });

  const account = accounts.find((a) => a.quota_owner_id === req.params.id);
  if (!account) return res.status(404).json({ message: 'No profile saved yet' });

  res.json({ ...owner, ...account });
});

// POST /api/account/:id  (multipart/form-data: photo? + description)
router.post('/:id', upload.single('photo'), [param('id').isInt({ min: 1 }).toInt()], (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });

  const ownerId = req.params.id;
  const owner   = quotaOwners.find((o) => o.id === ownerId);
  if (!owner) return res.status(404).json({ message: 'Quota owner not found' });

  let photoData = undefined;
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    if (base64.length > 1024 * 1024) {
      return res.status(413).json({ message: 'Immagine troppo grande (max 1 MB dopo compressione).' });
    }
    photoData = `data:${req.file.mimetype};base64,${base64}`;
  }

  const idx = accounts.findIndex((a) => a.quota_owner_id === ownerId);
  if (idx === -1) {
    accounts.push({
      id: nextId(accounts),
      quota_owner_id: ownerId,
      description: req.body.description ?? '',
      photo_data: photoData ?? null,
    });
  } else {
    accounts[idx].description = req.body.description ?? accounts[idx].description;
    if (photoData !== undefined) accounts[idx].photo_data = photoData;
  }

  const saved = accounts.find((a) => a.quota_owner_id === ownerId);
  res.json({ ...owner, ...saved });
});

module.exports = router;
