const alert = $('Gold Alert - Detect Sudden Move').first().json;
const raw = $input.first().json || {};
const points = Array.isArray(raw.points) ? raw.points : [];
if (!points.length) throw new Error('TradingView OANDA 1m candles missing');
if (raw.data_state && raw.data_state.status && raw.data_state.status !== 'fresh') {
  throw new Error('TradingView OANDA candle feed is not fresh: ' + raw.data_state.status);
}

// OANDA:XAUUSD pricescale=1000 → tick/pipette=0.001; TradingView ruler "points" use pip=0.01
const PIP_SIZE = 0.01; // 1 pip = $0.01 = 10 pipettes (matches TV measure third number)

const observedAt = Number(alert.observedAt);
const baselineAt = Number(alert.baselineAt || (observedAt - 3 * 60 * 1000));
const baselinePrice = Number(alert.baseline);
const endPrice = Number(alert.price);
const signedMove = Number(alert.move);
const upMove = signedMove > 0;
const accent = upMove ? '#26a69a' : '#ef5350';
const moveAbs = Math.abs(signedMove);
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
  open: Number(p.o.toFixed(3)),
  high: Number(p.h.toFixed(3)),
  low: Number(p.l.toFixed(3)),
  close: Number(p.c.toFixed(3)),
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

const barCount = Math.max(1, dedup.filter((r) => r.time >= startTime && r.time <= endTime).length);
const pctSigned = startPrice ? (signedMove / startPrice) * 100 : 0;
const tvPoints = signedMove / PIP_SIZE; // TradingView ruler third value (1 pip = 0.01)

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
  moveSigned: Number(signedMove.toFixed(3)),
  pctSigned: Number(pctSigned.toFixed(2)),
  tvPoints: Number(tvPoints.toFixed(1)),
  barCount,
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
      <div class="px">$${Number(endP).toFixed(3)}</div>
      <div class="ch">${upMove ? '▲' : '▼'} $${moveAbs.toFixed(3)} in ${windowMinutes}m</div>
    </div>
  </div>
  <div class="chart-box">
    <div id="chart"></div>
    <svg id="ruler" xmlns="http://www.w3.org/2000/svg"></svg>
  </div>
  <div class="foot">
    <div>OHLC: TradingView · OANDA <span class="badge">Ruler: TV measure</span></div>
    <div>1 pip = $0.01 · 1 pipette = $0.001</div>
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

function fmtSigned(n, digits) {
  const v = Number(n);
  const body = Math.abs(v).toFixed(digits);
  if (v > 0) return '+' + body;
  if (v < 0) return '−' + body; // unicode minus like TV
  return body;
}

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
  const w = Math.max(10, right - left);
  const h = Math.max(10, bottom - top);
  const midX = (x1 + x2) / 2;
  const color = payload.accent;
  const fillBand = payload.up ? 'rgba(38,166,154,0.16)' : 'rgba(239,83,80,0.16)';

  // TradingView measure tooltip format:
  // -9.619 (−0.26%) −961.9
  // 5 bars, 5m
  const line1 = fmtSigned(payload.moveSigned, 3) + ' (' + fmtSigned(payload.pctSigned, 2) + '%) ' + fmtSigned(payload.tvPoints, 1);
  const line2 = payload.barCount + ' bars, ' + payload.windowMinutes + 'm';

  // Measure label size (TV-like compact pill)
  const labelW = Math.max(168, Math.min(240, 10 + line1.length * 7.2));
  const labelH = 40;
  const priceScalePad = 88;
  const maxX = box.clientWidth - priceScalePad - 6;

  // Prefer empty space: to the RIGHT of the measure band (into rightOffset gap),
  // else LEFT of band, else above/below in free area — never centered on candles if avoidable.
  let labelX = right + 12;
  let labelY = payload.up ? top + 4 : bottom - labelH - 4;
  if (labelX + labelW > maxX) {
    labelX = Math.max(6, left - labelW - 12);
  }
  if (labelX < 6 || labelX + labelW > maxX) {
    labelX = Math.min(Math.max(midX - labelW / 2, 6), maxX - labelW);
    labelY = top - labelH - 8;
    if (labelY < 6) labelY = Math.min(bottom + 8, box.clientHeight - labelH - 6);
  }
  labelY = Math.min(Math.max(labelY, 6), box.clientHeight - labelH - 6);

  // Vertical arrow inside band (TV style)
  const arrowX = midX;
  const arrowTop = top + 4;
  const arrowBot = bottom - 4;
  const arrowLen = Math.max(16, arrowBot - arrowTop);
  const head = 7;
  let arrowPoly;
  if (payload.up) {
    arrowPoly = [
      arrowX + ',' + arrowTop,
      (arrowX - head) + ',' + (arrowTop + head + 2),
      (arrowX - 2) + ',' + (arrowTop + head + 2),
      (arrowX - 2) + ',' + arrowBot,
      (arrowX + 2) + ',' + arrowBot,
      (arrowX + 2) + ',' + (arrowTop + head + 2),
      (arrowX + head) + ',' + (arrowTop + head + 2),
    ].join(' ');
  } else {
    arrowPoly = [
      arrowX + ',' + arrowBot,
      (arrowX - head) + ',' + (arrowBot - head - 2),
      (arrowX - 2) + ',' + (arrowBot - head - 2),
      (arrowX - 2) + ',' + arrowTop,
      (arrowX + 2) + ',' + arrowTop,
      (arrowX + 2) + ',' + (arrowBot - head - 2),
      (arrowX + head) + ',' + (arrowBot - head - 2),
    ].join(' ');
  }

  const cx = labelX + labelW / 2;
  ruler.innerHTML = [
    '<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000" flood-opacity="0.45"/></filter></defs>',
    // shaded measure column
    '<rect x="'+left+'" y="'+top+'" width="'+w+'" height="'+h+'" fill="'+fillBand+'" stroke="'+color+'" stroke-width="1" rx="1"/>',
    // horizontal guides at start/end prices
    '<line x1="'+left+'" y1="'+y1+'" x2="'+right+'" y2="'+y1+'" stroke="'+color+'" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>',
    '<line x1="'+left+'" y1="'+y2+'" x2="'+right+'" y2="'+y2+'" stroke="'+color+'" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>',
    // TV-like vertical arrow
    '<polygon points="'+arrowPoly+'" fill="'+color+'" opacity="0.95"/>',
    // solid accent measure box (like TV tooltip)
    '<rect x="'+labelX+'" y="'+labelY+'" width="'+labelW+'" height="'+labelH+'" rx="4" fill="'+color+'" filter="url(#shadow)"/>',
    '<text x="'+cx+'" y="'+(labelY+16)+'" text-anchor="middle" font-family="Trebuchet MS,Segoe UI,Arial,sans-serif" font-size="12.5" font-weight="700" fill="#ffffff">'+line1+'</text>',
    '<text x="'+cx+'" y="'+(labelY+32)+'" text-anchor="middle" font-family="Trebuchet MS,Segoe UI,Arial,sans-serif" font-size="12" font-weight="600" fill="#ffffff">'+line2+'</text>',
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
    tvPoints: Number(tvPoints.toFixed(1)),
    pipSize: PIP_SIZE,
    candles: dedup.length,
    barCount,
  },
}];
