import sqlite3 from 'sqlite3';
import fs from 'fs';

/*
  use render persistent disk if available,
  otherwise fall back to local file
*/
const DB_PATH = process.env.RENDER
  ? '/data/notif.db'
  : './notif.db';

/* ensure render disk directory exists */
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

/* create tables */
db.serialize(() => {

  /* servers */
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY,
      server_name TEXT,
      default_channel_id TEXT
    )
  `);

  /* notifications */
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

  /* role permissions */
  db.run(`
    CREATE TABLE IF NOT EXISTS notif_roles (
      server_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (server_id, role_id)
    )
  `);
});