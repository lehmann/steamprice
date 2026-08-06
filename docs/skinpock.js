/**
 * window.Skinpock
 *
 * Client-side wrapper. All network calls are delegated to background.js
 * (which holds cross-origin fetch permissions).
 */
const Skinpock = (() => {
  function send(action, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, params }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response.error)           return reject(new Error(response.error));
        resolve(response.data);
      });
    });
  }

  /** Trigger Steam OpenID login popup. Returns { steamId }. */
  function login() {
    return send('login');
  }

  /** Returns { steamId } from local storage, or null if not logged in. */
  function getStoredSteamId() {
    return send('getStoredSteamId');
  }

  /**
   * Hybrid inventory: Steam structure + Skinpock prices.
   * Each item: { name, wear, rarity, type, tradable, count, priceSteam, priceMarket }
   * @param {string} steamId
   * @returns {Promise<Array>}
   */
  function inventoryHybrid(steamId) {
    return send('inventoryHybrid', { steamId });
  }

  /** Inventory value history — [{ date, worth, size }, ...] */
  function inventoryHistory(steamId) {
    return send('inventoryHistory', { steamid: steamId });
  }

  /** Currency exchange rates — { rates: { USD: 1, EUR: 0.86, ... } } */
  function currencyList() {
    return send('currencyList');
  }

  /**
   * Retrieve stored price history for a single item.
   * Returns { start: "YYYY-MM-DD", s: number[], m: number[] } or null.
   * @param {string} name  market_hash_name
   */
  /** Returns { items, cachedAt } from last successful load, or null. */
  function getInventoryCache() {
    return send('getInventoryCache');
  }

  function getHistory(name) {
    return send('getHistory', { name });
  }

  return { login, getStoredSteamId, inventoryHybrid, inventoryHistory, currencyList, getInventoryCache, getHistory };
})();
