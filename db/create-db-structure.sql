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

INSERT INTO quota_owners (id, name, surname, quota, email, phone_prefix, phone) VALUES
  (1, 'Marco',  'Rossi',   'quota_intera', 'marco.rossi@example.com',   '+39', '3331234567'),
  (2, 'Giulia', 'Bianchi', 'mezza_quota',  'giulia.bianchi@example.com', '+39', '3339876543'),
  (3, 'Luigi',  'Ferrari', 'quota_intera', 'luigi.ferrari@example.com',  '+39', '3355551234'),
  (4, 'Sofia',  'Conti',   'mezza_quota',  'sofia.conti@example.com',    '+39', '3371112233');

SELECT setval('quota_owners_id_seq', (SELECT MAX(id) FROM quota_owners));

-- ── accounts ─────────────────────────────────────────────────────────────────

INSERT INTO accounts (id, quota_owner_id, description, photo_data) VALUES
  (1, 1, 'Appassionato di agricoltura biologica.', NULL);

SELECT setval('accounts_id_seq', (SELECT MAX(id) FROM accounts));

-- ── events ───────────────────────────────────────────────────────────────────

INSERT INTO events (id, date, type, description, delivery_point, deadline) VALUES
  (1, '2026-04-05', 'inv', 'Raccolta piselli. Consiglio: porta l''impermeabile', NULL,  NULL),
  (2, '2026-04-07', 'del', 'Consegna settimanale — Portello',                   'prt', '2026-04-05'),
  (3, '2026-04-12', 'inv', 'Trapianto pomodori',                                 NULL,  NULL),
  (4, '2026-04-14', 'del', 'Consegna settimanale — Arcella',                    'arc', '2026-04-12'),
  (5, '2026-04-15', 'evt', 'Assemblea soci',                                     NULL,  NULL),
  (6, '2026-04-21', 'del', 'Consegna settimanale — Mirano',                     'mrn', '2026-04-19'),
  (7, '2026-05-03', 'inv', 'Raccolta fragole',                                   NULL,  NULL),
  (8, '2026-05-06', 'del', 'Consegna settimanale — Portello',                   'prt', '2026-05-04');

SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));

-- ── involvement_subscriptions ─────────────────────────────────────────────────

INSERT INTO involvement_subscriptions (id, event_id, quota_owner_id, participants, duration, pranzo) VALUES
  (1, 3, 1, '["Marco Rossi", "Anna Rossi"]', 'tutto il giorno', 'Porto focaccia da condividere'),
  (2, 3, 2, '["Giulia Bianchi"]',             'mattina',         NULL);

SELECT setval('involvement_subscriptions_id_seq', (SELECT MAX(id) FROM involvement_subscriptions));

-- ── delivery_changes ─────────────────────────────────────────────────────────

INSERT INTO delivery_changes (id, event_id, quota_owner_id, new_delivery_point, description) VALUES
  (1, 2, 3, 'arc', 'Al mio posto ritira mio fratello.');

SELECT setval('delivery_changes_id_seq', (SELECT MAX(id) FROM delivery_changes));

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
