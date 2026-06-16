const nodemailer = require('nodemailer');

// ── Transporter (lazy init so server starts even without email configured) ────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  Email not configured — set EMAIL_USER and EMAIL_PASS in .env');
    return null;
  }

  _transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,   // Gmail: use App Password, not account password
    },
  });

  return _transporter;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => '₹' + parseInt(n).toLocaleString('en-IN');

const emailStyles = `
  body { margin:0; padding:0; background:#F5F0E8; font-family:'Helvetica Neue',Arial,sans-serif; }
  .wrap { max-width:580px; margin:2rem auto; background:#fff; border:1px solid #E8E2D9; }
  .head { background:#0E1B2E; padding:2.5rem 2.5rem 2rem; text-align:center; }
  .head-brand { font-size:1.5rem; letter-spacing:.25em; color:#F5F0E8; font-weight:300; }
  .head-sub { font-size:.55rem; letter-spacing:.3em; text-transform:uppercase; color:#C8956C; margin-top:.35rem; }
  .body { padding:2.5rem; }
  .greeting { font-size:1.05rem; color:#1E1E1E; margin-bottom:.5rem; }
  .note { font-size:.85rem; color:#6B6560; line-height:1.75; margin-bottom:2rem; }
  .ref-box { background:#F5F0E8; border-left:3px solid #C8956C; padding:1rem 1.25rem; margin-bottom:2rem; }
  .ref-label { font-size:.55rem; letter-spacing:.2em; text-transform:uppercase; color:#9B5B2F; }
  .ref-val { font-size:1.1rem; color:#1E1E1E; margin-top:.2rem; letter-spacing:.05em; }
  .section-title { font-size:.6rem; letter-spacing:.2em; text-transform:uppercase; color:#9B5B2F; margin-bottom:.85rem; padding-bottom:.5rem; border-bottom:1px solid #E8E2D9; }
  .item-row { display:flex; justify-content:space-between; padding:.6rem 0; border-bottom:1px solid #F0EBE3; font-size:.85rem; color:#1E1E1E; }
  .item-meta { font-size:.72rem; color:#9B8F85; margin-top:.15rem; }
  .totals { margin-top:1.25rem; }
  .total-row { display:flex; justify-content:space-between; padding:.45rem 0; font-size:.85rem; color:#6B6560; }
  .total-row.grand { font-size:.95rem; color:#1E1E1E; font-weight:600; border-top:1px solid #E8E2D9; margin-top:.5rem; padding-top:.85rem; }
  .addr-box { background:#F5F0E8; padding:1rem 1.25rem; font-size:.82rem; color:#1E1E1E; line-height:1.85; margin-bottom:2rem; }
  .footer { background:#0E1B2E; padding:1.5rem 2.5rem; text-align:center; }
  .footer p { font-size:.65rem; color:rgba(245,240,232,.35); letter-spacing:.08em; margin:0; line-height:1.9; }
  .status-chip { display:inline-block; padding:.3rem .85rem; font-size:.6rem; letter-spacing:.15em; text-transform:uppercase; }
`;

