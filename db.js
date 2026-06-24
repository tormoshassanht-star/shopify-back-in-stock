'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_DIR  = process.env.DB_DIR || __dirname;
const DB_PATH = path.join(DB_DIR, 'subscribers.db');

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

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

  CREATE TABLE IF NOT EXISTS processed_webhooks (
    webhook_id   TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Auto-migrate: add columns that don't exist in older DB files
const existingCols = db.prepare('PRAGMA table_info(subscribers)').all().map(r => r.name);
if (!existingCols.includes('inventory_at_subscribed')) {
  db.exec('ALTER TABLE subscribers ADD COLUMN inventory_at_subscribed INTEGER DEFAULT 0');
}
if (!existingCols.includes('customer_location')) {
  db.exec('ALTER TABLE subscribers ADD COLUMN customer_location TEXT');
}
if (!existingCols.includes('webhook_triggered')) {
  db.exec('ALTER TABLE subscribers ADD COLUMN webhook_triggered INTEGER DEFAULT 0');
}
if (!existingCols.includes('sku')) {
  db.exec('ALTER TABLE subscribers ADD COLUMN sku TEXT');
}

module.exports = db;
