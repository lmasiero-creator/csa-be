-- ── Migration: add time support to events ─────────────────────────────────────
-- Run this ONCE on the existing Supabase database before deploying the new backend.
-- Converts DATE columns to TIMESTAMPTZ, interpreting existing dates as midnight Rome time.

ALTER TABLE events
  ALTER COLUMN date TYPE TIMESTAMPTZ
  USING (date::timestamp AT TIME ZONE 'Europe/Rome');

ALTER TABLE events
  ALTER COLUMN deadline TYPE TIMESTAMPTZ
  USING (deadline::timestamp AT TIME ZONE 'Europe/Rome');
