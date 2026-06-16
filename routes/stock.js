const express = require('express');
const router  = express.Router();
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD) || 3;

// All stock routes are admin-only
router.use(protect, admin);

// ── GET /api/stock  — all products with stock summary ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
      .select('name category price hex image_url stock_s stock_m stock_l stock_xl stock_xxl active badge')
      .sort({ sort_order: 1, createdAt: -1 });

    const withTotals = products.map(p => {
      const total = p.stock_s + p.stock_m + p.stock_l + p.stock_xl + p.stock_xxl;
      const sizes  = { S: p.stock_s, M: p.stock_m, L: p.stock_l, XL: p.stock_xl, XXL: p.stock_xxl };
      const lowSizes = Object.entries(sizes).filter(([, v]) => v <= LOW_STOCK_THRESHOLD).map(([k]) => k);
      return {
        _id:       p._id,
        name:      p.name,
        category:  p.category,
        price:     p.price,
        hex:       p.hex,
        image_url: p.image_url,
        active:    p.active,
        badge:     p.badge,
        stock_s:   p.stock_s,
        stock_m:   p.stock_m,
        stock_l:   p.stock_l,
        stock_xl:  p.stock_xl,
        stock_xxl: p.stock_xxl,
        total_stock: total,
        low_sizes:   lowSizes,
        is_low_stock: lowSizes.length > 0,
        is_out_of_stock: total === 0,
      };
    });

    res.json({
      products: withTotals,
      summary: {
        total_products:    withTotals.length,
        out_of_stock:      withTotals.filter(p => p.is_out_of_stock).length,
        low_stock:         withTotals.filter(p => p.is_low_stock && !p.is_out_of_stock).length,
        healthy:           withTotals.filter(p => !p.is_low_stock).length,
        low_stock_threshold: LOW_STOCK_THRESHOLD,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/stock/:id  — update stock levels for one product ─────────────────
// Body: { stock_s, stock_m, stock_l, stock_xl, stock_xxl }
// Can send all or just the sizes you want to change
// Also supports { adjust: true } to ADD/SUBTRACT instead of SET
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const sizes = ['s', 'm', 'l', 'xl', 'xxl'];
    const { adjust } = req.body; // if true, values are deltas (+/-), otherwise absolute set

    sizes.forEach(size => {
      const key = `stock_${size}`;
      if (req.body[key] !== undefined) {
        const val = parseInt(req.body[key]);
        if (!isNaN(val)) {
          if (adjust) {
            product[key] = Math.max(0, (product[key] || 0) + val);
          } else {
            product[key] = Math.max(0, val);
          }
        }
      }
    });

    await product.save();

    // Return updated totals
    const total = product.stock_s + product.stock_m + product.stock_l + product.stock_xl + product.stock_xxl;
    res.json({
      _id:      product._id,
      name:     product.name,
      stock_s:   product.stock_s,
      stock_m:   product.stock_m,
      stock_l:   product.stock_l,
      stock_xl:  product.stock_xl,
      stock_xxl: product.stock_xxl,
      total_stock: total,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/stock/alerts  — only low/out-of-stock products ──────────────────
router.get('/alerts', async (req, res) => {
  try {
    const products = await Product.find({ active: true })
      .select('name category stock_s stock_m stock_l stock_xl stock_xxl image_url hex');

    const alerts = products
      .map(p => {
        const sizes  = { S: p.stock_s, M: p.stock_m, L: p.stock_l, XL: p.stock_xl, XXL: p.stock_xxl };
        const total  = Object.values(sizes).reduce((a, b) => a + b, 0);
        const lowSizes = Object.entries(sizes).filter(([, v]) => v <= LOW_STOCK_THRESHOLD).map(([k]) => k);
        return { _id: p._id, name: p.name, category: p.category, image_url: p.image_url, hex: p.hex, sizes, total, lowSizes };
      })
      .filter(p => p.lowSizes.length > 0)
      .sort((a, b) => a.total - b.total);

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
