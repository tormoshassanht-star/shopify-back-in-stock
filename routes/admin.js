const express = require('express');
const router  = express.Router();
const db      = require('../db');

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

module.exports = router;
