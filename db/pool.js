/**
 * db/pool.js — single shared pg.Pool instance.
 *
 * When DATABASE_URL is set the app uses PostgreSQL; otherwise every route
 * falls back to the in-memory mock store so local dev still works without a DB.
 */

const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 DNS resolution — Render free tier cannot reach IPv6 addresses.
// Must be called before any Pool is created.
dns.setDefaultResultOrder('ipv4first');
console.log('[pool] dns.setDefaultResultOrder set to ipv4first');

let pool = null;

if (process.env.DATABASE_URL) {
  // Log the host being connected to (mask credentials)
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.log(`[pool] DATABASE_URL detected — host: ${u.hostname}, port: ${u.port}`);

    // Resolve the hostname manually so we can log what IP will be used
    dns.lookup(u.hostname, { family: 0, all: true }, (err, addresses) => {
      if (err) {
        console.error('[pool] dns.lookup error:', err.message);
      } else {
        console.log('[pool] dns.lookup results:', JSON.stringify(addresses));
      }
    });
  } catch (e) {
    console.error('[pool] Could not parse DATABASE_URL:', e.message);
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 65000, // Render free tier can take ~50s to wake up
  });

  // Always use Rome timezone so TIMESTAMPTZ values are interpreted/returned correctly
  pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'Europe/Rome'").catch(() => {});
  });

  // Test the connection at startup and log the outcome
  pool.connect((err, client, release) => {
    if (err) {
      console.error('[pool] startup connection test FAILED:', err.message);
    } else {
      console.log('[pool] startup connection test OK');
      release();
    }
  });
} else {
  console.log('[pool] No DATABASE_URL — running in mock mode');
}

module.exports = pool;
