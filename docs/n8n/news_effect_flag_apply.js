const route = $('News Effect - Only Commands').first().json;
const item = route;
if (item.ignore) {
  if (item.reply) {
    return [{ json: { chatId: item.chatId, message: item.reply, needWrite: false, enabled: false, cbId: item.cbId, keyboard: null, flagKey: item.flagKey }, pairedItem: { item: 0 } }];
  }
  return [];
}

const flag = $input.first().json;
const currently = !!(flag.enabled ?? flag.data?.enabled);
let enabled = currently;
if (item.action === 'on') enabled = true;
if (item.action === 'off') enabled = false;
const needWrite = item.action === 'on' || item.action === 'off';
const feature = item.feature === 'gold' ? 'gold' : 'effect';
const flagKey = item.flagKey || (feature === 'gold' ? 'gold-alert' : 'news-effect');

let statusLine, detail, prefix;
if (feature === 'gold') {
  statusLine = enabled ? '🟢 آلرت حرکت ناگهانی طلا: روشن' : '🔴 آلرت حرکت ناگهانی طلا: خاموش';
  detail = needWrite
    ? (enabled
        ? 'ارسال آلرت شارپ طلا به کانال فعال شد.'
        : 'آلرت شارپ طلا خاموش شد؛ تا روشن کردنش چیزی به کانال نمی‌رود.')
    : 'با دکمه‌های زیر می‌توانی این بخش را روشن یا خاموش کنی.';
  prefix = 'gold';
} else {
  statusLine = enabled ? '🟢 اثر احتمالی: روشن' : '🔴 اثر احتمالی: خاموش';
  detail = needWrite
    ? (enabled
        ? 'شاخهٔ ریپلای اثر احتمالی فعال شد.'
        : 'شاخهٔ ریپلای اثر احتمالی خاموش شد؛ خبرها بدون این ریپلای می‌روند.')
    : 'با دکمه‌های زیر می‌توانی روشن یا خاموشش کنی.';
  prefix = 'effect';
}

const message = '<b>' + statusLine + '</b>\n\n' + detail;
const keyboard = {
  inline_keyboard: [[
    { text: enabled ? '✅ روشن' : '🟢 روشن کردن', callback_data: prefix + ':on' },
    { text: !enabled ? '✅ خاموش' : '🔴 خاموش کردن', callback_data: prefix + ':off' },
  ], [
    { text: '🔄 وضعیت', callback_data: prefix + ':status' },
  ]],
};

return [{
  json: {
    chatId: item.chatId,
    message,
    enabled,
    needWrite,
    cbId: item.cbId || null,
    keyboard,
    feature,
    flagKey,
  },
  pairedItem: { item: 0 },
}];
