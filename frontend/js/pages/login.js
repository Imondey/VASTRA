import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { refreshCart, setUser, state } from '../store.js';
import { $, $$, clearErrors, formValues, params, showErrors, toast, withLoading } from '../ui.js';

// Only allow same-site relative redirects after sign-in.
function nextUrl() {
  const next = params().get('next') || '';
  return /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(next) && !next.startsWith('login.html') ? next : 'account.html';
}

function show(mode) {
  $('#authCard').classList.toggle('right-panel-active', mode === 'register');
  history.replaceState({}, '', `login.html?${new URLSearchParams({ ...(mode === 'register' ? { mode } : {}), ...(params().get('next') ? { next: params().get('next') } : {}) })}`);
}

async function submit(form, path) {
  clearErrors(form);
  await withLoading(form.querySelector('button[type=submit]'), async () => {
    try {
      const { user } = await api.post(path, formValues(form));
      setUser(user);
      await refreshCart();
      toast(path.endsWith('register') ? `Welcome to VASTRA, ${user.first_name}.` : `Welcome back, ${user.first_name}.`);
      setTimeout(() => { location.href = user.is_admin && !params().get('next') ? 'admin.html' : nextUrl(); }, 600);
    } catch (err) {
      showErrors(form, err);
    }
  });
}

(async () => {
  await initLayout();
  if (state.user) { location.replace(nextUrl()); return; }
  if (params().get('mode') === 'register') $('#authCard').classList.add('right-panel-active');
  $$('[data-show]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); show(b.dataset.show); }));
  $$('[data-toggle-password]').forEach((b) => b.addEventListener('click', () => {
    const input = b.previousElementSibling;
    input.type = input.type === 'password' ? 'text' : 'password';
    b.textContent = input.type === 'password' ? 'Show' : 'Hide';
  }));
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/auth/login'); });
  $('#registerForm').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/auth/register'); });
})();
