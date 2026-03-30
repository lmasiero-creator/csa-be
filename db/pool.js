/**
 * db/pool.js — single shared pg.Pool instance.
 *
 * When DATABASE_URL is set the app uses PostgreSQL; otherwise every route
 * falls back to the in-memory mock store so local dev still works without a DB.
 */

const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required by Supabase / Render
      family: 4, // force IPv4 — Render free tier has no IPv6 outbound
    })
  : null;

module.exports = pool;
