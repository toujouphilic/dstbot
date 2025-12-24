import sqlite3 from 'sqlite3';
import fs from 'fs';

const DB_PATH = process.env.RENDER ? '/data/notif.db' : './notif.db';

if (process.env.RENDER && !fs.existsSync('/data')) {
  fs.mkdirSync('/data');
}

export const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('failed to open database:', err);
  else console.log('database opened at', DB_PATH);
});

function tryAlter(sql) {
  db.run(sql, (err) => {
    // ignore "duplicate column name" or similar migration errors
    if (err) {
      const msg = String(err.message || '');
      if (
        msg.includes('duplicate column') ||
        msg.includes('already exists') ||
        msg.includes('no such table')
      ) return;
      console.error('migration error:', err.message);
    }
  });
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY,
      server_name TEXT,
      default_channel_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      role_id TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notif_roles (
      server_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (server_id, role_id)
    )
  `);

  // migrations for older dbs (safe to run every boot)
  tryAlter(`ALTER TABLE notifications ADD COLUMN name TEXT`);
  tryAlter(`ALTER TABLE notifications ADD COLUMN enabled INTEGER DEFAULT 1`);
  tryAlter(`ALTER TABLE notifications ADD COLUMN role_id TEXT`);
});