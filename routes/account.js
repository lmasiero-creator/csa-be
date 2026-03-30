const express = require('express');
const multer  = require('multer');
const { param } = require('express-validator');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');
const { accounts, quotaOwners, nextId } = require('../mock/data');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/account/:id
router.get('/:id', [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  if (!pool) {
    const owner = quotaOwners.find((o) => o.id === req.params.id);
    if (!owner) return res.status(404).json({ message: 'Quota owner not found' });
    const account = accounts.find((a) => a.quota_owner_id === req.params.id);
    if (!account) return res.status(404).json({ message: 'No profile saved yet' });
    return res.json({ ...owner, ...account });
  }
  try {
    const { rows: ownerRows } = await pool.query('SELECT * FROM quota_owners WHERE id = $1', [req.params.id]);
    if (!ownerRows.length) return res.status(404).json({ message: 'Quota owner not found' });
    const { rows: accRows } = await pool.query('SELECT * FROM accounts WHERE quota_owner_id = $1', [req.params.id]);
    if (!accRows.length) return res.status(404).json({ message: 'No profile saved yet' });
    res.json({ ...ownerRows[0], ...accRows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/account/:id  (multipart/form-data: photo? + description)
router.post('/:id', upload.single('photo'), [param('id').isInt({ min: 1 }).toInt()], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Invalid id' });
  const ownerId = req.params.id;

  let photoData = undefined;
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    if (base64.length > 1024 * 1024) {
      return res.status(413).json({ message: 'Immagine troppo grande (max 1 MB dopo compressione).' });
    }
    photoData = `data:${req.file.mimetype};base64,${base64}`;
  }

  if (!pool) {
    const owner = quotaOwners.find((o) => o.id === ownerId);
    if (!owner) return res.status(404).json({ message: 'Quota owner not found' });
    const idx = accounts.findIndex((a) => a.quota_owner_id === ownerId);
    if (idx === -1) {
      accounts.push({ id: nextId(accounts), quota_owner_id: ownerId, description: req.body.description ?? '', photo_data: photoData ?? null });
    } else {
      accounts[idx].description = req.body.description ?? accounts[idx].description;
      if (photoData !== undefined) accounts[idx].photo_data = photoData;
    }
    const saved = accounts.find((a) => a.quota_owner_id === ownerId);
    return res.json({ ...owner, ...saved });
  }

  try {
    const { rows: ownerRows } = await pool.query('SELECT * FROM quota_owners WHERE id = $1', [ownerId]);
    if (!ownerRows.length) return res.status(404).json({ message: 'Quota owner not found' });

    const setClauses = photoData !== undefined
      ? 'description = $2, photo_data = $3, updated_at = NOW()'
      : 'description = $2, updated_at = NOW()';
    const values = photoData !== undefined
      ? [ownerId, req.body.description ?? '', photoData]
      : [ownerId, req.body.description ?? ''];

    const { rows } = await pool.query(
      `INSERT INTO accounts (quota_owner_id, description, photo_data)
         VALUES ($1, $2, ${photoData !== undefined ? '$3' : 'NULL'})
       ON CONFLICT (quota_owner_id) DO UPDATE SET ${setClauses}
       RETURNING *`,
      values
    );
    res.json({ ...ownerRows[0], ...rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
