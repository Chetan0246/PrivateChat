const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const st of statements) {
    try { await db.query(st); } catch (e) { console.error('failed stmt', e.message); }
  }
  console.log('DB init done');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
