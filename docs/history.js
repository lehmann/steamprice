/**
 * Price history storage helpers.
 *
 * Each item is stored under the key `ph:<market_hash_name>` as:
 *   { start: "YYYY-MM-DD", s: number[], m: number[] }
 * where s[i] = Steam price and m[i] = Markets price on day (start + i).
 * null means no data for that day.
 * Arrays are capped at 365 entries.
 */

const MAX_DAYS = 365;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function storageKey(name) {
  return `ph:${name}`;
}

/**
 * Record today's prices for a list of items.
 * @param {Array<{ name: string, priceSteam: number|null, priceMarket: number|null }>} items
 */
async function recordPrices(items) {
  const date = today();
  const keys = items.map(i => storageKey(i.name));
  const stored = await chrome.storage.local.get(keys);

  const updates = {};
  for (const item of items) {
    const key = storageKey(item.name);
    let rec = stored[key];

    if (!rec) {
      rec = { start: date, s: [item.priceSteam], m: [item.priceMarket] };
    } else {
      const gap = daysBetween(rec.start, date);
      if (gap < 0) continue; // clock skew — ignore

      // Extend array to cover today, filling gaps with null
      while (rec.s.length <= gap) {
        rec.s.push(null);
        rec.m.push(null);
      }
      rec.s[gap] = item.priceSteam;
      rec.m[gap] = item.priceMarket;

      // Trim to MAX_DAYS from the end
      if (rec.s.length > MAX_DAYS) {
        const trim = rec.s.length - MAX_DAYS;
        rec.s = rec.s.slice(trim);
        rec.m = rec.m.slice(trim);
        rec.start = addDays(rec.start, trim);
      }
    }
    updates[key] = rec;
  }
  await chrome.storage.local.set(updates);
}

/**
 * Retrieve history for a single item.
 * Returns { start, s, m } or null.
 * @param {string} name
 */
async function getHistory(name) {
  const stored = await chrome.storage.local.get(storageKey(name));
  return stored[storageKey(name)] ?? null;
}
