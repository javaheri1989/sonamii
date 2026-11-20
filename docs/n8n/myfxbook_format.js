const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const bar = (longPct) => {
  const filled = Math.max(0, Math.min(10, Math.round(Number(longPct) / 10)));
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
};

const labels = {
  XAUUSD: '\u200E🥇 XAUUSD (Gold)',
  EURUSD: '\u200E🇪🇺 EURUSD',
  GBPUSD: '\u200E🇬🇧 GBPUSD',
};
const wanted = ['XAUUSD', 'EURUSD', 'GBPUSD'];

const trigger = $('Myfxbook - Decide Trigger').item.json || {};
const raw = $('Myfxbook - Fetch Outlook').item.json || {};
const body = (raw.symbols || raw.instruments) ? raw : (raw.data || raw.body || raw);
if (!body || body.error === true) {
  const msg = (body && body.message) ? String(body.message) : 'outlook fetch failed';
  throw new Error('Myfxbook outlook failed: ' + msg);
}
const symbols = body.symbols || body.instruments || [];
const byName = new Map();
for (const row of symbols) {
  const name = String(row.name || row.symbol || row.instrument || '')
    .replace(/[\/\s]/g, '')
    .toUpperCase();
  if (name) byName.set(name, row);
}

const missing = wanted.filter((s) => !byName.has(s));
if (missing.length) {
  throw new Error('Myfxbook outlook missing pairs: ' + missing.join(', '));
}

const reason = typeof trigger.reasonFa === 'string' && trigger.reasonFa.trim()
  ? trigger.reasonFa.trim()
  : 'احساسات معامله‌گران خرد';

const blocks = ['📊 #تست | احساسات معامله‌گران خرد', `📌 ${reason}`];
for (const name of wanted) {
  const row = byName.get(name);
  const longPct = Math.round(Number(row.longPercentage ?? row.longPercent ?? row.long));
  const shortPct = Math.round(Number(row.shortPercentage ?? row.shortPercent ?? row.short ?? (100 - longPct)));
  if (!Number.isFinite(longPct) || !Number.isFinite(shortPct)) {
    throw new Error('Myfxbook outlook has invalid percentages for ' + name);
  }
  blocks.push('');
  blocks.push(labels[name]);
  blocks.push(`🟢 خرید ${fa(longPct)}٪ ${bar(longPct)} 🔴 فروش ${fa(shortPct)}٪`);
  if (longPct >= 70) {
    blocks.push(`⚠️ ${fa(longPct)}٪ تریدرهای خرد خریدارن؛ احتمال حرکت قیمت به سمت پایین بیشتره`);
  } else if (shortPct >= 70) {
    blocks.push(`⚠️ ${fa(shortPct)}٪ تریدرهای خرد فروشنده‌ان؛ احتمال حرکت قیمت به سمت بالا بیشتره`);
  }
}

blocks.push('');
blocks.push('💡 تریدرهای خرد معمولاً در جهت اشتباه بازارن؛ وقتی بیش از ۷۰٪ اونا یه طرف (خرید یا فروش) باشن، قیمت اغلب خلاف جهت اکثریت حرکت می‌کنه.');
blocks.push('');
const clock = fa(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
blocks.push(`🕒 ${clock} تهران | منبع: Myfxbook`);

return [{ json: { message: blocks.join('\n'), triggerId: trigger.id, triggerKind: trigger.kind } }];
