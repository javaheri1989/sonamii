const state = $getWorkflowStaticData('global');
const now = Date.now();
const DUE_WINDOW_MS = 90 * 1000;
const LEAD_MS = 5 * 60 * 1000;
const NY = 'America/New_York';

const partsIn = (timeZone, date = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
);

const dateKeyIn = (timeZone, date) => {
  const p = partsIn(timeZone, date);
  return `${p.year}-${p.month}-${p.day}`;
};

const localTimeOnNyDay = (dayKey, hour, minute) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  let v = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 3; i++) {
    const q = partsIn(NY, new Date(v));
    const local = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute);
    v += Date.UTC(y, m - 1, d, hour, minute) - local;
  }
  return v;
};

if ($execution.mode === 'test') {
  return [{
    json: {
      id: `myfxbook-test-v1:${now}`,
      kind: 'test',
      reasonFa: 'اجرای تست دستی',
      dayKey: dateKeyIn(NY),
      dueAt: new Date(now).toISOString(),
      eventAt: null,
      currency: null,
      title: null,
    },
  }];
}

const cache = state.ffCalendarCacheV1;
if (!cache || !Array.isArray(cache.events) || now - cache.savedAt > 6 * 3600 * 1000) {
  return [];
}
const events = cache.events;
const nyNow = partsIn(NY);
const dayKey = `${nyNow.year}-${nyNow.month}-${nyNow.day}`;

// Weekend (NY): no publish
if (['Sat', 'Sun'].includes(nyNow.weekday)) return [];

const isTimed = (date) => /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(String(date));
const currencyOf = (e) => String(e.country ?? e.currency ?? '').toUpperCase();

// Bank holidays for USD/EUR on this NY day → skip everything
const bankHoliday = events.some((e) => {
  if (!/\bbank holiday\b/i.test(String(e.title ?? ''))) return false;
  if (!['USD', 'EUR'].includes(currencyOf(e))) return false;
  if (!e.date) return false;
  const raw = String(e.date);
  if (isTimed(raw)) {
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return false;
    return dateKeyIn(NY, new Date(at)) === dayKey;
  }
  // All-day rows sometimes arrive as YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw === dayKey;
});
if (bankHoliday) return [];

const news = events
  .filter((e) => {
    if (String(e.impact ?? '').toLowerCase() !== 'high') return false;
    if (!['USD', 'EUR'].includes(currencyOf(e))) return false;
    if (!e.title || !e.date || !isTimed(e.date)) return false;
    const at = Date.parse(e.date);
    if (!Number.isFinite(at)) return false;
    return dateKeyIn(NY, new Date(at)) === dayKey;
  })
  .map((e) => ({
    title: String(e.title).trim(),
    currency: currencyOf(e),
    at: Date.parse(e.date),
  }))
  .sort((a, b) => a.at - b.at || a.currency.localeCompare(b.currency) || a.title.localeCompare(b.title));

const dueHit = (dueAt) => {
  const lag = now - dueAt;
  return lag >= 0 && lag < DUE_WINDOW_MS;
};

if (news.length) {
  const first = news[0];
  const dueAt = first.at - LEAD_MS;
  if (!dueHit(dueAt)) return []; // news day: never fall back to NY session
  const id = `myfxbook-news-v1:${dayKey}:${first.currency}:${encodeURIComponent(first.title)}:${new Date(first.at).toISOString()}`;
  return [{
    json: {
      id,
      kind: 'news',
      reasonFa: `۵ دقیقه تا خبر ${first.currency}: ${first.title}`,
      dayKey,
      dueAt: new Date(dueAt).toISOString(),
      eventAt: new Date(first.at).toISOString(),
      currency: first.currency,
      title: first.title,
    },
  }];
}

// Normal day: 5 minutes before New York forex session open (08:00 NY)
const openAt = localTimeOnNyDay(dayKey, 8, 0);
const dueAt = openAt - LEAD_MS;
if (!dueHit(dueAt)) return [];
const id = `myfxbook-ny-v1:${dayKey}`;
return [{
  json: {
    id,
    kind: 'ny_session',
    reasonFa: '۵ دقیقه تا باز شدن سشن نیویورک (فارکس)',
    dayKey,
    dueAt: new Date(dueAt).toISOString(),
    eventAt: new Date(openAt).toISOString(),
    currency: null,
    title: null,
  },
}];
