# Steamprice

A Chrome extension for CS2 players who want a clear, data-driven view of their Steam inventory value — with dual pricing from both the Steam Community Market and third-party marketplaces, and a local price history database that grows silently over time.

## Motivation

The Steam Community Market only shows you what your items are worth on Steam itself. Third-party marketplaces (DMarket, Skinport, Buff163, etc.) often offer significantly different prices — sometimes higher, sometimes lower. Knowing both figures at a glance, and how they've moved over the past year, gives you a meaningful edge when deciding whether to sell, hold, or trade.

Existing tools like Skinpock do this well in a browser tab, but require you to navigate away from whatever you're doing. Steamprice brings the same data into a lightweight popup that opens in seconds, restores its last state instantly, and quietly builds a price history in the background without any manual effort.

## Features

- **Steam login** — authenticates via a real Chrome tab so session cookies work natively; reads the existing session if you're already logged into Steam in Chrome
- **Full inventory fetch** — retrieves all CS2 items via the Steam inventory API, handling pagination automatically
- **Dual pricing** — each item shows two prices side by side:
  - **Steam** — current price on the Steam Community Market (`pricelatest` from Skinpock)
  - **Markets** — best available price across DMarket, Skinport, Buff163, Tradeit, CSFloat, Skinbaron, and others (`pricemix` from Skinpock)
- **Portfolio totals** — aggregate Steam and Markets value displayed above the table
- **Instant restore** — the table is cached locally and rendered immediately on popup open, with no network request until you explicitly click Load
- **Price history** — every load records today's prices per item; a background alarm refreshes prices daily even without opening the popup
- **365-day chart** — clicking `↗` next to any price opens a full-tab line chart showing Steam and Markets price over the last year

## How It Works

```
Steam inventory API ──┐
                       ├── merged by item name ──► popup table ──► chrome.storage (cache)
Skinpock API ──────────┘                                      └──► price history (ph:<name>)
                                                                         │
                                                              chrome.alarms (daily) ──► refresh
```

The extension has no backend. All data lives in `chrome.storage.local`. The only external dependencies are the Steam inventory API and the Skinpock API (which aggregates marketplace prices).

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `docs/` folder
5. Click the Steamprice icon in the toolbar
6. Click **Login with Steam** — if you're already logged into Steam in Chrome, the Steam ID is detected automatically

## Project Structure

```
docs/               Chrome extension root (load this folder)
  manifest.json     Extension config — permissions and entry points
  background.js     Service worker — all API calls, storage, daily alarm
  skinpock.js       window.Skinpock — client API object (wraps chrome.runtime.sendMessage)
  index.html        Popup UI
  popup.js          Popup logic — table rendering, login, load
  chart.html        Full-tab price history page
  chart.js          Canvas chart renderer
  history.js        Price history helpers (documented reference; logic inlined in background.js)
CLAUDE.md           Technical reference for AI-assisted development
```

## Potential Improvements

### Pricing & Data
- **Currency selector** — convert all prices to the user's local currency using Skinpock's `/api/currency/list`; rates are already fetched by the extension
- **Price alerts** — notify the user when an item's price crosses a threshold (e.g. "AK-47 Redline drops below $20")
- **Trend indicators** — show 7-day and 30-day price change (Skinpock already returns `pricelatestsell7d` and `pricelatestsell30d`)
- **Multiple games** — Skinpock supports Dota 2, TF2, and Rust; the inventory API is game-agnostic

### Inventory & Filtering
- **Search / filter bar** — filter the table by item name, rarity, wear, or tradable status
- **Sort by column** — click column headers to sort by name, quantity, Steam price, market price, or total value
- **Wear / float display** — show the exact float value per asset (requires the Steam inspect link + a float API)
- **Tradable flag** — visually distinguish locked (untradable) items from tradable ones

### History & Charts
- **Export to CSV** — let the user download the full price history for analysis in Excel / Google Sheets
- **Portfolio chart** — a single chart showing total inventory value over time, aggregating all items
- **Comparison mode** — overlay two items on the same chart to compare price trajectories
- **Longer retention** — optionally extend history beyond 365 days for long-term holders

### UX
- **Persistent sort/filter state** — remember the user's last sort column and filter between popup opens
- **Paginated table** — for inventories with hundreds of unique items, add pagination or virtual scrolling
- **Dark/light theme toggle**
- **Extension badge** — show the total inventory value as a badge on the extension icon, updated daily

### Technical
- **Replace Skinpock dependency** — Skinpock's HMAC key is embedded in their public JS bundle today, but could rotate. A direct integration with steamwebapi.com (using a user-provided API key) would be more stable
- **Bundler / TypeScript** — as the codebase grows, adding esbuild and TypeScript would improve maintainability and catch type errors
- **Unit tests** — the history storage logic (`recordPrices`, gap filling, trimming) is well-suited for automated tests
- **Multi-account support** — allow switching between multiple Steam accounts
