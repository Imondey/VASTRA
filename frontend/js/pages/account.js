import { api } from '../api.js';
import { addressFields, addressText } from '../address.js';
import { initLayout, requireUser } from '../layout.js';
import { setUser, state } from '../store.js';
import { $, $$, clearErrors, date, emptyState, esc, formValues, icons, img, money, showErrors, toast, withLoading } from '../ui.js';

const TABS = ['orders', 'profile', 'addresses', 'password'];
const root = () => $('#tabRoot');

async function ordersTab() {
  root().innerHTML = '<div class="spinner"></div>';
  const orders = await api.get('/orders');
  if (!orders.length) {
    root().innerHTML = emptyState({ title: 'No orders yet', text: 'When you place an order, it will appear here.', cta: 'Start shopping', href: 'shop.html', icon: icons.box });
    return;
  }
  root().innerHTML = `<h2 style="margin-bottom:24px">Your orders</h2>${orders.map((o) => `
    <a class="order-card" href="order.html?no=${encodeURIComponent(o.order_number)}">
      <div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <strong class="serif" style="font-size:1.15rem;font-weight:500">${esc(o.order_number)}</strong>
          <span class="status ${esc(o.status)}">${esc(o.status)}</span>
        </div>
        <div class="muted" style="font-size:.84rem;margin-top:4px">${date(o.created_at)} · ${o.item_count} item${o.item_count === 1 ? '' : 's'}</div>
        <div class="thumbs">${(o.thumbnails || []).map((t) => `<img src="${esc(img(t))}" alt="">`).join('')}</div>
      </div>
      <div style="text-align:right"><strong>${money(o.total)}</strong><br><span class="link" style="font-size:.66rem">View</span></div>
    </a>`).join('')}`;
}

function profileTab() {
  const u = state.user;
  root().innerHTML = `
    <h2 style="margin-bottom:24px">Profile</h2>
    <form id="profileForm" class="panel-card" novalidate style="max-width:620px">
      <div class="alert" data-form-alert hidden></div>
      <div class="field"><label for="pName">Full name</label><input id="pName" name="full_name" maxlength="120" required value="${esc(u.full_name)}"></div>
      <div class="field"><label for="pEmail">Email</label><input id="pEmail" value="${esc(u.email)}" disabled><span class="hint">Contact client care to change your email.</span></div>
      <div class="field"><label for="pPhone">Mobile number</label><input id="pPhone" name="phone" maxlength="20" inputmode="tel" value="${esc(u.phone || '')}"></div>
      <p class="muted" style="font-size:.82rem;margin-bottom:18px">Member since ${date(u.created_at, { month: 'long', year: 'numeric' })}</p>
      <button class="btn" type="submit">Save changes</button>
    </form>`;
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    await withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        const { user } = await api.put('/account/profile', formValues(form));
        setUser(user);
        $('#greeting').textContent = `Welcome, ${user.first_name}`;
        toast('Your profile has been updated.');
      } catch (err) { showErrors(form, err); }
    });
  });
}

async function addressesTab() {
  root().innerHTML = '<div class="spinner"></div>';
  const list = await api.get('/account/addresses');
  root().innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:16px;flex-wrap:wrap">
      <h2>Addresses</h2><button class="btn btn-sm" type="button" data-add-address>Add address</button>
    </div>
    <div id="addressFormWrap"></div>
    ${list.length ? `<div class="address-grid">${list.map((a) => `
      <div class="address-card">
        <div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(a.label)}</strong>${a.is_default ? '<span class="status delivered">Default</span>' : ''}</div>
        <p class="address-block" style="margin-top:8px">${esc(a.full_name)}<br>${addressText(a)}<br>${esc(a.phone)}</p>
        <div class="actions">
          <button type="button" data-edit="${a.id}">Edit</button>
          ${a.is_default ? '' : `<button type="button" data-default="${a.id}">Set as default</button>`}
          <button type="button" data-delete="${a.id}" style="color:var(--danger)">Delete</button>
        </div>
      </div>`).join('')}</div>` : '<p class="muted">No saved addresses yet.</p>'}`;

  const openForm = (a = null) => {
    $('#addressFormWrap').innerHTML = `
      <form class="panel-card" id="addressForm" novalidate>
        <h3>${a ? 'Edit address' : 'New address'}</h3>
        <div class="alert" data-form-alert hidden></div>
        ${addressFields(a || {}, state.user)}
        <label class="checkbox" style="margin-bottom:18px"><input type="checkbox" name="is_default" ${a && a.is_default ? 'checked' : ''}> Make this my default address</label>
        <div style="display:flex;gap:10px"><button class="btn" type="submit">Save address</button><button class="btn btn-outline" type="button" data-cancel>Cancel</button></div>
      </form>`;
    const form = $('#addressForm');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('[data-cancel]').addEventListener('click', () => { $('#addressFormWrap').innerHTML = ''; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      await withLoading(form.querySelector('[type=submit]'), async () => {
        try {
          if (a) await api.put(`/account/addresses/${a.id}`, formValues(form));
          else await api.post('/account/addresses', formValues(form));
          toast('Address saved.');
          addressesTab();
        } catch (err) { showErrors(form, err); }
      });
    });
  };

  root().onclick = async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-add-address]')) openForm();
      else if (t.dataset.edit) openForm(list.find((a) => a.id === Number(t.dataset.edit)));
      else if (t.dataset.default) {
        const a = list.find((x) => x.id === Number(t.dataset.default));
        await api.put(`/account/addresses/${a.id}`, { ...a, is_default: true });
        addressesTab();
      } else if (t.dataset.delete && confirm('Delete this address?')) {
        await api.del(`/account/addresses/${t.dataset.delete}`);
        toast('Address deleted.');
        addressesTab();
      }
    } catch (err) { toast(err.message, { type: 'error' }); }
  };
}

function passwordTab() {
  root().innerHTML = `
    <h2 style="margin-bottom:24px">Change password</h2>
    <form id="passwordForm" class="panel-card" novalidate style="max-width:520px">
      <div class="alert" data-form-alert hidden></div>
      <div class="field"><label for="cp">Current password</label><input id="cp" name="current_password" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="np">New password</label><input id="np" name="new_password" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters, with letters and numbers.</span></div>
      <button class="btn" type="submit">Update password</button>
    </form>`;
  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    await withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await api.put('/account/password', formValues(form));
        form.reset();
        toast('Your password has been updated.');
      } catch (err) { showErrors(form, err); }
    });
  });
}

async function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'orders';
  $$('.account-nav [data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  root().onclick = null;
  try {
    if (tab === 'orders') await ordersTab();
    if (tab === 'profile') profileTab();
    if (tab === 'addresses') await addressesTab();
    if (tab === 'password') passwordTab();
  } catch (err) {
    root().innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
  }
}

(async () => {
  await initLayout();
  const user = await requireUser();
  $('#greeting').textContent = `Welcome, ${user.first_name}`;
  $$('.account-nav [data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
  window.addEventListener('hashchange', showTab);
  showTab();
})();
