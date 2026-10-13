import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { loginUrl, state, subscribe } from '../store.js';
import { $, emptyState, icons, observeReveal, productCard, skeletonCards } from '../ui.js';

async function render() {
  const grid = $('#wishGrid');
  if (!state.user) {
    grid.innerHTML = `<div style="grid-column:1/-1">${emptyState({ title: 'Keep track of the pieces you love', text: 'Sign in to save items to your wishlist across devices.', cta: 'Sign in', href: loginUrl(), icon: icons.heart })}</div>`;
    return;
  }
  const items = await api.get('/wishlist');
  grid.innerHTML = items.length
    ? items.map((p) => productCard(p, state.wishlist)).join('')
    : `<div style="grid-column:1/-1">${emptyState({ title: 'Your wishlist is empty', text: 'Tap the heart on any piece to save it here.', cta: 'Explore the collection', href: 'shop.html', icon: icons.heart })}</div>`;
  observeReveal(grid);
}

(async () => {
  $('#wishGrid').innerHTML = skeletonCards(4);
  await initLayout();
  await render();
  subscribe((s, change) => { if (change === 'wishlist') render(); });
})();
