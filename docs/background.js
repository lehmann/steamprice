// --- Skinpock ---

const SKINPOCK_KEY = 'sP_hM4c_8xKq2VnL7pRj9TwYf5mDc3Zb6gNu1XeA0sHi';
const SKINPOCK_BASE = 'https://www.skinpock.com';

async function hmacHeaders(path) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SKINPOCK_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const timestamp = Date.now().toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}:${path}:${nonce}`));
  const signature = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return { 'x-hmac-signature': signature, 'x-hmac-timestamp': timestamp, 'x-hmac-nonce': nonce };
}

async function skinpockFetch(path, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  ).toString();
  const url = qs ? `${SKINPOCK_BASE}${path}?${qs}` : `${SKINPOCK_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Cookie': 'game=cs2; NEXT_LOCALE=en',
      'Referer': 'https://www.skinpock.com/',
      ...(await hmacHeaders(path)),
    },
  });
  if (!res.ok) throw new Error(`Skinpock ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- History (inline — service workers cannot import scripts) ---

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

async function recordPrices(items) {
  const date = today();
  const keys = items.map(i => `ph:${i.name}`);
  const stored = await chrome.storage.local.get(keys);
  const updates = {};

  for (const item of items) {
    const key = `ph:${item.name}`;
    let rec = stored[key];

    if (!rec) {
      rec = { start: date, s: [item.priceSteam], m: [item.priceMarket] };
    } else {
      const gap = daysBetween(rec.start, date);
      if (gap < 0) continue;
      while (rec.s.length <= gap) { rec.s.push(null); rec.m.push(null); }
      rec.s[gap] = item.priceSteam;
      rec.m[gap] = item.priceMarket;
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

// --- Steam session via cookies ---

function steamIdFromCookie(cookieValue) {
  const decoded = decodeURIComponent(cookieValue);
  const steamId = decoded.split('||')[0];
  return /^\d{17}$/.test(steamId) ? steamId : null;
}

async function getSessionSteamId() {
  const cookie = await chrome.cookies.get({
    url: 'https://steamcommunity.com',
    name: 'steamLoginSecure',
  });
  return cookie ? steamIdFromCookie(cookie.value) : null;
}

async function steamLoginViaTab() {
  const tab = await chrome.tabs.create({
    url: 'https://steamcommunity.com/login/home/',
    active: true,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      chrome.tabs.onUpdated.removeListener(listener);
      await chrome.tabs.remove(tab.id).catch(() => {});
      reject(new Error('Login timeout (2 min)'));
    }, 120_000);

    async function listener(tabId, info) {
      if (tabId !== tab.id || info.status !== 'complete') return;
      const steamId = await getSessionSteamId();
      if (!steamId) return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      await chrome.tabs.remove(tab.id).catch(() => {});
      resolve(steamId);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function steamLogin() {
  const existing = await getSessionSteamId();
  if (existing) return existing;
  const steamId = await steamLoginViaTab();
  await chrome.storage.local.set({ steamId });
  return steamId;
}

// --- Steam inventory ---

async function steamInventory(steamId) {
  const tab = await chrome.tabs.create({
    url: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
    active: false,
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tab load timeout')), 20_000);
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      });
    });

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (sid) => {
        try {
          const allDescriptions = [];
          const allAssets = [];
          let lastAssetId = null;

          while (true) {
            const url = new URL(`https://steamcommunity.com/inventory/${sid}/730/2`);
            url.searchParams.set('l', 'english');
            url.searchParams.set('count', '2000');
            if (lastAssetId) url.searchParams.set('start_assetid', lastAssetId);

            const res = await fetch(url.toString(), { credentials: 'include' });
            const body = await res.text().catch(() => '');
            if (!res.ok) return { error: `Steam ${res.status}: ${body.slice(0, 200)}` };

            const page = JSON.parse(body);
            if (!page?.assets) return { error: 'Empty or private inventory' };

            allAssets.push(...page.assets);
            for (const d of (page.descriptions ?? [])) {
              if (!allDescriptions.some(e => e.classid === d.classid)) allDescriptions.push(d);
            }
            if (!page.more_items || !page.last_assetid) break;
            lastAssetId = page.last_assetid;
            await new Promise(r => setTimeout(r, 1000));
          }

          return { data: { descriptions: allDescriptions, assets: allAssets } };
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [steamId],
    });

    if (result.result.error) throw new Error(result.result.error);
    const raw = result.result.data;
    if (!raw?.descriptions) throw new Error('Steam inventory is private or empty');

    return raw.descriptions.map(item => ({
      markethashname: item.market_hash_name,
      tradable:       item.tradable,
      wear:    (item.tags ?? []).find(t => t.category === 'Exterior')?.localized_tag_name ?? null,
      rarity:  (item.tags ?? []).find(t => t.category === 'Rarity')?.localized_tag_name ?? null,
      type:    (item.tags ?? []).find(t => t.category === 'Type')?.localized_tag_name ?? null,
      count:   raw.assets.filter(a => a.classid === item.classid).length,
    }));
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// --- Daily price refresh ---

