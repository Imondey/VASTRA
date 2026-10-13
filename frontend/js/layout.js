// Shared chrome: announcement bar, header, search, mini-bag drawer, mobile menu, footer.
import { api } from './api.js';
import { $, $$, debounce, esc, icons, img, money, observeReveal, toast } from './ui.js';
import {
  addToCart, loadSession, loginUrl, logout, removeCartItem, state, subscribe, toggleWishlist, updateCartItem,
} from './store.js';

const NAV = [
  { label: 'New In', href: 'shop.html?new=1', match: 'new=1' },
  { label: 'Men', href: 'shop.html?gender=men', match: 'gender=men' },
  { label: 'Women', href: 'shop.html?gender=women', match: 'gender=women' },
  { label: 'Kids', href: 'shop.html?gender=kids', match: 'gender=kids' },
  { label: 'Ethnic', href: 'shop.html?category=ethnic', match: 'category=ethnic' },
  { label: 'Sale', href: 'shop.html?sale=1', match: 'sale=1', cls: 'is-sale' },
];

function isActive(item) {
  return location.pathname.endsWith('shop.html') && location.search.includes(item.match);
}

function headerHtml() {
  return `
  <div class="announcement"><span>Complimentary shipping above ₹1,999<span class="extra"> &nbsp;·&nbsp; Easy 15-day returns</span></span></div>
  <header class="site-header" id="siteHeader">
    <div class="container header-inner">
      <nav class="main-nav" aria-label="Main navigation">
        <ul>${NAV.map((n) => `<li><a href="${n.href}" class="${n.cls || ''} ${isActive(n) ? 'is-active' : ''}">${n.label}</a></li>`).join('')}</ul>
      </nav>
      <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu">${icons.menu}</button>
      <a href="index.html" class="logo" aria-label="VASTRA home">VASTRA<small>MAISON DE MODE</small></a>
      <div class="header-actions">
        <button class="icon-btn" id="searchOpen" aria-label="Search">${icons.search}</button>
        <div class="account-menu" id="accountMenu">
          <button class="icon-btn hide-sm" id="accountBtn" aria-label="Account" aria-haspopup="true">${icons.user}</button>
          <div class="account-dropdown" id="accountDropdown" role="menu"></div>
        </div>
        <a class="icon-btn hide-sm" href="wishlist.html" aria-label="Wishlist">${icons.heart}<span class="badge-count" data-wish-count></span></a>
        <button class="icon-btn" id="bagOpen" aria-label="Shopping bag">${icons.bag}<span class="badge-count" data-cart-count></span></button>
      </div>
    </div>
  </header>

  <div class="mobile-nav" id="mobileNav" aria-hidden="true">
    <div class="scrim" data-close-menu></div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="logo" style="font-size:1.4rem">VASTRA</span>
        <button class="icon-btn" data-close-menu aria-label="Close menu">${icons.close}</button>
      </div>
      ${NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('')}
      <a href="shop.html">Shop All</a>
      <div class="small-links" id="mobileAccountLinks"></div>
    </div>
  </div>

  <div class="search-overlay" id="searchOverlay" aria-hidden="true">
    <div class="search-panel">
      <div class="container">
        <form class="search-form" id="searchForm" role="search" action="shop.html">
          ${icons.search.replace('<svg', '<svg width="26" height="26"')}
          <input type="search" name="q" id="searchInput" placeholder="Search shirts, linen, Zara…" autocomplete="off" aria-label="Search products">
          <button type="button" class="icon-btn" id="searchClose" aria-label="Close search">${icons.close}</button>
        </form>
        <div class="search-results" id="searchResults">
          <div class="chips">
            <h4>Popular</h4>
            <a href="shop.html?q=linen">Linen</a><a href="shop.html?category=shirts">Shirts</a>
            <a href="shop.html?category=dresses">Dresses</a><a href="shop.html?tag=trending">Trending now</a>
            <a href="shop.html?category=ethnic">Ethnic edit</a>
          </div>
          <div><h4>Suggestions</h4><div class="suggest-products" id="suggestProducts"><p class="muted">Start typing to discover pieces.</p></div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="drawer" id="bagDrawer" aria-hidden="true">
    <div class="scrim" data-close-drawer></div>
    <aside class="panel" role="dialog" aria-label="Shopping bag">
      <div class="drawer-head"><h3>Your Bag</h3><button class="icon-btn" data-close-drawer aria-label="Close bag">${icons.close}</button></div>
      <div class="drawer-body" id="drawerBody"></div>
      <div class="drawer-foot" id="drawerFoot"></div>
    </aside>
  </div>`;
}

