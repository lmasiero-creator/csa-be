const express = require('express');
const { runDailyReport } = require('../services/daily-report');

const router = express.Router();

/** Return current time formatted as an ISO-8601 string in Europe/Rome. */
function nowRome() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Europe/Rome',
    hour12: false,
  }).replace(' ', 'T');
}

/** Shared auth check — returns true if the request is authorised. */
function isAuthorized(req) {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return !!(process.env.JOB_SECRET && token === process.env.JOB_SECRET);
}

/**
 * POST /api/job/run
 * Manual trigger for the daily report job, protected by JOB_SECRET.
 * Header: Authorization: Bearer <JOB_SECRET>
 */
router.post('/run', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ message: 'Unauthorized' });

  console.log('[job] Manual trigger at', nowRome());

  try {
    const results = await runDailyReport();
    res.json({
      success: true,
      timestamp: nowRome(),
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

/**
 * POST /api/job/dry-run
 * Same as /run but no emails are sent. Returns the full report including the
 * generated HTML body for each email so the result can be inspected.
 * Header: Authorization: Bearer <JOB_SECRET>
 */
router.post('/dry-run', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ message: 'Unauthorized' });

  console.log('[job] Dry-run trigger at', nowRome());

  try {
    const results = await runDailyReport({ dryRun: true });
    res.json({
      success: true,
      dryRun: true,
      timestamp: nowRome(),
      emails: results,
      message: results.length
        ? `${results.length} email generata/e (dry-run, nessuna inviata).`
        : 'Nessun evento corrispondente per oggi.',
    });
  } catch (err) {
    console.error('[job] Dry-run error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
