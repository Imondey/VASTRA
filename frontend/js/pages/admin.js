import { api } from '../api.js';
import { $, $$, date, debounce, esc, icons, img, money, titleCase, toast, withLoading } from '../ui.js';

const TABS = ['dashboard', 'orders', 'products', 'customers', 'coupons', 'messages'];
const main = () => $('#adminMain');
let lookups = { categories: [], brands: [], order_statuses: [] };

// ------------------------------------------------------------ helpers
function pager(page, pages, onGo) {
  if (pages <= 1) return '';
  const id = `pg${Math.random().toString(36).slice(2, 7)}`;
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b && !b.disabled) onGo(Number(b.dataset.page)); });
  });
  return `<nav class="pagination" id="${id}" style="margin-top:24px">
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>
    <button type="button" class="is-active">${page} / ${pages}</button>
    <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button></nav>`;
}

function modal(html, { size = '' } = {}) {
  const rootEl = $('#modalRoot');
  rootEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-card ${size}">${html}</div></div>`;
  const close = () => { rootEl.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  rootEl.querySelector('.modal').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal')) close(); });
  $$('[data-close-modal]', rootEl).forEach((b) => b.addEventListener('click', close));
  return { el: rootEl.querySelector('.modal-card'), close };
}

const statusBadge = (s) => `<span class="status ${esc(s)}">${esc(s)}</span>`;

// ------------------------------------------------------------ dashboard
async function dashboard() {
  const d = await api.get('/admin/stats');
  const t = d.totals;
  const max = Math.max(1, ...d.sales.map((s) => Number(s.revenue)));
  main().innerHTML = `
    <div class="admin-top"><div><span class="eyebrow">Overview</span><h1>Dashboard</h1></div>
      <span class="muted">${date(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
    <div class="kpis">
      <div class="kpi"><span>Revenue</span><strong>${money(t.revenue)}</strong><small>${money(t.revenue_30d)} in last 30 days</small></div>
      <div class="kpi"><span>Orders</span><strong>${t.orders}</strong><small>${t.open_orders} awaiting fulfilment</small></div>
      <div class="kpi"><span>Avg. order value</span><strong>${money(t.avg_order_value)}</strong><small>Excludes cancelled</small></div>
      <div class="kpi"><span>Customers</span><strong>${t.customers}</strong><small>${t.subscribers} newsletter subscribers</small></div>
    </div>
    <div class="admin-grid">
      <div class="card"><h3>Sales · last 14 days</h3>
        <div class="chart">${d.sales.map((s) => `<div class="bar"><i style="height:${(Number(s.revenue) / max) * 100}%" data-tip="${esc(money(s.revenue))} · ${s.orders} orders"></i><span>${date(s.day, { day: 'numeric', month: 'short' }).replace(' ', '\u00a0')}</span></div>`).join('')}</div>
      </div>
      <div class="card"><h3>Order status</h3>
        ${d.by_status.length ? d.by_status.map((s) => `<div class="summary-row">${statusBadge(s.status)}<strong>${s.count}</strong></div>`).join('') : '<p class="muted">No orders yet.</p>'}
        <hr class="divider"><div class="summary-row"><span>Active products</span><strong>${t.products}</strong></div>
        <div class="summary-row"><span>Unread messages</span><strong>${t.unread_messages}</strong></div>
      </div>
    </div>
    <div class="admin-grid">
      <div class="card"><h3>Recent orders <button class="link" type="button" data-goto="orders">View all</button></h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${d.recent_orders.map((o) => `<tr data-order="${o.id}" style="cursor:pointer"><td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.shipping_name)}<br><span class="muted">${esc(o.customer_email || '')}</span></td><td>${date(o.created_at)}</td><td>${statusBadge(o.status)}</td><td style="text-align:right">${money(o.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No orders yet.</td></tr>'}</tbody></table></div>
      </div>
      <div class="card"><h3>Low stock</h3>
        ${d.low_stock.length ? `<table class="table"><tbody>${d.low_stock.map((v) => `<tr><td>${esc(v.name)}<br><span class="muted">${esc(v.color)} · ${esc(v.size)}</span></td><td style="text-align:right"><strong style="color:${v.stock ? 'inherit' : 'var(--danger)'}">${v.stock}</strong></td></tr>`).join('')}</tbody></table>` : '<p class="muted">All variants are well stocked.</p>'}
        <h3 style="margin-top:24px">Best sellers</h3>
        ${d.top_products.length ? d.top_products.map((p) => `<div class="summary-row"><span>${esc(p.name)}</span><strong>${p.units}</strong></div>`).join('') : '<p class="muted">No sales yet.</p>'}
      </div>
    </div>`;
  main().onclick = (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) location.hash = go.dataset.goto;
    const row = e.target.closest('[data-order]');
    if (row) openOrder(Number(row.dataset.order));
  };
}

// ------------------------------------------------------------ orders
async function orders(page = 1) {
  const status = $('#orderStatus')?.value || '';
  const q = $('#orderSearch')?.value || '';
  if (!$('#ordersTable')) {
    main().innerHTML = `
      <div class="admin-top"><div><span class="eyebrow">Fulfilment</span><h1>Orders</h1></div></div>
      <div class="toolbar">
        <input id="orderSearch" placeholder="Search order no., name or email" aria-label="Search orders">
        <select id="orderStatus" aria-label="Filter by status"><option value="">All statuses</option>${lookups.order_statuses.map((s) => `<option value="${s}">${titleCase(s)}</option>`).join('')}</select>
      </div>
      <div class="card"><div class="table-wrap" id="ordersTable"></div></div>`;
    $('#orderSearch').addEventListener('input', debounce(() => orders(1), 300));
    $('#orderStatus').addEventListener('change', () => orders(1));
    main().onclick = (e) => { const row = e.target.closest('[data-order]'); if (row) openOrder(Number(row.dataset.order)); };
  }
  const d = await api.get('/admin/orders', { page, status, q });
  $('#ordersTable').innerHTML = `<table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Items</th><th>Payment</th><th>Status</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${d.items.map((o) => `<tr data-order="${o.id}" style="cursor:pointer">
      <td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.shipping_name)}<br><span class="muted">${esc(o.customer_email || '')}</span></td>
      <td>${date(o.created_at)}</td><td>${o.item_count}</td><td>${esc(o.payment_method.toUpperCase())} ${statusBadge(o.payment_status)}</td>
      <td>${statusBadge(o.status)}</td><td style="text-align:right">${money(o.total)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No orders found.</td></tr>'}</tbody></table>
    ${pager(d.page, d.pages, orders)}`;
}

async function openOrder(id) {
  const o = await api.get(`/admin/orders/${id}`);
  const { el, close } = modal(`
    <div class="modal-head"><div><span class="eyebrow">Order</span><h2>${esc(o.order_number)}</h2></div><button class="icon-btn" data-close-modal aria-label="Close">${icons.close}</button></div>
    <div class="form-grid" style="gap:0 24px">
      <div>
        ${o.items.map((i) => `<div class="order-line"><div class="thumb"><img src="${esc(img(i.image_url))}" alt=""><b>${i.quantity}</b></div>
          <div><strong style="font-weight:500">${esc(i.product_name)}</strong><br><span class="muted">${esc(i.color)} · ${esc(i.size)} · ${money(i.unit_price)}</span></div><span>${money(i.line_total)}</span></div>`).join('')}
        <hr class="divider">
        <div class="summary-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
        ${Number(o.discount) ? `<div class="summary-row"><span>Discount ${esc(o.coupon_code || '')}</span><span>−${money(o.discount)}</span></div>` : ''}
        <div class="summary-row"><span>Shipping</span><span>${money(o.shipping_fee)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px"><h3>Ship to</h3><div class="address-block">${esc(o.shipping_name)}<br>${esc(o.shipping_line1)}${o.shipping_line2 ? `<br>${esc(o.shipping_line2)}` : ''}<br>${esc(o.shipping_city)}, ${esc(o.shipping_state)} ${esc(o.shipping_postal_code)}<br>${esc(o.shipping_phone)}<br><span class="muted">${esc(o.customer_email || '')}</span></div>
          ${o.notes ? `<p class="muted" style="margin-top:10px">Note: ${esc(o.notes)}</p>` : ''}</div>
        <div class="card"><h3>Status ${statusBadge(o.status)}</h3>
          <p class="muted" style="font-size:.84rem;margin-bottom:14px">Payment: ${esc(o.payment_method.toUpperCase())} · ${esc(o.payment_status)}</p>
          ${o.status === 'cancelled' ? '<p class="muted">This order was cancelled and stock was released.</p>' : `
          <form id="statusForm">
            <div class="field"><label for="newStatus">Update status</label><select id="newStatus" name="status">${lookups.order_statuses.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${titleCase(s)}</option>`).join('')}</select></div>
            <div class="field"><label for="statusNote">Note (optional)</label><input id="statusNote" name="note" maxlength="255" placeholder="e.g. AWB 1234 via BlueDart"></div>
            <button class="btn btn-block" type="submit">Save</button>
          </form>`}
          <div style="margin-top:18px;font-size:.8rem" class="muted">${o.history.map((h) => `<div>${date(h.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(h.status)}${h.note ? ` — ${esc(h.note)}` : ''}</div>`).join('')}</div>
        </div>
      </div>
    </div>`);
  const form = el.querySelector('#statusForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.elements['status'].value === 'cancelled' && !confirm('Cancel this order and return items to stock?')) return;
      await withLoading(form.querySelector('[type=submit]'), async () => {
        try {
          await api.patch(`/admin/orders/${id}`, { status: form.elements['status'].value, note: form.elements['note'].value });
          toast('Order updated.');
          close();
          route();
        } catch (err) { toast(err.message, { type: 'error' }); }
      });
    });
  }
}

// ------------------------------------------------------------ products
async function products(page = 1) {
  const q = $('#productSearch')?.value || '';
  const status = $('#productStatus')?.value || '';
  if (!$('#productsTable')) {
    main().innerHTML = `
      <div class="admin-top"><div><span class="eyebrow">Catalogue</span><h1>Products</h1></div>
        <button class="btn" type="button" id="newProduct">New product</button></div>
      <div class="toolbar">
        <input id="productSearch" placeholder="Search name, slug or brand" aria-label="Search products">
        <select id="productStatus" aria-label="Filter by status"><option value="">All</option><option value="active">Active</option><option value="archived">Archived</option></select>
      </div>
      <div class="card"><div class="table-wrap" id="productsTable"></div></div>`;
    $('#productSearch').addEventListener('input', debounce(() => products(1), 300));
    $('#productStatus').addEventListener('change', () => products(1));
    $('#newProduct').addEventListener('click', () => editProduct(null));
    main().onclick = async (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-delete]');
      if (edit) editProduct(Number(edit.dataset.edit));
      if (del && confirm('Delete this product? Products with orders will be archived instead.')) {
        try {
          const r = await api.del(`/admin/products/${del.dataset.delete}`);
          toast(r.archived ? r.message : 'Product deleted.');
          products(page);
        } catch (err) { toast(err.message, { type: 'error' }); }
      }
    };
  }
  const d = await api.get('/admin/products', { page, q, status });
  $('#productsTable').innerHTML = `<table class="table"><thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
    <tbody>${d.items.map((p) => `<tr>
      <td><img class="thumb" src="${esc(img(p.image))}" alt=""></td>
      <td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.brand || '—')} · ${esc(titleCase(p.gender))}</span></td>
      <td>${esc(p.category || '—')}</td>
      <td>${money(p.price)}${p.compare_at_price ? `<br><del class="muted">${money(p.compare_at_price)}</del>` : ''}</td>
      <td><strong style="color:${Number(p.stock) <= 5 ? 'var(--danger)' : 'inherit'}">${p.stock}</strong> <span class="muted">/ ${p.variant_count} variants</span></td>
      <td>${p.is_active ? '<span class="status delivered">active</span>' : '<span class="status cancelled">archived</span>'}${p.is_featured ? ' <span class="status">featured</span>' : ''}</td>
      <td><div class="row-actions"><a href="product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener" style="font-size:.76rem;text-decoration:underline">View</a><button type="button" data-edit="${p.id}">Edit</button><button type="button" class="danger" data-delete="${p.id}">Delete</button></div></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No products found.</td></tr>'}</tbody></table>
    ${pager(d.page, d.pages, products)}`;
}

function variantRow(v = {}) {
  return `<tr data-original="${v.id ? esc(v.stock) : ''}">
    <td><input name="v_color" value="${esc(v.color || '')}" placeholder="e.g. Navy" required></td>
    <td><input type="color" name="v_hex" value="${esc(v.color_hex || '#1f2a44')}"></td>
    <td><input name="v_size" value="${esc(v.size || '')}" placeholder="M" required style="width:80px"></td>
    <td><input type="number" name="v_stock" min="0" value="${v.stock ?? 10}" style="width:90px"></td>
    <td><button type="button" class="icon-btn" data-remove-row aria-label="Remove variant">${icons.close}</button></td>
  </tr>`;
}

async function editProduct(id) {
  const p = id ? await api.get(`/admin/products/${id}`) : {
    name: '', slug: '', description: '', gender: 'unisex', price: '', compare_at_price: '', material: '', care: '', fit: '',
    tags: [], is_featured: false, is_active: true, images: [], variants: [{ color: 'Black', color_hex: '#151515', size: 'M', stock: 10 }],
  };
  let images = [...p.images];
  const opt = (list, sel) => `<option value="">—</option>${list.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const { el, close } = modal(`
    <div class="modal-head"><h2>${id ? 'Edit product' : 'New product'}</h2><button class="icon-btn" data-close-modal aria-label="Close">${icons.close}</button></div>
    <form id="productForm" novalidate>
      <div class="form-grid">
        <div class="field"><label>Name</label><input name="name" required maxlength="160" value="${esc(p.name)}"></div>
        <div class="field"><label>URL slug</label><input name="slug" maxlength="180" value="${esc(p.slug)}" placeholder="auto from name"></div>
        <div class="field"><label>Brand</label><select name="brand_id">${opt(lookups.brands, p.brand_id)}</select></div>
        <div class="field"><label>Category</label><select name="category_id">${opt(lookups.categories, p.category_id)}</select></div>
        <div class="field"><label>Price (₹)</label><input name="price" type="number" min="0" step="1" required value="${esc(p.price)}"></div>
        <div class="field"><label>Compare-at price (₹)</label><input name="compare_at_price" type="number" min="0" step="1" value="${esc(p.compare_at_price ?? '')}" placeholder="Optional — shows a sale price"></div>
        <div class="field"><label>For</label><select name="gender">${['men', 'women', 'kids', 'unisex'].map((g) => `<option value="${g}" ${g === p.gender ? 'selected' : ''}>${titleCase(g)}</option>`).join('')}</select></div>
        <div class="field"><label>Fit</label><input name="fit" maxlength="60" value="${esc(p.fit || '')}" placeholder="Regular fit"></div>
        <div class="field full"><label>Description</label><textarea name="description" maxlength="5000">${esc(p.description)}</textarea></div>
        <div class="field"><label>Material</label><input name="material" maxlength="160" value="${esc(p.material || '')}"></div>
        <div class="field"><label>Care</label><input name="care" maxlength="255" value="${esc(p.care || '')}"></div>
        <div class="field full"><label>Edits / tags</label><input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="casual, premium, trending"></div>
      </div>
      <div style="display:flex;gap:24px;margin-bottom:24px">
        <label class="checkbox"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> Active (visible in store)</label>
        <label class="checkbox"><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}> Featured on home page</label>
      </div>

      <h3 style="margin-bottom:12px">Images</h3>
      <div class="image-list" id="imageList"></div>
      <div class="toolbar">
        <input id="imageUrl" placeholder="images/products/… or https://…" style="flex:1">
        <button class="btn btn-outline btn-sm" type="button" id="addImageUrl">Add URL</button>
        <label class="btn btn-outline btn-sm" style="cursor:pointer">Upload<input type="file" id="imageFile" accept="image/jpeg,image/png,image/webp" hidden></label>
      </div>

      <h3 style="margin:24px 0 12px">Variants &amp; stock</h3>
      <table class="table variant-table"><thead><tr><th>Colour</th><th>Swatch</th><th>Size</th><th>Stock</th><th></th></tr></thead>
        <tbody id="variantRows">${p.variants.map(variantRow).join('')}</tbody></table>
      <div style="display:flex;gap:8px;margin:12px 0 28px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" type="button" id="addVariant">Add variant</button>
        <button class="btn btn-outline btn-sm" type="button" id="addSizeRun">Add size run (XS–XXL) for a colour</button>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-outline" type="button" data-close-modal>Cancel</button><button class="btn" type="submit">Save product</button></div>
    </form>`);

  const renderImages = () => {
    el.querySelector('#imageList').innerHTML = images.map((im, i) => `<figure><img src="${esc(img(im.url))}" alt=""><button type="button" data-remove-image="${i}" aria-label="Remove image">×</button></figure>`).join('') || '<p class="muted">No images yet.</p>';
  };
  renderImages();
  $$('[data-close-modal]', el).forEach((b) => b.addEventListener('click', close));

  el.addEventListener('click', async (e) => {
    const ri = e.target.closest('[data-remove-image]');
    if (ri) { images.splice(Number(ri.dataset.removeImage), 1); renderImages(); }
    if (e.target.closest('[data-remove-row]')) e.target.closest('tr').remove();
    if (e.target.closest('#addVariant')) el.querySelector('#variantRows').insertAdjacentHTML('beforeend', variantRow());
    if (e.target.closest('#addSizeRun')) {
      const color = prompt('Colour name for the size run', 'Black');
      if (color) ['XS', 'S', 'M', 'L', 'XL', 'XXL'].forEach((size) => el.querySelector('#variantRows').insertAdjacentHTML('beforeend', variantRow({ color, size, stock: 10 })));
    }
    if (e.target.closest('#addImageUrl')) {
      const url = el.querySelector('#imageUrl').value.trim();
      if (url) { images.push({ url, alt: '' }); el.querySelector('#imageUrl').value = ''; renderImages(); }
    }
  });
  el.querySelector('#imageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.upload('/admin/uploads', fd);
      images.push({ url: r.url, alt: '' });
      renderImages();
    } catch (err) { toast(err.message, { type: 'error' }); }
    e.target.value = '';
  });
  el.querySelector('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const variants = $$('#variantRows tr', el).map((tr) => ({
      color: tr.querySelector('[name=v_color]').value.trim(),
      color_hex: tr.querySelector('[name=v_hex]').value,
      size: tr.querySelector('[name=v_size]').value.trim(),
      stock: Number(tr.querySelector('[name=v_stock]').value || 0),
      original_stock: tr.dataset.original === '' ? null : Number(tr.dataset.original),
    }));
    const body = {
      name: f.elements['name'].value, slug: f.elements['slug'].value, brand_id: f.elements['brand_id'].value || null, category_id: f.elements['category_id'].value || null,
      price: f.elements['price'].value, compare_at_price: f.elements['compare_at_price'].value || null, gender: f.elements['gender'].value, fit: f.elements['fit'].value,
      description: f.elements['description'].value, material: f.elements['material'].value, care: f.elements['care'].value,
      tags: f.elements['tags'].value.split(',').map((t) => t.trim()).filter(Boolean),
      is_active: f.elements['is_active'].checked, is_featured: f.elements['is_featured'].checked, images, variants,
    };
    await withLoading(f.querySelector('[type=submit]'), async () => {
      try {
        await (id ? api.put(`/admin/products/${id}`, body) : api.post('/admin/products', body));
        toast(id ? 'Product updated.' : 'Product created.');
        close();
        products();
      } catch (err) { toast(err.message, { type: 'error' }); }
    });
  });
}

// ------------------------------------------------------------ customers
async function customers(page = 1) {
  const q = $('#customerSearch')?.value || '';
  if (!$('#customersTable')) {
    main().innerHTML = `
      <div class="admin-top"><div><span class="eyebrow">Clients</span><h1>Customers</h1></div></div>
      <div class="toolbar"><input id="customerSearch" placeholder="Search name or email" aria-label="Search customers"></div>
      <div class="card"><div class="table-wrap" id="customersTable"></div></div>`;
    $('#customerSearch').addEventListener('input', debounce(() => customers(1), 300));
    main().onclick = async (e) => {
      const b = e.target.closest('[data-toggle-user]');
      if (!b) return;
      try {
        await api.patch(`/admin/customers/${b.dataset.toggleUser}`, { is_active: b.dataset.active !== 'true' });
        toast('Customer updated.');
        customers(page);
      } catch (err) { toast(err.message, { type: 'error' }); }
    };
  }
  const d = await api.get('/admin/customers', { page, q });
  $('#customersTable').innerHTML = `<table class="table"><thead><tr><th>Name</th><th>Joined</th><th>Orders</th><th>Total spent</th><th>Last order</th><th>Role</th><th></th></tr></thead>
    <tbody>${d.items.map((u) => `<tr>
      <td><strong>${esc(u.full_name)}</strong><br><span class="muted">${esc(u.email)}</span></td><td>${date(u.created_at)}</td>
      <td>${u.order_count}</td><td>${money(u.total_spent)}</td><td>${u.last_order_at ? date(u.last_order_at) : '—'}</td>
      <td>${esc(u.role)}${u.is_active ? '' : ' <span class="status cancelled">disabled</span>'}</td>
      <td><div class="row-actions"><button type="button" data-toggle-user="${u.id}" data-active="${u.is_active}" class="${u.is_active ? 'danger' : ''}">${u.is_active ? 'Disable' : 'Enable'}</button></div></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No customers found.</td></tr>'}</tbody></table>
    ${pager(d.page, d.pages, customers)}`;
}

// ------------------------------------------------------------ coupons
async function coupons() {
  const list = await api.get('/admin/coupons');
  main().innerHTML = `
    <div class="admin-top"><div><span class="eyebrow">Promotions</span><h1>Coupons</h1></div></div>
    <div class="admin-grid">
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Offer</th><th>Min. order</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((c) => `<tr>
          <td><strong>${esc(c.code)}</strong><br><span class="muted">${esc(c.description)}</span></td>
          <td>${c.discount_type === 'percent' ? `${Number(c.value)}%${c.max_discount ? ` (max ${money(c.max_discount)})` : ''}` : money(c.value)}</td>
          <td>${money(c.min_order)}</td><td>${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
          <td>${c.expires_at ? date(c.expires_at) : '—'}</td>
          <td>${c.is_active ? '<span class="status delivered">active</span>' : '<span class="status cancelled">paused</span>'}</td>
          <td><div class="row-actions"><button type="button" data-toggle-coupon="${c.id}" data-active="${c.is_active}">${c.is_active ? 'Pause' : 'Activate'}</button><button type="button" class="danger" data-delete-coupon="${c.id}">Delete</button></div></td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">No coupons yet.</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>New coupon</h3>
        <form id="couponForm">
          <div class="field"><label>Code</label><input name="code" required maxlength="30" style="text-transform:uppercase"></div>
          <div class="field"><label>Description</label><input name="description" maxlength="200"></div>
          <div class="form-grid">
            <div class="field"><label>Type</label><select name="discount_type"><option value="percent">Percent</option><option value="fixed">Fixed ₹</option></select></div>
            <div class="field"><label>Value</label><input name="value" type="number" min="1" required></div>
            <div class="field"><label>Min. order ₹</label><input name="min_order" type="number" min="0" value="0"></div>
            <div class="field"><label>Max discount ₹</label><input name="max_discount" type="number" min="0"></div>
            <div class="field"><label>Usage limit</label><input name="usage_limit" type="number" min="1"></div>
            <div class="field"><label>Expires</label><input name="expires_at" type="date"></div>
          </div>
          <button class="btn btn-block" type="submit">Create coupon</button>
        </form>
      </div>
    </div>`;
  main().onclick = async (e) => {
    const t = e.target.closest('[data-toggle-coupon]');
    const d = e.target.closest('[data-delete-coupon]');
    try {
      if (t) { await api.patch(`/admin/coupons/${t.dataset.toggleCoupon}`, { is_active: t.dataset.active !== 'true' }); coupons(); }
      if (d && confirm('Delete this coupon?')) { await api.del(`/admin/coupons/${d.dataset.deleteCoupon}`); coupons(); }
    } catch (err) { toast(err.message, { type: 'error' }); }
  };
  $('#couponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api.post('/admin/coupons', body);
      toast('Coupon created.');
      coupons();
    } catch (err) { toast(err.message, { type: 'error' }); }
  });
}

// ------------------------------------------------------------ messages
async function messages() {
  const d = await api.get('/admin/messages');
  main().innerHTML = `
    <div class="admin-top"><div><span class="eyebrow">Client care</span><h1>Messages</h1></div></div>
    <div class="admin-grid">
      <div class="card"><h3>Contact messages</h3>
        ${d.messages.map((m) => `<div class="review" style="${m.is_read ? 'opacity:.6' : ''}">
          <div style="display:flex;justify-content:space-between;gap:10px"><strong>${esc(m.subject || 'Message')}</strong><span class="muted" style="font-size:.78rem">${date(m.created_at)}</span></div>
          <p style="margin:6px 0">${esc(m.message)}</p>
          <div class="meta"><span>${esc(m.name)}</span><a class="link-plain" href="mailto:${encodeURIComponent(m.email)}">${esc(m.email)}</a>
          ${m.is_read ? '' : `<button type="button" class="link-plain" data-read="${m.id}">Mark as read</button>`}</div>
        </div>`).join('') || '<p class="muted">No messages yet.</p>'}
      </div>
      <div class="card"><h3>Newsletter (${d.subscribers.length})</h3>
        ${d.subscribers.map((s) => `<div class="summary-row"><span>${esc(s.email)}</span><span class="muted">${date(s.created_at)}</span></div>`).join('') || '<p class="muted">No subscribers yet.</p>'}
      </div>
    </div>`;
  main().onclick = async (e) => {
    const b = e.target.closest('[data-read]');
    if (b) { await api.patch(`/admin/messages/${b.dataset.read}`, { is_read: true }); messages(); }
  };
}

// ------------------------------------------------------------ router
async function route() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  $$('#adminNav [data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  main().onclick = null;
  main().innerHTML = '<div class="spinner"></div>';
  try {
    await { dashboard, orders, products, customers, coupons, messages }[tab]();
  } catch (err) {
    main().innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
  }
}

(async () => {
  $$('#adminNav [data-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', icons[b.dataset.icon]));
  let me;
  try { me = (await api.get('/auth/me')).user; } catch (err) { main().innerHTML = `<div class="alert error">${esc(err.message)}</div>`; return; }
  if (!me) { location.replace('login.html?next=admin.html'); return; }
  if (!me.is_admin) {
    main().innerHTML = '<div class="empty-state"><h3>Restricted area</h3><p>Your account does not have access to the back office.</p><a class="btn" href="index.html">Back to store</a></div>';
    return;
  }
  $('#adminWho').textContent = me.email;
  lookups = await api.get('/admin/lookups');
  $$('#adminNav [data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
  $('[data-admin-logout]').addEventListener('click', async (e) => { e.preventDefault(); await api.post('/auth/logout'); location.href = 'index.html'; });
  window.addEventListener('hashchange', route);
  route();
})();
