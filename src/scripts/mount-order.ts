import { iconPencil, iconSend } from '../icons';
import { fetchCombosCsv, formatPrice, whatsappHref } from './combos';
import {
  bumpDrinkQty,
  clampDrinkQty,
  cloneDrinks,
  DRINK_MAX,
  drinkQtyOf,
  normalizeDrinks,
  setDrinkQty,
  toggleDrink,
  type DrinkPick,
} from './order-drinks';
import {
  escapeHtml,
  orderActionBar,
  papasBillLabel,
  portionOf,
  recapPanchoBase,
  recapPapas,
  type Kind,
} from './order-ui';
import { applySheetCsv, codes, labelOf, menu, papasBasePrice, priceOf, type Choice, type Portion } from './menu';
import {
  buildOrderLines,
  cloneRoundsForPayload,
  makeOrderId,
  registerOrder,
  type OrderRound,
} from './order-register';

type BuiltPancho = { free: string[]; premium: string[] };

type PapasPick = { portion: Portion; toppings: string[] };

type Round = OrderRound;

type Draft = {
  kind: Kind;
  panchos: BuiltPancho[];
  free: string[];
  premium: string[];
  papasToppings: string[];
  drinks: DrinkPick[];
};

type Step = 'choose' | 'pancho' | 'papas' | 'drink' | 'done' | 'edit';
type BillLine = { label: string; amount: number | null; sub?: boolean; head?: boolean };

type State = {
  step: Step;
  rounds: Round[];
  draft: Draft | null;
  editing: number | null;
};

function blankDraft(kind: Kind): Draft {
  return {
    kind,
    panchos: [],
    free: [],
    premium: [],
    papasToppings: [],
    drinks: [],
  };
}

function kindLabel(kind: Kind): string {
  if (kind === 'combo') return 'Combo';
  if (kind === 'papas') return 'Papas';
  return 'Pancho';
}

function cloneRound(round: Round): Round {
  return {
    kind: round.kind,
    panchos: round.panchos.map((pancho) => ({ free: [...pancho.free], premium: [...pancho.premium] })),
    papas: round.papas ? { portion: round.papas.portion, toppings: [...round.papas.toppings] } : null,
    drinks: cloneDrinks(round.drinks),
  };
}

function panchoLines(pancho: BuiltPancho, index: number, total: number): BillLine[] {
  const lines: BillLine[] = [{ label: total > 1 ? `Pancho ${index + 1}` : 'Pancho', amount: menu.panchoBase }];
  pancho.free.forEach((id) => lines.push({ label: labelOf(menu.freeToppings, id), amount: null, sub: true }));
  pancho.premium.forEach((id) =>
    lines.push({ label: labelOf(menu.premiumToppings, id), amount: priceOf(menu.premiumToppings, id), sub: true }),
  );
  return lines;
}

function papasLines(papas: PapasPick): BillLine[] {
  const lines: BillLine[] = [{ label: papasBillLabel(papas.portion), amount: papasBasePrice(papas.portion) }];
  papas.toppings.forEach((id) =>
    lines.push({ label: labelOf(menu.papasToppings, id), amount: priceOf(menu.papasToppings, id), sub: true }),
  );
  return lines;
}

function drinkLines(drink: DrinkPick): BillLine[] {
  const qty = clampDrinkQty(drink.qty);
  const name = labelOf(menu.drinks, drink.id);
  return [{ label: qty > 1 ? `${name} × ${qty}` : name, amount: priceOf(menu.drinks, drink.id) * qty }];
}

function roundBody(round: Round): BillLine[] {
  const lines: BillLine[] = [];
  round.panchos.forEach((pancho, index) => lines.push(...panchoLines(pancho, index, round.panchos.length)));
  if (round.papas) lines.push(...papasLines(round.papas));
  round.drinks.forEach((drink) => lines.push(...drinkLines(drink)));
  return lines;
}

function draftBody(draft: Draft, step: Step): BillLine[] {
  const lines: BillLine[] = [];
  const editing = step === 'pancho';
  const panchos = editing
    ? [...draft.panchos, { free: draft.free, premium: draft.premium }]
    : draft.panchos;
  panchos.forEach((pancho, index) => lines.push(...panchoLines(pancho, index, panchos.length)));
  if ((draft.kind === 'combo' || draft.kind === 'papas') && step !== 'pancho') {
    lines.push(...papasLines({ portion: portionOf(draft.kind), toppings: draft.papasToppings }));
  }
  if (step === 'drink') {
    draft.drinks.forEach((drink) => lines.push(...drinkLines(drink)));
  }
  return lines;
}

function editedRound(state: State, round: Round, index: number): Round {
  const draft = state.draft;
  if (state.step !== 'edit' || state.editing !== index || !draft) return round;
  return {
    ...round,
    panchos: round.panchos.map((pancho, panchoIndex) =>
      panchoIndex === 0 ? { free: [...draft.free], premium: [...draft.premium] } : pancho,
    ),
    papas: round.papas ? { portion: round.papas.portion, toppings: [...draft.papasToppings] } : null,
  };
}

