# VASTRA — Maison de Mode

A full-stack fashion e-commerce platform: a vanilla HTML/CSS/JS storefront, a Flask JSON API, and PostgreSQL.

## Features

**Storefront**
- Home page with hero, promo slider, shop-by-edit chips, gender tiles, featured pieces, category rail, editorial block, new arrivals, brand carousel and newsletter sign-up
- Shop page with full-text search, filters (gender, category, size, colour, brand, price, sale/new/in-stock), sorting and pagination, all reflected in the URL
- Product page with a colour-aware gallery and hover zoom, size/colour variants with live stock, quantity picker, wishlist button, details accordions, ratings breakdown, reviews (marked "verified" for buyers) and related products
- Live search suggestions (press `/` anywhere), a slide-out mini-bag, quick-add from product cards and toast notifications
- Bag with coupons and a free-shipping progress bar; checkout with saved or new addresses and COD / UPI / card
- Accounts: register and sign in (sliding-panel design), order history with a status timeline and cancellation, profile, address book, password change and wishlist
- About (story, craft, FAQ) and contact pages, plus a custom 404 page; responsive down to small phones

**Back office** (`/admin`, admin accounts only)
- Dashboard: revenue, orders, average order value, a 14-day sales chart, status breakdown, low stock, best sellers and recent orders
- Orders: search, filter, view detail, update status with notes (cancelling puts items back in stock)
- Products: create, edit, archive or delete; images by URL or upload; size/colour variants with stock levels
- Customers (enable/disable), coupons (percent or fixed, minimum order, cap, usage limit, expiry), contact messages and newsletter subscribers

**Backend**
- Every request runs in one PostgreSQL transaction. Checkout locks the stock rows (`SELECT … FOR UPDATE`), so stock can't be oversold.
- Guest bags live on the server and merge into the user's bag on sign-in
- Prices, discounts and shipping are always recalculated on the server
- Security: scrypt password hashing, signed HttpOnly SameSite session cookies, session-fixation protection, CSRF guard (custom header plus Origin check), rate limits on login/register/contact, CSP and other security headers, parameterised SQL everywhere, upload type/signature checks

## Project layout

```
server.py               entry point (python server.py / gunicorn server:app)
backend/
  __init__.py           app factory, JSON encoding, error handlers
  config.py             settings from environment / .env
  db.py                 connection pool + per-request transaction
  security.py           sessions, auth decorators, CSRF guard, rate limiting, headers
  services/cart.py      bag persistence, coupon + shipping pricing
  api/                  catalog, auth & account, cart & wishlist, orders, admin, misc
  cli.py                flask init-db | seed-db | create-admin
  seed.py, seed_catalog.py   demo catalogue (32 products, 9 categories, 10 brands, coupons)
database/schema.sql     PostgreSQL schema (idempotent)
frontend/               static storefront + admin (HTML, css/style.css, js/ ES modules, images/)
scripts/generate_product_art.py   regenerates the demo product artwork (SVG)
```

## Running locally

Requirements: Python 3.10+ and PostgreSQL 13+.

```bash
# 1. Database
createuser -P vastra             # choose a password
createdb -O vastra vastra_db

# 2. App
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # set DATABASE_URL and SECRET_KEY

flask --app server init-db       # create tables
flask --app server seed-db       # demo catalogue + coupons
flask --app server create-admin  # your admin login

python server.py                 # http://127.0.0.1:5000
```

Or with Docker: `docker compose up --build`, then `docker compose exec web flask --app server create-admin`. The site runs at http://localhost:8000.

Demo coupons: `WELCOME10`, `VASTRA500`, `FESTIVE20`.

## Production notes
- Set `APP_ENV=production`, a long random `SECRET_KEY` and `SESSION_COOKIE_SECURE=true`, and serve over HTTPS behind a reverse proxy.
- Card and UPI payments are **simulated**: those orders are marked paid immediately. Connect a gateway such as Razorpay or Stripe (with webhook confirmation) in `backend/api/orders.py → place_order` before taking real payments. The site never collects card numbers.
- The login rate limiter is in-memory and per process. Use Redis or similar if you run several servers.
- Product images for most demo items are generated SVG artwork. Replace them with real photography from the admin panel.
