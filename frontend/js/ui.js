// Shared UI helpers: escaping, formatting, icons, toasts, product cards.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n) => inr.format(Number(n || 0));
export const date = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', opts) : '';
export const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

export const params = () => new URLSearchParams(location.search);
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// Only allow relative or https image URLs coming from the API.
export function img(url, fallback = 'images/placeholder.svg') {
  if (!url || typeof url !== 'string') return fallback;
  if (/^(https:\/\/|\/|images\/|uploads\/)/.test(url)) return url;
  return fallback;
}

// ------------------------------------------------------------ icons
export const icons = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20s-7.5-4.6-9.2-9.4C1.6 7.1 3.9 4 7.2 4c2 0 3.5 1.1 4.8 2.8C13.3 5.1 14.8 4 16.8 4c3.3 0 5.6 3.1 4.4 6.6C19.5 15.4 12 20 12 20Z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrowL: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M15 5 8 12l7 7"/></svg>',
  arrowR: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m9 5 7 7-7 7"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  returns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 13 11"/></svg>',
  needle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M20 4 6 18M18 3l3 3M4 20l2-2"/><path d="M9 9c-3-1-5 1-5 3s3 3 5 1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m5 12 5 5 9-10"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7Z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 12V3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="14"/><path d="m3 6 9 7 9-7"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.4 2.5 4 5.2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

// ------------------------------------------------------------ toasts
export function toast(message, { type = 'info', action, href, timeout = 3800 } = {}) {
  let stack = $('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(message)}</span>${action && href ? `<a href="${esc(href)}">${esc(action)}</a>` : ''}`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, timeout);
}

// ------------------------------------------------------------ forms
export function formValues(form) {
  const data = {};
  new FormData(form).forEach((value, key) => { data[key] = typeof value === 'string' ? value.trim() : value; });
  $$('input[type="checkbox"]', form).forEach((cb) => { if (cb.name) data[cb.name] = cb.checked; });
  return data;
}

export function showErrors(form, err) {
  clearErrors(form);
  const fields = (err && err.fields) || {};
  Object.keys(fields).forEach((name) => {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    const field = input && input.closest('.field');
    if (field) {
      field.classList.add('has-error');
      const msg = document.createElement('span');
      msg.className = 'error';
      msg.textContent = fields[name];
      field.appendChild(msg);
    }
  });
  const box = form.querySelector('[data-form-alert]');
  if (box) {
    box.hidden = false;
    box.className = 'alert error';
    box.textContent = err.message;
  } else {
    toast(err.message, { type: 'error' });
  }
}

export function clearErrors(form) {
  $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  $$('.field .error', form).forEach((e) => e.remove());
  const box = form.querySelector('[data-form-alert]');
  if (box) box.hidden = true;
}

export async function withLoading(button, fn) {
  if (!button) return fn();
  const label = button.innerHTML;
  button.classList.add('is-loading');
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
    button.innerHTML = label;
  }
}

// ------------------------------------------------------------ product UI
export function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

export function priceHtml(price, compare) {
  const off = compare && Number(compare) > Number(price)
    ? Math.round(((compare - price) * 100) / compare) : 0;
  return `<div class="price"><span>${money(price)}</span>${off ? `<del>${money(compare)}</del><span class="off">${off}% off</span>` : ''}</div>`;
}

export function productCard(p, wishlist = new Set()) {
  const inWish = wishlist.has(p.id);
  const badges = [
    !p.in_stock ? '<span class="badge soldout">Sold out</span>' : '',
    p.discount_percent ? `<span class="badge sale">−${p.discount_percent}%</span>` : '',
    p.is_new ? '<span class="badge">New</span>' : '',
  ].join('');
  const url = `product.html?slug=${encodeURIComponent(p.slug)}`;
  return `
  <article class="product-card reveal" data-product-id="${p.id}" data-slug="${esc(p.slug)}">
    <div class="product-media">
      <a href="${url}" aria-label="${esc(p.name)}">
        <img src="${esc(img(p.image))}" alt="${esc(p.name)}" loading="lazy">
        ${p.hover_image ? `<img class="hover" src="${esc(img(p.hover_image))}" alt="" loading="lazy" aria-hidden="true">` : ''}
      </a>
      <div class="product-badges">${badges}</div>
      <button class="wish-btn ${inWish ? 'is-active' : ''}" data-wish="${p.id}" aria-pressed="${inWish}" aria-label="Save ${esc(p.name)} to wishlist">${icons.heart}</button>
      ${p.in_stock ? `<div class="quick-add" data-quick-add="${esc(p.slug)}">
        <button class="btn btn-sm btn-block" type="button" data-quick-open>Quick add</button>
      </div>` : ''}
    </div>
    <div class="product-info">
      <div class="product-brand">${esc(p.brand || 'VASTRA')}</div>
      <h3 class="product-name"><a href="${url}">${esc(p.name)}</a></h3>
      ${priceHtml(p.price, p.compare_at_price)}
      ${p.review_count ? `<div class="rating-mini"><span class="stars">${stars(p.rating)}</span>(${p.review_count})</div>` : ''}
      ${(p.colors || []).length > 1 ? `<div class="swatches">${p.colors.map((c) => `<span title="${esc(c.name)}" style="background:${esc(c.hex)}"></span>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

export function skeletonCards(n = 4) {
  return Array.from({ length: n }, () => `
    <div class="product-card skeleton-card" aria-hidden="true">
      <div class="product-media skeleton"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </div>`).join('');
}

export function emptyState({ title, text, cta, href, icon = icons.bag }) {
  return `<div class="empty-state">${icon}<h3>${esc(title)}</h3><p>${esc(text)}</p>${cta ? `<a class="btn" href="${esc(href)}">${esc(cta)}</a>` : ''}</div>`;
}

// Fade sections in as they scroll into view.
let observer;
export function observeReveal(root = document) {
  if (!('IntersectionObserver' in window)) {
    $$('.reveal', root).forEach((el) => el.classList.add('is-visible'));
    return;
  }
  observer = observer || new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); observer.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -40px 0px' });
  $$('.reveal:not(.is-visible)', root).forEach((el) => observer.observe(el));
}