function billLines(state: State): BillLine[] {
  const chunks: { kind: Kind; lines: BillLine[] }[] = state.rounds.map((round, index) => ({
    kind: round.kind,
    lines: roundBody(editedRound(state, round, index)),
  }));
  if (state.draft && state.step !== 'done' && state.step !== 'choose' && state.step !== 'edit') {
    chunks.push({ kind: state.draft.kind, lines: draftBody(state.draft, state.step) });
  }
  const filled = chunks.filter((chunk) => chunk.lines.length > 0);
  const lines: BillLine[] = [];
  filled.forEach((chunk, index) => {
    if (filled.length > 1) lines.push({ label: `${kindLabel(chunk.kind)} ${index + 1}`, amount: null, head: true });
    lines.push(...chunk.lines);
  });
  return lines;
}

function foodTotal(state: State): number {
  return billLines(state).reduce((sum, line) => sum + (line.amount ?? 0), 0);
}

function grandTotal(state: State): number {
  const food = foodTotal(state);
  return food > 0 ? food + menu.shipping : 0;
}

function whatsappText(state: State, orderId: string): string {
  const rows = billLines(state).map((line) => {
    if (line.head) return line.label;
    const price = line.amount == null ? '' : ` — ${formatPrice(line.amount)}`;
    return `${line.sub ? '· ' : ''}${line.label}${price}`;
  });
  rows.push(`Envío — ${formatPrice(menu.shipping)}`);
  return `Hola, quiero este pedido (ref ${orderId}):\n\n${rows.join('\n')}\n\nTotal: ${formatPrice(grandTotal(state))}\n\nDespués te paso dirección y horario.`;
}

function clearOrder(state: State) {
  state.step = 'choose';
  state.rounds = [];
  state.draft = null;
  state.editing = null;
}

function submitOrder(state: State, onSent?: () => void) {
  if (!state.rounds.length) return;
  const orderId = makeOrderId();
  const subtotal = foodTotal(state);
  const shipping = menu.shipping;
  const total = grandTotal(state);
  const rounds = cloneRoundsForPayload(state.rounds);
  const message = whatsappText(state, orderId);

  registerOrder({
    orderId,
    whatsappMessage: message,
    totals: { subtotal, shipping, total },
    rounds,
    lines: buildOrderLines(rounds, shipping),
    source: 'web',
  });

  window.open(whatsappHref(message), '_blank', 'noopener,noreferrer');
  clearOrder(state);
  onSent?.();
}

const DOG_LAYERS: Record<string, string> = {
  panceta:
    '<path d="M108 118c28-10 40 8 62 0s34 10 56 0 36 8 58 0 34 10 56 0" fill="none" stroke="#e7a090" stroke-width="8" stroke-linecap="round"/><path d="M120 128c24 8 36-6 52 0s32 8 50 0 30-6 48 0" fill="none" stroke="#f6d2c6" stroke-width="4" stroke-linecap="round"/>',
  cheddar:
    '<path d="M100 112c20 16 40-6 62 8 18 12 34-4 54 8 22 14 40-8 64 6 16 10 36 2 52-4v22H100z" fill="#ff9f1c" stroke="#3a1c0d" stroke-width="3"/>',
  roquefort:
    '<g fill="#e7eef2" stroke="#3a1c0d" stroke-width="2.4"><circle cx="140" cy="116" r="8"/><circle cx="188" cy="122" r="7"/><circle cx="236" cy="114" r="8"/><circle cx="286" cy="122" r="6"/><circle cx="332" cy="116" r="8"/><circle cx="372" cy="124" r="6"/></g>',
  criolla:
    '<g stroke="#3a1c0d" stroke-width="2"><rect x="130" y="112" width="10" height="10" fill="#da291c"/><rect x="176" y="118" width="9" height="9" fill="#f7f1e4"/><rect x="220" y="110" width="10" height="10" fill="#3f8f3a"/><rect x="268" y="118" width="9" height="9" fill="#f2c14b"/><rect x="314" y="112" width="10" height="10" fill="#da291c"/><rect x="358" y="120" width="9" height="9" fill="#f7f1e4"/></g>',
  aceituna:
    '<g fill="#6a8f3a" stroke="#3a1c0d" stroke-width="2.4"><ellipse cx="150" cy="118" rx="7" ry="10"/><ellipse cx="214" cy="122" rx="7" ry="10"/><ellipse cx="278" cy="116" rx="7" ry="10"/><ellipse cx="342" cy="122" rx="7" ry="10"/></g>',
  verdeo:
    '<g fill="#7dbe45" stroke="#3a1c0d" stroke-width="2"><path d="M128 128c2-16 8-18 12-18s8 4 10 16c-6-6-16-6-22 2z"/><path d="M196 130c2-16 8-18 12-18s8 4 10 16c-6-6-16-6-22 2z"/><path d="M264 126c2-16 8-18 12-18s8 4 10 16c-6-6-16-6-22 2z"/><path d="M332 130c2-16 8-18 12-18s8 4 10 16c-6-6-16-6-22 2z"/></g>',
  'cebolla-crispy':
    '<g stroke="#3a1c0d" stroke-width="2"><rect x="124" y="114" width="14" height="6" rx="1" transform="rotate(-16 131 117)" fill="#e2a23f"/><rect x="168" y="120" width="14" height="6" rx="1" transform="rotate(12 175 123)" fill="#c47a32"/><rect x="214" y="112" width="14" height="6" rx="1" transform="rotate(-8 221 115)" fill="#f2c14b"/><rect x="262" y="120" width="14" height="6" rx="1" transform="rotate(18 269 123)" fill="#e2a23f"/><rect x="310" y="114" width="14" height="6" rx="1" transform="rotate(-12 317 117)" fill="#c47a32"/><rect x="354" y="122" width="14" height="6" rx="1" transform="rotate(8 361 125)" fill="#f2c14b"/></g>',
  'cebolla-caramelizada':
    '<path d="M118 120c18-8 28-2 42 2s28 8 44 0 26-8 42 2 30 8 46 0 24-6 40 2" fill="none" stroke="#8a4b12" stroke-width="4" stroke-linecap="round"/><path d="M130 130c16-6 26 0 38 2s24 6 38 0 22-4 36 2" fill="none" stroke="#c47a32" stroke-width="3" stroke-linecap="round"/>',
  huevo:
    '<ellipse cx="240" cy="118" rx="34" ry="16" fill="#fffaf2" stroke="#3a1c0d" stroke-width="3"/><circle cx="246" cy="118" r="7" fill="#ffcc00" stroke="#3a1c0d" stroke-width="2"/>',
  mozzarella:
    '<g fill="#fffaf2" stroke="#3a1c0d" stroke-width="2.4"><ellipse cx="160" cy="118" rx="22" ry="9"/><ellipse cx="240" cy="122" rx="24" ry="9"/><ellipse cx="322" cy="116" rx="22" ry="9"/></g>',
  jamon:
    '<g fill="#e48b96" stroke="#3a1c0d" stroke-width="2.4"><rect x="128" y="110" width="46" height="16" rx="7"/><rect x="210" y="114" width="50" height="16" rx="7"/><rect x="296" y="110" width="48" height="16" rx="7"/></g>',
};

