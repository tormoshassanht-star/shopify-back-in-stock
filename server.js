require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Initialize DB (runs schema migrations on first start)
require('./db');

const subscribeRoutes = require('./routes/subscribe');
const webhookRoutes  = require('./routes/webhooks');
const adminRoutes    = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow configured Shopify store origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
}));

// Webhook route needs raw body for HMAC verification — mount BEFORE json middleware
app.use('/webhooks', webhookRoutes);

// Standard JSON parsing for all other routes
app.use(express.json());

app.use('/subscribe', subscribeRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Back-in-stock app listening on port ${PORT}`);
});
