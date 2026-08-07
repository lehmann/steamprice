const $ = id => document.getElementById(id);

function fmt(value) {
  if (value == null) return '—';
  return '$' + value.toFixed(2);
}

function chartBtn(itemName) {
  const btn = document.createElement('button');
  btn.className = 'chart-btn';
  btn.title = 'Price history';
  btn.textContent = '↗';
  btn.addEventListener('click', () => {
    const url = chrome.runtime.getURL(`chart.html?item=${encodeURIComponent(itemName)}`);
    chrome.tabs.create({ url });
  });
  return btn;
}

function totalChartBtn() {
  const btn = document.createElement('button');
  btn.className = 'chart-btn';
  btn.title = 'Total inventory value history';
  btn.textContent = '↗';
  btn.addEventListener('click', () => {
    const url = chrome.runtime.getURL('chart.html?item=__total__');
    chrome.tabs.create({ url });
  });
  return btn;
}

function renderTable(items) {
  const totalSteam  = items.reduce((s, g) => s + (g.priceSteam  ?? 0) * g.count, 0);
  const totalMarket = items.reduce((s, g) => s + (g.priceMarket ?? 0) * g.count, 0);
  const itemCount   = items.reduce((s, g) => s + g.count, 0);

  const summary = $('summary');
  summary.textContent = `${itemCount} items  ·  Steam: ${fmt(totalSteam)}  ·  Markets: ${fmt(totalMarket)}  `;
  summary.appendChild(totalChartBtn());

  const tbody = $('tbody');
  tbody.innerHTML = '';

  for (const g of items) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = g.name;

    const tdQty = document.createElement('td');
    tdQty.className = 'num';
    tdQty.textContent = g.count;

    const tdSteam = document.createElement('td');
    tdSteam.className = 'num price-cell';
    tdSteam.appendChild(document.createTextNode(fmt(g.priceSteam)));
    if (g.priceSteam != null) tdSteam.appendChild(chartBtn(g.name));

    const tdMarket = document.createElement('td');
    tdMarket.className = 'num price-cell';
    tdMarket.appendChild(document.createTextNode(fmt(g.priceMarket)));
    if (g.priceMarket != null) tdMarket.appendChild(chartBtn(g.name));

    const tdTotalSteam = document.createElement('td');
    tdTotalSteam.className = 'num';
    tdTotalSteam.textContent = fmt(g.priceSteam != null ? g.priceSteam * g.count : null);

    const tdTotalMarket = document.createElement('td');
    tdTotalMarket.className = 'num';
    tdTotalMarket.textContent = fmt(g.priceMarket != null ? g.priceMarket * g.count : null);

    tr.append(tdName, tdQty, tdSteam, tdMarket, tdTotalSteam, tdTotalMarket);
    tbody.appendChild(tr);
  }

  $('table').hidden = false;
}

async function init() {
  const { steamId } = await Skinpock.getStoredSteamId();
  if (!steamId) return;

  $('steamid-display').textContent = steamId;
  $('login-section').hidden = true;
  $('inventory-section').hidden = false;

  const cache = await Skinpock.getInventoryCache();
  if (cache?.items?.length) {
    renderTable(cache.items);
    $('status').textContent = `Last updated: ${cache.cachedAt}`;
  }
}

async function onLogin() {
  $('btn-login').disabled = true;
  $('status').textContent = 'Opening Steam login…';
  try {
    const { steamId } = await Skinpock.login();
    $('steamid-display').textContent = steamId;
    $('login-section').hidden = true;
    $('inventory-section').hidden = false;
    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = err.message;
    $('btn-login').disabled = false;
  }
}

async function onLoad() {
  const steamId = $('steamid-display').textContent.trim();
  $('btn-load').disabled = true;
  $('status').textContent = 'Loading inventory…';
  $('table').hidden = true;
  $('summary').textContent = '';

  try {
    const items = await Skinpock.inventoryHybrid(steamId);
    renderTable(items);
    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = err.message;
  } finally {
    $('btn-load').disabled = false;
  }
}

$('btn-login').addEventListener('click', onLogin);
$('btn-load').addEventListener('click', onLoad);

init();
