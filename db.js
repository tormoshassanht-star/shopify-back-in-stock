const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'subscribers.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id       TEXT NOT NULL,
    variant_id       TEXT NOT NULL,
    product_title    TEXT,
    variant_title    TEXT,
    product_handle   TEXT,
    channel          TEXT NOT NULL CHECK(channel IN ('whatsapp', 'email')),
    contact          TEXT NOT NULL,
    store_domain     TEXT,
    notified         INTEGER NOT NULL DEFAULT 0,
    notified_at      TEXT,
    notify_error     TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unique
    ON subscribers(variant_id, contact);

  CREATE INDEX IF NOT EXISTS idx_subscribers_product
    ON subscribers(product_id);

  CREATE INDEX IF NOT EXISTS idx_subscribers_variant
    ON subscribers(variant_id);

  CREATE INDEX IF NOT EXISTS idx_subscribers_notified
    ON subscribers(notified);
`);

module.exports = db;