function dogSvg(free: string[], premium: string[]): string {
  const on = (id: string) => (free.includes(id) || premium.includes(id) ? ' is-on' : '');
  const premiumBits = menu.premiumToppings
    .map((item) => {
      const icon = DOG_LAYERS[item.id];
      if (!icon) return '';
      return `<g class="dog-bit${on(item.id)}" data-bit="${item.id}">${icon}</g>`;
    })
    .join('');

  return `
    <svg class="dog" viewBox="0 0 480 188" role="img" aria-label="Tu pancho">
      <ellipse cx="240" cy="166" rx="198" ry="16" fill="#f7f1e4" stroke="#3a1c0d" stroke-width="4"/>
      <path d="M58 142c8 28 70 36 182 36s174-8 182-36c-18 10-86 16-182 16S76 152 58 142z" fill="#e2a23f" stroke="#3a1c0d" stroke-width="4"/>
      <rect x="78" y="104" width="324" height="46" rx="23" fill="#c44722" stroke="#3a1c0d" stroke-width="4"/>
      <path d="M68 112c18-52 70-62 172-62s154 10 172 62c-28-16-86-24-172-24s-144 8-172 24z" fill="#f0c56a" stroke="#3a1c0d" stroke-width="4"/>
      <g fill="#f7e7b0" stroke="#3a1c0d" stroke-width="2">
        <ellipse cx="150" cy="78" rx="7" ry="4"/><ellipse cx="196" cy="68" rx="7" ry="4"/>
        <ellipse cx="246" cy="64" rx="7" ry="4"/><ellipse cx="300" cy="70" rx="7" ry="4"/>
        <ellipse cx="348" cy="82" rx="7" ry="4"/>
      </g>
      <g class="dog-bit${on('mostaza')}" data-bit="mostaza">
        <path d="M108 124c16-10 22 8 36 0s20 10 34 0 22 8 36 0 20 10 36 0 22 8 34 0 18 8 32 0" fill="none" stroke="#ffcc00" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="dog-bit${on('ketchup')}" data-bit="ketchup">
        <path d="M116 132c14 8 24-6 36 0s22 8 34 0 24-6 36 0 22 8 34 0 22-6 34 0 20 8 30 0" fill="none" stroke="#da291c" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="dog-bit${on('mayonesa')}" data-bit="mayonesa">
        <path d="M124 118c10 6 16-4 26 0s16 6 26 0 16-4 26 0 16 6 26 0 16-4 26 0 16 6 26 0 14-4 22 0" fill="none" stroke="#fffaf2" stroke-width="4" stroke-linecap="round"/>
      </g>
      <g class="dog-bit${on('papas-pay')}" data-bit="papas-pay" fill="#fff4c2" stroke="#3a1c0d" stroke-width="2.4">
        <rect x="112" y="108" width="8" height="26" rx="2" transform="rotate(-24 116 121)"/>
        <rect x="148" y="104" width="8" height="28" rx="2" transform="rotate(8 152 118)"/>
        <rect x="188" y="106" width="8" height="26" rx="2" transform="rotate(-12 192 119)"/>
        <rect x="228" y="102" width="8" height="28" rx="2" transform="rotate(18 232 116)"/>
        <rect x="268" y="106" width="8" height="26" rx="2" transform="rotate(-6 272 119)"/>
        <rect x="308" y="104" width="8" height="28" rx="2" transform="rotate(14 312 118)"/>
        <rect x="346" y="108" width="8" height="26" rx="2" transform="rotate(-16 350 121)"/>
      </g>
      ${premiumBits}
    </svg>
  `;
}

