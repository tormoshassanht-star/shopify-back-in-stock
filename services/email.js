// POSTs to a Shopify Flow Webhooks URL. The Flow automation sends the email
// via Flow's native "Send email" action — mirrors the WhatsApp setup.
// Field names (fieldOne/fieldTwo/fieldThree) are fixed by the Flow Webhooks App.
async function sendEmail(subscriber, productUrl) {
  const webhookUrl = process.env.SHOPIFY_FLOW_WEBHOOK_URL;

  if (!webhookUrl) {
    const msg = 'SHOPIFY_FLOW_WEBHOOK_URL not configured';
    console.error(`[${new Date().toISOString()}] Email Flow: ${msg}`);
    return { success: false, error: msg };
  }

  const variant =
    subscriber.variant_title && subscriber.variant_title !== 'Default Title'
      ? subscriber.variant_title
      : '';

  const productInfo = variant
    ? `${subscriber.product_title} (${variant})`
    : subscriber.product_title;

  const token = process.env.SHOPIFY_FLOW_WEBHOOK_TOKEN;

  // fieldOne: recipient email
  // fieldTwo: product info (title + variant)
  // fieldThree: product URL
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
      console.error(`[${new Date().toISOString()}] Email Flow webhook failed for ${subscriber.contact}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`[${new Date().toISOString()}] Email Flow webhook fired → ${subscriber.contact} (variant ${subscriber.variant_id})`);
    return { success: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Email Flow network error for ${subscriber.contact}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
