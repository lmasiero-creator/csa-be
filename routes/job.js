const express = require('express');
const router  = express.Router();

// POST /api/job/run — protected by shared secret
router.post('/run', (req, res) => {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!process.env.JOB_SECRET || token !== process.env.JOB_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // In mock mode: simulate the job without actually sending emails or WhatsApp messages.
  console.log('[job] Mock daily report job triggered at', new Date().toISOString());
  res.json({
    success: true,
    message: 'Job simulato. Nessun report inviato (modalità mock — database non connesso).',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
