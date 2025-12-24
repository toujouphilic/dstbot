import sqlite3 from 'sqlite3';
import fs from 'fs';

const DB_PATH = process.env.RENDER
  ? '/data/notif.db'
  : './notif.db';

// ensure /data exists on render
if (process.env.RENDER && !fs.existsSync('/data')) {
  fs.mkdirSync('/data');
}

export const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('failed to open database:', err);
  } else {
    console.log('database opened at', DB_PATH);
  }
});

db.serialize(() => {
  // servers table
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY,
      server_name TEXT,
      default_channel_id TEXT
    )
  `);

  // notifications table
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT,
      type TEXT,
      source TEXT,
      channel_id TEXT,
      role_id TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);

  // notif roles table
  db.run(`
    CREATE TABLE IF NOT EXISTS notif_roles (
      server_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (server_id, role_id)
    )
  `);
});