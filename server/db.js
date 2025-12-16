const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.REPLIT_DB_URL });
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