function friesSvg(toppings: string[]): string {
  const on = (id: string) => (toppings.includes(id) ? ' is-on' : '');
  return `
    <svg class="dog" viewBox="0 0 480 150" role="img" aria-label="Tus papas">
      <ellipse cx="240" cy="132" rx="150" ry="12" fill="#f7f1e4" stroke="#3a1c0d" stroke-width="3"/>
      <path d="M92 78h296l-18 48H110z" fill="#e2a23f" stroke="#3a1c0d" stroke-width="4"/>
      <g fill="#f2c14b" stroke="#3a1c0d" stroke-width="2.2">
        <rect x="118" y="36" width="16" height="52" rx="3" transform="rotate(-8 126 62)"/>
        <rect x="150" y="28" width="16" height="58" rx="3"/>
        <rect x="182" y="34" width="16" height="52" rx="3" transform="rotate(6 190 60)"/>
        <rect x="214" y="24" width="16" height="60" rx="3" transform="rotate(-4 222 54)"/>
        <rect x="248" y="30" width="16" height="56" rx="3"/>
        <rect x="280" y="26" width="16" height="58" rx="3" transform="rotate(7 288 55)"/>
        <rect x="314" y="34" width="16" height="50" rx="3" transform="rotate(-6 322 59)"/>
        <rect x="346" y="30" width="16" height="54" rx="3"/>
      </g>
      <g class="dog-bit${on('cheddar')}" data-bit="cheddar">
        <path d="M120 70c24 18 40-8 64 10 20 14 36-6 58 8 24 16 48-4 70 8 12 6 28 4 36-2v28H120z" fill="#ff9f1c" stroke="#3a1c0d" stroke-width="3"/>
      </g>
      <g class="dog-bit${on('panceta')}" data-bit="panceta" fill="#e48b96" stroke="#3a1c0d" stroke-width="2">
        <rect x="150" y="62" width="28" height="12" rx="4" transform="rotate(-8 164 68)"/>
        <rect x="214" y="66" width="30" height="12" rx="4" transform="rotate(6 229 72)"/>
        <rect x="278" y="60" width="28" height="12" rx="4" transform="rotate(-4 292 66)"/>
        <rect x="330" y="68" width="26" height="11" rx="4"/>
      </g>
      <g class="dog-bit${on('verdeo')}" data-bit="verdeo" fill="#7dbe45" stroke="#3a1c0d" stroke-width="2">
        <path d="M168 78c2-14 8-16 11-16s7 3 9 14c-5-5-14-5-20 2z"/>
        <path d="M230 80c2-14 8-16 11-16s7 3 9 14c-5-5-14-5-20 2z"/>
        <path d="M292 76c2-14 8-16 11-16s7 3 9 14c-5-5-14-5-20 2z"/>
        <path d="M348 80c2-14 8-16 11-16s7 3 9 14c-5-5-14-5-20 2z"/>
      </g>
    </svg>
  `;
}

const DRINK_CODE: Record<string, string> = { coca: 'CC', sprite: 'SP', fanta: 'FA', agua: 'AG' };

function toppingButton(item: Choice, pressed: boolean, locked: boolean, action: string): string {
  const price = item.price > 0 ? `<small>${escapeHtml(formatPrice(item.price))}</small>` : '';
  const code = item.code || codes.get(item.id) || '··';
  return `<button type="button" class="topping${pressed ? ' is-on' : ''}${locked ? ' is-locked' : ''}" data-action="${action}" data-id="${item.id}" aria-pressed="${pressed ? 'true' : 'false'}"${locked ? ' aria-disabled="true"' : ''}><span class="topping-code" aria-hidden="true">${escapeHtml(code)}</span><span class="topping-copy"><span>${escapeHtml(item.label)}</span>${price}</span></button>`;
}

function meter(count: number): string {
  const cells = Array.from({ length: menu.premiumMax }, (_, index) => `<i class="${index < count ? 'is-filled' : ''}"></i>`).join('');
  return `<span class="meter" data-meter aria-live="polite"><span class="meter-cells">${cells}</span><span data-meter-label>${count}/${menu.premiumMax}</span></span>`;
}

function pickButton(item: Choice, selected: boolean, action: string, note = ''): string {
  const noteHtml = note ? `<span class="pick-note">${escapeHtml(note)}</span>` : '';
  return `<button type="button" class="pick${selected ? ' is-on' : ''}" data-action="${action}" data-id="${item.id}" aria-pressed="${selected ? 'true' : 'false'}"><span class="pick-swatch" data-swatch="${item.id}" aria-hidden="true"></span><span class="pick-copy"><span>${escapeHtml(item.label)}</span>${noteHtml}</span><span class="pick-price">${escapeHtml(formatPrice(item.price))}</span></button>`;
}

function stepRail(kind: Kind, step: Step): string {
  const steps: { id: Step; label: string }[] =
    kind === 'papas'
      ? [
          { id: 'papas', label: 'Papas' },
          { id: 'drink', label: 'Bebida' },
          { id: 'done', label: 'Total' },
        ]
      : kind === 'pancho'
        ? [
            { id: 'pancho', label: 'Pancho' },
            { id: 'drink', label: 'Bebida' },
            { id: 'done', label: 'Total' },
          ]
        : [
            { id: 'pancho', label: 'Pancho' },
            { id: 'papas', label: 'Papas' },
            { id: 'drink', label: 'Bebida' },
            { id: 'done', label: 'Total' },
          ];
  const current = steps.findIndex((item) => item.id === step);
  const items = steps
    .map((item, index) => {
      const mark = index === current ? ' is-now' : index < current ? ' is-done' : '';
      return `<li class="${mark.trim()}">${item.label}</li>`;
    })
    .join('');
  return `<ol class="step-rail" aria-label="Pasos del pedido">${items}</ol>`;
}

