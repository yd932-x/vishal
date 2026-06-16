require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB = require('./config/db');
const User    = require('./models/User');

const app = express();

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────────────────────────
// Product images
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Admin panel  →  /admin
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Main frontend  →  /
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/stock',    require('./routes/stock'));

// ── Config endpoint (shipping thresholds) ─────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    free_shipping_threshold: parseInt(process.env.FREE_SHIPPING_THRESHOLD) || 5000,
    shipping_cost:           parseInt(process.env.SHIPPING_COST)           || 299,
    razorpay_key_id:         process.env.RAZORPAY_KEY_ID || '',
    store_name:              process.env.STORE_NAME || 'Aryavela',
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Server is running' }));

// ── Seed default admin on first run ───────────────────────────────────────────
const seedAdmin = async () => {
  try {
    const exists = await User.findOne({ isAdmin: true });
    if (!exists) {
      await User.create({
        name:     'Admin',
        email:    process.env.ADMIN_EMAIL    || 'admin@aryavela.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123',
        isAdmin:  true,
      });
      console.log('✅ Default admin created:', process.env.ADMIN_EMAIL || 'admin@aryavela.com');
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
};
seedAdmin();

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Aryavela server running at http://localhost:${PORT}`));
