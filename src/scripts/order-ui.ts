import { formatPrice } from './combos';
import { menu, papasBasePrice, type Portion } from './menu';

export type Kind = 'combo' | 'pancho' | 'papas';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type OrderBarPrimary =
  | { kind: 'button'; action: string; label: string; className?: string }
  | { kind: 'link'; href: string; label: string; iconHtml?: string };

/** Volver + acción principal, mitad y mitad. */
export function orderActionBar(primary: OrderBarPrimary): string {
  const primaryEl =
    primary.kind === 'link'
      ? `<a class="btn btn-whatsapp" href="${escapeHtml(primary.href)}" target="_blank" rel="noopener noreferrer">${primary.iconHtml ?? ''}${escapeHtml(primary.label)}</a>`
      : `<button type="button" class="btn ${escapeHtml(primary.className ?? 'btn-whatsapp')}" data-action="${escapeHtml(primary.action)}">${escapeHtml(primary.label)}</button>`;
  return `<div class="order-bar is-pair"><button type="button" class="btn btn-plain" data-action="back">Volver</button>${primaryEl}</div>`;
}

export function portionOf(kind: Kind): Portion {
  return kind === 'combo' ? 'chica' : 'completa';
}

export function papasPortionLabel(portion: Portion): string {
  return portion === 'chica' ? 'porción mediana' : 'porción completa';
}

export function recapPanchoBase(): string {
  return `Base ${formatPrice(menu.panchoBase)}`;
}

export function recapPapas(kind: Kind): string {
  const portion = portionOf(kind);
  return `Base ${formatPrice(papasBasePrice(portion))} ${papasPortionLabel(portion)}`;
}

export function papasBillLabel(portion: Portion): string {
  return `Papas · ${papasPortionLabel(portion)}`;
}
