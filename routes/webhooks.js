'use strict';
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');
const notify  = require('../services/notify');

// Restrict to a specific warehouse location (optional — set BEIRUT_LOCATION_ID env var)
const BEIRUT_LOCATION_ID = process.env.BEIRUT_LOCATION_ID || null;

router.use(express.raw({ type: 'application/json' }));

function ts() { return new Date().toISOString(); }

function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(`[${ts()}] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification`);
    return true;
  }
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader || ''));
  } catch { return false; }
}

router.post('/inventory', async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const webhookId  = req.headers['x-shopify-webhook-id'] || '';

  if (!verifyShopifyHmac(req.body, hmacHeader)) {
    console.warn(`[${ts()}] Webhook HMAC verification failed`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Acknowledge immediately — Shopify expects a fast 200
  res.status(200).json({ received: true });

  const { inventory_item_id, location_id, available } = payload;

  // If BEIRUT_LOCATION_ID is set, only process updates from that location
  if (BEIRUT_LOCATION_ID && String(location_id) !== BEIRUT_LOCATION_ID) {
    console.log(`[${ts()}] Skipping inventory update from location ${location_id} (not Beirut)`);
    return;
  }

  // Idempotency — skip duplicate deliveries
  if (webhookId) {
    try {
      db.prepare('INSERT INTO processed_webhooks (webhook_id) VALUES (?)').run(webhookId);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) {
        console.log(`[${ts()}] Webhook ${webhookId} already processed — skipping`);
        return;
      }
      throw err;
    }
  }

  console.log(`[${ts()}] Inventory webhook: inventory_item_id=${inventory_item_id} location_id=${location_id} available=${available}`);

  if (!available || available <= 0) return;

  try {
    const variantId = await resolveVariantFromInventoryItem(inventory_item_id);
    if (!variantId) {
      console.warn(`[${ts()}] Could not resolve variant for inventory_item_id ${inventory_item_id}`);
      return;
    }

    const subscribers = db.prepare(
      'SELECT * FROM subscribers WHERE variant_id = ? AND notified = 0'
    ).all(String(variantId));

    if (subscribers.length === 0) {
      console.log(`[${ts()}] No pending subscribers for variant ${variantId}`);
      return;
    }

    console.log(`[${ts()}] Notifying ${subscribers.length} subscriber(s) for variant ${variantId}`);

    // Mark that webhook was triggered for this variant
    db.prepare('UPDATE subscribers SET webhook_triggered = 1 WHERE variant_id = ?').run(String(variantId));

    for (const subscriber of subscribers) {
      await notify.send(subscriber);
    }
  } catch (err) {
    console.error(`[${ts()}] Error processing inventory webhook:`, err.message);
  }
});

async function resolveVariantFromInventoryItem(inventoryItemId) {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const apiKey = process.env.SHOPIFY_ADMIN_API_KEY;

  if (!domain || !apiKey) {
    console.warn(`[${ts()}] Shopify API credentials not configured`);
    return null;
  }

  // Use GraphQL — the REST variants.json?inventory_item_ids= filter is unreliable
  const gid   = `gid://shopify/InventoryItem/${inventoryItemId}`;
  const query = `{ inventoryItem(id: "${gid}") { variant { id } } }`;

  try {
    const res = await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
      method:  'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.error(`[${ts()}] Shopify GraphQL error ${res.status} for inventory_item ${inventoryItemId}`);
      return null;
    }

    const data    = await res.json();
    const variantGid = data?.data?.inventoryItem?.variant?.id;
    if (!variantGid) {
      console.warn(`[${ts()}] No variant found for inventory_item ${inventoryItemId}`);
      return null;
    }

    // Extract numeric ID from "gid://shopify/ProductVariant/48769984364846"
    const numericId = variantGid.split('/').pop();
    console.log(`[${ts()}] Resolved inventory_item ${inventoryItemId} → variant ${numericId}`);
    return numericId;
  } catch (err) {
    console.error(`[${ts()}] resolveVariantFromInventoryItem error:`, err.message);
    return null;
  }
}

module.exports = router;
