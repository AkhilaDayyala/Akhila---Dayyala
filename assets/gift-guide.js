// Minimal, framework-free. No jQuery.

(function () {
  const currency = (cents, symbol = Shopify?.currency?.symbol || '$') =>
    symbol + (cents / 100).toFixed(2);

  // Event delegation helpers
  const on = (el, event, selector, handler) => {
    el.addEventListener(event, (e) => {
      if (selector ? e.target.closest(selector) : true) handler(e);
    });
  };

  // Find the grid container
  const grid = document.querySelector('.gg-grid');
  if (!grid) return;

  const modal = grid.querySelector('.gg-modal');
  const modalBody = modal.querySelector('.gg-modal__body');
  const bonusVariantId = grid.dataset.bonusVariantId || '';

  let activeProduct = null;
  let activeVariant = null;

  // Open modal when clicking "View" or the card
  on(grid, 'click', '.gg-card__open, .gg-card', (e) => {
    const card = e.target.closest('.gg-card');
    if (!card) return;
    const handle = card.dataset.handle;
    const productJSONEl = grid.querySelector(
      `script[data-product-json="${CSS.escape(handle)}"]`
    );
    if (!productJSONEl) return;

    activeProduct = JSON.parse(productJSONEl.textContent);
    activeVariant = activeProduct.variants.find(v => v.available) || activeProduct.variants[0];

    renderModal(activeProduct, activeVariant);
    openModal();
  });

  // Close modal
  on(modal, 'click', '[data-close-modal]', () => closeModal());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  function openModal() {
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    modalBody.innerHTML = '';
  }

  function renderModal(product, variant) {
    const desc = product.description || '';
    const price = variant ? currency(variant.price) : currency(product.price);

    modalBody.innerHTML = `
      <div class="gg-modal__header">
        <h3 class="gg-modal__title">${product.title}</h3>
        <div class="gg-modal__price" data-price>${price}</div>
      </div>
      <div class="gg-modal__content">
        <div class="gg-modal__media">
          ${product.images?.length ? `<img src="${product.images[0]}" alt="${product.title}">` : ''}
        </div>
        <div class="gg-modal__details">
          <div class="gg-modal__desc">${desc}</div>
          ${renderOptions(product)}
          <button class="gg-btn gg-btn--primary" data-add-to-cart>Add to Cart</button>
        </div>
      </div>
    `;

    // Wire option changes
    product.options.forEach((name, idx) => {
      const sel = modalBody.querySelector(`[data-option-index="${idx}"]`);
      if (sel) {
        sel.addEventListener('change', () => {
          const chosen = product.options.map((_, i) => {
            const s = modalBody.querySelector(`[data-option-index="${i}"]`);
            return s ? s.value : '';
          });
          const match = product.variants.find(v => {
            // variants[].option1/2/3
            const opts = [v.option1, v.option2, v.option3].filter(Boolean);
            return opts.every((val, i) => val === chosen[i]);
          });
          if (match) {
            activeVariant = match;
            const priceEl = modalBody.querySelector('[data-price]');
            if (priceEl) priceEl.textContent = currency(match.price);
          }
        });
      }
    });

    // Add to cart button
    const addBtn = modalBody.querySelector('[data-add-to-cart]');
    addBtn?.addEventListener('click', async () => {
      if (!activeVariant) return;
      addBtn.disabled = true;

      try {
        // 1) Add selected variant
        await addToCart(activeVariant.id, 1);

        // 2) Bonus rule: if options contain Black + Medium → add bonus variant
        const opts = [activeVariant.option1, activeVariant.option2, activeVariant.option3]
          .map(v => (v || '').toLowerCase());
        const hasBlackMedium = opts.includes('black') && opts.includes('medium');

        if (hasBlackMedium && bonusVariantId) {
          await addToCart(Number(bonusVariantId), 1);
        }

        // Optional: open cart drawer if theme supports it
        if (window.Shopify && window.Shopify.designMode) {
          // In editor, just close modal
          closeModal();
        } else {
          // Fallback: redirect to cart or show a toast
          closeModal();
        }
      } catch (err) {
        console.error(err);
        addBtn.disabled = false;
        alert('Could not add to cart. Please try again.');
      }
    });
  }

  function renderOptions(product) {
    if (!product.options || !product.options.length) return '';

    // Build current selected values (first available variant)
    const first = product.variants.find(v => v.available) || product.variants[0];
    const values = [first.option1, first.option2, first.option3];

    return product.options.map((name, i) => {
      // Gather distinct values for option i
      const uniq = Array.from(new Set(product.variants.map(v => [v.option1, v.option2, v.option3][i]).filter(Boolean)));
      const opts = uniq.map(v => `<option value="${v}" ${v === values[i] ? 'selected' : ''}>${v}</option>`).join('');
      return `
        <label class="gg-opt">
          <span class="gg-opt__label">${name}</span>
          <select class="gg-opt__select" data-option-index="${i}">${opts}</select>
        </label>
      `;
    }).join('');
  }

  async function addToCart(variantId, qty) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }
})();
