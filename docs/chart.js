const STEAM_COLOR   = '#00d4ff';
const MARKET_COLOR  = '#f4a261';
const GRID_COLOR    = '#1f2a4a';
const LABEL_COLOR   = '#888';
const PADDING       = { top: 20, right: 20, bottom: 50, left: 60 };

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function drawChart(canvas, rec) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const plotW = W - PADDING.left - PADDING.right;
  const plotH = H - PADDING.top  - PADDING.bottom;

  // Build date labels and non-null values for scale
  const dates = rec.s.map((_, i) => addDays(rec.start, i));
  const allVals = [...rec.s, ...rec.m].filter(v => v != null);
  if (!allVals.length) return;

  const minY = Math.max(0, Math.min(...allVals) * 0.9);
  const maxY = Math.max(...allVals) * 1.1;
  const rangeY = maxY - minY || 1;

  const toX = i => PADDING.left + (i / (rec.s.length - 1 || 1)) * plotW;
  const toY = v => PADDING.top + plotH - ((v - minY) / rangeY) * plotH;

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grid lines + Y labels
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = `${11 * dpr / dpr}px monospace`;
  ctx.textAlign = 'right';
  const yTicks = 5;
  for (let t = 0; t <= yTicks; t++) {
    const v = minY + (rangeY * t) / yTicks;
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(W - PADDING.right, y);
    ctx.stroke();
    ctx.fillText(`$${v.toFixed(2)}`, PADDING.left - 6, y + 4);
  }

  // X labels — one per month
  ctx.textAlign = 'center';
  let lastMonth = -1;
  rec.s.forEach((_, i) => {
    const d = dates[i];
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      const x = toX(i);
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(formatDate(d), x, H - PADDING.bottom + 18);
      ctx.strokeStyle = GRID_COLOR;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.stroke();
    }
  });

  // Draw a series, skipping null gaps
  function drawLine(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const x = toX(i), y = toY(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots for individual points
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      if (v == null) return;
      ctx.beginPath();
      ctx.arc(toX(i), toY(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(rec.s, STEAM_COLOR);
  drawLine(rec.m, MARKET_COLOR);
}

async function init() {
  const params = new URLSearchParams(location.search);
  const name = params.get('item');
  if (!name) return;

  document.getElementById('title').textContent = name;

  const rec = await Skinpock.getHistory(name);
  if (!rec || !rec.s.length) {
    document.getElementById('no-data').hidden = false;
    document.getElementById('chart').hidden = true;
    return;
  }

  const days  = rec.s.length;
  const start = new Date(rec.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const end   = addDays(rec.start, days - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  document.getElementById('subtitle').textContent = `${days} day${days !== 1 ? 's' : ''} · ${start} – ${end}`;

  const canvas = document.getElementById('chart');
  drawChart(canvas, rec);
  window.addEventListener('resize', () => drawChart(canvas, rec));
}

init();
