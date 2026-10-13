import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { state } from '../store.js';
import { $, debounce, emptyState, esc, icons, observeReveal, productCard, skeletonCards, titleCase } from '../ui.js';

const MULTI = ['gender', 'category', 'brand', 'size', 'color', 'tag'];
const FLAGS = { sale: 'On sale', new: 'New in', featured: 'Featured', in_stock: 'In stock' };
let facets = null;

function readQuery() {
  const p = new URLSearchParams(location.search);
  const q = {};
  for (const [k, v] of p.entries()) if (v) q[k] = v;
  return q;
}
function list(q, key) { return (q[key] || '').split(',').filter(Boolean); }

function writeQuery(q, { replace = false } = {}) {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  render();
}

function toggleValue(key, value) {
  const q = readQuery();
  const values = new Set(list(q, key));
  if (values.has(value)) values.delete(value); else values.add(value);
  q[key] = [...values].join(',');
  delete q.page;
  writeQuery(q);
}

function heading(q) {
  const eyebrow = $('#shopEyebrow');
  const title = $('#shopTitle');
  const intro = $('#shopIntro');
  let t = 'Shop All';
  let e = 'The collection';
  let i = 'Considered pieces from our atelier and the labels we love.';
  const cat = facets && facets.categories.find((c) => c.slug === list(q, 'category')[0]);
  const brand = facets && facets.brands.find((b) => b.slug === list(q, 'brand')[0]);
  if (q.q) { e = 'Search'; t = `“${q.q}”`; i = 'Pieces matching your search.'; }
  else if (cat) { t = cat.name; i = cat.description; }
  else if (brand) { e = 'The label'; t = brand.name; i = `Explore the ${brand.name} collection at VASTRA.`; }
  else if (q.sale) { e = 'Private sale'; t = 'The Sale'; i = 'Exceptional pieces at exceptional prices — while sizes last.'; }
  else if (q.new) { e = 'Just landed'; t = 'New Arrivals'; i = 'The latest additions to the VASTRA wardrobe.'; }
  else if (q.tag) { e = 'The edit'; t = titleCase(list(q, 'tag')[0]); }
  if (q.gender && !q.q) { const g = titleCase(list(q, 'gender').join(' & ')); t = cat ? `${g}'s ${cat.name}` : (t === 'Shop All' ? g : `${g} · ${t}`); }
  eyebrow.textContent = e;
  title.textContent = t;
  intro.textContent = i;
  document.title = `${t.replace(/[“”]/g, '')} — VASTRA`;
}

function renderFilters(q) {
  if (!facets) return;
  const checks = (key, items) => items.map((it) => `
    <label class="checkbox"><input type="checkbox" data-toggle="${key}" value="${esc(it.value)}" ${list(q, key).includes(it.value) ? 'checked' : ''}>
    ${esc(it.label)}${it.count != null ? `<small>${it.count}</small>` : ''}</label>`).join('');
  const open = (key) => (list(q, key).length ? 'open' : '');
  $('#filterGroups').innerHTML = `
    <details class="filter-group" open><summary>Shop for</summary><div class="filter-options">
      ${checks('gender', facets.genders.map((g) => ({ value: g, label: titleCase(g) })))}
    </div></details>
    <details class="filter-group" open><summary>Category</summary><div class="filter-options">
      ${checks('category', facets.categories.map((c) => ({ value: c.slug, label: c.name, count: c.product_count })))}
    </div></details>
    <details class="filter-group" ${open('size') || 'open'}><summary>Size</summary><div class="size-options">
      ${facets.sizes.map((s) => `<button type="button" data-toggle-btn="size" data-value="${esc(s)}" class="${list(q, 'size').includes(s) ? 'is-active' : ''}">${esc(s)}</button>`).join('')}
    </div></details>
    <details class="filter-group" ${open('color')}><summary>Colour</summary><div class="color-options">
      ${facets.colors.map((c) => `<button type="button" data-toggle-btn="color" data-value="${esc(c.name)}" class="${list(q, 'color').includes(c.name) ? 'is-active' : ''}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}</button>`).join('')}
    </div></details>
    <details class="filter-group" ${open('brand')}><summary>Brand</summary><div class="filter-options">
      ${checks('brand', facets.brands.map((b) => ({ value: b.slug, label: b.name, count: b.product_count })))}
    </div></details>
    <details class="filter-group" ${q.min_price || q.max_price ? 'open' : ''}><summary>Price</summary>
      <div class="price-range">
        <input class="input" type="number" min="0" id="minPrice" placeholder="₹ ${Math.floor(facets.price.min)}" value="${esc(q.min_price || '')}" aria-label="Minimum price">
        <span>–</span>
        <input class="input" type="number" min="0" id="maxPrice" placeholder="₹ ${Math.ceil(facets.price.max)}" value="${esc(q.max_price || '')}" aria-label="Maximum price">
      </div>
    </details>
    <details class="filter-group" open><summary>Highlights</summary><div class="filter-options">
      ${Object.entries(FLAGS).map(([k, label]) => `<label class="checkbox"><input type="checkbox" data-flag="${k}" ${q[k] ? 'checked' : ''}> ${label}</label>`).join('')}
    </div></details>`;
}

function renderActive(q) {
  const chips = [];
  MULTI.forEach((key) => list(q, key).forEach((v) => {
    let label = v;
    if (key === 'category') label = facets?.categories.find((c) => c.slug === v)?.name || v;
    if (key === 'brand') label = facets?.brands.find((b) => b.slug === v)?.name || v;
    if (key === 'size') label = `Size ${v}`;
    chips.push(`<button type="button" data-remove="${key}" data-value="${esc(v)}">${esc(titleCase(label))}</button>`);
  }));
  Object.entries(FLAGS).forEach(([k, label]) => { if (q[k]) chips.push(`<button type="button" data-remove-flag="${k}">${label}</button>`); });
  if (q.min_price || q.max_price) chips.push(`<button type="button" data-remove-price>₹${esc(q.min_price || 0)} – ₹${esc(q.max_price || '∞')}</button>`);
  if (q.q) chips.push(`<button type="button" data-remove-flag="q">“${esc(q.q)}”</button>`);
  $('#activeFilters').innerHTML = chips.join('');
}

function renderPagination(page, pages) {
  const nav = $('#pagination');
  if (pages <= 1) { nav.innerHTML = ''; return; }
  const nums = [];
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  nav.innerHTML = `
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
    ${nums.map((n) => (n === '…' ? '<button type="button" disabled>…</button>' : `<button type="button" data-page="${n}" class="${n === page ? 'is-active' : ''}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`)).join('')}
    <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
}

