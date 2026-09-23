/**
 * María Panch — registro de pedidos (Web App).
 * Libro: pedidos · Hojas: pedidos, pedidos_lineas
 *
 * Implementar como aplicación web (Cualquiera). El POST espera JSON en postData.contents.
 */

const CONFIG = {
  SECRET: 'CAMBIAR_IGUAL_QUE_PUBLIC_ORDERS_SECRET',
  SHEET_PEDIDOS: 'pedidos',
  SHEET_LINEAS: 'pedidos_lineas',
  TZ: 'America/Argentina/Buenos_Aires',
  DEFAULT_STATUS: 'new',
};

function doGet() {
  return jsonOut({ ok: true, service: 'maria-panch-pedidos' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'empty body' });
    }

    const body = JSON.parse(e.postData.contents);

    if (body.secret !== CONFIG.SECRET) {
      return jsonOut({ ok: false, error: 'unauthorized' });
    }

    const orderId = String(body.orderId || '').trim();
    if (!orderId) {
      return jsonOut({ ok: false, error: 'missing orderId' });
    }

    const totals = body.totals || {};
    const subtotal = Number(totals.subtotal) || 0;
    const ship = Number(totals.shipping ?? totals.ship) || 0;
    const total = Number(totals.total) || subtotal + ship;
    const rounds = Array.isArray(body.rounds) ? body.rounds : [];
    const whatsappMessage = String(body.whatsappMessage || body.whatsapp_message || '');
    const source = String(body.source || 'web');
    const version = String(body.version || '');
    const notes = String(body.notes || '');

    const payload = {
      orderId,
      totals: { subtotal, shipping: ship, total },
      rounds,
    };
    const jsonPayload = JSON.stringify(payload);

    const now = new Date();
    const date = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, CONFIG.TZ, 'HH:mm:ss');
    const createdAt = Utilities.formatDate(now, CONFIG.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pedidos = ss.getSheetByName(CONFIG.SHEET_PEDIDOS);
    if (!pedidos) {
      throw new Error('Missing sheet: ' + CONFIG.SHEET_PEDIDOS);
    }

    // order_id | date | time | created_at | status | subtotal | ship | total | blocks |
    // whatsapp_message | json_payload | source | version | notes
    pedidos.appendRow([
      orderId,
      date,
      time,
      createdAt,
      CONFIG.DEFAULT_STATUS,
      subtotal,
      ship,
      total,
      rounds.length,
      whatsappMessage,
      jsonPayload,
      source,
      version,
      notes,
    ]);

    const lineasSheet = ss.getSheetByName(CONFIG.SHEET_LINEAS);
    if (lineasSheet) {
      const lineRows = Array.isArray(body.lines) && body.lines.length
        ? normalizeClientLines(orderId, body.lines)
        : flattenLinesFromRounds(orderId, rounds, ship);

      lineRows.forEach((row) => lineasSheet.appendRow(row));
    }

    return jsonOut({ ok: true, orderId, createdAt });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Filas para pedidos_lineas:
 * order_id | line | block | block_type | line_type | desctiption | amount | item_id
 */
function normalizeClientLines(orderId, lines) {
  return lines.map((entry, index) => {
    const line = Number(entry.line) || index + 1;
    const block = entry.block === '' || entry.block == null ? '' : Number(entry.block);
    return [
      orderId,
      line,
      block === '' ? '' : block,
      String(entry.block_type || entry.blockType || ''),
      String(entry.line_type || entry.lineType || ''),
      String(entry.description || entry.desctiption || ''),
      entry.amount === '' || entry.amount == null ? '' : Number(entry.amount),
      String(entry.item_id || entry.itemId || ''),
    ];
  });
}

function flattenLinesFromRounds(orderId, rounds, ship) {
  const rows = [];
  let line = 0;

  rounds.forEach((round, blockIndex) => {
    const block = blockIndex + 1;
    const blockType = String(round.kind || '');

    (round.panchos || []).forEach((pancho, panchoIndex) => {
      line += 1;
      const panchoLabel =
        (round.panchos || []).length > 1 ? 'Pancho ' + (panchoIndex + 1) : 'Pancho';
      rows.push([orderId, line, block, blockType, 'pancho', panchoLabel, '', 'pancho']);

      (pancho.free || []).forEach((id) => {
        line += 1;
        rows.push([orderId, line, block, blockType, 'topping_free', id, 0, id]);
      });

      (pancho.premium || []).forEach((id) => {
        line += 1;
        rows.push([orderId, line, block, blockType, 'topping_premium', id, '', id]);
      });
    });

    if (round.papas) {
      line += 1;
      const portion = String(round.papas.portion || '');
      rows.push([
        orderId,
        line,
        block,
        blockType,
        'papas',
        portion ? 'Papas ' + portion : 'Papas',
        '',
        portion,
      ]);

      (round.papas.toppings || []).forEach((id) => {
        line += 1;
        rows.push([orderId, line, block, blockType, 'papas_topping', id, '', id]);
      });
    }

    (round.drinks || []).forEach((drink) => {
      line += 1;
      const id = String(drink.id || '');
      const qty = Number(drink.qty) || 1;
      const desc = qty > 1 ? id + ' × ' + qty : id;
      rows.push([orderId, line, block, blockType, 'drink', desc, '', id]);
    });
  });

  if (ship > 0) {
    line += 1;
    rows.push([orderId, line, '', '', 'shipping', 'Envío', ship, 'shipping']);
  }

  return rows;
}
