import { addToCart, cartCount, cartQtyFor, cartTotal, getCart, getShipping, orderWhatsappHref, setCartQty } from './cart';
import { formatPrice } from './combos';

export function mountCart() {
  const fab = document.querySelector<HTMLButtonElement>('.cart-fab');
  const layer = document.querySelector<HTMLElement>('.cart-layer');
  const linesRoot = document.querySelector<HTMLElement>('.cart-lines');
  const totalRoot = document.querySelector<HTMLElement>('.cart-total');
  const send = document.querySelector<HTMLAnchorElement>('.cart-send');
  const countRoot = document.querySelector<HTMLElement>('.cart-count');
  const fabText = document.querySelector<HTMLElement>('.cart-fab-text');
  const note = document.querySelector<HTMLElement>('.cart-note');
  const shippingCopy = document.querySelector<HTMLElement>('[data-shipping-cost]');
  if (!fab || !layer || !linesRoot || !totalRoot || !send || !countRoot) return;

  let closeTimer = 0;
  const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const openCart = () => {
    window.clearTimeout(closeTimer);
    layer.hidden = false;
    layer.offsetHeight;
    layer.classList.add('is-open');
    document.body.classList.add('cart-open');
    fab.setAttribute('aria-expanded', 'true');
  };

  const closeCart = () => {
    layer.classList.remove('is-open');
    document.body.classList.remove('cart-open');
    fab.setAttribute('aria-expanded', 'false');
    closeTimer = window.setTimeout(() => {
      layer.hidden = true;
    }, motionOk() ? 340 : 0);
  };

  const syncComboCards = (justAddedId?: string) => {
    document.querySelectorAll<HTMLElement>('.combo-card').forEach((card) => {
      const add = card.querySelector<HTMLButtonElement>('[data-add-combo]');
      if (!add?.dataset.id) return;

      const qty = cartQtyFor(add.dataset.id);
      const stepper = card.querySelector<HTMLElement>('.combo-stepper');
      const label = card.querySelector<HTMLElement>('.combo-stepper-label');
      const badge = card.querySelector<HTMLElement>('.in-cart-badge');
      const inCart = qty > 0;

      card.classList.toggle('is-in-cart', inCart);
      if (add) add.hidden = inCart;
      if (stepper) stepper.hidden = !inCart;

      if (label) {
        label.textContent =
          justAddedId === add.dataset.id ? '¡Agregado!' : qty === 1 ? '1 en el pedido' : `${qty} en el pedido`;
      }

      if (badge) {
        badge.hidden = !inCart;
        badge.textContent = `×${qty}`;
      }

      if (justAddedId === add.dataset.id) {
        card.classList.add('is-just-added');
        window.setTimeout(() => {
          card.classList.remove('is-just-added');
          if (label) label.textContent = qty === 1 ? '1 en el pedido' : `${qty} en el pedido`;
        }, 900);
      }
    });
  };

  const render = (justAddedId?: string) => {
    const lines = getCart();
    const count = cartCount();
    countRoot.textContent = String(count);
    fab.classList.toggle('has-items', count > 0);
    if (fabText) fabText.textContent = count > 0 ? 'Ver pedido' : 'Tu pedido';

    if (!lines.length) {
      linesRoot.innerHTML = '<p class="cart-empty">Todavía no agregaste nada. Elegí un combo y lo armamos.</p>';
    } else {
      const shipping = getShipping();
      const shippingRow =
        shipping
          ? `<div class="cart-line is-shipping">
              <div class="cart-line-info">
                <span class="cart-shipping-tag">Envío</span>
                <strong>${escapeHtml(shipping.name)}</strong>
                <span>${escapeHtml(shipping.unitPrice === 0 ? 'Sin cargo' : formatPrice(shipping.unitPrice))}</span>
              </div>
            </div>`
          : '';

      linesRoot.innerHTML =
        lines
          .map(
            (line) => `
          <div class="cart-line" data-id="${escapeAttr(line.id)}">
            <div class="cart-line-info">
              <strong>${escapeHtml(line.name)}</strong>
              <span>${escapeHtml(formatPrice(line.unitPrice * line.qty))}</span>
            </div>
            <div class="cart-qty">
              <button type="button" class="qty-btn" data-delta="-1" aria-label="Sacar uno">−</button>
              <span>${line.qty}</span>
              <button type="button" class="qty-btn" data-delta="1" aria-label="Agregar uno">+</button>
            </div>
          </div>
        `,
          )
          .join('') + shippingRow;
    }

    const shipping = getShipping();
    totalRoot.textContent = count ? `Total ${formatPrice(cartTotal())}` : 'Total $ 0';
    send.href = orderWhatsappHref();
    send.classList.toggle('is-disabled', count === 0);
    if (count === 0) send.setAttribute('aria-disabled', 'true');
    else send.removeAttribute('aria-disabled');

    if (note) {
      note.textContent = shipping
        ? `Incluye costo de envío ${shipping.unitPrice === 0 ? 'sin cargo' : formatPrice(shipping.unitPrice)}. Dirección y horario los vemos en el chat.`
        : 'Hacemos envíos. Dirección y horario los vemos en el chat.';
    }

    if (shippingCopy) {
      if (shipping) {
        shippingCopy.hidden = false;
        shippingCopy.textContent =
          shipping.unitPrice === 0
            ? 'El envío va sin cargo.'
            : `Costo de envío: ${formatPrice(shipping.unitPrice)}.`;
      } else {
        shippingCopy.hidden = true;
        shippingCopy.textContent = '';
      }
    }

    syncComboCards(justAddedId);
  };

  fab.addEventListener('click', () => {
    if (layer.hidden) openCart();
    else closeCart();
  });

  layer.querySelectorAll('[data-cart-close]').forEach((el) => {
    el.addEventListener('click', closeCart);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) closeCart();
  });

  linesRoot.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.qty-btn');
    const row = button?.closest<HTMLElement>('.cart-line');
    if (!button || !row?.dataset.id) return;
    const line = getCart().find((item) => item.id === row.dataset.id);
    if (!line) return;
    setCartQty(line.id, line.qty + Number(button.dataset.delta));
  });

  document.addEventListener('click', (event) => {
    const add = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add-combo]');
    if (add && !add.disabled && add.dataset.id && add.dataset.name) {
      addToCart({ id: add.dataset.id, name: add.dataset.name, unitPrice: Number(add.dataset.price) || 0 });
      fab.classList.add('is-pop');
      window.setTimeout(() => fab.classList.remove('is-pop'), 380);
      render(add.dataset.id);
      return;
    }

    const cardDelta = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-card-delta]');
    const card = cardDelta?.closest<HTMLElement>('.combo-card');
    const comboId = card?.querySelector<HTMLElement>('[data-add-combo]')?.dataset.id;
    if (!cardDelta || !comboId) return;
    setCartQty(comboId, cartQtyFor(comboId) + Number(cardDelta.dataset.cardDelta));
  });

  send.addEventListener('click', (event) => {
    if (cartCount() === 0) event.preventDefault();
  });

  window.addEventListener('maria-cart', () => render());
  render();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
