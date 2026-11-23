const alert = $('Gold Alert - Detect Sudden Move').first().json;
const raw = $input.first().json || {};
const points = Array.isArray(raw.points) ? raw.points : [];
if (!points.length) throw new Error('TradingView OANDA 1m candles missing');
if (raw.data_state && raw.data_state.status && raw.data_state.status !== 'fresh') {
  throw new Error('TradingView OANDA candle feed is not fresh: ' + raw.data_state.status);
}

const observedAt = Number(alert.observedAt);
const baselineAt = Number(alert.baselineAt || (observedAt - 3 * 60 * 1000));
const baselinePrice = Number(alert.baseline);
const endPrice = Number(alert.price);
const upMove = Number(alert.move) > 0;
const accent = upMove ? '#26a69a' : '#ef5350';
const moveAbs = Math.abs(Number(alert.move));
const windowMinutes = Math.max(1, Math.round((observedAt - baselineAt) / 60000) || 3);

const candles = points
  .map((p) => ({
    t: Number(p.t) * (Number(p.t) < 1e12 ? 1000 : 1),
    o: Number(p.o),
    h: Number(p.h),
    l: Number(p.l),
    c: Number(p.c),
  }))
  .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.o) && Number.isFinite(p.h) && Number.isFinite(p.l) && Number.isFinite(p.c) && p.t <= observedAt + 90000)
  .sort((a, b) => a.t - b.t);

const preferMs = 90 * 60 * 1000;
const minMs = 60 * 60 * 1000;
let chartCandles = candles.filter((p) => p.t >= observedAt - preferMs);
if (chartCandles.length < 60) chartCandles = candles.filter((p) => p.t >= observedAt - minMs);
if (chartCandles.length > 120) chartCandles = chartCandles.slice(-120);
if (chartCandles.length < 45) {
  throw new Error('Not enough 1m candles for TradingView-style chart (need >=45, got ' + chartCandles.length + ')');
}

const tvData = chartCandles.map((p) => ({
  time: Math.floor(p.t / 1000),
  open: Number(p.o.toFixed(2)),
  high: Number(p.h.toFixed(2)),
  low: Number(p.l.toFixed(2)),
  close: Number(p.c.toFixed(2)),
}));
const dedup = [];
for (const row of tvData) {
  if (dedup.length && dedup[dedup.length - 1].time === row.time) dedup[dedup.length - 1] = row;
  else dedup.push(row);
}

const nearest = (targetMs) => {
  let best = dedup[0];
  let bestDist = Infinity;
  for (const row of dedup) {
    const dist = Math.abs(row.time * 1000 - targetMs);
    if (dist < bestDist) { best = row; bestDist = dist; }
  }
  return best;
};
const startCandle = nearest(baselineAt);
const endCandle = nearest(observedAt);
let startTime = startCandle.time;
let endTime = endCandle.time;
const startPrice = Number(Number.isFinite(baselinePrice) ? baselinePrice : startCandle.close);
const endP = Number(Number.isFinite(endPrice) ? endPrice : endCandle.close);
if (startTime >= endTime) {
  const idx = Math.max(0, dedup.findIndex((r) => r.time === endTime) - 3);
  startTime = dedup[idx].time;
}
const pct = startPrice ? (moveAbs / startPrice) * 100 : 0;

let lib = '';
try {
  lib = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js',
    encoding: 'text',
  });
} catch (e) {
  lib = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js',
    encoding: 'text',
  });
}
if (typeof lib !== 'string' || lib.length < 10000 || !lib.includes('createChart')) {
  throw new Error('TradingView Lightweight Charts library response looks invalid');
}
const libSafe = lib.replace(/<\/script/gi, '<\\/script');

