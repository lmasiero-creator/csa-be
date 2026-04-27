/**
 * services/daily-report.js
 *
 * Core logic for the CSA daily job.
 *
 * Every time it runs it checks two conditions:
 *   1. Delivery events whose deadline falls on TODAY → collect delivery changes
 *      and send one email per event.
 *   2. Involvement events scheduled for TOMORROW → collect subscriptions
 *      and send one email per event.
 *
 * Emails are sent to the recipients list managed by the administrator.
 * If SMTP is not configured, the job logs what would have been sent and
 * returns results with { sent: false }.
 */

const pool = require('../db/pool');
const { sendMail } = require('./mailer');
const {
  deliveryChanges,
  events,
  involvementSubscriptions,
  quotaOwners,
  recipients,
} = require('../mock/data');

// ── Labels ────────────────────────────────────────────────────────────────────

const DELIVERY_POINT_LABELS = {
  prt: 'Picchetto (Portello)',
  arc: 'Pedro (Arcella)',
  mrn: 'Mirano',
};

const QUOTA_LABELS = {
  quota_intera: 'quota intera',
  mezza_quota: 'mezza quota',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function formatDate(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dpLabel(key) {
  return DELIVERY_POINT_LABELS[key] || key || '—';
}

function quotaLabel(key) {
  return QUOTA_LABELS[key] || key || '—';
}

// ── Email builders ────────────────────────────────────────────────────────────

function buildDeliveryHtml(eventDate, deliveryPoint, changes) {
  let changesSection;
  if (!changes.length) {
    changesSection = `
  <p style="color:#146c43;font-weight:bold;">Nessuna variazione comunicata per questa distribuzione.</p>`;
  } else {
    const rows = changes
      .map(
        (c) => `
      <tr>
        <td style="padding:6px 10px;">${c.name} ${c.surname}</td>
        <td style="padding:6px 10px;">${quotaLabel(c.quota)}</td>
        <td style="padding:6px 10px;">${dpLabel(c.new_delivery_point)}</td>
        <td style="padding:6px 10px;">${c.description || '—'}</td>
      </tr>`
      )
      .join('');
    changesSection = `
  <table border="1" cellpadding="0" cellspacing="0"
         style="border-collapse:collapse;width:100%;font-size:14px;">
    <thead style="background:#d8f3dc;">
      <tr>
        <th style="padding:8px 10px;text-align:left;">Socio</th>
        <th style="padding:8px 10px;text-align:left;">Quota</th>
        <th style="padding:8px 10px;text-align:left;">Nuovo punto</th>
        <th style="padding:8px 10px;text-align:left;">Note</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
  }

  return `
<!DOCTYPE html>
<html lang="it">
<body style="font-family:sans-serif;font-size:15px;color:#333;max-width:700px;margin:0 auto;">
  <h2 style="color:#2d6a4f;">Variazioni di consegna</h2>
  <p>Distribuzione del <strong>${formatDate(eventDate)}</strong> —
     punto <strong>${dpLabel(deliveryPoint)}</strong>.</p>
  ${changesSection}
  <p style="color:#aaa;font-size:12px;margin-top:32px;">
    Messaggio automatico CSA — non rispondere a questa email.
  </p>
</body>
</html>`;
}

function buildInvolvementHtml(eventDate, eventDescription, subscriptions) {
  const descPart = eventDescription
    ? ` — <em>${eventDescription}</em>`
    : '';

  let participantsSection;
  if (!subscriptions.length) {
    participantsSection = `
  <p style="color:#b02a37;font-weight:bold;">Nessun socio si è ancora iscritto a questa attività.</p>`;
  } else {
    const rows = subscriptions
      .map((s) => {
        const parts = Array.isArray(s.participants)
          ? s.participants.join(', ')
          : s.participants || '—';
        return `
      <tr>
        <td style="padding:6px 10px;">${s.name} ${s.surname}</td>
        <td style="padding:6px 10px;">${parts}</td>
        <td style="padding:6px 10px;">${s.duration || '—'}</td>
        <td style="padding:6px 10px;">${s.pranzo || '—'}</td>
        <td style="padding:6px 10px;">${s.mezzo_trasporto || '—'}</td>
      </tr>`;
      })
      .join('');
    participantsSection = `
  <p>Partecipanti iscritti:</p>
  <table border="1" cellpadding="0" cellspacing="0"
         style="border-collapse:collapse;width:100%;font-size:14px;">
    <thead style="background:#d8f3dc;">
      <tr>
        <th style="padding:8px 10px;text-align:left;">Referente</th>
        <th style="padding:8px 10px;text-align:left;">Partecipanti</th>
        <th style="padding:8px 10px;text-align:left;">Durata</th>
        <th style="padding:8px 10px;text-align:left;">Pranzo</th>
        <th style="padding:8px 10px;text-align:left;">Mezzo di trasporto</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
  }

  return `
<!DOCTYPE html>
<html lang="it">
<body style="font-family:sans-serif;font-size:15px;color:#333;max-width:700px;margin:0 auto;">
  <h2 style="color:#2d6a4f;">Attività in campo</h2>
  <p>Domani, <strong>${formatDate(eventDate)}</strong>${descPart}.</p>
  ${participantsSection}
  <p style="color:#aaa;font-size:12px;margin-top:32px;">
    Messaggio automatico CSA — non rispondere a questa email.
  </p>
</body>
</html>`;
}

// ── Main job function ─────────────────────────────────────────────────────────

/**
 * Run the daily report job.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun=false]  When true, skip sending emails and
 *                                        include the generated HTML in the result.
 * @returns {Promise<Array<{type: string, eventDate: string, subject: string,
 *                          sent: boolean, recipients: number, html?: string}>>}
 */
async function runDailyReport({ dryRun = false } = {}) {
  const romeNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome', hour12: false }).replace(' ', 'T');
  console.log('[job] Daily report started at', romeNow);

  // Derive today/tomorrow from the Rome-local date string (YYYY-MM-DDTHH:MM:SS)
  const todayStr = romeNow.slice(0, 10);                          // YYYY-MM-DD Rome
  // Build tomorrow by incrementing the day in UTC then re-reading in Rome tz
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const tomorrowUtc = new Date(Date.UTC(ty, tm - 1, td + 1));
  const tomorrowStr = tomorrowUtc.toLocaleString('sv-SE', { timeZone: 'Europe/Rome', hour12: false }).slice(0, 10);

  let deliveryEmails = [];   // [{ eventDate, deliveryPoint, changes[] }]
  let involvementEmails = []; // [{ eventDate, description, subscriptions[] }]
  let recipientList = [];

  // ── Data collection ────────────────────────────────────────────────────────

  if (pool) {
    // Delivery events whose deadline is today
    const { rows: delRows } = await pool.query(`
      SELECT
        e.id          AS event_id,
        e.date::text  AS event_date,
        e.delivery_point,
        dc.id         AS change_id,
        dc.new_delivery_point,
        dc.description,
        qo.name,
        qo.surname,
        qo.quota
      FROM events e
      LEFT JOIN delivery_changes dc ON dc.event_id = e.id
      LEFT JOIN quota_owners qo     ON qo.id = dc.quota_owner_id
      WHERE e.type = 'del'
        AND e.deadline::date = CURRENT_DATE
      ORDER BY e.date, qo.surname, qo.name
    `);

    // Group by event_id — seed every event, then append its changes
    const delByEvent = {};
    // First pass: ensure every event has an entry (handles zero-change events via LEFT JOIN nulls)
    for (const row of delRows) {
      if (!delByEvent[row.event_id]) {
        delByEvent[row.event_id] = {
          eventDate: row.event_date,
          deliveryPoint: row.delivery_point,
          changes: [],
        };
      }
      if (row.change_id !== null) {
        delByEvent[row.event_id].changes.push(row);
      }
    }
    deliveryEmails = Object.values(delByEvent);

    // Involvement events scheduled for tomorrow (LEFT JOIN so zero-participant events are included)
    const { rows: invRows } = await pool.query(`
      SELECT
        e.id               AS event_id,
        e.date::text       AS event_date,
        e.description      AS event_description,
        inv.id             AS sub_id,
        inv.participants,
        inv.duration,
        inv.pranzo,
        inv.mezzo_trasporto,
        qo.name,
        qo.surname
      FROM events e
      LEFT JOIN involvement_subscriptions inv ON inv.event_id = e.id
      LEFT JOIN quota_owners qo               ON qo.id = inv.quota_owner_id
      WHERE e.type = 'inv'
        AND e.date::date = CURRENT_DATE + INTERVAL '1 day'
      ORDER BY qo.surname, qo.name
    `);

    const invByEvent = {};
    for (const row of invRows) {
      if (!invByEvent[row.event_id]) {
        invByEvent[row.event_id] = {
          eventDate: row.event_date,
          description: row.event_description,
          subscriptions: [],
        };
      }
      if (row.sub_id !== null) {
        invByEvent[row.event_id].subscriptions.push(row);
      }
    }
    involvementEmails = Object.values(invByEvent);

    const { rows: recs } = await pool.query('SELECT * FROM recipients ORDER BY id');
    recipientList = recs;
  } else {
    // ── Mock mode ────────────────────────────────────────────────────────────

    // Delivery events whose deadline === today
    const delEvents = events.filter(
      (e) => e.type === 'del' && e.deadline === todayStr
    );
    for (const ev of delEvents) {
      const changes = deliveryChanges
        .filter((dc) => dc.event_id === ev.id)
        .map((dc) => {
          const owner = quotaOwners.find((o) => o.id === dc.quota_owner_id) || {};
          return { ...dc, name: owner.name, surname: owner.surname, quota: owner.quota };
        });
      // Always include the event — the email body signals when no changes were submitted
      deliveryEmails.push({
        eventDate: ev.date,
        deliveryPoint: ev.delivery_point,
        changes,
      });
    }

    // Involvement events scheduled for tomorrow
    const invEvents = events.filter(
      (e) => e.type === 'inv' && e.date === tomorrowStr
    );
    for (const ev of invEvents) {
      const subscriptions = involvementSubscriptions
        .filter((s) => s.event_id === ev.id)
        .map((s) => {
          const owner = quotaOwners.find((o) => o.id === s.quota_owner_id) || {};
          return { ...s, name: owner.name, surname: owner.surname };
        });
      // Always include the event — the email body signals when no one has signed up
      involvementEmails.push({
        eventDate: ev.date,
        description: ev.description,
        subscriptions,
      });
    }

    recipientList = recipients;
  }

  // ── Send emails ────────────────────────────────────────────────────────────

  const toAddresses = recipientList.map((r) => r.email).filter(Boolean);
  const smtpReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const canSend = !dryRun && smtpReady && toAddresses.length > 0;

  const results = [];

  for (const { eventDate, deliveryPoint, changes } of deliveryEmails) {
    const subject = `distribuzione del ${formatDate(eventDate)} - ${dpLabel(deliveryPoint)}`;
    const html = buildDeliveryHtml(eventDate, deliveryPoint, changes);

    if (dryRun) {
      console.log(`[job] DRY-RUN delivery email skipped: ${subject}`);
      results.push({ type: 'delivery', eventDate, subject, sent: false, dryRun: true, recipients: toAddresses.length, html });
    } else if (canSend) {
      try {
        const info = await sendMail({ to: toAddresses, subject, html });
        console.log(`[job] Delivery email sent <${info.messageId}> → ${toAddresses.join(', ')}`);
        results.push({ type: 'delivery', eventDate, subject, sent: true, recipients: toAddresses.length });
      } catch (err) {
        console.error(`[job] Failed to send delivery email for ${eventDate}:`, err.message);
        results.push({ type: 'delivery', eventDate, subject, sent: false, error: err.message, recipients: toAddresses.length });
      }
    } else {
      console.log(`[job] Delivery email NOT sent (SMTP unconfigured or no recipients): ${subject}`);
      console.log(`[job] Would send to: ${toAddresses.join(', ') || 'nobody'}`);
      results.push({ type: 'delivery', eventDate, subject, sent: false, recipients: toAddresses.length });
    }
  }

  for (const { eventDate, description, subscriptions } of involvementEmails) {
    const subject = `attività in campo del ${formatDate(eventDate)}`;
    const html = buildInvolvementHtml(eventDate, description, subscriptions);

    if (dryRun) {
      console.log(`[job] DRY-RUN involvement email skipped: ${subject}`);
      results.push({ type: 'involvement', eventDate, subject, sent: false, dryRun: true, recipients: toAddresses.length, html });
    } else if (canSend) {
      try {
        const info = await sendMail({ to: toAddresses, subject, html });
        console.log(`[job] Involvement email sent <${info.messageId}> → ${toAddresses.join(', ')}`);
        results.push({ type: 'involvement', eventDate, subject, sent: true, recipients: toAddresses.length });
      } catch (err) {
        console.error(`[job] Failed to send involvement email for ${eventDate}:`, err.message);
        results.push({ type: 'involvement', eventDate, subject, sent: false, error: err.message, recipients: toAddresses.length });
      }
    } else {
      console.log(`[job] Involvement email NOT sent (SMTP unconfigured or no recipients): ${subject}`);
      console.log(`[job] Would send to: ${toAddresses.join(', ') || 'nobody'}`);
      results.push({ type: 'involvement', eventDate, subject, sent: false, recipients: toAddresses.length });
    }
  }

  if (!results.length) {
    console.log('[job] Nothing to report today (no matching events).');
  }

  return results;
}

module.exports = { runDailyReport };
