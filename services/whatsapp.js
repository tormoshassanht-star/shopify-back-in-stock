const fetch = require('node-fetch');

// Fires a Shopify Flow custom trigger. The store's Flow automation
// (set up with the Whatflow app action) picks this up and sends the WhatsApp.
async function sendWhatsApp(subscriber, productUrl) {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const apiKey = process.env.SHOPIFY_ADMIN_API_KEY;

  if (!domain || !apiKey) {
    const msg = 'SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_API_KEY not configured';
    console.error(`[${new Date().toISOString()}] WhatsApp Flow: ${msg}`);
    return { success: false, error: msg };
  }

  const variantLabel =
    subscriber.variant_title && subscriber.variant_title !== 'Default Title'
      ? ` (${subscriber.variant_title})`
      : '';

  const triggerPayload = {
    phone:         subscriber.contact,
    product_title: `${subscriber.product_title}${variantLabel}`,
    product_url:   productUrl,
  };

  const mutation = `
    mutation FlowTriggerReceive($body: String!) {
      flowTriggerReceive(body: $body) {
        userErrors { field message }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${domain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':          'application/json',
          'X-Shopify-Access-Token': apiKey,
        },
        body: JSON.stringify({
          query:     mutation,
          variables: { body: JSON.stringify(triggerPayload) },
        }),
      }
    );

    const data       = await response.json().catch(() => ({}));
    const userErrors = data?.data?.flowTriggerReceive?.userErrors || [];

    if (!response.ok || userErrors.length > 0) {
      const errMsg = userErrors.map(e => e.message).join(', ') || `HTTP ${response.status}`;
      console.error(`[${new Date().toISOString()}] Flow trigger failed for ${subscriber.contact}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`[${new Date().toISOString()}] Flow triggered for WhatsApp → ${subscriber.contact} (variant ${subscriber.variant_id})`);
    return { success: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Flow trigger network error for ${subscriber.contact}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWhatsApp };
