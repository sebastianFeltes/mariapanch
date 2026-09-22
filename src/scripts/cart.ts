import {
  displayName,
  findShipping,
  formatPrice,
  isShippingRow,
  parsePrice,
  whatsappHref,
  type Combo,
} from './combos';

export type ShippingFee = {
  id: string;
  name: string;
  unitPrice: number;
};

const SHIPPING_LABEL = 'Costo de envío';

export type CartLine = {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
};

const CART_KEY = 'maria-panch-cart-v1';
const MAX_QTY = 20;

let lines: CartLine[] = readCart();
let shipping: ShippingFee | null = null;

function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) => line && typeof line.id === 'string' && line.qty > 0 && Number.isFinite(line.unitPrice),
    );
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event('maria-cart'));
}

export function getCart(): CartLine[] {
  return lines.map((line) => ({ ...line }));
}

export function cartQtyFor(id: string): number {
  return lines.find((line) => line.id === id)?.qty ?? 0;
}

export function cartCount(): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

export function setShippingFromCombos(combos: Combo[]) {
  const row = findShipping(combos);
  shipping = row
    ? { id: row.id, name: SHIPPING_LABEL, unitPrice: parsePrice(row.salePrice) }
    : null;
}

export function getShipping(): ShippingFee | null {
  return shipping ? { ...shipping } : null;
}

export function shippingFee(): number {
  return lines.length && shipping ? shipping.unitPrice : 0;
}

export function cartTotal(): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0) + shippingFee();
}

export function addToCart(item: { id: string; name: string; unitPrice: number }) {
  if (isShippingRow(item) || item.id === shipping?.id) return;
  const existing = lines.find((line) => line.id === item.id);
  if (existing) {
    existing.qty = Math.min(MAX_QTY, existing.qty + 1);
  } else {
    lines.push({ ...item, qty: 1 });
  }
  persist();
}

export function setCartQty(id: string, qty: number) {
  if (qty <= 0) {
    lines = lines.filter((line) => line.id !== id);
  } else {
    const line = lines.find((item) => item.id === id);
    if (line) line.qty = Math.min(MAX_QTY, qty);
  }
  persist();
}

export function syncCartFromCombos(combos: Combo[]) {
  setShippingFromCombos(combos);
  const byId = new Map(
    combos.filter((combo) => !isShippingRow(combo)).map((combo) => [combo.id, combo]),
  );
  const next: CartLine[] = [];
  let changed = false;

  for (const line of lines) {
    if (isShippingRow(line) || line.id === shipping?.id) {
      changed = true;
      continue;
    }

    const combo = byId.get(line.id);
    if (!combo || !combo.isActive) {
      changed = true;
      continue;
    }

    const name = displayName(combo.name);
    const unitPrice = parsePrice(combo.salePrice);
    if (line.name !== name || line.unitPrice !== unitPrice) {
      changed = true;
      next.push({ ...line, name, unitPrice });
    } else {
      next.push(line);
    }
  }

  if (changed) {
    lines = next;
    persist();
  }
}

export function orderWhatsappHref(): string {
  if (!lines.length) return whatsappHref('Hola, quiero pedir para envío');

  const items = lines
    .map((line) => `• ${line.qty}× ${line.name} — ${formatPrice(line.unitPrice * line.qty)}`)
    .join('\n');

  const fee = getShipping();
  const shippingLine =
    fee && lines.length
      ? `\n• ${fee.name} — ${fee.unitPrice === 0 ? 'sin cargo' : formatPrice(fee.unitPrice)}`
      : '';

  const message = `Hola, quiero este pedido para envío:

${items}${shippingLine}

Total: ${formatPrice(cartTotal())}

Después te paso dirección y horario.`;

  return whatsappHref(message);
}
