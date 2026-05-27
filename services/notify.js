const db             = require('../db');
const { sendWhatsApp } = require('./whatsapp');
const { sendEmail }    = require('./email');

function buildProductUrl(subscriber) {
  const domain  = subscriber.store_domain || process.env.SHOPIFY_SHOP_DOMAIN || '';
  const handle  = subscriber.product_handle || '';
  const variant = subscriber.variant_id || '';

  if (!domain) return '';

  const base = handle
    ? `https://${domain}/products/${handle}`
    : `https://${domain}/products`;

  return variant ? `${base}?variant=${variant}` : base;
}

const markNotified = db.prepare(`
  UPDATE subscribers
  SET notified = 1, notified_at = datetime('now'), notify_error = NULL
  WHERE id = ?
`);

const markFailed = db.prepare(`
  UPDATE subscribers
  SET notify_error = ?
  WHERE id = ?
`);

/**
 * Send a back-in-stock notification to a single subscriber.
 * Updates the DB row regardless of success/failure.
 *
 * @param {object} subscriber - Row from the subscribers table
 */
async function send(subscriber) {
  const productUrl = buildProductUrl(subscriber);

  let result;
  if (subscriber.channel === 'whatsapp') {
    result = await sendWhatsApp(subscriber, productUrl);
  } else if (subscriber.channel === 'email') {
    result = await sendEmail(subscriber, productUrl);
  } else {
    console.error(`[${new Date().toISOString()}] Unknown channel "${subscriber.channel}" for subscriber ${subscriber.id}`);
    return;
  }

  if (result.success) {
    markNotified.run(subscriber.id);
    console.log(`[${new Date().toISOString()}] Subscriber ${subscriber.id} (${subscriber.channel}) marked as notified`);
  } else {
    markFailed.run(result.error || 'unknown error', subscriber.id);
    console.warn(`[${new Date().toISOString()}] Notification failed for subscriber ${subscriber.id}: ${result.error}`);
  }
}

module.exports = { send };
