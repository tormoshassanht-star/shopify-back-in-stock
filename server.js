require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

// Initialize DB (runs schema migrations on first start)
require('./db');

const subscribeRoutes = require('./routes/subscribe');
const webhookRoutes  = require('./routes/webhooks');
const adminRoutes    = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow all origins so the widget works on custom Shopify domains.
// Admin routes are protected by ADMIN_API_KEY regardless of origin.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
}));

// Webhook route needs raw body for HMAC verification — mount BEFORE json middleware
app.use('/webhooks', webhookRoutes);

// Standard JSON parsing for all other routes
app.use(express.json());

app.use('/subscribe', subscribeRoutes);
app.use('/admin', adminRoutes);

// Serve admin dashboard
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Back-in-stock app listening on port ${PORT}`);
});
