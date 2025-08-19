/**
 * Gift Guide Quick View + Add to Cart
 * - no jQuery
 * - dynamic product JSON via /products/{handle}.js
 * - auto-add Soft Winter Jacket when variant has both "Black" and "Medium"
 */

const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const $ = (sel, ctx = document) => ctx.querySelector(sel);

const section = document.currentScript.closest('[data-section-id]'); // grid section root
const modal = $('.gg-modal', section);
const form = $('.js-qv-form', modal);
const optionsWrap = $('.js-qv-options', modal);
const titleEl = $('.js-qv-title', modal);
const priceEl = $('.js-qv-price', modal);
const descEl = $('.js-qv-desc', modal);
const imageEl = $('.js-qv-image', modal);

// soft jacket product handle from setting (if provided)
const softJacketHandle = (() => {
  // we serialized it as a product setting (handle). Read from a data tag for reliability.
  // Fallback: store the handle on the section tag via Liquid (simpler):
  // (We’ll inject below with Liquid update)
  return section.dataset.softJacketHandle || null;
})();

let currentProduct = null; // product JSON
let currentVariant = null;

// open modal for a given product handle
async function openQuickView(handle) {
  try {
    const res = await fetch(`/products/${handle}.js`);
    if (!res.ok) throw new Error('Product not found');
    currentProduct = await res.json();

    // content
    titleEl.textContent = currentProduct.title;
    priceEl.textContent = formatMoney(currentProduct.price);
    descEl.innerHTML = currentProduct.description || '';

    // first image
    const firstImg = currentProduct.images && currentProduct.images[0];
    imageEl.src = firstImg || '';

    buildVariantSelectors(currentProduct);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  } catch (e) {
    showError(e.message);
  }
}

function closeQuickView() {
  modal.hidden = true;
  document.body.style.overflow = '';
  optionsWrap.innerHTML = '';
  form.reset();
  currentProduct = null;
  currentVariant = null;
}

function buildVariantSelectors(product) {
  optionsWrap.innerHTML = '';
  // product.options is ["Color","Size", ...]
  product.options.forEach((optName, idx) => {
    const optIndex = idx + 1; // 1..3
    const values = unique(product.variants.map(v => v[`option_${optIndex}`] || v[`option${optIndex}`] || v[`option${optIndex}`]));
    const wrap = document.createElement('div');
    wrap.className = 'gg-option';
    const id = `opt-${optIndex}`;
    wrap.innerHTML = `
      <label for="${id}">${optName}</label>
      <select id="${id}" data-opt-index="${optIndex}">
        ${values.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('')}
      </select>
    `;
    optionsWrap.appendChild(wrap);
  });

  // init currentVariant to first matching
  updateCurrentVariant();
  optionsWrap.addEventListener('change', updateCurrentVariant);
}

function updateCurrentVariant() {
  if (!currentProduct) return;
  const chosen = {};
  $$('select[data-opt-index]', optionsWrap).forEach(sel => {
    chosen[sel.dataset.optIndex] = sel.value;
  });

  currentVariant = currentProduct.variants.find(v => {
    return Object.entries(chosen).every(([i, val]) => {
      const key = `option${i}` in v ? `option${i}` : `option_${i}`;
      return (v[key] || '') === val;
    });
  }) || currentProduct.variants[0];

  priceEl.textContent = formatMoney(currentVariant.price);
}

// submit add to cart
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (!currentVariant) throw new Error('No variant selected');

    const needsBundle = variantHas(currentVariant, 'Black') && variantHas(currentVariant, 'Medium');
    if (needsBundle && softJacketHandle) {
      // fetch jacket variant (first available)
      const j = await (await fetch(`/products/${softJacketHandle}.js`)).json();
      const jacketVar = j.variants.find(v => v.available) || j.variants[0];

      await addToCart([
        { id: currentVariant.id, quantity: 1 },
        { id: jacketVar.id, quantity: 1 }
      ]);
    } else {
      await addToCart({ id: currentVariant.id, quantity: 1 });
    }

    // simple success UX
    closeQuickView();
    window.location.href = '/cart';
  } catch (err) {
    showError(err.message || 'Could not add to cart');
  }
});

function showError(msg) {
  const el = $('.js-qv-error', modal);
  el.textContent = msg;
  el.hidden = false;
}

// open / close bindings (event delegation)
section.addEventListener('click', (e) => {
  const open = e.target.closest('.js-quick-open');
  const close = e.target.closest('.js-quick-close');

  if (open) {
    e.preventDefault();
    const handle = open.closest('.gg-card')?.dataset.productHandle;
    if (handle) openQuickView(handle);
  }
  if (close) {
    e.preventDefault();
    closeQuickView();
  }
});

// utils
function unique(arr){ return [...new Set(arr.filter(Boolean))]; }
function escapeHTML(s){ return (s || '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function variantHas(variant, value){
  value = String(value).toLowerCase();
  const opts = [variant.option1, variant.option2, variant.option3].filter(Boolean).map(v => String(v).toLowerCase());
  return opts.includes(value);
}

function formatMoney(cents) {
  // relies on shop money format; simple fallback:
  return new Intl.NumberFormat(undefined, { style:'currency', currency: Shopify.currency.active || 'USD' })
    .format((cents || 0) / 100);
}

async function addToCart(payload) {
  const url = '/cart/add.js';
  const body = Array.isArray(payload) ? JSON.stringify({ items: payload }) : JSON.stringify(payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.description || 'Cart error');
  }
  return res.json();
}