let requestId = 0;
async function render() {
  const q = readQuery();
  heading(q);
  if (!['minPrice', 'maxPrice'].includes(document.activeElement?.id)) renderFilters(q);
  renderActive(q);
  $('#sortSelect').value = q.sort || '';
  const grid = $('#productGrid');
  grid.innerHTML = skeletonCards(6);
  const id = ++requestId;
  try {
    const data = await api.get('/products', { ...q, per_page: 12 });
    if (id !== requestId) return;
    $('#resultCount').textContent = `${data.total} ${data.total === 1 ? 'piece' : 'pieces'}`;
    grid.innerHTML = data.items.length
      ? data.items.map((p) => productCard(p, state.wishlist)).join('')
      : `<div style="grid-column:1/-1">${emptyState({ title: 'Nothing matches just yet', text: 'Try removing a filter or searching for something else.', cta: 'Clear filters', href: 'shop.html', icon: icons.search })}</div>`;
    renderPagination(data.page, data.pages);
    observeReveal(grid);
  } catch (err) {
    if (id !== requestId) return;
    grid.innerHTML = `<div style="grid-column:1/-1">${emptyState({ title: 'We could not load the collection', text: err.message, icon: icons.box })}</div>`;
  }
}

function bind() {
  const filters = $('#filters');
  const onPrice = debounce(() => {
    const q = readQuery();
    q.min_price = $('#minPrice')?.value || '';
    q.max_price = $('#maxPrice')?.value || '';
    delete q.page;
    writeQuery(q, { replace: true });
  }, 600);

  filters.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.toggle) toggleValue(t.dataset.toggle, t.value);
    else if (t.dataset.flag) {
      const q = readQuery();
      if (t.checked) q[t.dataset.flag] = '1'; else delete q[t.dataset.flag];
      delete q.page;
      writeQuery(q);
    }
  });
  filters.addEventListener('input', (e) => { if (e.target.id === 'minPrice' || e.target.id === 'maxPrice') onPrice(); });
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle-btn]');
    if (b) toggleValue(b.dataset.toggleBtn, b.dataset.value);
  });
  $('#clearFilters').addEventListener('click', () => writeQuery({}));
  $('#activeFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.remove) toggleValue(b.dataset.remove, b.dataset.value);
    else {
      const q = readQuery();
      if (b.dataset.removeFlag) delete q[b.dataset.removeFlag];
      if (b.hasAttribute('data-remove-price')) { delete q.min_price; delete q.max_price; }
      delete q.page;
      writeQuery(q);
    }
  });
  $('#sortSelect').addEventListener('change', (e) => {
    const q = readQuery();
    q.sort = e.target.value;
    delete q.page;
    writeQuery(q);
  });
  $('#pagination').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    const q = readQuery();
    q.page = b.dataset.page;
    writeQuery(q);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#openFilters').addEventListener('click', () => filters.classList.add('is-open'));
  $('#applyFilters').addEventListener('click', () => filters.classList.remove('is-open'));
  window.addEventListener('popstate', render);
}

(async () => {
  bind();
  const layout = initLayout();
  try { facets = await api.get('/catalog/filters'); } catch { $('#filterGroups').innerHTML = ''; }
  await layout;
  render();
})();
