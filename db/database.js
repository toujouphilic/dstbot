import sqlite3 from 'sqlite3';
import fs from 'fs';

/*
  database path logic:
  - local: ./notif.db
  - render without disk: /tmp/notif.db
  - render with disk: /data/notif.db
*/

let DB_PATH = './notif.db';

if (process.env.RENDER) {
  DB_PATH = fs.existsSync('/data')
    ? '/data/notif.db'
    : '/tmp/notif.db';
}

export const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('failed to open database:', err.message);
  } else {
    console.log(`database opened at ${DB_PATH}`);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY,
      server_name TEXT NOT NULL,
      default_channel_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      role_id TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (server_id) REFERENCES servers(server_id)
    )
  `);
});