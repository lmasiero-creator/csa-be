-- ── Migration: add mezzo_trasporto to involvement_subscriptions ───────────────
-- Run this ONCE on the existing Supabase database before deploying the new backend.

ALTER TABLE involvement_subscriptions
  ADD COLUMN IF NOT EXISTS mezzo_trasporto VARCHAR(512);
