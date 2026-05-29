'use strict';
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');
const notify  = require('../services/notify');

// Beirut warehouse — only process inventory updates from this location
const BEIRUT_LOCATION_ID = '74671718702';

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

  // Only process updates from the Beirut warehouse
  if (String(location_id) !== BEIRUT_LOCATION_ID) {
    console.log(`[${ts()}] Skipping inventory update from non-Beirut location ${location_id}`);
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

  try {
    const url = `https://${domain}/admin/api/2024-01/variants.json?inventory_item_ids=${inventoryItemId}&fields=id`;
    const res  = await fetch(url, { headers: { 'X-Shopify-Access-Token': apiKey } });

    if (!res.ok) {
      console.error(`[${ts()}] Shopify API error ${res.status} for inventory_item ${inventoryItemId}`);
      return null;
    }

    const data    = await res.json();
    const variant = data.variants && data.variants[0];
    return variant ? String(variant.id) : null;
  } catch (err) {
    console.error(`[${ts()}] resolveVariantFromInventoryItem error:`, err.message);
    return null;
  }
}

module.exports = router;
