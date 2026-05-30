const express = require('express');
const router = express.Router();
const db = require('../db');

const VALID_CHANNELS = ['whatsapp', 'email'];

function validateSubscribeBody(body) {
  const { product_id, variant_id, channel, contact } = body;
  if (!product_id)                          return 'product_id is required';
  if (!variant_id)                          return 'variant_id is required';
  if (!channel || !VALID_CHANNELS.includes(channel))
                                            return 'channel must be "whatsapp" or "email"';
  if (!contact || !contact.trim())          return 'contact is required';
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
                                            return 'contact must be a valid email address';
  if (channel === 'whatsapp' && !/^\+?[1-9]\d{6,14}$/.test(contact.replace(/[\s\-()]/g, '')))
                                            return 'contact must be a valid phone number with country code';
  return null;
}

router.post('/', async (req, res) => {
  try {
    const {
      product_id,
      variant_id,
      product_title  = '',
      variant_title  = '',
      product_handle = '',
      channel,
      contact,
      store_domain   = process.env.SHOPIFY_SHOP_DOMAIN || '',
    } = req.body;

    const validationError = validateSubscribeBody(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const normalizedContact = contact.trim().toLowerCase();

    // Check for existing subscription
    const existing = db.prepare(
      'SELECT id FROM subscribers WHERE variant_id = ? AND contact = ?'
    ).get(variant_id, normalizedContact);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You're already on the list! We'll notify you when this is back in stock.",
      });
    }

    // Get customer location from Shopify/Cloudflare header
    const customerLocation = req.headers['cf-ipcountry'] || req.headers['x-country'] || 'LB';

    // Resolve variant title + inventory server-side (theme-independent)
    let inventoryAtSubscribed = 0;
    let resolvedVariantTitle = variant_title;
    try {
      const apiKey = process.env.SHOPIFY_ADMIN_API_KEY;
      const domain = process.env.SHOPIFY_SHOP_DOMAIN;
      if (apiKey && domain) {
        const variantGid = `gid://shopify/ProductVariant/${variant_id}`;
        const query = `{
          productVariant(id: "${variantGid}") {
            title
            inventoryItem {
              inventoryLevels(first: 10) {
                edges { node { quantities(names: ["available"]) { quantity } } }
              }
            }
          }
        }`;
        const gqlRes = await fetch(
          `https://${domain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': apiKey,
            },
            body: JSON.stringify({ query }),
          }
        );
        if (gqlRes.ok) {
          const gqlData = await gqlRes.json();
          const v = gqlData?.data?.productVariant;
          if (v) {
            if (v.title && v.title !== 'Default Title') resolvedVariantTitle = v.title;
            const levels = v.inventoryItem?.inventoryLevels?.edges || [];
            inventoryAtSubscribed = levels.reduce((sum, edge) => {
              const q = (edge.node.quantities || []).find(x => x.quantity != null);
              return sum + (q ? q.quantity : 0);
            }, 0);
          }
        }
      }
    } catch (err) {
      console.warn(`[${new Date().toISOString()}] Could not fetch variant data for ${variant_id}: ${err.message}`);
    }

    db.prepare(`
      INSERT INTO subscribers
        (product_id, variant_id, product_title, variant_title, product_handle, channel, contact, store_domain, customer_location, inventory_at_subscribed)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(product_id),
      String(variant_id),
      product_title,
      resolvedVariantTitle,
      product_handle,
      channel,
      normalizedContact,
      store_domain,
      customerLocation,
      inventoryAtSubscribed,
    );

    console.log(`[${new Date().toISOString()}] New subscriber: ${channel} ${normalizedContact} for variant ${variant_id} (${variant_title || product_title})`);

    return res.status(201).json({
      success: true,
      message: "You'll be notified when back in stock!",
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Subscribe error:`, err.message);
    return res.status(500).json({ success: false, error: 'Could not save subscription. Please try again.' });
  }
});

module.exports = router;
