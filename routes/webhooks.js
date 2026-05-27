const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');
const notify  = require('../services/notify');

// Raw body is required for HMAC verification.
// This middleware captures the raw buffer before any JSON parsing.
router.use(express.raw({ type: 'application/json' }));

function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(`[${new Date().toISOString()}] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification`);
    return true;
  }
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader || ''));
}

// Shopify sends inventory_levels/update with { inventory_item_id, location_id, available }
router.post('/inventory', async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];

  if (!verifyShopifyHmac(req.body, hmacHeader)) {
    console.warn(`[${new Date().toISOString()}] Webhook HMAC verification failed`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const { inventory_item_id, available } = payload;

  console.log(`[${new Date().toISOString()}] Inventory webhook received: inventory_item_id=${inventory_item_id} available=${available}`);

  // Acknowledge immediately — Shopify expects a fast 200
  res.status(200).json({ received: true });

  // Only proceed if stock is now positive
  if (!available || available <= 0) return;

  try {
    // Resolve inventory_item_id → variant_id via Shopify Admin REST API
    const variantId = await resolveVariantFromInventoryItem(inventory_item_id);
    if (!variantId) {
      console.warn(`[${new Date().toISOString()}] Could not resolve variant for inventory_item_id ${inventory_item_id}`);
      return;
    }

    // Find all pending subscribers for this variant
    const subscribers = db.prepare(
      'SELECT * FROM subscribers WHERE variant_id = ? AND notified = 0'
    ).all(String(variantId));

    if (subscribers.length === 0) {
      console.log(`[${new Date().toISOString()}] No pending subscribers for variant ${variantId}`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Notifying ${subscribers.length} subscriber(s) for variant ${variantId}`);

    for (const subscriber of subscribers) {
      await notify.send(subscriber);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing inventory webhook:`, err.message);
  }
});

async function resolveVariantFromInventoryItem(inventoryItemId) {
  const domain  = process.env.SHOPIFY_SHOP_DOMAIN;
  const apiKey  = process.env.SHOPIFY_ADMIN_API_KEY;

  if (!domain || !apiKey) {
    console.warn(`[${new Date().toISOString()}] Shopify API credentials not configured`);
    return null;
  }

  try {
    const fetch = require('node-fetch');
    const url = `https://${domain}/admin/api/2024-01/variants.json?inventory_item_ids=${inventoryItemId}&fields=id`;
    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });

    if (!response.ok) {
      console.error(`[${new Date().toISOString()}] Shopify API error ${response.status} for inventory_item ${inventoryItemId}`);
      return null;
    }

    const data = await response.json();
    const variant = data.variants && data.variants[0];
    return variant ? String(variant.id) : null;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] resolveVariantFromInventoryItem error:`, err.message);
    return null;
  }
}

module.exports = router;
