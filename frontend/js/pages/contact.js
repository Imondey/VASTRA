import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { state } from '../store.js';
import { $, clearErrors, esc, formValues, showErrors, withLoading } from '../ui.js';

(async () => {
  await initLayout();
  const form = $('#contactForm');
  if (state.user) {
    form.elements['name'].value = state.user.full_name;
    form.elements['email'].value = state.user.email;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    await withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api.post('/contact', formValues(form));
        form.innerHTML = `<div class="alert success">${esc(res.message)}</div><a class="btn" href="shop.html">Continue shopping</a>`;
      } catch (err) { showErrors(form, err); }
    });
  });
})();
