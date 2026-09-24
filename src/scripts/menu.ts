import raw from '../data/menu.json';
import { parseSheetRows } from './combos';

export type Choice = { id: string; label: string; price: number; code?: string; active?: boolean };
export type Portion = 'chica' | 'completa';

export type Menu = {
  panchoBase: number;
  shipping: number;
  premiumMax: number;
  freeToppings: Choice[];
  premiumToppings: Choice[];
  papasBase: Record<Portion, number>;
  papasToppings: Choice[];
  drinks: Choice[];
};

function money(value: unknown, fallback: number): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : fallback;
}

function choices(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; label?: unknown; price?: unknown; code?: unknown };
    const id = String(row.id || '').trim();
    const label = String(row.label || '').trim();
    const code = String(row.code || '').trim();
    if (!id || !label) return [];
    return [{ id, label, price: money(row.price, 0), ...(code ? { code } : {}) }];
  });
}

function papasPortion(value: unknown, fallback: Record<Portion, number>): Record<Portion, number> {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const completa = money(row.completa, fallback.completa);
  const chica = money(row.chica, fallback.chica);
  return {
    completa,
    chica: chica < completa ? chica : Math.max(0, completa - 500),
  };
}

export function normalizeMenu(input: unknown): Menu {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    panchoBase: money(row.panchoBase, 2500),
    shipping: money(row.shipping, 1000),
    premiumMax: Math.max(1, money(row.premiumMax, 3)),
    freeToppings: choices(row.freeToppings),
    premiumToppings: choices(row.premiumToppings),
    papasBase: papasPortion(row.papasBase, { completa: 2800, chica: 2000 }),
    papasToppings: choices(row.papasToppings),
    drinks: choices(row.drinks),
  };
}

export const menu = normalizeMenu(raw);

const SHEET_ITEM: Record<string, { id: string; label: string }> = {
  'SP-PP': { id: 'papas-pay', label: 'Papas Pay' },
  'SP-KE': { id: 'ketchup', label: 'Ketchup' },
  'SP-MO': { id: 'mostaza', label: 'Mostaza' },
  'SP-MA': { id: 'mayonesa', label: 'Mayonesa' },
  'SP-PA': { id: 'panceta', label: 'Panceta' },
  'SP-RO': { id: 'roquefort', label: 'Roquefort' },
  'SP-CH': { id: 'cheddar', label: 'Cheddar' },
  'SP-JA': { id: 'jamon', label: 'Jamón cocido' },
  'SP-CC': { id: 'cebolla-caramelizada', label: 'Cebolla caramelizada' },
  'SP-CR': { id: 'cebolla-crispy', label: 'Cebolla crispy' },
  'SP-MZ': { id: 'mozzarella', label: 'Mozzarella' },
  'SP-HU': { id: 'huevo', label: 'Huevo' },
  'SP-AC': { id: 'aceituna', label: 'Aceituna' },
  'SP-SC': { id: 'criolla', label: 'Salsa criolla' },
  'SP-VE': { id: 'verdeo', label: 'Verdeo' },
  'PF-CH': { id: 'cheddar', label: 'Cheddar' },
  'PF-PA': { id: 'panceta', label: 'Panceta' },
  'PF-VE': { id: 'verdeo', label: 'Verdeo' },
  'BE-CO': { id: 'coca', label: 'Coca-Cola' },
  'BE-FA': { id: 'fanta', label: 'Fanta' },
  'BE-SP': { id: 'sprite', label: 'Sprite' },
  'BE-AG': { id: 'agua', label: 'Agua' },
};

function badgeOf(code: string): string {
  const tail = code.includes('-') ? code.split('-').pop() || code : code;
  return tail.slice(0, 2);
}

function choiceFromSheet(code: string, name: string, price: number, active: boolean): Choice {
  const known = SHEET_ITEM[code];
  return {
    id: known?.id ?? code.toLowerCase(),
    label: known?.label ?? name,
    price: money(price, 0),
    code: badgeOf(code),
    active,
  };
}

export function isChoiceActive(item: Choice): boolean {
  return item.active !== false;
}

/** Precios vivos del Sheet. El envío se guarda y solo se muestra en el resumen. */
export function applySheetCsv(csv: string): boolean {
  const parsed = parseSheetRows(csv);
  const rows = parsed.filter((row) => row.active);
  if (!rows.length) return false;

  const pancho = rows.find((row) => row.code === 'SP');
  const chica = rows.find((row) => row.code === 'SP-PF');
  const completa = rows.find((row) => row.code === 'PF');
  const shipping = rows.find((row) => row.code === 'EN');
  const isTopping = (row: { code: string }) => row.code.startsWith('SP-') && row.code !== 'SP-PF';
  const free = parsed.filter((row) => isTopping(row) && row.price <= 0);
  const premium = parsed.filter((row) => isTopping(row) && row.price > 0);
  const papas = parsed.filter((row) => row.code.startsWith('PF-'));
  const drinks = parsed.filter((row) => row.code.startsWith('BE-'));

  if (pancho) menu.panchoBase = money(pancho.price, menu.panchoBase);
  if (shipping) menu.shipping = money(shipping.price, menu.shipping);
  if (chica && completa) {
    menu.papasBase = papasPortion(
      { chica: chica.price, completa: completa.price },
      menu.papasBase,
    );
  }
  const toChoice = (row: { code: string; name: string; price: number; active: boolean }) =>
    choiceFromSheet(row.code, row.name, row.price, row.active);
  if (free.length) menu.freeToppings = free.map(toChoice);
  if (premium.length) menu.premiumToppings = premium.map(toChoice);
  if (papas.length) menu.papasToppings = papas.map(toChoice);
  if (drinks.length) menu.drinks = drinks.map(toChoice);
  codes = toppingCodes([...menu.freeToppings, ...menu.premiumToppings]);
  return true;
}

export function labelOf(list: Choice[], id: string): string {
  return list.find((item) => item.id === id)?.label ?? id;
}

export function priceOf(list: Choice[], id: string): number {
  return list.find((item) => item.id === id)?.price ?? 0;
}

export function papasBasePrice(portion: Portion, catalog: Menu = menu): number {
  return catalog.papasBase[portion];
}

function plainLabel(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

/** Dos letras estables: las dos primeras, o la primera y la tercera si chocan o el nombre tiene más de dos palabras. */
export function toppingCodes(items: Choice[]): Map<string, string> {
  const used = new Set<string>();
  const codes = new Map<string, string>();
  items.forEach((item) => {
    const words = plainLabel(item.label).split(/\s+/).filter(Boolean);
    const first = words[0] ?? '';
    const flat = words.join('');
    const options = [
      words.length > 2 ? `${flat[0] ?? ''}${flat[2] ?? ''}` : first.slice(0, 2),
      `${first[0] ?? ''}${first[2] ?? first[1] ?? ''}`,
      words[1] ? `${first[0] ?? ''}${words[1][0] ?? ''}` : '',
      words[1] ? `${first[0] ?? ''}${words[1][2] ?? words[1][1] ?? ''}` : '',
    ].filter((code) => code.length === 2);
    const code = options.find((option) => !used.has(option)) ?? 'XX';
    used.add(code);
    codes.set(item.id, code);
  });
  return codes;
}

export let codes = toppingCodes([...menu.freeToppings, ...menu.premiumToppings]);
