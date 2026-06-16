const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:       { type: String, required: true },
  size:       { type: String, required: true },
  quantity:   { type: Number, required: true },
  price:      { type: Number, required: true },
  image_url:  { type: String, default: null },
});

const orderSchema = new mongoose.Schema({
  order_ref:      { type: String, required: true, unique: true },

  // Customer info (guest checkout — no account required)
  customer_name:  { type: String, required: true },
  customer_email: { type: String, required: true },
  customer_phone: { type: String, required: true },

  // Shipping address
  ship_address:   { type: String, required: true },
  ship_city:      { type: String, required: true },
  ship_state:     { type: String, required: true },
  ship_pincode:   { type: String, required: true },

  // Items
  items: [orderItemSchema],

  // Totals
  subtotal:       { type: Number, required: true },
  shipping:       { type: Number, default: 0 },
  total:          { type: Number, required: true },

  // Payment
  payment_method: { type: String, default: 'razorpay' },
  payment_id:     { type: String, default: null },           // razorpay_payment_id
  razorpay_order_id:  { type: String, default: null },
  razorpay_signature: { type: String, default: null },
  payment_verified:   { type: Boolean, default: false },

  // Order status
  status: {
    type: String,
    enum: ['confirmed', 'processing', 'dispatched', 'delivered', 'cancelled', 'refunded'],
    default: 'confirmed',
  },

  // Optional: linked user account
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
