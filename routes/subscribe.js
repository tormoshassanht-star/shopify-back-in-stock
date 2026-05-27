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

router.post('/', (req, res) => {
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

    db.prepare(`
      INSERT INTO subscribers
        (product_id, variant_id, product_title, variant_title, product_handle, channel, contact, store_domain)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(product_id),
      String(variant_id),
      product_title,
      variant_title,
      product_handle,
      channel,
      normalizedContact,
      store_domain,
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
