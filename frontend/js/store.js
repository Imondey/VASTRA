// Client-side session state (user, bag, wishlist) with a tiny event bus.
import { api } from './api.js';
import { toast } from './ui.js';

const listeners = new Set();
export const state = {
  user: null,
  cart: { items: [], count: 0, subtotal: 0, total: 0 },
  wishlist: new Set(),
  ready: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(change) { listeners.forEach((fn) => fn(state, change)); }

let loading;
export function loadSession() {
  if (!loading) {
    loading = Promise.allSettled([api.get('/auth/me'), api.get('/cart'), api.get('/wishlist/ids')])
      .then(([me, cart, wish]) => {
        if (me.status === 'fulfilled') state.user = me.value.user;
        if (cart.status === 'fulfilled') state.cart = cart.value;
        if (wish.status === 'fulfilled') state.wishlist = new Set(wish.value);
        state.ready = true;
        emit('session');
        return state;
      });
  }
  return loading;
}

export function setUser(user) { state.user = user; emit('user'); }
export function setCart(cart) { state.cart = cart; emit('cart'); }

export async function refreshCart() {
  setCart(await api.get('/cart'));
  return state.cart;
}

export async function addToCart(variantId, quantity = 1, { openDrawer = true } = {}) {
  const cart = await api.post('/cart/items', { variant_id: variantId, quantity });
  setCart(cart);
  if (openDrawer) emit('drawer:open');
  return cart;
}

export async function updateCartItem(itemId, quantity) {
  setCart(await api.patch(`/cart/items/${itemId}`, { quantity }));
  return state.cart;
}

export async function removeCartItem(itemId) {
  setCart(await api.del(`/cart/items/${itemId}`));
  return state.cart;
}

export function loginUrl() {
  return `login.html?next=${encodeURIComponent(location.pathname.replace(/^\//, '') + location.search)}`;
}

export async function toggleWishlist(productId) {
  if (!state.user) {
    toast('Sign in to save pieces to your wishlist.', { action: 'Sign in', href: loginUrl() });
    return null;
  }
  const id = Number(productId);
  if (state.wishlist.has(id)) {
    await api.del(`/wishlist/${id}`);
    state.wishlist.delete(id);
    toast('Removed from your wishlist.');
  } else {
    await api.post('/wishlist', { product_id: id });
    state.wishlist.add(id);
    toast('Saved to your wishlist.', { action: 'View', href: 'wishlist.html' });
  }
  emit('wishlist');
  return state.wishlist.has(id);
}

export async function logout() {
  await api.post('/auth/logout');
  location.href = 'index.html';
}

export function openCartDrawer() { emit('drawer:open'); }