const payload = JSON.stringify({
  candles: dedup,
  startTime,
  endTime,
  startPrice,
  endPrice: endP,
  accent,
  up: upMove,
  moveAbs: Number(moveAbs.toFixed(2)),
  pct: Number(pct.toFixed(2)),
  windowMinutes,
}).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#131722;color:#d1d4dc;font-family:Inter,Segoe UI,Arial,sans-serif}
  .wrap{width:1280px;height:720px;padding:18px 22px 14px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:16px}
  .left .sym{font-size:13px;letter-spacing:.08em;color:#787b86;text-transform:uppercase}
  .left .title{font-size:22px;font-weight:700;color:#f0f3fa;margin-top:4px}
  .left .sub{font-size:13px;color:#787b86;margin-top:4px}
  .right{text-align:right}
  .right .px{font-size:34px;font-weight:700;color:#f0f3fa;line-height:1}
  .right .ch{font-size:18px;font-weight:600;margin-top:6px;color:${accent}}
  .chart-box{position:relative;flex:1;width:100%;min-height:560px;border:1px solid #2a2e39;border-radius:4px;overflow:hidden;background:#131722}
  #chart{position:absolute;inset:0}
  #ruler{position:absolute;inset:0;pointer-events:none;z-index:5}
  .foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#787b86}
  .badge{display:inline-block;padding:2px 8px;border-radius:3px;background:#1e222d;border:1px solid #2a2e39;margin-inline-start:8px}
</style>
<script>${libSafe}</script>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="left">
      <div class="sym">XAU / USD · 1</div>
      <div class="title">Gold sudden move</div>
      <div class="sub">OANDA via TradingView · ${dedup.length} × 1m</div>
    </div>
    <div class="right">
      <div class="px">$${Number(alert.price).toFixed(2)}</div>
      <div class="ch">${upMove ? '▲' : '▼'} $${moveAbs.toFixed(2)} in ${windowMinutes}m</div>
    </div>
  </div>
  <div class="chart-box">
    <div id="chart"></div>
    <svg id="ruler" xmlns="http://www.w3.org/2000/svg"></svg>
  </div>
  <div class="foot">
    <div>OHLC: TradingView · OANDA <span class="badge">Measure: USD ($)</span></div>
    <div>1-minute candles · window ${windowMinutes}m</div>
  </div>
</div>
<script>
const payload = ${payload};
const el = document.getElementById('chart');
const ruler = document.getElementById('ruler');
const chart = LightweightCharts.createChart(el, {
  layout: { background: { type: 'solid', color: '#131722' }, textColor: '#d1d4dc', fontSize: 12 },
  grid: { vertLines: { color: '#1f2330' }, horzLines: { color: '#1f2330' } },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal,
    vertLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
    horzLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
  },
  rightPriceScale: {
    borderColor: '#2a2e39',
    scaleMargins: { top: 0.08, bottom: 0.12 },
    minimumWidth: 78,
  },
  timeScale: {
    borderColor: '#2a2e39',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 14,
    barSpacing: 8,
    minBarSpacing: 6,
  },
  width: el.clientWidth,
  height: el.clientHeight,
});
const series = chart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderUpColor: '#26a69a',
  borderDownColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  borderVisible: true,
});
series.setData(payload.candles);
chart.timeScale().fitContent();
chart.timeScale().applyOptions({ rightOffset: 14 });

function drawRuler() {
  const box = document.querySelector('.chart-box');
  ruler.setAttribute('width', box.clientWidth);
  ruler.setAttribute('height', box.clientHeight);
  const x1 = chart.timeScale().timeToCoordinate(payload.startTime);
  const x2 = chart.timeScale().timeToCoordinate(payload.endTime);
  const y1 = series.priceToCoordinate(payload.startPrice);
  const y2 = series.priceToCoordinate(payload.endPrice);
  if ([x1,x2,y1,y2].some((v) => v == null || Number.isNaN(v))) return false;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const w = Math.max(12, right - left);
  const h = Math.max(12, bottom - top);
  const color = payload.accent;
  const sign = payload.up ? '+' : '−';
  const line1 = sign + '$' + payload.moveAbs.toFixed(2) + ' USD';
  const line2 = payload.pct.toFixed(2) + '%  ·  ' + payload.windowMinutes + 'm';
  const labelW = 168;
  const labelH = 44;
  const priceScalePad = 86;
  const maxX = box.clientWidth - priceScalePad - 8;
  // Prefer above the measure box, else below, else side — keep off candles when possible
  let labelX = Math.min(Math.max(left + (w - labelW) / 2, 8), maxX - labelW);
  let labelY = top - labelH - 10;
  if (labelY < 8) labelY = Math.min(bottom + 10, box.clientHeight - labelH - 8);
  if (labelY < 8 || labelY + labelH > box.clientHeight - 4) {
    labelX = right + 12;
    if (labelX + labelW > maxX) labelX = Math.max(8, left - labelW - 12);
    labelY = Math.min(Math.max(top + h / 2 - labelH / 2, 8), box.clientHeight - labelH - 8);
  }
  const cx = labelX + labelW / 2;

  ruler.innerHTML = [
    '<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.55"/></filter></defs>',
    '<rect x="'+left+'" y="'+top+'" width="'+w+'" height="'+h+'" fill="'+(payload.up ? 'rgba(38,166,154,0.18)' : 'rgba(239,83,80,0.18)')+'" stroke="'+color+'" stroke-width="1.8" stroke-dasharray="5 4" rx="2"/>',
    '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#f0b90b" stroke-width="2.2"/>',
    '<circle cx="'+x1+'" cy="'+y1+'" r="5" fill="#f0b90b" stroke="#131722" stroke-width="1.5"/>',
    '<circle cx="'+x2+'" cy="'+y2+'" r="5" fill="'+color+'" stroke="#131722" stroke-width="1.5"/>',
    '<rect x="'+labelX+'" y="'+labelY+'" width="'+labelW+'" height="'+labelH+'" rx="6" fill="rgba(15,18,28,0.92)" stroke="'+color+'" stroke-width="1.4" filter="url(#shadow)"/>',
    '<text x="'+cx+'" y="'+(labelY+18)+'" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14" font-weight="700" fill="#f0f3fa">'+line1+'</text>',
    '<text x="'+cx+'" y="'+(labelY+34)+'" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="12" font-weight="600" fill="#b2b5be">'+line2+'</text>',
  ].join('');
  return true;
}
function tryDraw(attempt) {
  if (drawRuler()) { window.__rulerReady = true; return; }
  if (attempt < 25) setTimeout(() => tryDraw(attempt + 1), 100);
}
tryDraw(0);
</script>
</body>
</html>`;

return [{
  json: {
    caption: alert.caption,
    html,
    observedAt,
    baselineAt,
    price: alert.price,
    move: alert.move,
    pips: alert.pips,
    candles: dedup.length,
  },
}];
