const express = require('express');
const router = express.Router();
const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const { protect, admin } = require('../middleware/auth');

// All admin routes require protect + admin
router.use(protect, admin);

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      totalRevenueAgg,
      todayRevenueAgg,
      totalUsers,
      totalProducts,
      statusCounts,
      recentOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, status: { $nin: ['cancelled','refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      User.countDocuments({ isAdmin: false }),
      Product.countDocuments({ active: true }),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.find().sort({ createdAt: -1 }).limit(8),
    ]);

    const statusMap = {};
    statusCounts.forEach(s => { statusMap[s._id] = s.count; });

    res.json({
      total_orders:    totalOrders,
      today_orders:    todayOrders,
      total_revenue:   totalRevenueAgg[0]?.total  || 0,
      today_revenue:   todayRevenueAgg[0]?.total  || 0,
      total_users:     totalUsers,
      total_products:  totalProducts,
      confirmed:   statusMap['confirmed']   || 0,
      processing:  statusMap['processing']  || 0,
      dispatched:  statusMap['dispatched']  || 0,
      delivered:   statusMap['delivered']   || 0,
      cancelled:   statusMap['cancelled']   || 0,
      refunded:    statusMap['refunded']    || 0,
      recent_orders: recentOrders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isAdmin) return res.status(400).json({ message: 'Cannot delete admin accounts' });
    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/admin/orders/lookup?q=AV-xxx OR q=email ─────────────────────────
router.get('/orders/lookup', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: 'Query parameter q is required' });
    const isEmail = q.includes('@');
    const filter = isEmail
      ? { customer_email: q }
      : { order_ref: q };
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