export type MountOrderOptions = {
  onOrderSent?: () => void;
};

export function mountOrder(root: HTMLElement, options: MountOrderOptions = {}) {
  const ticket = document.getElementById('pedido-ticket');
  const base = (root.dataset.base || '/').replace(/\/?$/, '/');
  const fallback = `${base}placeholder.svg`;

  const photo = (file: string, className: string) =>
    `<img class="${className}" src="${escapeHtml(`${base}${file}`)}" alt="" data-fallback="${escapeHtml(fallback)}" />`;

  const state: State = { step: 'choose', rounds: [], draft: null, editing: null };

  const syncShippingNote = () => {
    const note = document.querySelector<HTMLElement>('[data-shipping-note]');
    if (note) note.textContent = `Envío ${formatPrice(menu.shipping)}. Depende de la zona.`;
  };

  const paintTicket = () => {
    if (!ticket) return;
    const food = foodTotal(state);
    if (food > 0) {
      ticket.hidden = false;
      ticket.textContent = formatPrice(food);
    } else {
      ticket.hidden = true;
      ticket.textContent = '';
    }
  };

  const paint = (moveFocus = false) => {
    root.innerHTML = render();
    root.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        const next = img.dataset.fallback;
        if (!next || img.dataset.failed === '1') return;
        img.dataset.failed = '1';
        img.src = next;
      });
    });
    paintTicket();
    if (!moveFocus) return;
    root.querySelector<HTMLElement>('[data-step-title]')?.focus({ preventScroll: true });
  };

  const go = (step: Step) => {
    state.step = step;
    paint(true);
  };

  const render = (): string => {
    if (state.step === 'edit' && state.draft && state.editing != null) {
      const round = state.rounds[state.editing];
      if (round) return renderEdit(state.draft, round);
    }
    if (state.step === 'done') return renderDone();
    if (state.step === 'choose' || !state.draft) return renderChoose();
    if (state.step === 'pancho') return renderPancho(state.draft);
    if (state.step === 'papas') return renderPapas(state.draft);
    return renderDrink(state.draft);
  };

  const renderChoose = () => `
      <div class="order-view is-choose is-fill">
      <div class="fork">
        <button type="button" class="fork-card is-combo" data-action="start-combo">
          ${photo('card-combo.png', 'fork-photo')}
          <span class="fork-kicker">Pancho + papas</span>
          <strong>Combo</strong>
        </button>
        <button type="button" class="fork-card" data-action="start-pancho">
          ${photo('card-pancho.png', 'fork-photo')}
          <span class="fork-kicker">Solo el pancho</span>
          <strong>Armá tu pancho</strong>
        </button>
        <button type="button" class="fork-card is-papas" data-action="start-papas">
          ${photo('card-papas.png', 'fork-photo')}
          <span class="fork-kicker">Solo papas</span>
          <strong>Armá tus papas</strong>
        </button>
      </div>
    </div>
  `;

  const renderPancho = (draft: Draft) => {
    const freeButtons = menu.freeToppings
      .map((item) => toppingButton(item, draft.free.includes(item.id), false, 'topping'))
      .join('');
    const premiumButtons = menu.premiumToppings
      .map((item) => {
        const pressed = draft.premium.includes(item.id);
        const locked = !pressed && draft.premium.length >= menu.premiumMax;
        return toppingButton(item, pressed, locked, 'topping');
      })
      .join('');

    return `
      <div class="order-view is-pancho">
        <div class="order-head">
          ${stepRail(draft.kind, 'pancho')}
          <h3 id="pancho-title" data-step-title tabindex="-1">Armá tu pancho</h3>
          <p class="recap">${escapeHtml(recapPanchoBase())}</p>
        </div>
        <div class="topping-scroll">
          <div class="topping-group" role="group" aria-labelledby="free-label">
            <div class="topping-head">
              <h4 id="free-label">Incluidos</h4>
              <span class="chip-tag">Todos, si querés</span>
            </div>
            <div class="topping-list is-wide is-included">${freeButtons}</div>
          </div>
          <div class="topping-group" role="group" aria-labelledby="premium-label">
            <div class="topping-head">
              <h4 id="premium-label">A parte</h4>
              ${meter(draft.premium.length)}
            </div>
            <div class="topping-list is-wide is-extras">${premiumButtons}</div>
          </div>
        </div>
        <!-- <div class="dog-stage" data-dog></div> -->
        ${orderActionBar({ kind: 'button', action: 'save-pancho', label: 'Listo' })}
      </div>
    `;
  };

  const renderPapas = (draft: Draft) => {
    const buttons = menu.papasToppings
      .map((item) => toppingButton(item, draft.papasToppings.includes(item.id), false, 'papas-topping'))
      .join('');

    return `
    <div class="order-view is-pancho">
      <div class="order-head">
        ${stepRail(draft.kind, 'papas')}
        <h3 data-step-title tabindex="-1">Armá tus papas</h3>
        <p class="recap">${escapeHtml(recapPapas(draft.kind))}</p>
      </div>
      <div class="topping-group" role="group" aria-labelledby="papas-premium-label">
        <div class="topping-head">
          <h4 id="papas-premium-label">A parte</h4>
        </div>
        <div class="topping-list is-wide is-extras">${buttons}</div>
      </div>
      <!-- <div class="dog-stage" data-fries></div> -->
      ${orderActionBar({ kind: 'button', action: 'save-papas', label: 'Listo' })}
    </div>
  `;
  };

  const drinkQtyBlock = (id: string, qty: number) => `
    <div class="drink-qty">
      <span class="qty-label">¿Cuántas?</span>
      <button type="button" class="qty-btn" data-action="drink-delta" data-id="${escapeHtml(id)}" data-delta="-1"${qty <= 1 ? ' disabled' : ''} aria-label="Sacar una">−</button>
      <input type="number" min="1" max="${DRINK_MAX}" inputmode="numeric" value="${qty}" data-drink-qty data-id="${escapeHtml(id)}" aria-label="Cantidad" />
      <button type="button" class="qty-btn" data-action="drink-delta" data-id="${escapeHtml(id)}" data-delta="1"${qty >= DRINK_MAX ? ' disabled' : ''} aria-label="Agregar una">+</button>
    </div>`;

  const renderDrink = (draft: Draft) => `
    <div class="order-view is-select">
      <div class="order-head">
        ${stepRail(draft.kind, 'drink')}
        <h3 data-step-title tabindex="-1">¿Querés algo para tomar?</h3>
      </div>
      <div class="pick-grid is-drinks" role="group" aria-label="Bebidas">
        ${menu.drinks
          .map((item) => {
            const qty = drinkQtyOf(draft.drinks, item.id);
            const selected = qty != null;
            const code = DRINK_CODE[item.id] ?? '';
            return `<div class="drink-slot">
              <button type="button" class="pick${selected ? ' is-on' : ''}" data-action="pick-drink" data-id="${item.id}" aria-pressed="${selected ? 'true' : 'false'}"><span class="pick-swatch" data-swatch="${item.id}">${escapeHtml(code)}</span><span class="pick-copy"><span>${escapeHtml(item.label)}</span></span><span class="pick-price">${escapeHtml(formatPrice(item.price))}</span></button>
              ${selected ? drinkQtyBlock(item.id, qty) : ''}
            </div>`;
          })
          .join('')}
      </div>
      ${
        draft.drinks.length > 0
          ? orderActionBar({ kind: 'button', action: 'save-drink', label: 'Listo' })
          : orderActionBar({ kind: 'button', action: 'skip-drink', label: 'Sin bebida' })
      }
    </div>
  `;

  const lineRow = (line: BillLine) =>
    `<tr class="${line.sub ? 'is-sub' : ''}"><th scope="row">${escapeHtml(line.label)}</th><td>${line.amount == null ? '' : escapeHtml(formatPrice(line.amount))}</td></tr>`;

  const renderEdit = (draft: Draft, round: Round) => {
    const panchoBits = round.panchos.length
      ? `<section class="edit-block">
          <h4 class="edit-kicker">Pancho</h4>
          <div class="topping-group" role="group" aria-labelledby="edit-free">
            <div class="topping-head"><h4 id="edit-free">Incluidos</h4></div>
            <div class="topping-list is-wide is-included">${menu.freeToppings.map((item) => toppingButton(item, draft.free.includes(item.id), false, 'topping')).join('')}</div>
          </div>
          <div class="topping-group" role="group" aria-labelledby="edit-premium">
            <div class="topping-head"><h4 id="edit-premium">A parte</h4>${meter(draft.premium.length)}</div>
            <div class="topping-list is-wide is-extras">${menu.premiumToppings
              .map((item) => {
                const pressed = draft.premium.includes(item.id);
                return toppingButton(item, pressed, !pressed && draft.premium.length >= menu.premiumMax, 'topping');
              })
              .join('')}</div>
          </div>
          <!-- <div class="dog-stage" data-dog></div> -->
        </section>`
      : '';
    const papasBits = round.papas
      ? `<section class="edit-block">
          <h4 class="edit-kicker">Papas</h4>
          <div class="topping-group" role="group" aria-label="Papas a parte">
            <div class="topping-head"><h4>A parte</h4></div>
            <div class="topping-list is-wide is-extras">${menu.papasToppings.map((item) => toppingButton(item, draft.papasToppings.includes(item.id), false, 'papas-topping')).join('')}</div>
          </div>
          <!-- <div class="dog-stage" data-fries></div> -->
        </section>`
      : '';
    return `
      <div class="order-view is-select">
        <div class="order-head">
          <h3 data-step-title tabindex="-1">Editá este pedido</h3>
          <p class="recap">Sacá o sumá. El precio se actualiza.</p>
        </div>
        ${panchoBits}
        ${papasBits}
        ${orderActionBar({ kind: 'button', action: 'save-edit', label: 'Guardar cambios' })}
      </div>
    `;
  };

  const renderDone = () => {
    const rows = state.rounds
      .map((round, index) => {
        const section =
          state.rounds.length > 1
            ? `<tr class="is-head"><th colspan="2">${escapeHtml(`${kindLabel(round.kind)} ${index + 1}`)}</th></tr>`
            : '';
        const body = roundBody(round).map(lineRow).join('');
        const edit = `<tr class="is-round-edit"><td colspan="2"><button type="button" class="btn btn-edit" data-action="edit-round" data-index="${index}">${iconPencil} Editar</button></td></tr>`;
        const divider =
          index < state.rounds.length - 1 ? `<tr class="is-round-divider" aria-hidden="true"><td colspan="2"></td></tr>` : '';
        return `${section}${body}${edit}${divider}`;
      })
      .join('');
    const shipping = `<tr><th scope="row">Envío</th><td>${escapeHtml(formatPrice(menu.shipping))}</td></tr>`;
    return `
      <div class="order-view is-summary">
        <div class="order-head">
          <h3 data-step-title tabindex="-1">Tu pedido</h3>
          <p class="recap">Envío ${escapeHtml(formatPrice(menu.shipping))}.</p>
        </div>
        <div class="receipt">
          <table class="bill">
            <tbody>${rows}${shipping}</tbody>
            <tfoot>
              <tr class="is-total">
                <th scope="row">Total</th>
                <td>${escapeHtml(formatPrice(grandTotal(state)))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="order-bar">
          ${orderActionBar({
            kind: 'button',
            action: 'send-order',
            label: 'Enviar',
            className: 'btn-whatsapp',
            iconHtml: iconSend,
          })}
          <div class="end-more">
            <button type="button" class="btn btn-plain" data-action="repeat">+ Otro igual</button>
            <button type="button" class="btn btn-combo" data-action="start-combo">+ Combo</button>
            <button type="button" class="btn btn-pancho" data-action="start-pancho">+ Pancho</button>
            <button type="button" class="btn btn-papas" data-action="start-papas">+ Papas</button>
          </div>
        </div>
      </div>
    `;
  };

  const syncPancho = () => {
    const draft = state.draft;
    if (!draft) return;
    const dog = root.querySelector('[data-dog]');
    if (dog) dog.innerHTML = dogSvg(draft.free, draft.premium);

    root.querySelectorAll<HTMLButtonElement>('[data-action="topping"]').forEach((button) => {
      const id = button.dataset.id || '';
      const isFree = menu.freeToppings.some((item) => item.id === id);
      const pressed = isFree ? draft.free.includes(id) : draft.premium.includes(id);
      const locked = !isFree && !pressed && draft.premium.length >= menu.premiumMax;
      button.classList.toggle('is-on', pressed);
      button.classList.toggle('is-locked', locked);
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (locked) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    });

    const meterEl = root.querySelector<HTMLElement>('[data-meter]');
    if (meterEl) {
      const count = draft.premium.length;
      meterEl.querySelectorAll('i').forEach((cell, index) => {
        cell.classList.toggle('is-filled', index < count);
      });
      const label = meterEl.querySelector('[data-meter-label]');
      if (label) label.textContent = `${count}/${menu.premiumMax}`;
      if (count >= menu.premiumMax) {
        meterEl.classList.add('is-bump');
        window.setTimeout(() => meterEl.classList.remove('is-bump'), 280);
      }
    }
    paintTicket();
  };

  const bumpMeter = () => {
    const meterEl = root.querySelector('[data-meter]');
    meterEl?.classList.add('is-bump');
    window.setTimeout(() => meterEl?.classList.remove('is-bump'), 280);
  };

  const toggleTopping = (id: string) => {
    const draft = state.draft;
    if (!draft) return;
    if (menu.freeToppings.some((item) => item.id === id)) {
      draft.free = draft.free.includes(id) ? draft.free.filter((item) => item !== id) : [...draft.free, id];
      syncPancho();
      return;
    }
    if (!menu.premiumToppings.some((item) => item.id === id)) return;
    if (draft.premium.includes(id)) {
      draft.premium = draft.premium.filter((item) => item !== id);
      syncPancho();
      return;
    }
    if (draft.premium.length >= menu.premiumMax) {
      bumpMeter();
      return;
    }
    draft.premium = [...draft.premium, id];
    syncPancho();
  };

  const togglePapasTopping = (id: string) => {
    const draft = state.draft;
    if (!draft || !menu.papasToppings.some((item) => item.id === id)) return;
    draft.papasToppings = draft.papasToppings.includes(id)
      ? draft.papasToppings.filter((item) => item !== id)
      : [...draft.papasToppings, id];
    paint();
  };

  const commitDraft = () => {
    const draft = state.draft;
    if (!draft) return;
    const papas =
      draft.kind === 'pancho' ? null : { portion: portionOf(draft.kind), toppings: [...draft.papasToppings] };
    const drinks = normalizeDrinks(draft.drinks);
    if (draft.kind === 'combo' && (!draft.panchos.length || !papas)) return;
    if (draft.kind === 'pancho' && !draft.panchos.length) return;
    if (draft.kind === 'papas' && !papas) return;
    state.rounds.push({
      kind: draft.kind,
      panchos: draft.panchos.map((pancho) => ({ free: [...pancho.free], premium: [...pancho.premium] })),
      papas,
      drinks,
    });
    state.draft = null;
    go('done');
  };

  const start = (kind: Kind) => {
    state.editing = null;
    state.draft = blankDraft(kind);
    go(kind === 'papas' ? 'papas' : 'pancho');
  };

  const back = () => {
    const draft = state.draft;
    if (state.step === 'edit') {
      state.draft = null;
      state.editing = null;
      state.step = 'done';
      paint(true);
      return;
    }
    if (state.step === 'done') {
      const last = state.rounds.pop();
      if (!last) {
        state.step = 'choose';
        paint(true);
        return;
      }
      state.draft = {
        kind: last.kind,
        panchos: last.panchos.map((pancho) => ({ free: [...pancho.free], premium: [...pancho.premium] })),
        free: [],
        premium: [],
        papasToppings: last.papas ? [...last.papas.toppings] : [],
        drinks: cloneDrinks(last.drinks),
      };
      state.step = 'drink';
      paint(true);
      return;
    }
    if (!draft) {
      state.step = 'choose';
      paint(true);
      return;
    }
    if (state.step === 'pancho') {
      draft.free = [];
      draft.premium = [];
      if (state.rounds.length) {
        state.draft = null;
        state.step = 'done';
      } else {
        state.draft = null;
        state.step = 'choose';
      }
      paint(true);
      return;
    }
    if (state.step === 'papas') {
      if (draft.kind === 'combo' && draft.panchos.length) {
        const last = draft.panchos.pop();
        draft.free = last ? [...last.free] : [];
        draft.premium = last ? [...last.premium] : [];
        state.step = 'pancho';
      } else if (state.rounds.length) {
        state.draft = null;
        state.step = 'done';
      } else {
        state.draft = null;
        state.step = 'choose';
      }
      paint(true);
      return;
    }
    if (state.step === 'drink') {
      if (draft.kind === 'pancho' && draft.panchos.length) {
        const last = draft.panchos.pop();
        draft.free = last ? [...last.free] : [];
        draft.premium = last ? [...last.premium] : [];
        state.step = 'pancho';
      } else state.step = 'papas';
      paint(true);
    }
  };

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    const id = target.dataset.id || '';

    if (action === 'start-pancho' || action === 'start-combo' || action === 'start-papas') {
      start(action === 'start-combo' ? 'combo' : action === 'start-papas' ? 'papas' : 'pancho');
      return;
    }
    if (action === 'topping') {
      toggleTopping(id);
      return;
    }
    if (action === 'papas-topping') {
      togglePapasTopping(id);
      return;
    }
    if (action === 'save-pancho' && state.draft) {
      state.draft.panchos.push({ free: [...state.draft.free], premium: [...state.draft.premium] });
      state.draft.free = [];
      state.draft.premium = [];
      go(state.draft.kind === 'combo' ? 'papas' : 'drink');
      return;
    }
    if (action === 'save-papas') {
      go('drink');
      return;
    }
    if (action === 'edit-round') {
      const index = Number(target.dataset.index);
      const round = state.rounds[index];
      if (!round) return;
      state.editing = index;
      state.draft = {
        kind: round.kind,
        panchos: round.panchos.map((pancho) => ({ free: [...pancho.free], premium: [...pancho.premium] })),
        free: [...(round.panchos[0]?.free ?? [])],
        premium: [...(round.panchos[0]?.premium ?? [])],
        papasToppings: [...(round.papas?.toppings ?? [])],
        drinks: cloneDrinks(round.drinks),
      };
      go('edit');
      return;
    }
    if (action === 'save-edit' && state.draft && state.editing != null) {
      const round = state.rounds[state.editing];
      if (round?.panchos[0]) {
        round.panchos[0] = { free: [...state.draft.free], premium: [...state.draft.premium] };
      }
      if (round?.papas) round.papas.toppings = [...state.draft.papasToppings];
      state.draft = null;
      state.editing = null;
      go('done');
      return;
    }
    if (action === 'pick-drink' && state.draft) {
      state.draft.drinks = toggleDrink(state.draft.drinks, id);
      paint();
      return;
    }
    if (action === 'drink-delta' && state.draft && id) {
      state.draft.drinks = bumpDrinkQty(state.draft.drinks, id, Number(target.dataset.delta));
      paint();
      return;
    }
    if (action === 'save-drink' && state.draft) {
      root.querySelectorAll<HTMLInputElement>('[data-drink-qty]').forEach((input) => {
        const drinkId = input.dataset.id;
        if (!drinkId) return;
        state.draft!.drinks = setDrinkQty(state.draft!.drinks, drinkId, input.value);
      });
      state.draft.drinks = normalizeDrinks(state.draft.drinks);
      if (!state.draft.drinks.length) return;
      commitDraft();
      return;
    }
    if (action === 'skip-drink' && state.draft) {
      state.draft.drinks = [];
      commitDraft();
      return;
    }
    if (action === 'send-order') {
      submitOrder(state, () => {
        paint();
        options.onOrderSent?.();
      });
      return;
    }
    if (action === 'repeat') {
      const last = state.rounds.at(-1);
      if (!last) return;
      state.rounds.push(cloneRound(last));
      paint(true);
      return;
    }
    if (action === 'back') {
      back();
      return;
    }
    if (action === 'reset') {
      clearOrder(state);
      paint(true);
    }
  });

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-drink-qty]') || !state.draft) return;
    const drinkId = input.dataset.id;
    if (!drinkId) return;
    state.draft.drinks = setDrinkQty(state.draft.drinks, drinkId, input.value);
    paint();
  });

  paint();
  syncShippingNote();

  void fetchCombosCsv('live')
    .then((csv) => {
      if (!applySheetCsv(csv)) return;
      syncShippingNote();
      paint();
    })
    .catch(() => {
      /* si el Sheet no responde, quedan los precios locales */
    });
}
