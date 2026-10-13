import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { addToCart, loginUrl, state, subscribe } from '../store.js';
import {
  $, $$, clearErrors, date, emptyState, esc, formValues, icons, img, observeReveal, params, priceHtml,
  productCard, showErrors, stars, titleCase, toast, withLoading,
} from '../ui.js';

const slug = params().get('slug');
let product;
let selectedColor;
let selectedVariant = null;
let quantity = 1;

function imagesFor(color) {
  const list = product.images.filter((i) => !i.color || i.color === color);
  return list.length ? list : product.images;
}

function renderGallery() {
  const images = imagesFor(selectedColor);
  const main = images[0];
  $('#gallery').innerHTML = `
    <div class="gallery-thumbs">${images.map((im, i) => `
      <button type="button" class="${i === 0 ? 'is-active' : ''}" data-img="${esc(img(im.url))}" aria-label="View image ${i + 1}">
        <img src="${esc(img(im.url))}" alt="">
      </button>`).join('')}</div>
    <div class="gallery-main" id="galleryMain"><img src="${esc(img(main && main.url))}" alt="${esc((main && main.alt) || product.name)}"></div>`;
}

function variantsFor(color) { return product.variants.filter((v) => v.color === color); }

function renderOptions() {
  const colors = [...new Map(product.variants.map((v) => [v.color, v.color_hex])).entries()];
  const variants = variantsFor(selectedColor);
  $('#colorLabel').textContent = selectedColor;
  $('#colorSelect').innerHTML = colors.map(([name, hex]) => `
    <button type="button" data-color="${esc(name)}" class="${name === selectedColor ? 'is-active' : ''}" style="background:${esc(hex)}" title="${esc(name)}" aria-label="${esc(name)}" aria-pressed="${name === selectedColor}"></button>`).join('');
  $('#sizeSelect').innerHTML = variants.map((v) => `
    <button type="button" data-variant="${v.id}" class="${v.stock <= 0 ? 'is-out' : ''} ${selectedVariant && selectedVariant.id === v.id ? 'is-active' : ''}"
      aria-pressed="${selectedVariant && selectedVariant.id === v.id ? 'true' : 'false'}" ${v.stock <= 0 ? 'aria-disabled="true" title="Sold out"' : ''}>${esc(v.size)}</button>`).join('');
  const note = $('#stockNote');
  note.className = 'stock-note';
  if (!selectedVariant) note.textContent = variants.every((v) => v.stock <= 0) ? 'This colour is currently sold out.' : '';
  else if (selectedVariant.stock <= 3) { note.textContent = `Only ${selectedVariant.stock} left — order soon.`; note.classList.add('low'); }
  else note.textContent = 'In stock · Dispatched within 24 hours';
  $('#qtyInput').value = quantity;
}