function footerHtml() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer" role="contentinfo">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="logo">VASTRA</div>
          <p>Considered clothing from the labels you love and our own atelier — crafted to be worn, loved and kept.</p>
        </div>
        <div><h4>Shop</h4><ul>
          <li><a href="shop.html?new=1">New In</a></li><li><a href="shop.html?gender=men">Men</a></li>
          <li><a href="shop.html?gender=women">Women</a></li><li><a href="shop.html?gender=kids">Kids</a></li>
          <li><a href="shop.html?sale=1">Sale</a></li></ul></div>
        <div><h4>Client Care</h4><ul>
          <li><a href="contact.html">Contact us</a></li><li><a href="about.html#faq">Shipping &amp; returns</a></li>
          <li><a href="about.html#faq">Size guide</a></li><li><a href="account.html">Track your order</a></li></ul></div>
        <div><h4>The House</h4><ul>
          <li><a href="about.html">Our story</a></li><li><a href="about.html#craft">Craftsmanship</a></li>
          <li><a href="about.html#sustainability">Sustainability</a></li><li><a href="contact.html">Stores</a></li></ul></div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${year} VASTRA. All rights reserved.</span>
        <div class="pay-icons"><span>UPI</span><span>VISA</span><span>MASTERCARD</span><span>RUPAY</span><span>COD</span></div>
      </div>
    </div>
  </footer>`;
}

// ------------------------------------------------------------ account menu
function renderAccount() {
  const dd = $('#accountDropdown');
  const mobile = $('#mobileAccountLinks');
  const u = state.user;
  if (u) {
    dd.innerHTML = `
      <div class="who"><strong>Hello, ${esc(u.first_name)}</strong><span>${esc(u.email)}</span></div>
      <a href="account.html" role="menuitem">My account</a>
      <a href="account.html#orders" role="menuitem">Orders</a>
      <a href="wishlist.html" role="menuitem">Wishlist</a>
      ${u.is_admin ? '<a href="admin.html" role="menuitem">Admin dashboard</a>' : ''}
      <button type="button" data-logout role="menuitem">Sign out</button>`;
    mobile.innerHTML = `<a href="account.html">My account</a><a href="wishlist.html">Wishlist</a>
      ${u.is_admin ? '<a href="admin.html">Admin</a>' : ''}<a href="#" data-logout>Sign out</a>`;
  } else {
    dd.innerHTML = `
      <div class="who"><strong>Welcome</strong><span>Sign in for orders, wishlist &amp; faster checkout.</span></div>
      <a href="${loginUrl()}" role="menuitem">Sign in</a>
      <a href="login.html?mode=register" role="menuitem">Create an account</a>`;
    mobile.innerHTML = `<a href="${loginUrl()}">Sign in</a><a href="login.html?mode=register">Create account</a><a href="wishlist.html">Wishlist</a>`;
  }
}

function renderCounts() {
  $$('[data-cart-count]').forEach((el) => { el.textContent = state.cart.count || ''; el.dataset.count = state.cart.count || 0; });
  $$('[data-wish-count]').forEach((el) => { el.textContent = state.wishlist.size || ''; el.dataset.count = state.wishlist.size; });
  $$('[data-wish]').forEach((btn) => {
    const on = state.wishlist.has(Number(btn.dataset.wish));
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on);
  });
}

// ------------------------------------------------------------ mini bag
function renderDrawer() {
  const body = $('#drawerBody');
  const foot = $('#drawerFoot');
  const cart = state.cart;
  if (!cart.items || !cart.items.length) {
    body.innerHTML = `<div class="empty-state">${icons.bag}<h3>Your bag is empty</h3><p>Discover new arrivals and timeless essentials.</p><a class="btn" href="shop.html">Start shopping</a></div>`;
    foot.innerHTML = '';
    return;
  }
  const remaining = Number(cart.free_shipping_remaining || 0);
  body.innerHTML = `
    <div class="ship-progress" style="margin-top:16px">
      ${remaining > 0 ? `You're <strong>${money(remaining)}</strong> away from complimentary shipping.` : 'You have unlocked <strong>complimentary shipping</strong>.'}
      <div class="bar"><i style="width:${Math.min(100, (1 - remaining / Number(cart.free_shipping_threshold || 1)) * 100)}%"></i></div>
    </div>
    ${cart.items.map((i) => `
    <div class="mini-item">
      <a href="product.html?slug=${encodeURIComponent(i.slug)}"><img src="${esc(img(i.image))}" alt="${esc(i.name)}"></a>
      <div>
        <div class="product-brand">${esc(i.brand || '')}</div>
        <h4>${esc(i.name)}</h4>
        <div class="variant">${esc(i.color)} · Size ${esc(i.size)}</div>
        ${!i.available ? '<div class="warn" style="color:var(--danger);font-size:.78rem">Sold out — please remove</div>' : ''}
        <div class="row">
          <div class="qty sm">
            <button type="button" data-mini-qty="${i.id}" data-delta="-1" aria-label="Decrease">−</button>
            <input value="${i.quantity}" readonly aria-label="Quantity">
            <button type="button" data-mini-qty="${i.id}" data-delta="1" aria-label="Increase">+</button>
          </div>
          <strong>${money(i.line_total)}</strong>
        </div>
      </div>
    </div>`).join('')}`;
  foot.innerHTML = `
    <div class="summary-row"><span>Subtotal</span><span>${money(cart.subtotal)}</span></div>
    <a class="btn btn-block" href="checkout.html">Checkout</a>
    <a class="btn btn-outline btn-block" href="cart.html">View bag</a>`;
}

function openDrawer() {
  renderDrawer();
  $('#bagDrawer').classList.add('is-open');
  $('#bagDrawer').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}
function closeDrawer() {
  $('#bagDrawer').classList.remove('is-open');
  $('#bagDrawer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

// ------------------------------------------------------------ search
function openSearch() {
  $('#searchOverlay').classList.add('is-open');
  $('#searchOverlay').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#searchInput').focus(), 50);
}
function closeSearch() {
  $('#searchOverlay').classList.remove('is-open');
  $('#searchOverlay').setAttribute('aria-hidden', 'true');
}
const runSuggest = debounce(async (q) => {
  const box = $('#suggestProducts');
  if (q.length < 2) { box.innerHTML = '<p class="muted">Start typing to discover pieces.</p>'; return; }
  try {
    const data = await api.get('/search/suggest', { q });
    const links = [
      ...data.categories.map((c) => `<a href="shop.html?category=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`),
      ...data.brands.map((b) => `<a href="shop.html?brand=${encodeURIComponent(b.slug)}">${esc(b.name)}</a>`),
    ];
    box.innerHTML = data.products.length
      ? data.products.map((p) => `
        <a href="product.html?slug=${encodeURIComponent(p.slug)}">
          <img src="${esc(img(p.image))}" alt="">
          <span>${esc(p.name)}</span><b>${money(p.price)}</b>
        </a>`).join('') + (links.length ? `<div class="chips" style="grid-column:1/-1">${links.join(' · ')}</div>` : '')
      : `<p class="muted">No pieces match “${esc(q)}”. Try another term.</p>`;
  } catch { /* keep previous suggestions */ }
}, 220);

