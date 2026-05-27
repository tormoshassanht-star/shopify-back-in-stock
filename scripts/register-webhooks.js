/**
 * One-time setup script: registers the inventory_levels/update webhook with Shopify.
 * Run with: node scripts/register-webhooks.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fetch = require('node-fetch');

const domain  = process.env.SHOPIFY_SHOP_DOMAIN;
const apiKey  = process.env.SHOPIFY_ADMIN_API_KEY;
const baseUrl = process.env.BASE_URL;

if (!domain || !apiKey || !baseUrl) {
  console.error('Error: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_API_KEY, and BASE_URL must be set in .env');
  process.exit(1);
}

const WEBHOOKS_TO_REGISTER = [
  {
    topic:   'inventory_levels/update',
    address: `${baseUrl}/webhooks/inventory`,
    format:  'json',
  },
];

async function listExistingWebhooks() {
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/webhooks.json`,
    { headers: { 'X-Shopify-Access-Token': apiKey } }
  );
  if (!res.ok) throw new Error(`Failed to list webhooks: HTTP ${res.status}`);
  const { webhooks } = await res.json();
  return webhooks;
}

async function createWebhook(webhook) {
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/webhooks.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type':             'application/json',
        'X-Shopify-Access-Token':   apiKey,
      },
      body: JSON.stringify({ webhook }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body.errors || body));
  return body.webhook;
}

async function deleteWebhook(id) {
  await fetch(
    `https://${domain}/admin/api/2024-01/webhooks/${id}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': apiKey },
    }
  );
}

(async () => {
  console.log(`\nShopify Webhook Registration`);
  console.log(`Store:   ${domain}`);
  console.log(`App URL: ${baseUrl}\n`);

  const existing = await listExistingWebhooks();
  console.log(`Found ${existing.length} existing webhook(s)\n`);

  for (const wh of WEBHOOKS_TO_REGISTER) {
    // Remove stale webhooks for the same topic pointing to a different address
    const stale = existing.filter(
      e => e.topic === wh.topic && e.address !== wh.address
    );
    for (const s of stale) {
      console.log(`  Removing stale webhook: [${s.id}] ${s.topic} → ${s.address}`);
      await deleteWebhook(s.id);
    }

    // Skip if already registered at the correct address
    const alreadyRegistered = existing.find(
      e => e.topic === wh.topic && e.address === wh.address
    );
    if (alreadyRegistered) {
      console.log(`  ✓ Already registered: ${wh.topic} → ${wh.address}`);
      continue;
    }

    try {
      const created = await createWebhook(wh);
      console.log(`  ✓ Registered: ${created.topic} → ${created.address} (id: ${created.id})`);
    } catch (err) {
      console.error(`  ✗ Failed to register ${wh.topic}: ${err.message}`);
    }
  }

  console.log('\nDone.\n');
})();
