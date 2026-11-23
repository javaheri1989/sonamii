const ADMIN_ID = 44086079;
const msg = $input.first().json;
const fromId = msg.message?.from?.id ?? msg.callback_query?.from?.id;
const chatId = msg.message?.chat?.id ?? msg.callback_query?.message?.chat?.id ?? fromId;
const cbId = msg.callback_query?.id;
let text = String(msg.message?.text || msg.callback_query?.data || '').trim();
text = (text.split(/\s+/)[0] || text).replace(/@\w+$/,'');

if (fromId !== ADMIN_ID) {
  // ignore foreign chats silently unless it's clearly our command family
  const raw0 = String(msg.callback_query?.data || msg.message?.text || '').trim();
  if (/^(effect:|gold:|اثر|طلا|\/اثر|\/طلا|\/effect|\/gold)/i.test(raw0)) {
    return [{ json: { ignore: true, chatId, reply: 'این بخش فقط برای مدیر است.', cbId, feature: null, flagKey: null }, pairedItem: { item: 0 } }];
  }
  return [{ json: { ignore: true, chatId, reply: '', cbId, feature: null, flagKey: null }, pairedItem: { item: 0 } }];
}

const raw = String(msg.callback_query?.data || msg.message?.text || '').trim();
const head = (raw.split(/\s+/)[0] || raw).replace(/@\w+$/,'');

let feature = null;
let action = 'panel';

// Gold sudden-move controls
if (
  raw === 'gold:on' || head === 'طلا_on' || head === '/طلا_on' || head === '/gold_on' || head === 'gold_on'
) { feature = 'gold'; action = 'on'; }
else if (
  raw === 'gold:off' || head === 'طلا_off' || head === '/طلا_off' || head === '/gold_off' || head === 'gold_off'
) { feature = 'gold'; action = 'off'; }
else if (
  raw === 'gold:status' || head === 'طلا' || head === '/طلا' || head === '/gold' || head === 'gold' ||
  head === 'آلرت_طلا' || head === '🎛️ طلا' || /^gold:/i.test(raw) || /^طلا/.test(head)
) { feature = 'gold'; action = 'panel'; }

// News effect controls
else if (
  raw === 'effect:on' || head === 'اثر_on' || head === '/اثر_on' || head === '/effect_on' || head === 'effect_on'
) { feature = 'effect'; action = 'on'; }
else if (
  raw === 'effect:off' || head === 'اثر_off' || head === '/اثر_off' || head === '/effect_off' || head === 'effect_off'
) { feature = 'effect'; action = 'off'; }
else if (
  raw === 'effect:status' || head === 'اثر' || head === '/اثر' || head === '/effect' || head === 'effect' ||
  head === 'اثر احتمالی' || head === '🎛️ اثر احتمالی' || /^effect:/i.test(raw) || /^اثر/.test(head)
) { feature = 'effect'; action = 'panel'; }

else {
  return [{ json: { ignore: true, chatId, reply: '', cbId, feature: null, flagKey: null }, pairedItem: { item: 0 } }];
}

const flagKey = feature === 'gold' ? 'gold-alert' : 'news-effect';
return [{ json: { ignore: false, action, feature, flagKey, chatId, fromId, cbId }, pairedItem: { item: 0 } }];
