import sqlite3 from 'sqlite3';
import fs from 'fs';

let DB_PATH = './notif.db';

if (process.env.RENDER) {
  DB_PATH = fs.existsSync('/data')
    ? '/data/notif.db'
    : '/tmp/notif.db';
}

if (process.env.RENDER && !fs.existsSync('/data')) {
  fs.mkdirSync('/data');
}

export const db = new sqlite3.Database(DB_PATH);

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
      server_id TEXT,
      type TEXT,
      source TEXT,
      channel_id TEXT,
      role_id TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);
});