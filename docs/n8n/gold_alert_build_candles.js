const alert = $('Gold Alert - Detect Sudden Move').first().json;
const raw = $input.first().json || {};
const points = Array.isArray(raw.points) ? raw.points : [];
if (!points.length) throw new Error('XAUS 1m candles missing');
if (raw.data_state && raw.data_state.status && raw.data_state.status !== 'fresh') {
  throw new Error('XAUS candle feed is not fresh: ' + raw.data_state.status);
}

const observedAt = Number(alert.observedAt);
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
let chart = candles.filter((p) => p.t >= observedAt - preferMs);
if (chart.length < 60) chart = candles.filter((p) => p.t >= observedAt - minMs);
if (chart.length > 120) chart = chart.slice(-120);
if (chart.length < 45) {
  throw new Error('Not enough 1m candles for TradingView-style chart (need >=45, got ' + chart.length + ')');
}

const tvData = chart.map((p) => ({
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

const upMove = Number(alert.move) > 0;
const accent = upMove ? '#26a69a' : '#ef5350';
const marker = {
  time: dedup[dedup.length - 1].time,
  position: upMove ? 'belowBar' : 'aboveBar',
  color: '#f0b90b',
  shape: upMove ? 'arrowUp' : 'arrowDown',
  text: Math.abs(Number(alert.pips)) + ' pips',
};

let lib = '';
try {
  lib = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js',
    encoding: 'text',
  });
} catch (e) {
  try {
    lib = await this.helpers.httpRequest({
      method: 'GET',
      url: 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js',
      encoding: 'text',
    });
  } catch (e2) {
    throw new Error('Could not download TradingView Lightweight Charts library: ' + e2.message);
  }
}
if (typeof lib !== 'string' || lib.length < 10000 || !lib.includes('createChart')) {
  throw new Error('TradingView Lightweight Charts library response looks invalid');
}
const libSafe = lib.replace(/<\/script/gi, '<\\/script');

const payload = JSON.stringify({
  candles: dedup,
  marker,
}).replace(/</g, '\\u003c');

const faPips = (n) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(n);
const tehran = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(observedAt));
const moveAbs = Math.abs(Number(alert.move)).toFixed(2);

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
  #chart{flex:1;width:100%;min-height:560px;border:1px solid #2a2e39;border-radius:4px;overflow:hidden;background:#131722}
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
      <div class="sub">TradingView Lightweight Charts · ${dedup.length} × 1m candles</div>
    </div>
    <div class="right">
      <div class="px">$${Number(alert.price).toFixed(2)}</div>
      <div class="ch">${upMove ? '▲' : '▼'} ${Number(alert.pips)} pips · $${moveAbs} / 3m</div>
    </div>
  </div>
  <div id="chart"></div>
  <div class="foot">
    <div>OHLC source: XAUS <span class="badge">TradingView Lightweight Charts™</span></div>
    <div>${tehran} Tehran · ${faPips(alert.pips)} پیپ ${upMove ? 'صعودی' : 'نزولی'}</div>
  </div>
</div>
<script>
const payload = ${payload};
const el = document.getElementById('chart');
const chart = LightweightCharts.createChart(el, {
  layout: { background: { type: 'solid', color: '#131722' }, textColor: '#d1d4dc', fontSize: 12 },
  grid: { vertLines: { color: '#1f2330' }, horzLines: { color: '#1f2330' } },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal,
    vertLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
    horzLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
  },
  rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.12 } },
  timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 8 },
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
series.setMarkers([payload.marker]);
chart.timeScale().fitContent();
</script>
</body>
</html>`;

return [{
  json: {
    caption: alert.caption,
    html,
    observedAt,
    price: alert.price,
    move: alert.move,
    pips: alert.pips,
    candles: dedup.length,
  },
}];
