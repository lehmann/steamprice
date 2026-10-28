# Steamprice

Chrome extension (Manifest V3) that displays a CS2 Steam inventory with dual pricing — Steam Community Market and cross-marketplace — and builds a local price history database over time.

## Architecture

All files live under `docs/`, which is the extension root loaded via `chrome://extensions` → Load unpacked.

```
docs/
  manifest.json   Extension config (MV3)
  background.js   Service worker — all network calls and storage logic
  skinpock.js     window.Skinpock — client-side API object used by popup and chart pages
  popup.js        Popup logic (table rendering, login/load actions)
  index.html      Extension popup (640px wide)
  chart.html      Full-tab price history chart page
  chart.js        Canvas chart renderer for chart.html
  history.js      Price history helpers (referenced for documentation; logic is inlined in background.js)
```

## Data Flow

### Login
- Reads the `steamLoginSecure` cookie from `steamcommunity.com` — if present, the user is already logged in and the Steam ID is extracted directly.
- If not logged in, opens a real Chrome tab to `steamcommunity.com/login/home/` and waits for the cookie to appear (polls `tabs.onUpdated`), then closes the tab.
- Steam ID is persisted in `chrome.storage.local` under `steamId`.

### Inventory load (`Load Inventory` button)
One request is made (the Steam inventory is no longer fetched directly; Steam is used only for the login cookie):

1. **Skinpock inventory and prices** — `GET api.skinpock.com/api/v2/inventories/{steamId}` (HMAC-SHA256 signed by the page's patched fetch). Returns `pricelatest` (Steam Community Market price) and `pricemix` (best cross-marketplace price). The request runs via `chrome.scripting.executeScript` (world `MAIN`) inside a `www.skinpock.com` tab: the endpoint returns `403 browser_proof_required` to any non-browser client, so the page's own scripts must make the call. If no Skinpock tab is open, one is opened in the background and closed afterwards, but only if the extension opened it. If the response is `browser_proof_required`, the tab is focused so the user can complete the verification.

The Skinpock response is mapped to items (`markethashname`, `rarity`, `quality`, `count`, `pricelatest`, `pricemix`) and sorted by value. The list is:
- Returned to the popup for display
- Persisted in `chrome.storage.local` as `inventoryCache` (restored on next popup open without a network request)
- Written to per-item price history (see below)

### Daily background refresh
A `chrome.alarms` alarm fires every 24 hours. It calls Skinpock through the same skinpock.com tab path as the inventory load (no Steam inventory fetch needed — prices only) and appends to the price history. If the verification is required, the refresh fails until the user completes it in the tab.

## Price History Storage

Each item is stored under `ph:<market_hash_name>` as:
```json
{ "start": "YYYY-MM-DD", "s": [number|null, ...], "m": [number|null, ...] }
```
- `s[i]` = Steam price on day `start + i`
- `m[i]` = Markets price on day `start + i`
- `null` = no data for that day (gap)
- Arrays are capped at 365 entries; older entries are trimmed as new days are added

## Price History Chart

Clicking the `↗` button next to any price opens `chart.html?item=<name>` in a new tab. The chart renders two line series (Steam in blue `#00d4ff`, Markets in orange `#f4a261`) on an HTML canvas, with monthly X-axis labels and gaps shown as line breaks.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` + `unlimitedStorage` | Inventory cache and price history (up to 365 days × N items) |
| `cookies` | Read `steamLoginSecure` to extract Steam ID without a login popup |
| `tabs` | Open login tab and hidden inventory-fetch tab |
| `scripting` | `executeScript` inside a Skinpock tab (Skinpock inventory fetch) |
| `alarms` | Daily price refresh in background |
| `host_permissions: www.skinpock.com`, `api.skinpock.com` | Skinpock tab access and CORS for Skinpock API |
| `host_permissions: steamcommunity.com` | Steam login cookie / login tab |

## Key Implementation Notes

- **Service workers cannot set the `Cookie` header** — browsers strip it silently. Requests that need the site's session or page-side verification must run inside a real tab via `executeScript` (currently the Skinpock tab).
- **`chrome.identity.launchWebAuthFlow` uses an isolated cookie partition** — cookies set during that flow do not appear in `chrome.cookies` and are unavailable to `executeScript` tabs. Login is done via a real tab instead.
- **Skinpock HMAC**: signature = `HMAC-SHA256(key, "<timestamp>:<path>:<nonce>")`, sent as `x-hmac-signature`, `x-hmac-timestamp`, `x-hmac-nonce` headers. The key `sP_hM4c_8xKq2VnL7pRj9TwYf5mDc3Zb6gNu1XeA0sHi` is extracted from Skinpock's public JS bundle. HMAC alone no longer unlocks `api.skinpock.com/api/v2/inventories` (it also needs browser proof), which is why that call goes through the Skinpock tab. `skinpockFetch` (`/api/currency/list`, `/api/inventory-history` on `www`) still uses HMAC directly; `/api/inventory-history` is also gated by browser proof.
- **Do not reimplement the browser proof**: the page obtains it via `/api/security/browser-proof`. Forging or replaying it is out of scope; the extension relies on the page doing it.
- **History helpers** (`history.js`) are inlined into `background.js` because service workers cannot use `importScripts` with ES module syntax, and the extension does not use a bundler.
- **Inventory cache** (`inventoryCache`) is loaded on popup open — the table renders instantly without any network request. Clicking `Load Inventory` explicitly triggers a fresh fetch and updates the cache.
- **Steam login** (`steamLogin`, `steamLoginViaTab`) only reads the `steamLoginSecure` cookie and the Steam ID; the Steam inventory itself is not requested.
- **Skinpock tab ownership**: `getSkinpockTab()` returns `{ tab, created }`. The extension closes only tabs it created, never a user's existing Skinpock tab, and never on a `browser_proof_required` response.
