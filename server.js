require('dotenv').config();
const cron = require('node-cron');
const app  = require('./app');
const { runDailyReport } = require('./services/daily-report');

const PORT = process.env.PORT || 3000;
const mode = process.env.DATABASE_URL ? 'db' : 'mock';

// ── Cron scheduling ───────────────────────────────────────────────────────────
// JOB_TIME format: HH:MM (24-hour). Default 22:00.
function buildCronExpression(timeStr) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeStr || '');
  if (!match) {
    console.warn(`[job] Invalid JOB_TIME "${timeStr}", falling back to 22:00.`);
    return '0 22 * * *';
  }
  return `${parseInt(match[2], 10)} ${parseInt(match[1], 10)} * * *`;
}

const cronExpr = buildCronExpression(process.env.JOB_TIME);
console.log(`[job] Scheduled daily report with cron expression: "${cronExpr}"`);

cron.schedule(cronExpr, async () => {
  try {
    await runDailyReport();
  } catch (err) {
    console.error('[job] Unhandled error in daily report:', err.message);
  }
}, { timezone: 'Europe/Rome' });

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`CSA backend (${mode}) running on port ${PORT}`);
  if (mode === 'mock') {
    console.log('DATABASE_URL not set — using in-memory mock data.');
  } else {
    console.log('DATABASE_URL detected — using PostgreSQL.');
  }
});
