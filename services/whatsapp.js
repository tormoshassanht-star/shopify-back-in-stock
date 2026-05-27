const fetch = require('node-fetch');

const WHATFLOW_BASE_URL = 'https://api.whatflow.io/v1';

/**
 * Send a WhatsApp back-in-stock notification via Whatflow.
 *
 * @param {object} subscriber - Row from the subscribers table
 * @param {string} productUrl - Full URL to the product page
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendWhatsApp(subscriber, productUrl) {
  const apiKey   = process.env.WHATFLOW_API_KEY;
  const phoneId  = process.env.WHATFLOW_PHONE_ID;

  if (!apiKey || !phoneId) {
    const msg = 'WHATFLOW_API_KEY or WHATFLOW_PHONE_ID not configured';
    console.error(`[${new Date().toISOString()}] WhatsApp: ${msg}`);
    return { success: false, error: msg };
  }

  const variantLabel = subscriber.variant_title && subscriber.variant_title !== 'Default Title'
    ? ` (${subscriber.variant_title})`
    : '';

  const message = [
    `Hi! 👋 Great news — *${subscriber.product_title}${variantLabel}* is back in stock!`,
    ``,
    `Shop now before it sells out again:`,
    productUrl,
  ].join('\n');

  try {
    const response = await fetch(`${WHATFLOW_BASE_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phone_id: phoneId,
        to:       subscriber.contact,
        message,
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = body.message || body.error || `HTTP ${response.status}`;
      console.error(`[${new Date().toISOString()}] WhatsApp send failed for ${subscriber.contact}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`[${new Date().toISOString()}] WhatsApp sent to ${subscriber.contact} for variant ${subscriber.variant_id}`);
    return { success: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] WhatsApp network error for ${subscriber.contact}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWhatsApp };
