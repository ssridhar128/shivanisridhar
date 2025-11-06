// backend/db.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbFile = path.join(dataDir, 'judging.sqlite3');
const db = new Database(dbFile);

// Initialize tables if not present
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT,
  label TEXT
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  judgeId TEXT,
  participantId TEXT,
  roleLabel TEXT
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  judgeId TEXT,
  participantId TEXT,
  creativity INTEGER,
  execution INTEGER,
  usability INTEGER,
  presentationIndex INTEGER,
  submittedAt INTEGER
);
`).run();

module.exports = {
  db
};
