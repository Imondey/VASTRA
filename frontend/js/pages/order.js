import { api } from '../api.js';
import { initLayout, requireUser } from '../layout.js';
import { $, date, emptyState, esc, icons, img, money, params, titleCase, toast, withLoading } from '../ui.js';

const STEPS = ['confirmed', 'processing', 'shipped', 'delivered'];
const PAYMENT = { cod: 'Cash on delivery', upi: 'UPI', card: 'Card' };

export function timelineHtml(order) {
  if (order.status === 'cancelled') {
    return '<div class="timeline cancelled"><div class="done">Placed</div><div class="done">Cancelled</div></div>';
  }
  const idx = STEPS.indexOf(order.status);
  return `<div class="timeline">${STEPS.map((s, i) => `<div class="${i <= idx ? 'done' : ''}">${titleCase(s)}</div>`).join('')}</div>`;
}

function render(order, placed) {
  document.title = `Order ${order.order_number} — VASTRA`;
  $('#orderRoot').innerHTML = `
    ${placed ? `
    <section class="confirm-hero">
      <div class="tick">${icons.check}</div>
      <span class="eyebrow">Thank you</span>
      <h1 style="margin-top:10px">Your order is confirmed</h1>
      <p>Order <strong>${esc(order.order_number)}</strong> · Track its journey anytime from your account.</p>
    </section>` : `
    <section class="page-head">
      <span class="eyebrow">Order details</span>
      <h1>${esc(order.order_number)}</h1>
      <p>Placed on ${date(order.created_at, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </section>`}

    <div class="panel-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">Status</h3>
        <span class="status ${esc(order.status)}">${esc(order.status)}</span>
      </div>
      ${timelineHtml(order)}
      ${order.history.length ? `<div style="margin-top:22px;font-size:.84rem" class="muted">${order.history.map((h) => `<div>${date(h.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(titleCase(h.status))}${h.note ? ` · ${esc(h.note)}` : ''}</div>`).join('')}</div>` : ''}
    </div>

    <div class="panel-card">
      <h3>Items</h3>
      ${order.items.map((i) => `
      <div class="order-line">
        <a class="thumb" href="product.html?slug=${encodeURIComponent(i.product_slug)}"><img src="${esc(img(i.image_url))}" alt=""><b>${i.quantity}</b></a>
        <div><span class="product-brand">${esc(i.brand_name || '')}</span><br><strong style="font-weight:500">${esc(i.product_name)}</strong><br><span class="muted">${esc(i.color)} · Size ${esc(i.size)} · ${money(i.unit_price)}</span></div>
        <span>${money(i.line_total)}</span>
      </div>`).join('')}
      <hr class="divider">
      <div class="summary-row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      ${Number(order.discount) ? `<div class="summary-row"><span>Discount${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}</span><span class="save">−${money(order.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Shipping</span><span>${Number(order.shipping_fee) ? money(order.shipping_fee) : 'Free'}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
    </div>

    <div class="form-grid" style="gap:0 24px">
      <div class="panel-card"><h3>Delivering to</h3>
        <div class="address-block"><strong>${esc(order.shipping_name)}</strong><br>${esc(order.shipping_line1)}${order.shipping_line2 ? `<br>${esc(order.shipping_line2)}` : ''}<br>
        ${esc(order.shipping_city)}, ${esc(order.shipping_state)} ${esc(order.shipping_postal_code)}<br>${esc(order.shipping_country)}<br>${esc(order.shipping_phone)}</div>
      </div>
      <div class="panel-card"><h3>Payment</h3>
        <p>${PAYMENT[order.payment_method] || esc(order.payment_method)}</p>
        <p style="margin-top:8px"><span class="status ${esc(order.payment_status)}">${esc(order.payment_status)}</span></p>
        ${order.notes ? `<p class="muted" style="margin-top:14px;font-size:.86rem">Note: ${esc(order.notes)}</p>` : ''}
      </div>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:10px">
      <a class="btn" href="shop.html">Continue shopping</a>
      <a class="btn btn-outline" href="account.html#orders">All orders</a>
      ${order.can_cancel ? '<button class="btn btn-outline" type="button" id="cancelOrder">Cancel order</button>' : ''}
    </div>`;
}

(async () => {
  await initLayout();
  await requireUser();
  const no = params().get('no');
  const placed = params().get('placed') === '1';
  const root = $('#orderRoot');
  if (!no) { root.innerHTML = emptyState({ title: 'Order not found', text: 'Check your account for all orders.', cta: 'My orders', href: 'account.html#orders' }); return; }
  try {
    let order = await api.get(`/orders/${encodeURIComponent(no)}`);
    render(order, placed);
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('#cancelOrder');
      if (!btn || !confirm('Cancel this order? Items will be released back to stock.')) return;
      await withLoading(btn, async () => {
        try {
          order = await api.post(`/orders/${encodeURIComponent(no)}/cancel`);
          toast('Your order has been cancelled.');
          render(order, false);
        } catch (err) { toast(err.message, { type: 'error' }); }
      });
    });
  } catch (err) {
    root.innerHTML = emptyState({ title: 'Order not found', text: err.message, cta: 'My orders', href: 'account.html#orders' });
  }
})();
