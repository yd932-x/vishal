const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  category:       { type: String, required: true, trim: true },   // 'shirts', 'half-sleeve', 'sweaters', 'trousers'
  category_label: { type: String, default: '' },                   // 'Shirts', 'Half-Sleeve Collared', etc.
  price:          { type: Number, required: true },
  color:          { type: String, default: '' },
  hex:            { type: String, default: '#EDE8DC' },            // Background swatch colour used in frontend cards
  badge:          { type: String, default: null },                 // 'New', 'Bestseller', null
  description:    { type: String, default: '' },
  fabric:         { type: String, default: '' },

  // Three image slots (uploaded via admin panel → served from /uploads/)
  image_url:      { type: String, default: null },
  image_url_2:    { type: String, default: null },
  image_url_3:    { type: String, default: null },

  // Per-size stock
  stock_s:   { type: Number, default: 0 },
  stock_m:   { type: Number, default: 0 },
  stock_l:   { type: Number, default: 0 },
  stock_xl:  { type: Number, default: 0 },
  stock_xxl: { type: Number, default: 0 },

  active:     { type: Boolean, default: true },
  sort_order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
