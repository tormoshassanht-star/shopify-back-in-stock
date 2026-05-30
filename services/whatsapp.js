// POSTs to the Shopify Flow Webhooks URL. The Flow automation picks this up
// and sends the WhatsApp via the Whatflow action.
// Field names (fieldOne/fieldTwo/fieldThree) are fixed by the Flow Webhooks App.
async function sendWhatsApp(subscriber, productUrl) {
  const webhookUrl = process.env.SHOPIFY_FLOW_WEBHOOK_URL;

  if (!webhookUrl) {
    const msg = 'SHOPIFY_FLOW_WEBHOOK_URL not configured';
    console.error(`[${new Date().toISOString()}] WhatsApp Flow: ${msg}`);
    return { success: false, error: msg };
  }

  const variant =
    subscriber.variant_title && subscriber.variant_title !== 'Default Title'
      ? subscriber.variant_title
      : '';

  // fieldOne: recipient phone
  // fieldTwo: product info (title + variant)
  // fieldThree: product URL
  const productInfo = variant
    ? `${subscriber.product_title} (${variant})`
    : subscriber.product_title;

  const token = process.env.SHOPIFY_FLOW_WEBHOOK_TOKEN;

  const body = {
    fieldOne:   subscriber.contact,
    fieldTwo:   productInfo,
    fieldThree: productUrl,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Api-Key'] = token;

  try {
    const response = await fetch(webhookUrl, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const errMsg = `HTTP ${response.status}`;
      console.error(`[${new Date().toISOString()}] Flow webhook failed for ${subscriber.contact}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`[${new Date().toISOString()}] Flow webhook fired for WhatsApp → ${subscriber.contact} (variant ${subscriber.variant_id})`);
    return { success: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Flow webhook network error for ${subscriber.contact}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWhatsApp };
