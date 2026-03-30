require('dotenv').config();
const app  = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CSA backend (mock) running on http://localhost:${PORT}`);
  console.log('No database connection — using in-memory mock data.');
});
