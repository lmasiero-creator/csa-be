const express = require('express');
const pool    = require('../db/pool');
const { deliveryChanges, events, recipients } = require('../mock/data');

const router = express.Router();

// POST /api/job/run — protected by shared secret
router.post('/run', async (req, res) => {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!process.env.JOB_SECRET || token !== process.env.JOB_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  console.log('[job] Daily report job triggered at', new Date().toISOString());

  try {
    let pendingChanges, recipientList;

    if (pool) {
      // Find delivery events whose deadline is today or earlier and that have changes
      const { rows: changes } = await pool.query(`
        SELECT dc.*, e.date AS event_date, e.delivery_point AS original_point,
               qo.name, qo.surname
        FROM delivery_changes dc
        JOIN events e ON e.id = dc.event_id
        JOIN quota_owners qo ON qo.id = dc.quota_owner_id
        WHERE e.deadline <= CURRENT_DATE
        ORDER BY e.date
      `);
      pendingChanges = changes;

      const { rows: recs } = await pool.query('SELECT * FROM recipients ORDER BY id');
      recipientList = recs;
    } else {
      // Mock fallback
      const today = new Date().toDateString();
      pendingChanges = deliveryChanges.filter((dc) => {
        const ev = events.find((e) => e.id === dc.event_id);
        return ev?.deadline && new Date(ev.deadline) <= new Date(today);
      });
      recipientList = recipients;
    }

    if (!pendingChanges.length) {
      return res.json({
        success: true,
        message: 'Nessuna modifica da riportare.',
        changes: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // TODO: send email and WhatsApp via external APIs
    // For now: log the report and return it in the response
    console.log(`[job] ${pendingChanges.length} cambiamenti trovati, ${recipientList.length} destinatari.`);
    console.log('[job] Report:', JSON.stringify(pendingChanges, null, 2));

    res.json({
      success: true,
      message: `Report generato. ${pendingChanges.length} cambiamenti, ${recipientList.length} destinatari. Invio email/WhatsApp non ancora implementato.`,
      changes: pendingChanges.length,
      recipients: recipientList.length,
      report: pendingChanges,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[job] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
