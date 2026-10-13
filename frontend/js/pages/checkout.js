import { api } from '../api.js';
import { initLayout, requireUser } from '../layout.js';
import { refreshCart, setCart, state, subscribe } from '../store.js';
import { addressFields, addressText } from '../address.js';
import { bindCoupon, loadPublicCoupons, summaryHtml } from '../summary.js';
import { $, $$, clearErrors, emptyState, esc, formValues, icons, img, money, showErrors, toast, withLoading } from '../ui.js';

let addresses = [];
let selectedAddress = null; // id or 'new'
let payment = 'cod';

function render() {
  const cart = state.cart;
  const root = $('#checkoutRoot');
  if (!cart.items.length) {
    root.innerHTML = emptyState({ title: 'Your bag is empty', text: 'Add a few pieces before checking out.', cta: 'Continue shopping', href: 'shop.html', icon: icons.bag });
    return;
  }
  root.innerHTML = `
    <div class="checkout-layout">
      <div>
        <section class="panel-card">
          <h3><span class="num">1</span> Delivery address</h3>
          <div class="choice-list" id="addressChoices">
            ${addresses.map((a) => `
            <label class="choice ${selectedAddress === a.id ? 'is-selected' : ''}">
              <input type="radio" name="address" value="${a.id}" ${selectedAddress === a.id ? 'checked' : ''}>
              <div><strong>${esc(a.full_name)} · ${esc(a.phone)}</strong><span>${addressText(a)}</span></div>
              <span class="tag">${esc(a.label)}</span>
            </label>`).join('')}
            <label class="choice ${selectedAddress === 'new' ? 'is-selected' : ''}">
              <input type="radio" name="address" value="new" ${selectedAddress === 'new' ? 'checked' : ''}>
              <div><strong>${addresses.length ? 'Deliver to a new address' : 'Add your delivery address'}</strong><span>We deliver across India.</span></div>
            </label>
          </div>
          <form id="newAddressForm" ${selectedAddress === 'new' ? '' : 'hidden'} novalidate>
            <div class="alert" data-form-alert hidden></div>
            ${addressFields({}, state.user)}
            <label class="checkbox"><input type="checkbox" name="save_address" checked> Save this address to my account</label>
          </form>
        </section>

        <section class="panel-card">
          <h3><span class="num">2</span> Payment</h3>
          <div class="choice-list" id="paymentChoices">
            ${[
    ['cod', 'Cash on delivery', 'Pay in cash or UPI when your order arrives.'],
    ['upi', 'UPI', 'Google Pay, PhonePe, Paytm and all UPI apps.'],
    ['card', 'Credit / debit card', 'Visa, Mastercard, RuPay and Amex.'],
  ].map(([v, t, d]) => `
            <label class="choice ${payment === v ? 'is-selected' : ''}">
              <input type="radio" name="payment" value="${v}" ${payment === v ? 'checked' : ''}>
              <div><strong>${t}</strong><span>${d}</span></div>
            </label>`).join('')}
          </div>
          ${payment !== 'cod' ? '<p class="alert info">Demo mode: online payments are simulated and marked as paid instantly. Connect a gateway such as Razorpay or Stripe before going live.</p>' : ''}
          <div class="field"><label for="orderNotes">Order notes (optional)</label><textarea id="orderNotes" maxlength="500" placeholder="Gift message or delivery instructions" style="min-height:80px"></textarea></div>
        </section>
      </div>

      <aside class="summary" id="checkoutSummary">
        <h3>Your Order</h3>
        <div class="order-lines">${cart.items.map((i) => `
          <div class="order-line">
            <div class="thumb"><img src="${esc(img(i.image))}" alt=""><b>${i.quantity}</b></div>
            <div><strong style="font-weight:500">${esc(i.name)}</strong><br><span class="muted">${esc(i.color)} · ${esc(i.size)}</span></div>
            <span>${money(i.line_total)}</span>
          </div>`).join('')}</div>
        ${summaryHtml(cart)}
        <button class="btn btn-block" type="button" id="placeOrder" style="margin-top:22px">Place order · ${money(cart.total)}</button>
        <div class="secure-note">${icons.lock} Your information is encrypted and secure</div>
        <p class="muted" style="font-size:.74rem;text-align:center;margin-top:12px">By placing your order you agree to our terms and returns policy.</p>
      </aside>
    </div>`;
}

async function placeOrder(button) {
  const body = { payment_method: payment, notes: $('#orderNotes').value.trim() };
  if (selectedAddress === 'new') {
    const form = $('#newAddressForm');
    clearErrors(form);
    const data = formValues(form);
    body.address = data;
    body.save_address = data.save_address;
  } else if (selectedAddress) {
    body.address_id = selectedAddress;
  } else {
    toast('Please choose a delivery address.', { type: 'error' });
    return;
  }
  await withLoading(button, async () => {
    try {
      const res = await api.post('/orders', body);
      await refreshCart();
      location.href = `order.html?no=${encodeURIComponent(res.order_number)}&placed=1`;
    } catch (err) {
      if (selectedAddress === 'new' && Object.keys(err.fields || {}).length) {
        showErrors($('#newAddressForm'), err);
        $('#newAddressForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        toast(err.message, { type: 'error', timeout: 6000 });
      }
      if (err.status === 409) await refreshCart();
    }
  });
}

(async () => {
  await initLayout();
  await requireUser();
  const [list] = await Promise.all([api.get('/account/addresses').catch(() => []), loadPublicCoupons()]);
  addresses = list;
  selectedAddress = (addresses.find((a) => a.is_default) || addresses[0] || { id: 'new' }).id;
  render();

  const root = $('#checkoutRoot');
  bindCoupon(root, setCart);
  subscribe((s, change) => {
    if (change !== 'cart') return;
    // keep in-progress address input when the summary changes
    const draft = selectedAddress === 'new' ? formValues($('#newAddressForm')) : null;
    const notes = $('#orderNotes')?.value;
    render();
    if (draft) Object.entries(draft).forEach(([k, v]) => { const el = $(`#newAddressForm [name="${k}"]`); if (el && el.type !== 'checkbox') el.value = v; });
    if (notes && $('#orderNotes')) $('#orderNotes').value = notes;
  });
  root.addEventListener('change', (e) => {
    if (e.target.name === 'address') {
      selectedAddress = e.target.value === 'new' ? 'new' : Number(e.target.value);
      $$('#addressChoices .choice').forEach((c) => c.classList.toggle('is-selected', c.contains(e.target)));
      $('#newAddressForm').hidden = selectedAddress !== 'new';
    }
    if (e.target.name === 'payment') {
      payment = e.target.value;
      const notes = $('#orderNotes').value;
      const draft = selectedAddress === 'new' ? formValues($('#newAddressForm')) : null;
      render();
      $('#orderNotes').value = notes;
      if (draft) Object.entries(draft).forEach(([k, v]) => { const el = $(`#newAddressForm [name="${k}"]`); if (el && el.type !== 'checkbox') el.value = v; });
    }
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('#placeOrder');
    if (btn) placeOrder(btn);
  });
})();
