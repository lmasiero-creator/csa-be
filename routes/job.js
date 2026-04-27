const express = require('express');
const { runDailyReport } = require('../services/daily-report');

const router = express.Router();

/**
 * POST /api/job/run
 * Manual trigger for the daily report job, protected by JOB_SECRET.
 * Useful for testing without waiting for the cron schedule.
 *
 * Header: Authorization: Bearer <JOB_SECRET>
 */
router.post('/run', async (req, res) => {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!process.env.JOB_SECRET || token !== process.env.JOB_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  console.log('[job] Manual trigger at', new Date().toISOString());

  try {
    const results = await runDailyReport();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      emails: results,
      message: results.length
        ? `${results.length} email elaborata/e.`
        : 'Nessun evento corrispondente per oggi.',
    });
  } catch (err) {
    console.error('[job] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
