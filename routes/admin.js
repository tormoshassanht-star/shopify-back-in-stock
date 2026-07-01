const express = require('express');
const router  = express.Router();
const db      = require('../db');
const notify  = require('../services/notify');

async function fetchVariantData(variantId) {
  const apiKey = process.env.SHOPIFY_ADMIN_API_KEY;
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!apiKey || !domain) return null;
  const beirutId = process.env.BEIRUT_LOCATION_ID || '74671718702';
  const query = `{
    productVariant(id: "gid://shopify/ProductVariant/${variantId}") {
      sku
      inventoryItem {
        inventoryLevels(first: 10) {
          edges { node { location { id } quantities(names: ["available"]) { quantity } } }
        }
      }
    }
  }`;
  const res = await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': apiKey },
    body:    JSON.stringify({ query }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const v = data?.data?.productVariant;
  if (!v) return null;
  const levels = v.inventoryItem?.inventoryLevels?.edges || [];
  const beirut = levels.find(e => String(e.node.location?.id || '').endsWith(`/${beirutId}`));
  const q = beirut && (beirut.node.quantities || []).find(x => x.quantity != null);
  const available = q ? q.quantity : 0;
  return { available, sku: v.sku || '' };
}

function requireAdminKey(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    console.warn(`[${new Date().toISOString()}] ADMIN_API_KEY not set — admin routes are unprotected!`);
    return next();
  }
  if (req.headers['x-admin-key'] !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdminKey);

// GET /admin/subscribers
// Query params: product_id, notified (0 or 1), channel, limit (default 500), offset (default 0)
router.get('/subscribers', (req, res) => {
  try {
    const { product_id, notified, channel, limit = 500, offset = 0 } = req.query;

    const conditions = [];
    const params     = [];

    if (product_id) { conditions.push('product_id = ?');  params.push(product_id); }
    if (notified !== undefined) { conditions.push('notified = ?'); params.push(Number(notified)); }
    if (channel)    { conditions.push('channel = ?');     params.push(channel); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(
      `SELECT * FROM subscribers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, Number(limit), Number(offset));

    // Summary stats (always over all rows, ignoring pagination filters for totals)
    const stats = db.prepare(`
      SELECT
        COUNT(*)                                       AS total,
        SUM(CASE WHEN notified = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN notified = 1 THEN 1 ELSE 0 END) AS notified,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_count,
        SUM(CASE WHEN channel = 'email'    THEN 1 ELSE 0 END) AS email_count
      FROM subscribers
    `).get();

    return res.json({
      stats,
      subscribers: rows,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        returned: rows.length,
      },
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Admin subscribers error:`, err.message);
    return res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// GET /admin/stats — summary only
router.get('/stats', (_req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*)                                       AS total,
        SUM(CASE WHEN notified = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN notified = 1 THEN 1 ELSE 0 END) AS notified,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_count,
        SUM(CASE WHEN channel = 'email'    THEN 1 ELSE 0 END) AS email_count
      FROM subscribers
    `).get();

    const byProduct = db.prepare(`
      SELECT product_id, product_title,
             COUNT(*) AS subscribers,
             SUM(CASE WHEN notified = 0 THEN 1 ELSE 0 END) AS pending
      FROM subscribers
      GROUP BY product_id, product_title
      ORDER BY subscribers DESC
      LIMIT 20
    `).all();

    return res.json({ stats, top_products: byProduct });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Admin stats error:`, err.message);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// DELETE /admin/subscribers/:id
router.delete('/subscribers/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM subscribers WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admin/subscribers/:id/reset — re-queue for notification
router.patch('/subscribers/:id/reset', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE subscribers SET notified = 0, notified_at = NULL, notify_error = NULL WHERE id = ?'
    ).run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/refresh-inventory — refresh live Beirut Qty + SKU for all rows (no sending)
router.post('/refresh-inventory', async (req, res) => {
  try {
    const variantIds = db.prepare('SELECT DISTINCT variant_id FROM subscribers').all().map(r => r.variant_id);
    let updated = 0;
    for (const variantId of variantIds) {
      const vd = await fetchVariantData(variantId);
      if (vd === null) continue;
      const { available, sku } = vd;
      db.prepare('UPDATE subscribers SET inventory_at_subscribed = ? WHERE variant_id = ?').run(available, variantId);
      if (sku) db.prepare('UPDATE subscribers SET sku = ? WHERE variant_id = ?').run(sku, variantId);
      updated++;
    }
    res.json({ success: true, variants: variantIds.length, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/subscribers/:id/resync — check live stock, send if available
router.post('/subscribers/:id/resync', async (req, res) => {
  try {
    const sub = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });

    const vd = await fetchVariantData(sub.variant_id);
    if (vd === null) {
      return res.status(502).json({ error: 'Could not check Shopify inventory' });
    }
    const { available, sku } = vd;
    db.prepare('UPDATE subscribers SET inventory_at_subscribed = ? WHERE id = ?').run(available, sub.id);
    if (sku && sku !== sub.sku) {
      db.prepare('UPDATE subscribers SET sku = ? WHERE id = ?').run(sku, sub.id);
    }
    if (available <= 0) {
      return res.json({ success: false, available, message: 'Still out of stock — nothing sent' });
    }

    db.prepare('UPDATE subscribers SET notified = 0, notify_error = NULL, webhook_triggered = 1 WHERE id = ?').run(sub.id);
    await notify.send({ ...sub, notified: 0 });

    const updated = db.prepare('SELECT notified, notify_error FROM subscribers WHERE id = ?').get(sub.id);
    if (updated.notified === 1) {
      return res.json({ success: true, available, message: `In stock (${available}) — notification sent` });
    }
    return res.json({ success: false, available, error: updated.notify_error || 'Send failed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/subscribers — manually add a subscriber
router.post('/subscribers', (req, res) => {
  try {
    const { product_id, variant_id, product_title, variant_title, product_handle, channel, contact, store_domain } = req.body;
    if (!product_id || !variant_id || !channel || !contact) {
      return res.status(400).json({ error: 'product_id, variant_id, channel, and contact are required' });
    }
    const result = db.prepare(`
      INSERT INTO subscribers (product_id, variant_id, product_title, variant_title, product_handle, channel, contact, store_domain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product_id, variant_id, product_title || '', variant_title || '', product_handle || '', channel, contact, store_domain || '');
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Already subscribed' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
