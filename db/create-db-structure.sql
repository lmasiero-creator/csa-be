-- =============================================================================
-- CSA App — Supabase PostgreSQL schema
-- Run this script once in the Supabase SQL Editor:
--   https://mqcsqktqkdliwziqheje.supabase.co  →  SQL Editor  →  New query
--
-- Safe to re-run: DROP IF EXISTS precedes every CREATE.
-- =============================================================================

-- ── Drop existing objects (reverse dependency order) ─────────────────────────

DROP TABLE IF EXISTS delivery_changes         CASCADE;
DROP TABLE IF EXISTS involvement_subscriptions CASCADE;
DROP TABLE IF EXISTS accounts                 CASCADE;
DROP TABLE IF EXISTS events                   CASCADE;
DROP TABLE IF EXISTS recipients               CASCADE;
DROP TABLE IF EXISTS quota_owners             CASCADE;
DROP TABLE IF EXISTS job_config               CASCADE;
DROP TABLE IF EXISTS google_config            CASCADE;

-- ── quota_owners ──────────────────────────────────────────────────────────────
-- One row per CSA member (a.k.a. "socio").

CREATE TABLE quota_owners (
  id           SERIAL       PRIMARY KEY,
  name         VARCHAR(256) NOT NULL,
  surname      VARCHAR(256) NOT NULL,
  quota        VARCHAR(20)  NOT NULL
                 CHECK (quota IN ('quota_intera', 'mezza_quota')),
  email        VARCHAR(320) NOT NULL,
  phone_prefix VARCHAR(10)  NOT NULL DEFAULT '+39',
  phone        VARCHAR(30),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── accounts ──────────────────────────────────────────────────────────────────
-- Optional profile data for a quota owner (description + avatar photo).
-- photo_data stores the full Base64 data-URI, e.g. "data:image/jpeg;base64,..."
-- Max recommended size: 1 MB after encoding (~750 KB raw image).

CREATE TABLE accounts (
  id             SERIAL      PRIMARY KEY,
  quota_owner_id INTEGER     NOT NULL UNIQUE
                   REFERENCES quota_owners(id) ON DELETE CASCADE,
  description    TEXT,
  photo_data     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically refresh updated_at on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── events ────────────────────────────────────────────────────────────────────
-- Calendar events created by the admins.
-- type:           inv = involvement activity, del = delivery, evt = generic event
-- delivery_point: only set when type = 'del'
-- deadline:       only set when type = 'del' — last date users can submit changes
-- google_event_id: populated after the Google Calendar API call

CREATE TABLE events (
  id              SERIAL      PRIMARY KEY,
  date            TIMESTAMPTZ NOT NULL,
  type            VARCHAR(3)  NOT NULL CHECK (type IN ('inv', 'del', 'evt')),
  description     TEXT,
  delivery_point  VARCHAR(3)  CHECK (delivery_point IN ('prt', 'arc', 'mrn')),
  deadline        TIMESTAMPTZ,
  google_event_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT delivery_fields_required
    CHECK (
      type <> 'del'
      OR (delivery_point IS NOT NULL AND deadline IS NOT NULL)
    )
);

CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_type ON events(type);

-- ── involvement_subscriptions ─────────────────────────────────────────────────
-- A quota owner subscribes to an involvement (type='inv') event.
-- participants: JSONB array of extra participant names (strings beyond the owner).

CREATE TABLE involvement_subscriptions (
  id             SERIAL      PRIMARY KEY,
  event_id       INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quota_owner_id INTEGER     NOT NULL REFERENCES quota_owners(id) ON DELETE CASCADE,
  participants   JSONB       NOT NULL DEFAULT '[]',
  duration       VARCHAR(512),
  pranzo         VARCHAR(512),
  mezzo_trasporto VARCHAR(512),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_subs_event_id ON involvement_subscriptions(event_id);
CREATE INDEX idx_inv_subs_owner_id ON involvement_subscriptions(quota_owner_id);

-- ── delivery_changes ──────────────────────────────────────────────────────────
-- A quota owner requests a change to their delivery (type='del') event.
-- new_delivery_point: the requested alternative pick-up location.

CREATE TABLE delivery_changes (
  id                 SERIAL      PRIMARY KEY,
  event_id           INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quota_owner_id     INTEGER     NOT NULL REFERENCES quota_owners(id) ON DELETE CASCADE,
  new_delivery_point VARCHAR(3)  NOT NULL CHECK (new_delivery_point IN ('prt', 'arc', 'mrn')),
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_del_changes_event_id ON delivery_changes(event_id);
CREATE INDEX idx_del_changes_owner_id ON delivery_changes(quota_owner_id);

-- ── recipients ────────────────────────────────────────────────────────────────
-- Email / phone contacts that receive the periodic delivery-change report.

CREATE TABLE recipients (
  id           SERIAL       PRIMARY KEY,
  email        VARCHAR(320) NOT NULL,
  phone_prefix VARCHAR(10)  NOT NULL DEFAULT '+39',
  phone        VARCHAR(30),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── job_config ────────────────────────────────────────────────────────────────
-- Single-row configuration for the periodic delivery-report job.
-- Seeded once by developers; never modified through the UI.
-- cron_expression: standard 5-field cron, e.g. '0 7 * * 1' = every Monday at 07:00 UTC

CREATE TABLE job_config (
  id              SERIAL       PRIMARY KEY,
  cron_expression VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── google_config ─────────────────────────────────────────────────────────────
-- Google Calendar integration credentials.
-- service_account_json: full JSON of the Google service-account key (keep secret).
-- calendar_id: the Google Calendar ID to publish events to.
-- Seeded once by developers; never exposed through the API.

CREATE TABLE google_config (
  id                   SERIAL PRIMARY KEY,
  service_account_json TEXT   NOT NULL,
  calendar_id          TEXT   NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SEED: initial data (mirrors mock/data.js for parity with local dev)
-- =============================================================================

-- ── quota_owners ─────────────────────────────────────────────────────────────

INSERT INTO quota_owners (name, surname, quota, email, phone_prefix, phone) VALUES
  ('Marco',  'Rossi',   'quota_intera', 'marco.rossi@example.com',   '+39', '3331234567'),
  ('Giulia', 'Bianchi', 'mezza_quota',  'giulia.bianchi@example.com', '+39', '3339876543'),
  ('Luigi',  'Ferrari', 'quota_intera', 'luigi.ferrari@example.com',  '+39', '3355551234'),
  ('Sofia',  'Conti',   'mezza_quota',  'sofia.conti@example.com',    '+39', '3371112233');

-- ── accounts ─────────────────────────────────────────────────────────────────

INSERT INTO accounts (quota_owner_id, description, photo_data) VALUES
  (1, 'Appassionato di agricoltura biologica.', NULL);

-- ── events ───────────────────────────────────────────────────────────────────

INSERT INTO events (date, type, description, delivery_point, deadline) VALUES
  ('2026-04-15', 'inv', 'trapianti', NULL,  NULL),
  ('2026-04-12', 'inv', 'sistemazione serre', NULL,  NULL),
  ('2026-03-29', 'evt', 'Asta CSA', NULL,  NULL);

-- ── Weekly Wednesday deliveries (Picchetto) — May 13 → Dec 30, 2026 ──────────
-- Dates are stored in UTC. Italy is CEST (UTC+2) until 25 Oct, CET (UTC+1) after.
-- Event time: 18:00 Rome → 16:00 UTC (CEST) / 17:00 UTC (CET)
-- Deadline:   Monday 22:00 Rome → 20:00 UTC (CEST) / 21:00 UTC (CET)

INSERT INTO events (date, type, description, delivery_point, deadline, google_event_id, created_at) VALUES
-- CEST (UTC+2): May 13 → Oct 21
  ('2026-05-13 16:00:00+00', 'del', 'picchetto', 'prt', '2026-05-11 20:00:00+00', NULL, NOW()),
  ('2026-05-20 16:00:00+00', 'del', 'picchetto', 'prt', '2026-05-18 20:00:00+00', NULL, NOW()),
  ('2026-05-27 16:00:00+00', 'del', 'picchetto', 'prt', '2026-05-25 20:00:00+00', NULL, NOW()),
  ('2026-06-03 16:00:00+00', 'del', 'picchetto', 'prt', '2026-06-01 20:00:00+00', NULL, NOW()),
  ('2026-06-10 16:00:00+00', 'del', 'picchetto', 'prt', '2026-06-08 20:00:00+00', NULL, NOW()),
  ('2026-06-17 16:00:00+00', 'del', 'picchetto', 'prt', '2026-06-15 20:00:00+00', NULL, NOW()),
  ('2026-06-24 16:00:00+00', 'del', 'picchetto', 'prt', '2026-06-22 20:00:00+00', NULL, NOW()),
  ('2026-07-01 16:00:00+00', 'del', 'picchetto', 'prt', '2026-06-29 20:00:00+00', NULL, NOW()),
  ('2026-07-08 16:00:00+00', 'del', 'picchetto', 'prt', '2026-07-06 20:00:00+00', NULL, NOW()),
  ('2026-07-15 16:00:00+00', 'del', 'picchetto', 'prt', '2026-07-13 20:00:00+00', NULL, NOW()),
  ('2026-07-22 16:00:00+00', 'del', 'picchetto', 'prt', '2026-07-20 20:00:00+00', NULL, NOW()),
  ('2026-07-29 16:00:00+00', 'del', 'picchetto', 'prt', '2026-07-27 20:00:00+00', NULL, NOW()),
  ('2026-08-05 16:00:00+00', 'del', 'picchetto', 'prt', '2026-08-03 20:00:00+00', NULL, NOW()),
  ('2026-08-12 16:00:00+00', 'del', 'picchetto', 'prt', '2026-08-10 20:00:00+00', NULL, NOW()),
  ('2026-08-19 16:00:00+00', 'del', 'picchetto', 'prt', '2026-08-17 20:00:00+00', NULL, NOW()),
  ('2026-08-26 16:00:00+00', 'del', 'picchetto', 'prt', '2026-08-24 20:00:00+00', NULL, NOW()),
  ('2026-09-02 16:00:00+00', 'del', 'picchetto', 'prt', '2026-08-31 20:00:00+00', NULL, NOW()),
  ('2026-09-09 16:00:00+00', 'del', 'picchetto', 'prt', '2026-09-07 20:00:00+00', NULL, NOW()),
  ('2026-09-16 16:00:00+00', 'del', 'picchetto', 'prt', '2026-09-14 20:00:00+00', NULL, NOW()),
  ('2026-09-23 16:00:00+00', 'del', 'picchetto', 'prt', '2026-09-21 20:00:00+00', NULL, NOW()),
  ('2026-09-30 16:00:00+00', 'del', 'picchetto', 'prt', '2026-09-28 20:00:00+00', NULL, NOW()),
  ('2026-10-07 16:00:00+00', 'del', 'picchetto', 'prt', '2026-10-05 20:00:00+00', NULL, NOW()),
  ('2026-10-14 16:00:00+00', 'del', 'picchetto', 'prt', '2026-10-12 20:00:00+00', NULL, NOW()),
  ('2026-10-21 16:00:00+00', 'del', 'picchetto', 'prt', '2026-10-19 20:00:00+00', NULL, NOW()),
-- CET (UTC+1): Oct 28 → Dec 30 (clocks fall back on Oct 25)
  ('2026-10-28 17:00:00+00', 'del', 'picchetto', 'prt', '2026-10-26 21:00:00+00', NULL, NOW()),
  ('2026-11-04 17:00:00+00', 'del', 'picchetto', 'prt', '2026-11-02 21:00:00+00', NULL, NOW()),
  ('2026-11-11 17:00:00+00', 'del', 'picchetto', 'prt', '2026-11-09 21:00:00+00', NULL, NOW()),
  ('2026-11-18 17:00:00+00', 'del', 'picchetto', 'prt', '2026-11-16 21:00:00+00', NULL, NOW()),
  ('2026-11-25 17:00:00+00', 'del', 'picchetto', 'prt', '2026-11-23 21:00:00+00', NULL, NOW()),
  ('2026-12-02 17:00:00+00', 'del', 'picchetto', 'prt', '2026-11-30 21:00:00+00', NULL, NOW()),
  ('2026-12-09 17:00:00+00', 'del', 'picchetto', 'prt', '2026-12-07 21:00:00+00', NULL, NOW()),
  ('2026-12-16 17:00:00+00', 'del', 'picchetto', 'prt', '2026-12-14 21:00:00+00', NULL, NOW()),
  ('2026-12-23 17:00:00+00', 'del', 'picchetto', 'prt', '2026-12-21 21:00:00+00', NULL, NOW()),
  ('2026-12-30 17:00:00+00', 'del', 'picchetto', 'prt', '2026-12-28 21:00:00+00', NULL, NOW());

-- ── Weekly Friday deliveries (Pedro/Arcella) — May 8, 2026 → Feb 12, 2027 ──
-- Event time: 18:00 Rome → 16:00 UTC (CEST) / 17:00 UTC (CET)
-- Deadline:   Wednesday 22:00 Rome (2 days before) → 20:00 UTC (CEST) / 21:00 UTC (CET)

INSERT INTO events (date, type, description, delivery_point, deadline, google_event_id, created_at) VALUES
-- CEST (UTC+2): May 8 → Oct 23
  ('2026-05-08 16:00:00+00', 'del', 'pedro', 'arc', '2026-05-06 20:00:00+00', NULL, NOW()),
  ('2026-05-15 16:00:00+00', 'del', 'pedro', 'arc', '2026-05-13 20:00:00+00', NULL, NOW()),
  ('2026-05-22 16:00:00+00', 'del', 'pedro', 'arc', '2026-05-20 20:00:00+00', NULL, NOW()),
  ('2026-05-29 16:00:00+00', 'del', 'pedro', 'arc', '2026-05-27 20:00:00+00', NULL, NOW()),
  ('2026-06-05 16:00:00+00', 'del', 'pedro', 'arc', '2026-06-03 20:00:00+00', NULL, NOW()),
  ('2026-06-12 16:00:00+00', 'del', 'pedro', 'arc', '2026-06-10 20:00:00+00', NULL, NOW()),
  ('2026-06-19 16:00:00+00', 'del', 'pedro', 'arc', '2026-06-17 20:00:00+00', NULL, NOW()),
  ('2026-06-26 16:00:00+00', 'del', 'pedro', 'arc', '2026-06-24 20:00:00+00', NULL, NOW()),
  ('2026-07-03 16:00:00+00', 'del', 'pedro', 'arc', '2026-07-01 20:00:00+00', NULL, NOW()),
  ('2026-07-10 16:00:00+00', 'del', 'pedro', 'arc', '2026-07-08 20:00:00+00', NULL, NOW()),
  ('2026-07-17 16:00:00+00', 'del', 'pedro', 'arc', '2026-07-15 20:00:00+00', NULL, NOW()),
  ('2026-07-24 16:00:00+00', 'del', 'pedro', 'arc', '2026-07-22 20:00:00+00', NULL, NOW()),
  ('2026-07-31 16:00:00+00', 'del', 'pedro', 'arc', '2026-07-29 20:00:00+00', NULL, NOW()),
  ('2026-08-07 16:00:00+00', 'del', 'pedro', 'arc', '2026-08-05 20:00:00+00', NULL, NOW()),
  ('2026-08-14 16:00:00+00', 'del', 'pedro', 'arc', '2026-08-12 20:00:00+00', NULL, NOW()),
  ('2026-08-21 16:00:00+00', 'del', 'pedro', 'arc', '2026-08-19 20:00:00+00', NULL, NOW()),
  ('2026-08-28 16:00:00+00', 'del', 'pedro', 'arc', '2026-08-26 20:00:00+00', NULL, NOW()),
  ('2026-09-04 16:00:00+00', 'del', 'pedro', 'arc', '2026-09-02 20:00:00+00', NULL, NOW()),
  ('2026-09-11 16:00:00+00', 'del', 'pedro', 'arc', '2026-09-09 20:00:00+00', NULL, NOW()),
  ('2026-09-18 16:00:00+00', 'del', 'pedro', 'arc', '2026-09-16 20:00:00+00', NULL, NOW()),
  ('2026-09-25 16:00:00+00', 'del', 'pedro', 'arc', '2026-09-23 20:00:00+00', NULL, NOW()),
  ('2026-10-02 16:00:00+00', 'del', 'pedro', 'arc', '2026-09-30 20:00:00+00', NULL, NOW()),
  ('2026-10-09 16:00:00+00', 'del', 'pedro', 'arc', '2026-10-07 20:00:00+00', NULL, NOW()),
  ('2026-10-16 16:00:00+00', 'del', 'pedro', 'arc', '2026-10-14 20:00:00+00', NULL, NOW()),
  ('2026-10-23 16:00:00+00', 'del', 'pedro', 'arc', '2026-10-21 20:00:00+00', NULL, NOW()),
-- CET (UTC+1): Oct 30 → Feb 12 (clocks fall back on Oct 25)
  ('2026-10-30 17:00:00+00', 'del', 'pedro', 'arc', '2026-10-28 21:00:00+00', NULL, NOW()),
  ('2026-11-06 17:00:00+00', 'del', 'pedro', 'arc', '2026-11-04 21:00:00+00', NULL, NOW()),
  ('2026-11-13 17:00:00+00', 'del', 'pedro', 'arc', '2026-11-11 21:00:00+00', NULL, NOW()),
  ('2026-11-20 17:00:00+00', 'del', 'pedro', 'arc', '2026-11-18 21:00:00+00', NULL, NOW()),
  ('2026-11-27 17:00:00+00', 'del', 'pedro', 'arc', '2026-11-25 21:00:00+00', NULL, NOW()),
  ('2026-12-04 17:00:00+00', 'del', 'pedro', 'arc', '2026-12-02 21:00:00+00', NULL, NOW()),
  ('2026-12-11 17:00:00+00', 'del', 'pedro', 'arc', '2026-12-09 21:00:00+00', NULL, NOW()),
  ('2026-12-18 17:00:00+00', 'del', 'pedro', 'arc', '2026-12-16 21:00:00+00', NULL, NOW()),
  ('2026-12-25 17:00:00+00', 'del', 'pedro', 'arc', '2026-12-23 21:00:00+00', NULL, NOW()),
-- CET continues into 2027 (CEST resumes Mar 28, 2027)
  ('2027-01-01 17:00:00+00', 'del', 'pedro', 'arc', '2026-12-30 21:00:00+00', NULL, NOW()),
  ('2027-01-08 17:00:00+00', 'del', 'pedro', 'arc', '2027-01-06 21:00:00+00', NULL, NOW()),
  ('2027-01-15 17:00:00+00', 'del', 'pedro', 'arc', '2027-01-13 21:00:00+00', NULL, NOW()),
  ('2027-01-22 17:00:00+00', 'del', 'pedro', 'arc', '2027-01-20 21:00:00+00', NULL, NOW()),
  ('2027-01-29 17:00:00+00', 'del', 'pedro', 'arc', '2027-01-27 21:00:00+00', NULL, NOW()),
  ('2027-02-05 17:00:00+00', 'del', 'pedro', 'arc', '2027-02-03 21:00:00+00', NULL, NOW()),
  ('2027-02-12 17:00:00+00', 'del', 'pedro', 'arc', '2027-02-10 21:00:00+00', NULL, NOW());

-- ── Saturday involvement events — Jun, Jul, Aug, first 2 weeks Sep 2026 ───────
-- Event time: 08:00 Rome (CEST, UTC+2) → 06:00 UTC

INSERT INTO events (date, type, description, delivery_point, deadline, google_event_id, created_at) VALUES
-- June (4 Saturdays)
  ('2026-06-06 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-06-13 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-06-20 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-06-27 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
-- July (4 Saturdays)
  ('2026-07-04 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-07-11 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-07-18 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-07-25 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
-- August (5 Saturdays)
  ('2026-08-01 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-08-08 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-08-15 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-08-22 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-08-29 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
-- September (first 2 Saturdays)
  ('2026-09-05 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW()),
  ('2026-09-12 06:00:00+00', 'inv', 'lavori in campo', NULL, NULL, NULL, NOW());

-- ── involvement_subscriptions ─────────────────────────────────────────────────

INSERT INTO involvement_subscriptions (event_id, quota_owner_id, participants, duration, pranzo) VALUES
  (3, 1, '["Marco Rossi", "Anna Rossi"]', 'tutto il giorno', 'Porto focaccia da condividere'),
  (3, 2, '["Giulia Bianchi"]',             'mattina',         NULL);

-- ── delivery_changes ─────────────────────────────────────────────────────────

INSERT INTO delivery_changes (event_id, quota_owner_id, new_delivery_point, description) VALUES
  (2, 3, 'arc', 'Al mio posto ritira mio fratello.');

-- ── recipients ───────────────────────────────────────────────────────────────

INSERT INTO recipients (id, email, phone_prefix, phone) VALUES
  (1, 'admin@csa-fattoria.it',    '+39', '3331234567'),
  (2, 'co-admin@csa-fattoria.it', '+39', '3339876543');

SELECT setval('recipients_id_seq', (SELECT MAX(id) FROM recipients));

-- ── job_config ───────────────────────────────────────────────────────────────
-- Every Monday at 07:00 UTC. Adjust cron_expression to match your schedule.

INSERT INTO job_config (id, cron_expression) VALUES
  (1, '0 7 * * 1');

SELECT setval('job_config_id_seq', (SELECT MAX(id) FROM job_config));

-- ── google_config ─────────────────────────────────────────────────────────────
-- Replace placeholder values with real credentials before going live.
-- IMPORTANT: service_account_json contains a private key — treat as a secret.

INSERT INTO google_config (id, service_account_json, calendar_id) VALUES
  (1, '{"type":"service_account","project_id":"REPLACE_ME"}', 'REPLACE_ME@group.calendar.google.com');

SELECT setval('google_config_id_seq', (SELECT MAX(id) FROM google_config));

-- =============================================================================
-- Done. Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- =============================================================================
