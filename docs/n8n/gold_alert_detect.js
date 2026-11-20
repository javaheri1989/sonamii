const state = $getWorkflowStaticData('global');
const data = $input.first().json;
const price = Number(data.spot_usd_oz);
const observedAt = Date.parse(data.price_as_of ?? data.updated_at);
const now = Date.now();
if (data.xau?.currency !== 'USD' || data.data_state?.status !== 'fresh' || data.stale === true || !Number.isFinite(price) || price <= 0 || !Number.isFinite(observedAt)) return [];
if (observedAt > now + 60000 || now - observedAt > 120000) return [];
const samples = state.goldAlertSamplesV1 ??= [];
if (!samples.some(s => s.t === observedAt)) samples.push({t: observedAt, p: price});
samples.sort((a,b) => a.t-b.t);
while (samples.length && samples[0].t < observedAt - 75*60000) samples.shift();
const closest = (target, maxGap=90000) => {
  let best;
  for (const s of samples) if (s.t <= target + maxGap && s.t >= target - maxGap && (!best || Math.abs(s.t-target) < Math.abs(best.t-target))) best=s;
  return best;
};
if (samples.length < 35 || observedAt - samples[0].t < 55*60000) return [];
const current = samples[samples.length-1];
const baseline = closest(current.t - 3*60000);
const previous = samples[samples.length-2];
if (!baseline || !previous || current.t-previous.t > 90000 || baseline.t >= previous.t) return [];
const normal = [];
for (const s of samples) {
  if (s.t > current.t-6*60000 || s.t < current.t-60*60000) continue;
  const old = closest(s.t-3*60000);
  if (old && old.t < s.t) normal.push(Math.abs(s.p-old.p));
}
if (normal.length < 20) return [];
normal.sort((a,b)=>a-b);
const median = normal[Math.floor(normal.length/2)];
const threshold = Math.max(18, 4*median);
const move = current.p-baseline.p;
const sameDirection = Math.sign(previous.p-baseline.p) === Math.sign(move);
if (Math.abs(move) < threshold || !sameDirection || Math.abs(previous.p-baseline.p) < threshold*0.65) return [];
if (now - Number(state.goldAlertLastSentAtV1 || 0) < 30*60000) return [];

// XAUUSD retail pip = $0.01
const PIP = 0.01;
const pips = Math.round(Math.abs(move) / PIP);
const up = move > 0;
const faMoney = (n) => new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const faPips = (n) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(n);
const time = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(current.t));
const directionFa = up ? 'صعودی' : 'نزولی';
const arrow = up ? '📈' : '📉';
const caption =
  '🚨 <b>حرکت سریع انس جهانی طلا</b>\n' +
  arrow + ' حرکت ' + directionFa + ': <b>' + faPips(pips) + ' پیپ</b> (' + faMoney(Math.abs(move)) + ' دلار) در ۳ دقیقهٔ اخیر\n' +
  '💵 از ' + faMoney(baseline.p) + ' به ' + faMoney(current.p) + ' دلار\n' +
  '🕒 ' + time + ' تهران\n' +
  '🕯 تایم‌فریم نمودار: ۱ دقیقه\n' +
  '<a href="https://xaus.com/api/">Source: XAUS</a>';

return [{
  json: {
    caption,
    observedAt: current.t,
    price: current.p,
    baseline: baseline.p,
    move,
    pips,
    direction: up ? 'up' : 'down',
    threshold,
  },
}];