function render() {
  document.title = `${product.name} — ${product.brand || 'VASTRA'}`;
  const meta = document.createElement('meta');
  meta.name = 'description';
  meta.content = (product.description || '').slice(0, 155);
  document.head.appendChild(meta);
  $('#breadcrumb').innerHTML = `<a href="index.html">Home</a><span><a href="shop.html">Shop</a></span>
    ${product.category ? `<span><a href="shop.html?category=${encodeURIComponent(product.category_slug)}">${esc(product.category)}</a></span>` : ''}
    <span aria-current="page">${esc(product.name)}</span>`;
  $('#productRoot').innerHTML = `
    <div class="pdp">
      <div class="gallery" id="gallery"></div>
      <div class="pdp-info">
        <a class="product-brand" href="shop.html?brand=${encodeURIComponent(product.brand_slug || '')}">${esc(product.brand || 'VASTRA')}</a>
        <h1>${esc(product.name)}</h1>
        ${product.review_count ? `<a href="#reviewsSection" class="rating-mini"><span class="stars">${stars(product.rating)}</span> ${product.rating.toFixed(1)} · ${product.review_count} review${product.review_count > 1 ? 's' : ''}</a>` : ''}
        ${priceHtml(product.price, product.compare_at_price)}
        <p class="tax-note">Inclusive of all taxes · ${Number(product.price) >= 1999 ? 'Free shipping' : 'Free shipping over ₹1,999'}</p>

        <div class="option-label">Colour <span id="colorLabel"></span></div>
        <div class="color-select" id="colorSelect"></div>

        <div class="option-label">Size <span>${esc(product.fit || '')}</span></div>
        <div class="size-select" id="sizeSelect"></div>
        <div class="stock-note" id="stockNote" aria-live="polite"></div>

        <div class="buy-row">
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
            <input id="qtyInput" type="number" min="1" max="10" value="1" aria-label="Quantity">
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn" type="button" id="addToBag" ${product.in_stock ? '' : 'disabled'}>${product.in_stock ? 'Add to bag' : 'Sold out'}</button>
          <button class="wish-lg ${state.wishlist.has(product.id) ? 'is-active' : ''}" type="button" data-wish="${product.id}" aria-label="Save to wishlist">${icons.heart}</button>
        </div>

        <div class="perks">
          <div>${icons.truck}<span>Complimentary delivery over ₹1,999 · 3–5 business days</span></div>
          <div>${icons.returns}<span>Free 15-day returns &amp; exchanges</span></div>
          <div>${icons.shield}<span>Authenticity guaranteed · Secure payments</span></div>
        </div>

        <div class="accordion">
          <details open><summary>Description</summary><div class="content"><p>${esc(product.description)}</p></div></details>
          <details><summary>Details &amp; care</summary><div class="content"><dl>
            ${product.material ? `<dt>Fabric</dt><dd>${esc(product.material)}</dd>` : ''}
            ${product.fit ? `<dt>Fit</dt><dd>${esc(product.fit)}</dd>` : ''}
            <dt>For</dt><dd>${esc(titleCase(product.gender))}</dd>
            ${product.care ? `<dt>Care</dt><dd>${esc(product.care)}</dd>` : ''}
            ${(product.tags || []).length ? `<dt>Edits</dt><dd>${product.tags.map((t) => `<a class="link-plain" href="shop.html?tag=${encodeURIComponent(t)}">${esc(titleCase(t))}</a>`).join(', ')}</dd>` : ''}
          </dl></div></details>
          <details><summary>Size &amp; fit</summary><div class="content">
            <p>Model is 6'0" / 183 cm and wears size M. If you are between sizes, we recommend sizing up for a relaxed fit.</p>
            <p class="muted" style="margin-top:8px">Waist sizes are in inches. Kidswear is sized by age.</p>
          </div></details>
          <details><summary>Delivery &amp; returns</summary><div class="content">
            <p>Orders are dispatched within 24 hours from our Mumbai studio. Returns are free within 15 days of delivery — simply request a pickup from your account.</p>
          </div></details>
        </div>
      </div>
    </div>`;
  renderGallery();
  renderOptions();
}

