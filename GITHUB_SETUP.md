# GitHub Setup Guide

## Step 1 — Create the GitHub repo

1. Go to https://github.com/new
2. Name it: `aryavela` (or `aryavela-store`)
3. Set to **Private** (your .env is gitignored but keep the repo private to be safe)
4. Do NOT initialise with README (you already have one)
5. Click **Create repository**

---

## Step 2 — Push this code to GitHub

Open a terminal, navigate to this project folder, then run:

```bash
# Initialise git
git init

# Add all files (the .gitignore will automatically exclude .env and node_modules)
git add .

# First commit
git commit -m "Initial commit — Aryavela full stack"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/aryavela.git

# Push
git branch -M main
git push -u origin main
```

---

## Step 3 — Verify what's on GitHub

Check that these files are NOT visible on GitHub (gitignore working):
- ❌ `.env` — should NOT be there
- ❌ `node_modules/` — should NOT be there
- ✅ `.env.example` — should be there (safe template)
- ✅ All source files — should be there

---

## Step 4 — Run locally end-to-end

```bash
# In the project folder
npm install

# Copy the env template and fill it in
cp .env.example .env
# Edit .env with your real MongoDB URI, Razorpay keys, etc.

# Start the server
npm run dev
```

Then open:
- 🛍️  http://localhost:5000          — the storefront
- 🔧  http://localhost:5000/admin    — the admin panel
- 💚  http://localhost:5000/api/health — quick health check

---

## Step 5 — Test the full flow locally

1. **Admin panel** → login with your ADMIN_EMAIL/ADMIN_PASSWORD
2. **Add a product** → fill the form, upload 1–3 images
3. **Storefront** → refresh, product should appear
4. **Shop** → click a product, select size, add to cart
5. **Checkout** → fill form, click Pay
   - In test mode, Razorpay will open — use test card: `4111 1111 1111 1111`, any future date, any CVV
6. **Confirmation page** should appear
7. **Admin → Orders** should show the new order
8. **Admin → Products** → stock should have decremented

---

## Step 6 — Deploy to Railway (when ready)

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select your `aryavela` repo
3. Railway auto-detects Node.js
4. Go to **Variables** tab → add all values from your `.env`
5. Deploy
6. Under **Settings → Domains** → add your custom domain

That's it. Every `git push` to `main` will auto-deploy.
