/**
 * shared/dispatchPacks.mjs
 * Pack-size rules shared by the server and the client. Mirrors BC "Order Pack Mgt.":
 * an order quantity (pieces) is broken down largest pack first; what does not fill the
 * smallest pack is loose.
 */

export const hasPacks = (setup) => Number(setup?.MainPackSize ?? setup?.mainPackSize) > 0;

export function packSetupOf(line) {
  return {
    main: Number(line?.MainPackSize ?? line?.mainPackSize) || 0,
    mini: Number(line?.MiniPackSize ?? line?.miniPackSize) || 0,
    allowLoose: !!(line?.AllowLoose ?? line?.allowLoose),
  };
}

/** { mainPacks, miniPacks, loose, text } for a quantity in pieces. */
export function packBreakdown(setup, qty) {
  const { main, mini } = packSetupOf(setup);
  let rest = Math.max(0, Number(qty) || 0);
  const mainPacks = main > 0 ? Math.floor(rest / main) : 0;
  rest -= mainPacks * main;
  const miniPacks = mini > 0 ? Math.floor(rest / mini) : 0;
  rest -= miniPacks * mini;
  const loose = Math.round(rest * 10000) / 10000;
  const parts = [];
  if (mainPacks) parts.push(`${mainPacks} x ${main}`);
  if (miniPacks) parts.push(`${miniPacks} x ${mini}`);
  if (loose) parts.push(`${loose} loose`);
  return { mainPacks, miniPacks, loose, text: main > 0 ? parts.join(' + ') : '' };
}

/** Size of a pack type for an item setup ('main' | 'mini'); 0 if the item has no such pack. */
export function packSize(setup, packType) {
  const { main, mini } = packSetupOf(setup);
  return packType === 'mini' ? mini : packType === 'main' ? main : 0;
}

/**
 * Checks the prepacks scanned onto an assembly line.
 *  - each prepack is for the line's item and company, not void, and either available or
 *    already on this line (a correction);
 *  - no prepack twice;
 *  - their total does not exceed the assembled pieces.
 * Returns the total pieces in the prepacks.
 */
export function validatePrepacks(line, prepacks, pieces) {
  const seen = new Set();
  let total = 0;
  for (const p of prepacks) {
    if (!p) throw new Error('Prepack not found');
    if (seen.has(p.PrepackNo)) throw new Error(`Prepack ${p.PrepackNo} is scanned twice`);
    seen.add(p.PrepackNo);
    if (String(p.ItemNo) !== String(line.ItemNo)) throw new Error(`Prepack ${p.PrepackNo} is for item ${p.ItemNo}, not ${line.ItemNo}`);
    if (line.Company && p.Company && String(p.Company) !== String(line.Company)) throw new Error(`Prepack ${p.PrepackNo} belongs to company ${p.Company}`);
    if (p.Status === 'void') throw new Error(`Prepack ${p.PrepackNo} is void`);
    if (p.Status === 'used' && String(p.LineId || '').toLowerCase() !== String(line.LineId || '').toLowerCase())
      throw new Error(`Prepack ${p.PrepackNo} is already used on order ${p.OrderNo || ''}`.trim());
    total += Number(p.PackSize) || 0;
  }
  if (total > Number(pieces)) throw new Error(`The scanned prepacks hold ${total} pieces, more than the ${pieces} pieces assembled`);
  return total;
}

/** Groups DPL lines by chiller, chillers in name order with UNMAPPED last; lines by part then line order. */
export function groupByChiller(lines) {
  const groups = new Map();
  for (const l of lines) {
    const key = l.Chiller || 'UNMAPPED';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === 'UNMAPPED') - (b === 'UNMAPPED') || a.localeCompare(b));
  return keys.map((chiller) => ({
    chiller,
    lines: groups.get(chiller).sort((a, b) => String(a.Part || '').localeCompare(String(b.Part || '')) || (a.SortOrder || 0) - (b.SortOrder || 0)),
  }));
}