function renderReviews(reviews) {
  const total = product.review_count;
  const breakdown = product.rating_breakdown || {};
  $('#reviewsSection').hidden = false;
  $('#ratingSummary').innerHTML = `
    <span class="eyebrow">Reviews</span>
    <h2 style="margin:8px 0 18px">What clients say</h2>
    <div class="big">${total ? product.rating.toFixed(1) : '—'}</div>
    <div class="stars" style="font-size:1.1rem;margin-top:6px">${stars(product.rating)}</div>
    <p class="muted" style="font-size:.86rem">Based on ${total} review${total === 1 ? '' : 's'}</p>
    <div class="rating-bars">${[5, 4, 3, 2, 1].map((r) => {
    const n = breakdown[r] || 0;
    return `<div><span>${r} ★</span><i><b style="width:${total ? (n / total) * 100 : 0}%"></b></i><span>${n}</span></div>`;
  }).join('')}</div>`;
  $('#reviewList').innerHTML = reviews.length ? reviews.map((r) => `
    <article class="review">
      <div class="stars">${stars(r.rating)}</div>
      ${r.title ? `<h4>${esc(r.title)}</h4>` : ''}
      <p>${esc(r.body)}</p>
      <div class="meta"><span>${esc(r.author)}</span><span>${date(r.created_at)}</span>${r.is_verified ? '<span class="verified">✓ Verified buyer</span>' : ''}</div>
    </article>`).join('') : '<p class="muted">No reviews yet — be the first to share your thoughts.</p>';

  const wrap = $('#reviewFormWrap');
  if (!state.user) {
    wrap.innerHTML = `<p class="muted"><a class="link-plain" href="${loginUrl()}">Sign in</a> to write a review.</p>`;
    return;
  }
  const mine = reviews.find((r) => r.is_mine);
  wrap.innerHTML = `
    <h3 style="margin-bottom:16px">${mine ? 'Update your review' : 'Write a review'}</h3>
    <form id="reviewForm" novalidate>
      <div class="alert" data-form-alert hidden></div>
      <div class="field"><label>Your rating</label>
        <div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="star${n}" value="${n}" ${mine && mine.rating === n ? 'checked' : ''}><label for="star${n}" title="${n} stars">★</label>`).join('')}</div>
      </div>
      <div class="field"><label for="reviewTitle">Title</label><input id="reviewTitle" name="title" maxlength="120" value="${esc(mine ? mine.title : '')}"></div>
      <div class="field"><label for="reviewBody">Review</label><textarea id="reviewBody" name="body" maxlength="2000" required>${esc(mine ? mine.body : '')}</textarea></div>
      <button class="btn" type="submit">Submit review</button>
    </form>`;
  $('#reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = formValues(form);
    if (!data.rating) { showErrors(form, { message: 'Please choose a star rating.', fields: {} }); return; }
    clearErrors(form);
    await withLoading(form.querySelector('button[type=submit]'), async () => {
      try {
        await api.post(`/products/${encodeURIComponent(slug)}/reviews`, { ...data, rating: Number(data.rating) });
        toast('Thank you — your review has been published.');
        product = await api.get(`/products/${encodeURIComponent(slug)}`);
        renderReviews(await api.get(`/products/${encodeURIComponent(slug)}/reviews`));
      } catch (err) { showErrors(form, err); }
    });
  });
}

function bind() {
  const root = $('#productRoot');
  root.addEventListener('click', async (e) => {
    const thumb = e.target.closest('[data-img]');
    if (thumb) {
      $$('.gallery-thumbs button').forEach((b) => b.classList.toggle('is-active', b === thumb));
      $('#galleryMain img').src = thumb.dataset.img;
      return;
    }
    const color = e.target.closest('[data-color]');
    if (color) {
      selectedColor = color.dataset.color;
      if (selectedVariant && selectedVariant.color !== selectedColor) {
        selectedVariant = variantsFor(selectedColor).find((v) => v.size === selectedVariant.size && v.stock > 0) || null;
      }
      renderGallery();
      renderOptions();
      return;
    }
    const size = e.target.closest('[data-variant]');
    if (size) {
      const v = product.variants.find((x) => x.id === Number(size.dataset.variant));
      if (v.stock <= 0) { toast(`Size ${v.size} is sold out in ${v.color}.`); return; }
      selectedVariant = v;
      quantity = Math.min(quantity, v.stock);
      renderOptions();
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const max = Math.min(10, selectedVariant ? selectedVariant.stock : 10);
      quantity = Math.max(1, Math.min(max, quantity + Number(q.dataset.qty)));
      $('#qtyInput').value = quantity;
      return;
    }
    if (e.target.closest('#addToBag')) {
      if (!selectedVariant) {
        $('#stockNote').textContent = 'Please select a size.';
        $('#stockNote').className = 'stock-note low';
        $('#sizeSelect').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
        return;
      }
      const btn = $('#addToBag');
      await withLoading(btn, async () => {
        try { await addToCart(selectedVariant.id, quantity); } catch (err) { toast(err.message, { type: 'error' }); }
      });
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'qtyInput') {
      const max = Math.min(10, selectedVariant ? selectedVariant.stock : 10);
      quantity = Math.max(1, Math.min(max, Number(e.target.value) || 1));
      e.target.value = quantity;
    }
  });
  // hover zoom
  root.addEventListener('mousemove', (e) => {
    const main = e.target.closest('#galleryMain');
    if (!main || !main.classList.contains('is-zoomed')) return;
    const r = main.getBoundingClientRect();
    main.querySelector('img').style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  root.addEventListener('click', (e) => {
    const main = e.target.closest('#galleryMain');
    if (main) main.classList.toggle('is-zoomed');
  });
  root.addEventListener('mouseleave', () => { const m = $('#galleryMain'); if (m) m.classList.remove('is-zoomed'); }, true);
}

(async () => {
  await initLayout();
  if (!slug) { $('#productRoot').innerHTML = emptyState({ title: 'Product not found', text: 'This piece may have moved.', cta: 'Back to shop', href: 'shop.html' }); return; }
  try {
    product = await api.get(`/products/${encodeURIComponent(slug)}`);
  } catch (err) {
    $('#productRoot').innerHTML = emptyState({ title: err.status === 404 ? 'Product not found' : 'Something went wrong', text: err.status === 404 ? 'This piece is no longer available.' : err.message, cta: 'Back to shop', href: 'shop.html' });
    return;
  }
  if (product.in_wishlist) state.wishlist.add(product.id);
  const firstInStock = product.variants.find((v) => v.stock > 0);
  selectedColor = (firstInStock || product.variants[0] || {}).color;
  render();
  bind();
  subscribe(() => {
    const w = $('.wish-lg');
    if (w) w.classList.toggle('is-active', state.wishlist.has(product.id));
  });
  api.get(`/products/${encodeURIComponent(slug)}/reviews`).then(renderReviews).catch(() => {});
  if (product.related.length) {
    $('#relatedSection').hidden = false;
    $('#relatedGrid').innerHTML = product.related.map((p) => productCard(p, state.wishlist)).join('');
    observeReveal($('#relatedGrid'));
  }
})();
