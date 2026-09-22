import { iconPlus } from '../icons';
import {
  displayName,
  fetchCombosCsv,
  formatPrice,
  LIVE_FETCH_GAP_MS,
  menuCombos,
  menuPollMs,
  parseCombos,
  parsePrice,
  type Combo,
} from './combos';
import { syncCartFromCombos } from './cart';

function titleCaseName(name: string): string {
  return displayName(name);
}

function renderCard(combo: Combo, placeholder: string): string {
  const image = combo.imageUrl || placeholder;
  const name = titleCaseName(combo.name);
  const price = formatPrice(combo.salePrice);
  const soldOut = !combo.isActive;

  return `
    <article class="combo-card${soldOut ? ' is-soldout' : ''}">
      <div class="combo-media">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy" data-fallback="${escapeAttr(placeholder)}" />
        <div class="combo-price">${escapeHtml(price)}</div>
        ${soldOut ? '<span class="soldout-banner">Agotado</span>' : '<span class="in-cart-badge" hidden></span>'}
      </div>
      <div class="combo-body">
        <h3>${escapeHtml(name)}</h3>
        ${combo.description ? `<p>${escapeHtml(combo.description)}</p>` : ''}
        ${
          soldOut
            ? `<button type="button" class="btn btn-soldout" disabled>Agotado</button>`
            : `<div class="combo-actions">
                <button type="button" class="btn btn-whatsapp combo-add" data-add-combo data-id="${escapeAttr(combo.id)}" data-name="${escapeAttr(name)}" data-price="${parsePrice(combo.salePrice)}">${iconPlus} Agregar</button>
                <div class="combo-stepper" hidden>
                  <button type="button" class="qty-btn" data-card-delta="-1" aria-label="Sacar uno">−</button>
                  <span class="combo-stepper-label">En el pedido</span>
                  <button type="button" class="qty-btn" data-card-delta="1" aria-label="Agregar uno">+</button>
                </div>
              </div>`
        }
      </div>
    </article>
  `;
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

function bindImageFallbacks(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallback;
      if (fallback && img.src !== fallback) img.src = fallback;
    });
  });
}

let sliderAbort: AbortController | null = null;

function bindSlider(root: HTMLElement) {
  sliderAbort?.abort();
  if (!window.matchMedia('(max-width: 759px)').matches) return;

  const track = root.querySelector<HTMLElement>('.combo-grid');
  const cards = [...root.querySelectorAll<HTMLElement>('.combo-card')];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('.combo-dot')];
  if (!track || cards.length < 2) return;

  sliderAbort = new AbortController();
  const { signal } = sliderAbort;

  const setActive = (index: number) => {
    dots.forEach((dot, i) => {
      const active = i === index;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  const activeIndex = () => {
    const origin = track.getBoundingClientRect().left;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((card, index) => {
      const dist = Math.abs(card.getBoundingClientRect().left - origin);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return best;
  };

  const update = () => setActive(activeIndex());

  track.addEventListener('scroll', update, { passive: true, signal });
  track.addEventListener('scrollend', update, { signal });
  window.addEventListener('resize', update, { signal });

  let startX = 0;
  let startY = 0;
  let axis: 'x' | 'y' | null = null;
  let pointerId: number | null = null;

  const releaseAxis = () => {
    track.style.removeProperty('overflow');
    track.style.removeProperty('overflow-x');
    axis = null;
    pointerId = null;
  };

  track.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerId = event.pointerId;
      axis = null;
      startX = event.clientX;
      startY = event.clientY;
    },
    { signal },
  );

  track.addEventListener(
    'pointermove',
    (event) => {
      if (pointerId !== event.pointerId || axis) return;
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);
      if (dx < 8 && dy < 8) return;
      axis = dx > dy ? 'x' : 'y';
      if (axis === 'y') track.style.overflow = 'visible';
    },
    { passive: true, signal },
  );

  track.addEventListener('pointerup', releaseAxis, { signal });
  track.addEventListener('pointercancel', releaseAxis, { signal });

  dots.forEach((dot, index) => {
    dot.addEventListener(
      'click',
      () => {
        const first = cards[0];
        track.scrollTo({
          left: cards[index].offsetLeft - first.offsetLeft,
          behavior: 'smooth',
        });
      },
      { signal },
    );
  });

  update();
}

export async function mountCombos(root: HTMLElement) {
  const placeholder = root.dataset.placeholder || 'placeholder.svg';
  let lastKey = '';
  let timer = 0;
  let lastLiveAt = 0;

  const catalogKey = (combos: Combo[]) =>
    combos.map((combo) => `${combo.id}|${combo.isActive ? 1 : 0}|${combo.name}|${combo.salePrice}`).join('\n');

  const load = async (mode: 'live' | 'light') => {
    try {
      const useLive = mode === 'live' && Date.now() - lastLiveAt >= LIVE_FETCH_GAP_MS;
      const csv = await fetchCombosCsv(useLive ? 'live' : 'light');
      if (useLive) lastLiveAt = Date.now();

      const catalog = parseCombos(csv);
      const key = catalogKey(catalog);
      if (key === lastKey) {
        syncCartFromCombos(catalog);
        return;
      }
      lastKey = key;

      syncCartFromCombos(catalog);
      const combos = menuCombos(catalog);

      if (!combos.length) {
        root.innerHTML =
          '<p class="status">Por ahora no hay combos. Escribinos por WhatsApp y te armamos algo.</p>';
        return;
      }

      root.innerHTML = `
      <div class="combo-slider">
        <div class="combo-grid">${combos.map((combo) => renderCard(combo, placeholder)).join('')}</div>
      </div>
      ${
        combos.length > 1
          ? `<div class="combo-dots" role="tablist" aria-label="Combos">${combos
              .map(
                (_, index) =>
                  `<button type="button" class="combo-dot${index === 0 ? ' is-active' : ''}" role="tab" aria-label="Combo ${index + 1}" aria-selected="${index === 0 ? 'true' : 'false'}"></button>`,
              )
              .join('')}</div>
             <p class="combo-hint">Deslizá para ver más</p>`
          : ''
      }
    `;
      bindImageFallbacks(root);
      bindSlider(root);
      window.dispatchEvent(new Event('maria-cart'));
    } catch {
      if (lastKey) return;
      root.innerHTML =
        '<p class="status error">No pudimos cargar los combos. Recargá la página o pedí por WhatsApp.</p>';
    }
  };

  const startPoll = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => void load('light'), menuPollMs());
  };

  await load('live');
  startPoll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void load('live');
      startPoll();
    } else {
      window.clearInterval(timer);
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    void load('live');
    startPoll();
  });
}
