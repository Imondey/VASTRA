import { bindCoupon, loadPublicCoupons, summaryHtml } from '../summary.js';
import { initLayout } from '../layout.js';
import { removeCartItem, setCart, state, subscribe, updateCartItem } from '../store.js';
import { $, emptyState, esc, icons, img, money, toast } from '../ui.js';

function render() {
  const cart = state.cart;
  const root = $('#cartRoot');
  if (!cart.items.length) {
    root.innerHTML = emptyState({ title: 'Your bag is empty', text: 'Pieces you add will appear here. Start with our newest arrivals.', cta: 'Discover new in', href: 'shop.html?new=1', icon: icons.bag });
    return;
  }
  const blocked = cart.items.some((i) => !i.available || i.exceeds_stock);
  root.innerHTML = `
    <div class="cart-layout">
      <div>
        ${cart.items.map((i) => `
        <div class="cart-item">
          <a class="thumb" href="product.html?slug=${encodeURIComponent(i.slug)}"><img src="${esc(img(i.image))}" alt="${esc(i.name)}"></a>
          <div>
            <div class="product-brand">${esc(i.brand || '')}</div>
            <h3><a href="product.html?slug=${encodeURIComponent(i.slug)}">${esc(i.name)}</a></h3>
            <div class="variant">${esc(i.color)} · Size ${esc(i.size)} · ${money(i.price)} each</div>
            <div class="actions">
              <div class="qty sm">
                <button type="button" data-qty="${i.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
                <input value="${i.quantity}" readonly aria-label="Quantity">
                <button type="button" data-qty="${i.id}" data-delta="1" aria-label="Increase quantity" ${i.quantity >= Math.min(10, i.stock) ? 'disabled' : ''}>+</button>
              </div>
              <button type="button" class="text" data-wish="${i.product_id}">Save for later</button>
              <button type="button" class="text" data-remove="${i.id}">Remove</button>
            </div>
            ${!i.available ? '<p class="warn">This piece is now sold out. Please remove it to continue.</p>' : ''}
            ${i.available && i.exceeds_stock ? `<p class="warn">Only ${i.stock} left — please reduce the quantity.</p>` : ''}
          </div>
          <div class="line-price">${money(i.line_total)}${i.compare_at_price && Number(i.compare_at_price) > Number(i.price) ? `<del>${money(i.compare_at_price * i.quantity)}</del>` : ''}</div>
        </div>`).join('')}
        <a class="link" href="shop.html" style="display:inline-block;margin-top:28px">Continue shopping</a>
      </div>
      <aside class="summary" id="summary">
        <h3>Order Summary</h3>
        ${summaryHtml(cart)}
        <a class="btn btn-block" href="checkout.html" style="margin-top:22px" ${blocked ? 'aria-disabled="true" data-blocked' : ''}>Proceed to checkout</a>
        <div class="secure-note">${icons.lock} Secure checkout · UPI · Cards · COD</div>
      </aside>
    </div>`;
}

(async () => {
  await Promise.all([initLayout(), loadPublicCoupons()]);
  render();
  subscribe((s, change) => { if (change === 'cart' || change === 'session') render(); });
  const root = $('#cartRoot');
  bindCoupon(root, setCart);
  root.addEventListener('click', async (e) => {
    const q = e.target.closest('[data-qty]');
    const r = e.target.closest('[data-remove]');
    const blocked = e.target.closest('[data-blocked]');
    try {
      if (q) {
        const item = state.cart.items.find((i) => i.id === Number(q.dataset.qty));
        const next = item.quantity + Number(q.dataset.delta);
        if (next <= 0) await removeCartItem(item.id); else await updateCartItem(item.id, next);
      } else if (r) {
        await removeCartItem(Number(r.dataset.remove));
        toast('Removed from your bag.');
      } else if (blocked) {
        e.preventDefault();
        toast('Please resolve the highlighted items before checkout.', { type: 'error' });
      }
    } catch (err) { toast(err.message, { type: 'error' }); }
  });
})();
