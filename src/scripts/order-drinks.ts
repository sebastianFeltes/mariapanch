export type DrinkPick = { id: string; qty: number };

export const DRINK_MAX = 20;

export function clampDrinkQty(value: string | number): number {
  const qty = Math.floor(Number(value));
  if (!Number.isFinite(qty)) return 1;
  return Math.min(DRINK_MAX, Math.max(1, qty));
}

export function drinkQtyOf(drinks: DrinkPick[], id: string): number | null {
  const pick = drinks.find((item) => item.id === id);
  return pick ? pick.qty : null;
}

export function toggleDrink(drinks: DrinkPick[], id: string): DrinkPick[] {
  if (drinks.some((item) => item.id === id)) {
    return drinks.filter((item) => item.id !== id);
  }
  return [...drinks, { id, qty: 1 }];
}

export function bumpDrinkQty(drinks: DrinkPick[], id: string, delta: number): DrinkPick[] {
  return drinks.map((item) =>
    item.id === id ? { ...item, qty: clampDrinkQty(item.qty + delta) } : item,
  );
}

export function setDrinkQty(drinks: DrinkPick[], id: string, qty: string | number): DrinkPick[] {
  return drinks.map((item) => (item.id === id ? { ...item, qty: clampDrinkQty(qty) } : item));
}

export function normalizeDrinks(drinks: DrinkPick[]): DrinkPick[] {
  return drinks
    .map((item) => ({ id: item.id, qty: clampDrinkQty(item.qty) }))
    .filter((item) => item.qty > 0);
}

export function cloneDrinks(drinks: DrinkPick[]): DrinkPick[] {
  return drinks.map((item) => ({ ...item }));
}