// ------------------------------------------------------------ quick add
async function openQuickAdd(container) {
  const slug = container.dataset.quickAdd;
  container.innerHTML = '<div class="spinner" style="margin:6px auto"></div>';
  try {
    const p = await api.get(`/products/${encodeURIComponent(slug)}`);
    const color = p.variants[0] && p.variants[0].color;
    const variants = p.variants.filter((v) => v.color === color);
    container.innerHTML = `<p>Select size${p.colors.length > 1 ? ` · ${esc(color)}` : ''}</p>
      <div class="sizes">${variants.map((v) => `<button type="button" data-variant-add="${v.id}" ${v.stock > 0 ? '' : 'disabled'}>${esc(v.size)}</button>`).join('')}</div>`;
  } catch (err) {
    container.innerHTML = `<p>${esc(err.message)}</p>`;
  }
}

// ------------------------------------------------------------ init
export async function initLayout() {
  const top = document.createElement('div');
  top.innerHTML = headerHtml();
  document.body.prepend(...top.children);
  const foot = document.createElement('div');
  foot.innerHTML = footerHtml();
  document.body.append(...foot.children);

  renderAccount();

  // header shadow on scroll
  const header = $('#siteHeader');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // account dropdown
  const menu = $('#accountMenu');
  $('#accountBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('is-open'); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.classList.remove('is-open'); });

  // mobile nav
  const mobile = $('#mobileNav');
  $('#menuToggle').addEventListener('click', () => { mobile.classList.add('is-open'); document.body.classList.add('no-scroll'); });
  $$('[data-close-menu]').forEach((el) => el.addEventListener('click', () => { mobile.classList.remove('is-open'); document.body.classList.remove('no-scroll'); }));

  // search
  $('#searchOpen').addEventListener('click', openSearch);
  $('#searchClose').addEventListener('click', closeSearch);
  $('#searchOverlay').addEventListener('click', (e) => { if (e.target.id === 'searchOverlay') closeSearch(); });
  $('#searchInput').addEventListener('input', (e) => runSuggest(e.target.value.trim()));
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q) location.href = `shop.html?q=${encodeURIComponent(q)}`;
  });

  // drawer
  $('#bagOpen').addEventListener('click', openDrawer);
  $$('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); closeSearch(); mobile.classList.remove('is-open'); document.body.classList.remove('no-scroll'); }
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });

  // global delegated actions
  document.addEventListener('click', async (e) => {
    const wish = e.target.closest('[data-wish]');
    if (wish) {
      e.preventDefault();
      try { await toggleWishlist(wish.dataset.wish); } catch (err) { toast(err.message, { type: 'error' }); }
      return;
    }
    const quick = e.target.closest('[data-quick-open]');
    if (quick) { e.preventDefault(); openQuickAdd(quick.closest('[data-quick-add]')); return; }
    const add = e.target.closest('[data-variant-add]');
    if (add) {
      e.preventDefault();
      add.disabled = true;
      try { await addToCart(Number(add.dataset.variantAdd)); } catch (err) { toast(err.message, { type: 'error' }); }
      add.disabled = false;
      return;
    }
    const mini = e.target.closest('[data-mini-qty]');
    if (mini) {
      const item = state.cart.items.find((i) => i.id === Number(mini.dataset.miniQty));
      if (!item) return;
      const next = item.quantity + Number(mini.dataset.delta);
      try {
        if (next <= 0) await removeCartItem(item.id); else await updateCartItem(item.id, next);
      } catch (err) { toast(err.message, { type: 'error' }); }
      return;
    }
    if (e.target.closest('[data-logout]')) { e.preventDefault(); logout(); }
  });

  subscribe((s, change) => {
    if (change === 'drawer:open') { openDrawer(); return; }
    renderCounts();
    if (change === 'session' || change === 'user') renderAccount();
    if (change === 'cart' && $('#bagDrawer').classList.contains('is-open')) renderDrawer();
  });

  observeReveal();
  await loadSession();
  return state;
}

export async function requireUser() {
  await loadSession();
  if (!state.user) {
    location.replace(loginUrl());
    return new Promise(() => {}); // halt page script while redirecting
  }
  return state.user;
}