// ── Order confirmation email → customer ───────────────────────────────────────
async function sendOrderConfirmation(order) {
  const t = getTransporter();
  if (!t) return;

  const itemsHtml = (order.items || []).map(item => `
    <div class="item-row">
      <div>
        <div>${item.name}</div>
        <div class="item-meta">Size: ${item.size} &nbsp;·&nbsp; Qty: ${item.quantity}</div>
      </div>
      <div>${fmt(item.price * item.quantity)}</div>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${emailStyles}</style></head>
  <body><div class="wrap">
    <div class="head">
      <div class="head-brand">ARYAVELA</div>
      <div class="head-sub">Considered Menswear</div>
    </div>
    <div class="body">
      <p class="greeting">Thank you, ${order.customer_name.split(' ')[0]}.</p>
      <p class="note">Your order has been confirmed and will be prepared with care. We'll send you a shipping update once your parcel is on its way.</p>

      <div class="ref-box">
        <div class="ref-label">Order Reference</div>
        <div class="ref-val">${order.order_ref}</div>
      </div>

      <div class="section-title">Items Ordered</div>
      ${itemsHtml}
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>
        <div class="total-row"><span>Shipping</span><span>${order.shipping === 0 ? 'Complimentary' : fmt(order.shipping)}</span></div>
        <div class="total-row grand"><span>Total Paid</span><span>${fmt(order.total)}</span></div>
      </div>

      <div class="section-title" style="margin-top:2rem">Shipping To</div>
      <div class="addr-box">
        ${order.customer_name}<br/>
        ${order.ship_address}<br/>
        ${order.ship_city}, ${order.ship_state} – ${order.ship_pincode}<br/>
        ${order.customer_phone}
      </div>

      <p class="note" style="margin-bottom:0">For any queries, reply to this email or write to us at <strong>${process.env.EMAIL_USER}</strong>. Please quote your order reference.</p>
    </div>
    <div class="footer">
      <p>© 2025 Aryavela · The Noble Sail · Est. MMXXV<br/>Mumbai, India</p>
    </div>
  </div></body></html>`;

  try {
    await t.sendMail({
      from:    `"Aryavela" <${process.env.EMAIL_USER}>`,
      to:      order.customer_email,
      subject: `Order Confirmed — ${order.order_ref} · Aryavela`,
      html,
    });
    console.log(`✅ Confirmation email sent to ${order.customer_email}`);
  } catch (err) {
    console.error('❌ Confirmation email failed:', err.message);
  }
}

// ── New order alert → admin ───────────────────────────────────────────────────
async function sendAdminOrderAlert(order) {
  const t = getTransporter();
  if (!t) return;

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const itemsText = (order.items || [])
    .map(i => `  • ${i.name} (${i.size}) × ${i.quantity} = ${fmt(i.price * i.quantity)}`)
    .join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${emailStyles}</style></head>
  <body><div class="wrap">
    <div class="head">
      <div class="head-brand">ARYAVELA</div>
      <div class="head-sub">Admin · New Order</div>
    </div>
    <div class="body">
      <p class="greeting">New Order Received</p>
      <div class="ref-box">
        <div class="ref-label">Order Reference</div>
        <div class="ref-val">${order.order_ref}</div>
      </div>

      <div class="section-title">Customer</div>
      <div class="addr-box">
        <strong>${order.customer_name}</strong><br/>
        ${order.customer_email} · ${order.customer_phone}<br/><br/>
        ${order.ship_address}, ${order.ship_city}, ${order.ship_state} – ${order.ship_pincode}
      </div>

      <div class="section-title">Items</div>
      ${(order.items || []).map(item => `
        <div class="item-row">
          <div>
            <div>${item.name}</div>
            <div class="item-meta">Size: ${item.size} &nbsp;·&nbsp; Qty: ${item.quantity}</div>
          </div>
          <div>${fmt(item.price * item.quantity)}</div>
        </div>`).join('')}
      <div class="totals">
        <div class="total-row grand"><span>Total</span><span>${fmt(order.total)}</span></div>
      </div>

      <div style="margin-top:2rem;text-align:center">
        <a href="${process.env.SITE_URL || 'http://localhost:5000'}/admin" 
           style="display:inline-block;background:#C8956C;color:#fff;padding:.9rem 2rem;font-size:.65rem;letter-spacing:.2em;text-transform:uppercase;text-decoration:none">
          View in Admin Panel →
        </a>
      </div>
    </div>
    <div class="footer"><p>Aryavela Admin Notification</p></div>
  </div></body></html>`;

  try {
    await t.sendMail({
      from:    `"Aryavela Orders" <${process.env.EMAIL_USER}>`,
      to:      adminEmail,
      subject: `🛍️ New Order ${order.order_ref} — ${fmt(order.total)}`,
      html,
    });
    console.log(`✅ Admin alert sent to ${adminEmail}`);
  } catch (err) {
    console.error('❌ Admin alert email failed:', err.message);
  }
}

// ── Stock alert → admin ───────────────────────────────────────────────────────
async function sendLowStockAlert(products) {
  const t = getTransporter();
  if (!t || !products.length) return;

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const rows = products.map(p => `
    <div class="item-row">
      <div>
        <div>${p.name}</div>
        <div class="item-meta">${p.category}</div>
      </div>
      <div style="text-align:right;font-size:.78rem">
        S:${p.stock_s} M:${p.stock_m} L:${p.stock_l} XL:${p.stock_xl} XXL:${p.stock_xxl}
      </div>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${emailStyles}</style></head>
  <body><div class="wrap">
    <div class="head">
      <div class="head-brand">ARYAVELA</div>
      <div class="head-sub">Stock Alert</div>
    </div>
    <div class="body">
      <p class="greeting">Low Stock Warning</p>
      <p class="note">The following products have one or more sizes with ${process.env.LOW_STOCK_THRESHOLD || 3} or fewer units remaining.</p>
      ${rows}
      <div style="margin-top:2rem;text-align:center">
        <a href="${process.env.SITE_URL || 'http://localhost:5000'}/admin"
           style="display:inline-block;background:#C8956C;color:#fff;padding:.9rem 2rem;font-size:.65rem;letter-spacing:.2em;text-transform:uppercase;text-decoration:none">
          Manage Stock →
        </a>
      </div>
    </div>
    <div class="footer"><p>Aryavela Admin Notification</p></div>
  </div></body></html>`;

  try {
    await t.sendMail({
      from:    `"Aryavela Stock" <${process.env.EMAIL_USER}>`,
      to:      adminEmail,
      subject: `⚠️ Low Stock Alert — ${products.length} product${products.length > 1 ? 's' : ''} need restocking`,
      html,
    });
    console.log(`✅ Low stock alert sent for ${products.length} products`);
  } catch (err) {
    console.error('❌ Low stock alert failed:', err.message);
  }
}

module.exports = { sendOrderConfirmation, sendAdminOrderAlert, sendLowStockAlert };
