import { clampDrinkQty, type DrinkPick } from './order-drinks';
import { labelOf, menu, papasBasePrice, priceOf, type Portion } from './menu';
import { papasBillLabel, type Kind } from './order-ui';

export type OrderPancho = { free: string[]; premium: string[] };
export type OrderPapas = { portion: Portion; toppings: string[] };
export type OrderRound = {
  kind: Kind;
  panchos: OrderPancho[];
  papas: OrderPapas | null;
  drinks: DrinkPick[];
};

export type OrderLinePayload = {
  line: number;
  block: number | '';
  block_type: string;
  line_type: string;
  description: string;
  amount: number | '';
  item_id: string;
};

export type RegisterOrderInput = {
  orderId: string;
  whatsappMessage: string;
  totals: { subtotal: number; shipping: number; total: number };
  rounds: OrderRound[];
  lines: OrderLinePayload[];
  source?: string;
  version?: string;
};

const webappUrl = import.meta.env.PUBLIC_ORDERS_WEBAPP_URL ?? '';
const registerSecret = import.meta.env.PUBLIC_ORDERS_SECRET ?? '';

export function ordersRegisterConfigured(): boolean {
  return Boolean(webappUrl && registerSecret);
}

export function makeOrderId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MP-${stamp}-${suffix}`;
}

export function cloneRoundsForPayload(rounds: OrderRound[]): OrderRound[] {
  return rounds.map((round) => ({
    kind: round.kind,
    panchos: round.panchos.map((pancho) => ({
      free: [...pancho.free],
      premium: [...pancho.premium],
    })),
    papas: round.papas
      ? { portion: round.papas.portion, toppings: [...round.papas.toppings] }
      : null,
    drinks: round.drinks.map((drink) => ({
      id: drink.id,
      qty: clampDrinkQty(drink.qty),
    })),
  }));
}

export function buildOrderLines(rounds: OrderRound[], shipping: number): OrderLinePayload[] {
  const lines: OrderLinePayload[] = [];
  let line = 0;

  rounds.forEach((round, blockIndex) => {
    const block = blockIndex + 1;
    const blockType = round.kind;

    round.panchos.forEach((pancho, panchoIndex) => {
      line += 1;
      const label = round.panchos.length > 1 ? `Pancho ${panchoIndex + 1}` : 'Pancho';
      lines.push({
        line,
        block,
        block_type: blockType,
        line_type: 'pancho',
        description: label,
        amount: menu.panchoBase,
        item_id: 'pancho',
      });

      pancho.free.forEach((id) => {
        line += 1;
        lines.push({
          line,
          block,
          block_type: blockType,
          line_type: 'topping_free',
          description: labelOf(menu.freeToppings, id),
          amount: 0,
          item_id: id,
        });
      });

      pancho.premium.forEach((id) => {
        line += 1;
        lines.push({
          line,
          block,
          block_type: blockType,
          line_type: 'topping_premium',
          description: labelOf(menu.premiumToppings, id),
          amount: priceOf(menu.premiumToppings, id),
          item_id: id,
        });
      });
    });

    if (round.papas) {
      line += 1;
      lines.push({
        line,
        block,
        block_type: blockType,
        line_type: 'papas',
        description: papasBillLabel(round.papas.portion),
        amount: papasBasePrice(round.papas.portion),
        item_id: round.papas.portion,
      });

      round.papas.toppings.forEach((id) => {
        line += 1;
        lines.push({
          line,
          block,
          block_type: blockType,
          line_type: 'papas_topping',
          description: labelOf(menu.papasToppings, id),
          amount: priceOf(menu.papasToppings, id),
          item_id: id,
        });
      });
    }

    round.drinks.forEach((drink) => {
      const qty = clampDrinkQty(drink.qty);
      const unit = priceOf(menu.drinks, drink.id);
      const name = labelOf(menu.drinks, drink.id);
      line += 1;
      lines.push({
        line,
        block,
        block_type: blockType,
        line_type: 'drink',
        description: qty > 1 ? `${name} × ${qty}` : name,
        amount: unit * qty,
        item_id: drink.id,
      });
    });
  });

  if (shipping > 0) {
    line += 1;
    lines.push({
      line,
      block: '',
      block_type: '',
      line_type: 'shipping',
      description: 'Envío',
      amount: shipping,
      item_id: 'shipping',
    });
  }

  return lines;
}

export function registerOrder(input: RegisterOrderInput): void {
  if (!ordersRegisterConfigured()) return;

  const body = {
    secret: registerSecret,
    orderId: input.orderId,
    whatsappMessage: input.whatsappMessage,
    totals: input.totals,
    rounds: input.rounds,
    lines: input.lines,
    source: input.source ?? 'web',
    version: input.version ?? import.meta.env.PUBLIC_APP_VERSION ?? '1.0.0',
  };

  void fetch(webappUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  }).catch(() => {
    /* no-cors: el script puede haber guardado igual */
  });
}
