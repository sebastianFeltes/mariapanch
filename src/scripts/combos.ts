export const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNTGxDekrzkFLrM-XynJSc3rxKzA2bc6ajqsTYr7bSEB8I5RGOrXmFAkfDCOEfnKjBZXWvDL0HFhgb/pub?gid=0&single=true&output=csv';

export const SHEET_HTML_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNTGxDekrzkFLrM-XynJSc3rxKzA2bc6ajqsTYr7bSEB8I5RGOrXmFAkfDCOEfnKjBZXWvDL0HFhgb/pubhtml/sheet?headers=false&gid=0';

export const WHATSAPP_BASE = 'https://wa.me/542215681829';
export const MENU_POLL_MS = 60_000;
export const MENU_POLL_SAVER_MS = 120_000;
export const LIVE_FETCH_GAP_MS = 60_000;

const CACHE_KEY = 'maria-panch-combos-v4';
const CACHE_TTL_MS = 15_000;

export type Combo = {
  id: string;
  name: string;
  description: string;
  salePrice: string;
  order: number;
  isActive: boolean;
  imageUrl: string;
};

type CachePayload = {
  at: number;
  csv: string;
};

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

export function parseCombos(csv: string): Combo[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const index = (key: string) => headers.indexOf(key);

  const idIdx = index('id');
  const nameIdx = index('name');
  const descIdx = index('description');
  const priceIdx = index('sale_price');
  const orderIdx = index('order');
  const activeIdx = index('is_active');
  const imageIdx = index('image_url');

  return rows
    .slice(1)
    .map((row) => {
      const name = (row[nameIdx] ?? '').trim();
      const id = (row[idIdx] ?? '').trim() || name;
      return {
        id,
        name,
        description: (row[descIdx] ?? '').trim(),
        salePrice: (row[priceIdx] ?? '').trim(),
        order: Number((row[orderIdx] ?? '0').trim()) || 0,
        isActive: (row[activeIdx] ?? '').trim() === '1',
        imageUrl: (row[imageIdx] ?? '').trim(),
      };
    })
    .filter((combo) => combo.name)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.order - b.order);
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isShippingRow(item: { id?: string; name?: string }): boolean {
  return /\bcosto\s*envio\b/.test(normalizeKey(`${item.id ?? ''} ${item.name ?? ''}`));
}

export function findShipping(combos: Combo[]): Combo | null {
  return combos.find((combo) => isShippingRow(combo)) ?? null;
}

export function menuCombos(combos: Combo[]): Combo[] {
  return combos.filter((combo) => !isShippingRow(combo));
}

function readCache(): string | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.csv || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.csv;
  } catch {
    return null;
  }
}

function writeCache(csv: string) {
  try {
    const payload: CachePayload = { at: Date.now(), csv };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
        .join(','),
    )
    .join('\n');
}

function htmlTableToCsv(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('table tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim()),
  );
  const filled = rows.filter((row) => row.some((cell) => cell !== ''));
  if (filled.length < 2) throw new Error('tabla vacía');
  return rowsToCsv(filled);
}

async function fetchPublishedCsv(): Promise<string> {
  const response = await fetch(`${CSV_URL}&t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`CSV ${response.status}`);
  const csv = await response.text();
  if (!csv.trim()) throw new Error('CSV vacío');
  return csv;
}

async function fetchLiveSheet(): Promise<string> {
  const response = await fetch(`${SHEET_HTML_URL}&t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Sheet ${response.status}`);
  const csv = htmlTableToCsv(await response.text());
  if (!parseCombos(csv).length) throw new Error('Sheet sin combos');
  return csv;
}

type FetchMode = 'live' | 'light';

function dataSaverOn(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  return Boolean(connection.saveData) || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

export function menuPollMs(): number {
  return dataSaverOn() ? MENU_POLL_SAVER_MS : MENU_POLL_MS;
}

export async function fetchCombosCsv(mode: FetchMode = 'light'): Promise<string> {
  const tryLive = mode === 'live' && !dataSaverOn();

  if (tryLive) {
    try {
      const csv = await fetchLiveSheet();
      writeCache(csv);
      return csv;
    } catch {
      /* cae al CSV liviano */
    }
  }

  try {
    const csv = await fetchPublishedCsv();
    writeCache(csv);
    return csv;
  } catch (error) {
    const cached = readCache();
    if (cached) return cached;
    throw error;
  }
}

export function whatsappHref(text: string): string {
  return `${WHATSAPP_BASE}?text=${encodeURIComponent(text)}`;
}

export function parsePrice(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatPrice(value: string | number): string {
  const amount = typeof value === 'number' ? value : parsePrice(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function displayName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}
