import { api } from '../api.js';
import { initLayout } from '../layout.js';
import { state } from '../store.js';
import { $, $$, esc, icons, img, observeReveal, productCard, skeletonCards, toast } from '../ui.js';

function initSlider() {
  const slider = $('#slider');
  const slides = $$('.slide', slider);
  const dots = $('.slider-dots', slider);
  $('.slider-arrow.prev', slider).innerHTML = icons.arrowL;
  $('.slider-arrow.next', slider).innerHTML = icons.arrowR;
  dots.innerHTML = slides.map((_, i) => `<button type="button" role="tab" aria-label="Slide ${i + 1}" class="${i === 0 ? 'active' : ''}"></button>`).join('');
  let current = 0;
  let timer;
  const show = (i) => {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, j) => s.classList.toggle('active', j === current));
    $$('button', dots).forEach((d, j) => d.classList.toggle('active', j === current));
  };
  const start = () => { clearInterval(timer); timer = setInterval(() => show(current + 1), 5000); };
  $$('button', dots).forEach((d, i) => d.addEventListener('click', () => { show(i); start(); }));
  $$('[data-slide]', slider).forEach((b) => b.addEventListener('click', () => { show(current + Number(b.dataset.slide)); start(); }));
  slider.addEventListener('mouseenter', () => clearInterval(timer));
  slider.addEventListener('mouseleave', start);
  start();
}

async function loadGrid(el, query) {
  el.innerHTML = skeletonCards(4);
  try {
    const data = await api.get('/products', query);
    el.innerHTML = data.items.map((p) => productCard(p, state.wishlist)).join('');
    observeReveal(el);
  } catch (err) {
    el.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function loadCatalogBlocks() {
  try {
    const data = await api.get('/catalog/filters');
    $('#categoryRail').innerHTML = data.categories.map((c) => `
      <a class="category-card reveal" href="shop.html?category=${encodeURIComponent(c.slug)}">
        <div class="thumb"><img src="${esc(img(c.image_url))}" alt="" loading="lazy"></div>
        <span>${esc(c.name)}</span>
      </a>`).join('');
    $('#brandScroll').innerHTML = data.brands.map((b) => `
      <a class="brand-card" href="shop.html?brand=${encodeURIComponent(b.slug)}" aria-label="${esc(b.name)}">
        ${b.logo_url ? `<img src="${esc(img(b.logo_url))}" alt="${esc(b.name)} logo" loading="lazy">` : `<span class="text-logo">${esc(b.name)}</span>`}
      </a>`).join('');
    observeReveal();
  } catch { /* sections stay empty if the API is unavailable */ }
}

function initNewsletter() {
  $('#newsletterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#newsletterEmail');
    try {
      const res = await api.post('/newsletter', { email: input.value });
      toast(res.message);
      input.value = '';
    } catch (err) { toast(err.message, { type: 'error' }); }
  });
}

(async () => {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icons[el.dataset.icon]; });
  initSlider();
  initNewsletter();
  await initLayout();
  loadGrid($('#featuredGrid'), { featured: 1, per_page: 8 });
  loadGrid($('#newGrid'), { new: 1, sort: 'newest', per_page: 4 });
  loadCatalogBlocks();
})();
