// Order summary + coupon UI shared by the bag and checkout pages.
import { api } from './api.js';
import { esc, money, toast } from './ui.js';

let publicCoupons = [];

export function summaryHtml(cart, { showCoupon = true } = {}) {
  const remaining = Number(cart.free_shipping_remaining || 0);
  const pct = Math.min(100, (1 - remaining / Number(cart.free_shipping_threshold || 1)) * 100);
  return `
    <div class="ship-progress">
      ${remaining > 0 ? `Add <strong>${money(remaining)}</strong> more for complimentary shipping.` : '✓ Your order ships <strong>free</strong>.'}
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="summary-row"><span>Subtotal (${cart.count} item${cart.count === 1 ? '' : 's'})</span><span>${money(cart.subtotal)}</span></div>
    ${Number(cart.mrp_total) > Number(cart.subtotal) ? `<div class="summary-row"><span class="muted">You save on MRP</span><span class="save">−${money(cart.mrp_total - cart.subtotal)}</span></div>` : ''}
    ${Number(cart.discount) > 0 ? `<div class="summary-row"><span>Coupon (${esc(cart.coupon.code)})</span><span class="save">−${money(cart.discount)}</span></div>` : ''}
    <div class="summary-row"><span>Shipping</span><span>${Number(cart.shipping) ? money(cart.shipping) : 'Free'}</span></div>
    ${showCoupon ? couponHtml(cart) : ''}
    <div class="summary-row total"><span>Total</span><span>${money(cart.total)}</span></div>
    <p class="muted" style="font-size:.76rem;text-align:right">Inclusive of all taxes</p>`;
}

function couponHtml(cart) {
  if (cart.coupon) {
    return `<div class="coupon-applied"><span>✓ <strong>${esc(cart.coupon.code)}</strong> — ${esc(cart.coupon.description)}</span><button type="button" class="link-plain" data-remove-coupon>Remove</button></div>`;
  }
  return `
    ${cart.coupon_error ? `<div class="alert error" style="margin:14px 0 0">${esc(cart.coupon_error)}</div>` : ''}
    <form class="coupon-form" data-coupon-form>
      <label class="sr-only" for="couponCode">Coupon code</label>
      <input id="couponCode" name="code" placeholder="Coupon code" maxlength="30" autocomplete="off">
      <button class="btn btn-outline btn-sm" type="submit">Apply</button>
    </form>
    ${publicCoupons.length ? `<p class="coupon-hints">Try: ${publicCoupons.map((c) => `<button type="button" data-try-coupon="${esc(c.code)}" title="${esc(c.description)}">${esc(c.code)}</button>`).join('')}</p>` : ''}`;
}

export function bindCoupon(root, onChange) {
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-coupon-form]');
    if (!form) return;
    e.preventDefault();
    const code = form.code.value.trim();
    if (!code) return;
    try {
      onChange(await api.post('/cart/coupon', { code }));
      toast(`Coupon ${code.toUpperCase()} applied.`);
    } catch (err) { toast(err.message, { type: 'error' }); }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-try-coupon]');
    if (t) {
      const input = root.querySelector('#couponCode');
      input.value = t.dataset.tryCoupon;
      input.form.requestSubmit();
    }
    if (e.target.closest('[data-remove-coupon]')) {
      try { onChange(await api.del('/cart/coupon')); } catch (err) { toast(err.message, { type: 'error' }); }
    }
  });
}

export async function loadPublicCoupons() {
  try { publicCoupons = await api.get('/coupons/public'); } catch { publicCoupons = []; }
}
