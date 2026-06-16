const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const { sendOrderConfirmation, sendAdminOrderAlert, sendLowStockAlert } = require('../config/email');

// Lazily initialise Razorpay so server doesn't crash if keys aren't set yet
let razorpay;
const getRazorpay = () => {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

// Helper: decrement stock for a single order item
async function decrementStock(productId, size, quantity) {
  const sizeField = `stock_${size.toLowerCase()}`;
  const product = await Product.findById(productId);
  if (!product) return;
  const current = product[sizeField] || 0;
  product[sizeField] = Math.max(0, current - quantity);
  await product.save();
}

// Helper: check for low stock after an order and alert admin
const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD) || 3;

async function checkLowStock(productIds) {
  try {
    const products = await Product.find({ _id: { $in: productIds } });
    const lowStock = products.filter(p =>
      p.stock_s   <= LOW_STOCK_THRESHOLD ||
      p.stock_m   <= LOW_STOCK_THRESHOLD ||
      p.stock_l   <= LOW_STOCK_THRESHOLD ||
      p.stock_xl  <= LOW_STOCK_THRESHOLD ||
      p.stock_xxl <= LOW_STOCK_THRESHOLD
    );
    if (lowStock.length) await sendLowStockAlert(lowStock);
  } catch (err) {
    console.error('Low stock check failed:', err.message);
  }
}

// ── POST /api/orders/create-razorpay-order ────────────────────────────────────
// Step 1: frontend calls this to get a Razorpay orderId before opening checkout
router.post('/create-razorpay-order', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const rpOrder = await getRazorpay().orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: 'rcpt_' + Date.now(),
    });

    res.json({ orderId: rpOrder.id, amount: rpOrder.amount });
  } catch (err) {
    res.status(500).json({ message: 'Razorpay order creation failed: ' + err.message });
  }
});

// ── POST /api/orders  ─────────────────────────────────────────────────────────
// Step 2: after Razorpay payment succeeds, frontend posts full order here
router.post('/', async (req, res) => {
  try {
    const {
      items, shippingAddress, paymentMethod,
      razorpayOrderId, razorpayPaymentId, razorpaySignature,
      totalAmount, shippingCharge,
      // Customer details (guest checkout)
      customerName, customerEmail, customerPhone,
    } = req.body;

    if (!items?.length)       return res.status(400).json({ message: 'Cart is empty' });
    if (!customerName)        return res.status(400).json({ message: 'Customer name required' });
    if (!customerEmail)       return res.status(400).json({ message: 'Customer email required' });
    if (!shippingAddress)     return res.status(400).json({ message: 'Shipping address required' });

    // ── Verify Razorpay signature ──────────────────────────────────────────────
    if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
      const expectedSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpayOrderId + '|' + razorpayPaymentId)
        .digest('hex');

      if (expectedSig !== razorpaySignature) {
        return res.status(400).json({ message: 'Payment verification failed — signature mismatch' });
      }
    }

    // ── Build order reference ──────────────────────────────────────────────────
    const order_ref = 'AV-' + Date.now();

    // ── Create order in DB ─────────────────────────────────────────────────────
    const order = await Order.create({
      order_ref,
      customer_name:  customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      ship_address:   shippingAddress.address,
      ship_city:      shippingAddress.city,
      ship_state:     shippingAddress.state,
      ship_pincode:   shippingAddress.pincode,
      items: items.map(i => ({
        product_id: i.productId && i.productId.length === 24 ? i.productId : null,
        name:       i.name,
        size:       i.size,
        quantity:   i.quantity,
        price:      i.price,
        image_url:  i.image_url || null,
      })),
      subtotal:         totalAmount - (shippingCharge || 0),
      shipping:         shippingCharge || 0,
      total:            totalAmount,
      payment_method:   paymentMethod || 'razorpay',
      payment_id:       razorpayPaymentId || null,
      razorpay_order_id:  razorpayOrderId  || null,
      razorpay_signature: razorpaySignature || null,
      payment_verified:   !!razorpaySignature,
      user: req.user?._id || null,
    });

    // ── Decrement stock ────────────────────────────────────────────────────────
    const productIds = [];
    for (const item of items) {
      if (item.productId && item.productId.length === 24) {
        await decrementStock(item.productId, item.size, item.quantity);
        productIds.push(item.productId);
      }
    }

    // ── Send emails (non-blocking — don't fail the order if email fails) ───────
    sendOrderConfirmation(order).catch(() => {});
    sendAdminOrderAlert(order).catch(() => {});
    checkLowStock(productIds).catch(() => {});

    res.status(201).json({ order_ref: order.order_ref, _id: order._id, status: order.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/orders/my  (requires login) ─────────────────────────────────────
// Returns orders linked to this user's account OR email address
// so past guest orders placed with the same email also appear
router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { user: req.user._id },
        { customer_email: req.user.email },
      ]
    }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/orders  (admin only) ─────────────────────────────────────────────
router.get('/', protect, admin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$or = [
      { order_ref:      { $regex: search, $options: 'i' } },
      { customer_name:  { $regex: search, $options: 'i' } },
      { customer_email: { $regex: search, $options: 'i' } },
    ];
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Order.countDocuments(query);
    res.json({ orders, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/orders/:id  (admin or order owner) ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      $or: [{ _id: req.params.id }, { order_ref: req.params.id }]
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/orders/:id/status  (admin only) ──────────────────────────────────
router.put('/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['confirmed','processing','dispatched','delivered','cancelled','refunded'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ message: 'Invalid status value' });

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
