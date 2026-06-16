const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');

// ── Multer setup (stores to public/uploads/) ──────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)
    ? cb(null, true) : cb(new Error('Only JPEG/PNG/WebP images allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Helper: build full image URL from filename
const imageURL = (req, filename) =>
  filename ? `${req.protocol}://${req.get('host')}/uploads/${filename}` : null;

// ── GET /api/products  (public) ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 100, showAll } = req.query;
    const query = {};
    // showAll=true is used by the admin panel to see inactive products
    if (!showAll) query.active = true;
    if (category) query.category = category;
    if (search)   query.name = { $regex: search, $options: 'i' };

    const products = await Product.find(query)
      .sort({ sort_order: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/products/:id  (public) ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/products  (admin only) ─────────────────────────────────────────
// Accepts up to 3 image files: image1, image2, image3
router.post(
  '/',
  protect, admin,
  upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'image3', maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = req.files || {};
      const data = {
        ...req.body,
        price:      Number(req.body.price),
        stock_s:    Number(req.body.stock_s)   || 0,
        stock_m:    Number(req.body.stock_m)   || 0,
        stock_l:    Number(req.body.stock_l)   || 0,
        stock_xl:   Number(req.body.stock_xl)  || 0,
        stock_xxl:  Number(req.body.stock_xxl) || 0,
        sort_order: Number(req.body.sort_order) || 0,
        active:     req.body.active !== 'false',
        image_url:   files.image1 ? imageURL(req, files.image1[0].filename) : null,
        image_url_2: files.image2 ? imageURL(req, files.image2[0].filename) : null,
        image_url_3: files.image3 ? imageURL(req, files.image3[0].filename) : null,
      };
      const product = await Product.create(data);
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

// ── PUT /api/products/:id  (admin only) ──────────────────────────────────────
router.put(
  '/:id',
  protect, admin,
  upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'image3', maxCount: 1 }]),
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });

      const files = req.files || {};
      const updates = {
        ...req.body,
        price:      req.body.price      !== undefined ? Number(req.body.price)      : product.price,
        stock_s:    req.body.stock_s    !== undefined ? Number(req.body.stock_s)    : product.stock_s,
        stock_m:    req.body.stock_m    !== undefined ? Number(req.body.stock_m)    : product.stock_m,
        stock_l:    req.body.stock_l    !== undefined ? Number(req.body.stock_l)    : product.stock_l,
        stock_xl:   req.body.stock_xl   !== undefined ? Number(req.body.stock_xl)   : product.stock_xl,
        stock_xxl:  req.body.stock_xxl  !== undefined ? Number(req.body.stock_xxl)  : product.stock_xxl,
        sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order) : product.sort_order,
        active:     req.body.active !== undefined ? req.body.active !== 'false' : product.active,
        // Only update image slots if new files were uploaded
        image_url:   files.image1 ? imageURL(req, files.image1[0].filename) : product.image_url,
        image_url_2: files.image2 ? imageURL(req, files.image2[0].filename) : product.image_url_2,
        image_url_3: files.image3 ? imageURL(req, files.image3[0].filename) : product.image_url_3,
      };

      const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

// ── DELETE /api/products/:id  (admin only) ───────────────────────────────────
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Delete image files from disk
    [product.image_url, product.image_url_2, product.image_url_3].forEach(url => {
      if (!url) return;
      const filename = url.split('/uploads/').pop();
      const filepath = path.join(uploadDir, filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    });

    await product.deleteOne();
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
