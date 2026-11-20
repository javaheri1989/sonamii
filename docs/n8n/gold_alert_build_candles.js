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

const windowMs = 20 * 60 * 1000; // last ~20 one-minute candles
const chart = candles.filter((p) => p.t >= observedAt - windowMs);
if (chart.length < 8) throw new Error('Not enough 1m candles for chart');

const lows = chart.map((p) => p.l);
const highs = chart.map((p) => p.h);
const min = Math.min(...lows);
const max = Math.max(...highs);
const pad = Math.max(1.5, (max - min) * 0.12);
const low = min - pad;
const high = max + pad;
const plotW = 1040;
const plotH = 300;
const left = 70;
const top = 20;

const xCenter = (i) => left + ((i + 0.5) / chart.length) * plotW;
const yOf = (price) => top + plotH - ((price - low) / (high - low)) * plotH;
const bodyW = Math.max(4, Math.min(18, (plotW / chart.length) * 0.55));
const upColor = '#2bc48a';
const downColor = '#f36c75';

const shapes = [];
for (let i = 0; i < chart.length; i++) {
  const c = chart[i];
  const up = c.c >= c.o;
  const color = up ? upColor : downColor;
  const x = xCenter(i);
  const yHigh = yOf(c.h);
  const yLow = yOf(c.l);
  const yOpen = yOf(c.o);
  const yClose = yOf(c.c);
  const yBodyTop = Math.min(yOpen, yClose);
  const yBodyBot = Math.max(yOpen, yClose);
  const bodyH = Math.max(2, yBodyBot - yBodyTop);
  shapes.push('<line x1="' + x.toFixed(1) + '" y1="' + yHigh.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + yLow.toFixed(1) + '" stroke="' + color + '" stroke-width="2"/>');
  shapes.push('<rect x="' + (x - bodyW / 2).toFixed(1) + '" y="' + yBodyTop.toFixed(1) + '" width="' + bodyW.toFixed(1) + '" height="' + bodyH.toFixed(1) + '" fill="' + color + '" rx="1"/>');
}

const last = chart[chart.length - 1];
const upMove = Number(alert.move) > 0;
const color = upMove ? upColor : downColor;
const faMoney = (n) => new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const faPips = (n) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(n);
const tehran = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(observedAt));

const html = '<!doctype html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;background:#101827;color:#f7fafc;font-family:Arial,sans-serif}.card{width:1200px;height:560px;padding:42px 50px}.top{display:flex;justify-content:space-between;align-items:start}.eyebrow{font-size:19px;color:#91a4bd;letter-spacing:2px}.title{font-size:34px;font-weight:700;margin-top:8px}.price{font-size:51px;font-weight:700;text-align:right}.change{font-size:24px;color:' + color + ';text-align:right;margin-top:6px}.chart{margin-top:18px}.footer{display:flex;justify-content:space-between;color:#91a4bd;font-size:18px;margin-top:10px}</style></head><body><div class="card"><div class="top"><div><div class="eyebrow">XAU / USD · 1-MINUTE CANDLES</div><div class="title">Gold sudden move · last 20 minutes</div></div><div><div class="price">$' + Number(alert.price).toFixed(2) + '</div><div class="change">' + (upMove ? '▲' : '▼') + ' ' + Number(alert.pips) + ' pips · $' + Math.abs(Number(alert.move)).toFixed(2) + ' in 3 min</div></div></div><svg class="chart" width="1100" height="340" viewBox="0 0 1100 340"><line x1="70" y1="320" x2="1110" y2="320" stroke="#35445a"/>' + shapes.join('') + '</svg><div class="footer"><span>1-minute OHLC from XAUS · ' + chart.length + ' candles</span><span>' + tehran + ' Tehran · ' + faPips(alert.pips) + ' پیپ ' + (upMove ? 'صعودی' : 'نزولی') + '</span></div></div></body></html>';

return [{ json: { caption: alert.caption, html, observedAt, price: alert.price, move: alert.move, pips: alert.pips, candles: chart.length } }];