async function dailyRefresh() {
  const { steamId } = await chrome.storage.local.get('steamId');
  if (!steamId) return;

  try {
    const items = await skinpockFetch('/api/inventory', {
      steam_id: steamId,
      sort: 'price_max',
      game: 'cs2',
      language: 'english',
      markets: 'tradeit,skinflow,dmarket,buff,youpin,skinport,skinbaron,skinland,haloskins,csfloat',
    });

    const toRecord = items.map(i => ({
      name:        i.markethashname,
      priceSteam:  parseFloat(i.pricelatest) || null,
      priceMarket: parseFloat(i.pricemix)    || null,
    }));

    await recordPrices(toRecord);
    await chrome.storage.local.set({ lastRefresh: today() });
  } catch (e) {
    console.error('Daily refresh failed:', e.message);
  }
}

// Schedule daily alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dailyRefresh', { periodInMinutes: 1440 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'dailyRefresh') dailyRefresh();
});

// --- Message handlers ---

const HANDLERS = {
  login: async () => {
    const steamId = await steamLogin();
    await chrome.storage.local.set({ steamId });
    return { steamId };
  },

  getStoredSteamId: async () => {
    const live = await getSessionSteamId();
    if (live) {
      await chrome.storage.local.set({ steamId: live });
      return { steamId: live };
    }
    const { steamId } = await chrome.storage.local.get('steamId');
    return { steamId: steamId ?? null };
  },

  inventoryHybrid: async ({ steamId }) => {
    const [steamItems, skinpockItems] = await Promise.all([
      steamInventory(steamId),
      skinpockFetch('/api/inventory', {
        steam_id: steamId,
        sort: 'price_max',
        game: 'cs2',
        language: 'english',
        markets: 'tradeit,skinflow,dmarket,buff,youpin,skinport,skinbaron,skinland,haloskins,csfloat',
      }),
    ]);

    const spMap = new Map();
    for (const sp of skinpockItems) {
      if (!spMap.has(sp.markethashname)) {
        spMap.set(sp.markethashname, {
          priceSteam:  parseFloat(sp.pricelatest) || null,
          priceMarket: parseFloat(sp.pricemix)    || null,
        });
      }
    }

    const map = new Map();
    for (const item of steamItems) {
      const name = item.markethashname;
      if (!map.has(name)) {
        const sp = spMap.get(name) ?? {};
        map.set(name, {
          name,
          wear:        item.wear,
          rarity:      item.rarity,
          type:        item.type,
          tradable:    item.tradable,
          count:       0,
          priceSteam:  sp.priceSteam  ?? null,
          priceMarket: sp.priceMarket ?? null,
        });
      }
      map.get(name).count += item.count;
    }

    const result = [...map.values()].sort((a, b) => {
      const av = (a.priceSteam ?? a.priceMarket ?? 0) * a.count;
      const bv = (b.priceSteam ?? b.priceMarket ?? 0) * b.count;
      return bv - av;
    });

    // Persist today's prices and cache the full result for the popup
    await Promise.all([
      recordPrices(result.map(i => ({
        name: i.name, priceSteam: i.priceSteam, priceMarket: i.priceMarket,
      }))),
      chrome.storage.local.set({ inventoryCache: { items: result, cachedAt: today() } }),
    ]);

    return result;
  },

  getInventoryCache: async () => {
    const { inventoryCache } = await chrome.storage.local.get('inventoryCache');
    return inventoryCache ?? null;
  },

  getHistory: async ({ name }) => {
    const stored = await chrome.storage.local.get(`ph:${name}`);
    return stored[`ph:${name}`] ?? null;
  },

  currencyList: () =>
    skinpockFetch('/api/currency/list'),

  inventoryHistory: ({ steamid }) =>
    skinpockFetch('/api/inventory-history', { steamid, game: 'cs2' }),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message.action];
  if (!handler) {
    sendResponse({ error: `Unknown action: ${message.action}` });
    return false;
  }
  handler(message.params ?? {})
    .then(data => sendResponse({ data }))
    .catch(err => sendResponse({ error: err.message }));
  return true;
});
