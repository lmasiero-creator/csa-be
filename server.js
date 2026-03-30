require('dotenv').config();
const app  = require('./app');
const PORT = process.env.PORT || 3000;
const mode = process.env.DATABASE_URL ? 'db' : 'mock';

app.listen(PORT, () => {
  console.log(`CSA backend (${mode}) running on port ${PORT}`);
  if (mode === 'mock') {
    console.log('DATABASE_URL not set — using in-memory mock data.');
  } else {
    console.log('DATABASE_URL detected — routes will use PostgreSQL (once pg queries are wired).');
  }
});
