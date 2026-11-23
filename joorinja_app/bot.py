from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from telegram import KeyboardButton, ReplyKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CallbackQueryHandler, ContextTypes, MessageHandler, filters

from jalali import to_jalali
from magazine import publish_magazine_post
from news import fetch_candidates, translate_fa
from store import JsonStore

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("joorinja_app")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "@joorinja").strip()
SITE_URL = os.getenv("JOORAINJA_SITE_URL", "http://127.0.0.1:8098").strip()
BASIC_USER = os.getenv("JOORAINJA_BASIC_USER", "").strip()
BASIC_PASS = os.getenv("JOORAINJA_BASIC_PASS", "").strip()
XAI_API_KEY = os.getenv("XAI_API_KEY", "").strip()
XAI_MODEL = os.getenv("XAI_MODEL", "grok-2-1212").strip()
LOOKBACK_MINUTES = int(os.getenv("LOOKBACK_MINUTES", "20"))
MAX_ITEMS_PER_RUN = int(os.getenv("MAX_ITEMS_PER_RUN", "1"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))

store = JsonStore(DATA_DIR / "state.json")


def kb_admin() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [
            [KeyboardButton("افزودن ادمین"), KeyboardButton("حذف ادمین")],
            [KeyboardButton("لیست ادمین‌ها"), KeyboardButton("شناسه من")],
            [KeyboardButton("راهنما")],
        ],
        resize_keyboard=True,
    )


def kb_guest() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("شناسه من"), KeyboardButton("منو")]],
        resize_keyboard=True,
    )


def kb_cancel() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("لغو"), KeyboardButton("منو")]],
        resize_keyboard=True,
    )


def is_admin(uid: str, data: dict) -> bool:
    return uid in (data.get("admins") or {})


def is_owner(uid: str, data: dict) -> bool:
    return data.get("ownerId") is not None and str(data.get("ownerId")) == uid


def save_admin(data: dict, admin_id: str, username: str = "", name: str = "") -> None:
    admins = data.setdefault("admins", {})
    prev = admins.get(admin_id) or {}
    admins[admin_id] = {
        "id": admin_id,
        "username": username or prev.get("username") or "",
        "name": name or prev.get("name") or "",
        "addedAt": prev.get("addedAt") or int(time.time() * 1000),
    }


async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.effective_chat or not update.message:
        return
    if update.effective_chat.type != "private":
        return

    user = update.effective_user
    uid = str(user.id)
    text = (update.message.text or "").strip()
    forward = update.message.forward_from
    reply_user = update.message.reply_to_message.from_user if update.message.reply_to_message else None

    data = store.get()
    state = (data.get("userState") or {}).get(uid) or {"mode": "idle"}

    # first contact becomes owner
    if not data.get("ownerId"):
        def bootstrap(d):
            d["ownerId"] = uid
            save_admin(d, uid, user.username or "", user.full_name or "")
            d.setdefault("userState", {})[uid] = {"mode": "idle"}

        store.update(bootstrap)
        await update.message.reply_text(
            f"سلام {user.full_name or ''}!\nتو مدیر اصلی تأیید خبر جوراینجا شدی.\nاز دکمه‌های پایین استفاده کن.",
            reply_markup=kb_admin(),
        )
        return

    admin = is_admin(uid, data)
    owner = is_owner(uid, data)

    async def reply(msg: str, markup) -> None:
        await update.message.reply_text(msg, parse_mode=ParseMode.HTML, reply_markup=markup)

    if state.get("mode") == "await_add_admin" and admin:
        target = ""
        meta_user = ""
        meta_name = ""
        if forward:
            target = str(forward.id)
            meta_user = forward.username or ""
            meta_name = forward.full_name or ""
        elif reply_user:
            target = str(reply_user.id)
            meta_user = reply_user.username or ""
            meta_name = reply_user.full_name or ""
        elif text.isdigit():
            target = text
        elif text in {"منو", "لغو"}:
            store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "idle"}))
            await reply("لغو شد. از دکمه‌ها استفاده کن.", kb_admin())
            return
        else:
            await reply(
                "برای افزودن ادمین یک پیام از او را فوروارد کن، یا شناسه عددی‌اش را بفرست.\nبرای انصراف دکمه لغو را بزن.",
                kb_cancel(),
            )
            return

        def add_admin(d):
            save_admin(d, target, meta_user, meta_name)
            d.setdefault("userState", {})[uid] = {"mode": "idle"}

        store.update(add_admin)
        await reply(
            f"ادمین اضافه شد: {meta_name or meta_user or target}\n<code>{target}</code>\nاز او بخواه یک پیام برای ربات بفرستد.",
            kb_admin(),
        )
        return

    if state.get("mode") == "await_remove_admin" and owner:
        target = ""
        if forward:
            target = str(forward.id)
        elif reply_user:
            target = str(reply_user.id)
        elif text.isdigit():
            target = text
        elif text in {"منو", "لغو"}:
            store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "idle"}))
            await reply("لغو شد.", kb_admin())
            return
        else:
            await reply("شناسه عددی را بفرست یا پیامش را فوروارد کن.", kb_cancel())
            return

        if target == str(data.get("ownerId")):
            store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "idle"}))
            await reply("مدیر اصلی قابل حذف نیست.", kb_admin())
            return
        if target not in (data.get("admins") or {}):
            store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "idle"}))
            await reply("این شناسه ادمین نیست.", kb_admin())
            return

        def remove_admin(d):
            d.get("admins", {}).pop(target, None)
            d.setdefault("userState", {})[uid] = {"mode": "idle"}

        store.update(remove_admin)
        await reply(f"ادمین حذف شد: <code>{target}</code>", kb_admin())
        return

    if text == "افزودن ادمین":
        if not admin:
            await reply("دسترسی نداری.", kb_guest())
            return
        store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "await_add_admin"}))
        await reply("یک پیام از کاربر را فوروارد کن، یا شناسه عددی‌اش را بفرست.", kb_cancel())
        return

    if text == "حذف ادمین":
        if not owner:
            await reply("فقط مدیر اصلی می‌تواند ادمین حذف کند.", kb_admin() if admin else kb_guest())
            return
        lines = []
        for a in (data.get("admins") or {}).values():
            if str(a.get("id")) == str(data.get("ownerId")):
                continue
            un = f"@{a['username']}" if a.get("username") else (a.get("name") or "")
            lines.append(f"• <code>{a.get('id')}</code> — {un}")
        if not lines:
            await reply("ادمین دیگری برای حذف نیست.", kb_admin())
            return
        store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "await_remove_admin"}))
        await reply("کدام ادمین حذف شود؟\n" + "\n".join(lines) + "\n\nشناسه را بفرست یا فوروارد کن.", kb_cancel())
        return

    if text == "لیست ادمین‌ها":
        if not admin:
            await reply("دسترسی نداری.", kb_guest())
            return
        lines = []
        for a in (data.get("admins") or {}).values():
            star = " ⭐" if str(a.get("id")) == str(data.get("ownerId")) else ""
            un = f"@{a['username']}" if a.get("username") else (a.get("name") or "بدون‌نام")
            lines.append(f"• {un}{star}\n  <code>{a.get('id')}</code>")
        await reply("ادمین‌های تأیید خبر:\n\n" + "\n\n".join(lines) if lines else "ادمینی نیست.", kb_admin())
        return

    if text == "شناسه من":
        await reply(f"شناسه عددی تو:\n<code>{uid}</code>", kb_admin() if admin else kb_guest())
        return

    # منو / راهنما / هر پیام دیگر
    store.update(lambda d: d.setdefault("userState", {}).__setitem__(uid, {"mode": "idle"}))
    if admin:
        await reply(
            "منوی مدیریت تأیید خبر\nاز دکمه‌های پایین استفاده کن.\nخبرهای جدید همین‌جا با دکمه تأیید یا رد می‌آیند.",
            kb_admin(),
        )
    else:
        await reply(
            f"ربات خبر جوراینجا\nشناسه تو: <code>{uid}</code>\nبرای دسترسی، مدیر باید با دکمه «افزودن ادمین» اضافه‌ات کند.",
            kb_guest(),
        )


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query or not query.from_user:
        return
    await query.answer()
    data = store.get()
    uid = str(query.from_user.id)
    if not is_admin(uid, data):
        await query.answer("اجازه تأیید/رد نداری.", show_alert=True)
        return

    payload = query.data or ""
    decision = ""
    pending_id = ""
    if payload.startswith("game_ok_"):
        decision = "approve"
        pending_id = payload[8:]
    elif payload.startswith("game_no_"):
        decision = "reject"
        pending_id = payload[8:]
    else:
        return

    pending = (data.get("pending") or {}).get(pending_id)
    if not pending:
        await query.edit_message_text("این خبر منقضی شده.")
        return
    if pending.get("status") and pending.get("status") != "pending":
        await query.answer("قبلاً رسیدگی شده.", show_alert=True)
        return

    actor = query.from_user.full_name or query.from_user.username or uid

    if decision == "reject":
        def reject(d):
            d.get("pending", {}).pop(pending_id, None)

        store.update(reject)
        await query.edit_message_text(f"❌ رد شد توسط {actor}\n\n{pending.get('title_fa') or ''}")
        return

    def mark_publishing(d):
        item = d.get("pending", {}).get(pending_id)
        if item:
            item["status"] = "publishing"

    store.update(mark_publishing)
    await query.answer("در حال انتشار...")

    # publish channel
    try:
        await context.bot.send_message(
            chat_id=CHANNEL_ID,
            text=f"<b>{pending['title_fa']}</b>\n\n{pending['body_fa']}",
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=False,
        )
    except Exception as e:
        log.exception("channel publish failed")
        await query.edit_message_text(f"خطا در انتشار کانال: {e}")
        return

    # publish magazine
    try:
        await publish_magazine_post(
            site_url=SITE_URL,
            basic_user=BASIC_USER,
            basic_pass=BASIC_PASS,
            post={
                "id": f"mag-{pending_id}",
                "title": pending["title_fa"],
                "excerpt": pending["excerpt_fa"],
                "body": pending["body_fa"],
                "date": pending["date_fa"],
            },
        )
    except Exception as e:
        log.exception("magazine publish failed")
        await query.edit_message_text(f"کانال منتشر شد ولی مجله خطا داد: {e}")
        return

    def done(d):
        d.get("pending", {}).pop(pending_id, None)

    store.update(done)
    await query.edit_message_text(
        f"✅ منتشر شد توسط {actor}\n\n{pending['title_fa']}\nکانال {CHANNEL_ID} + مجله"
    )


async def poll_news(context: ContextTypes.DEFAULT_TYPE) -> None:
    if not XAI_API_KEY:
        log.warning("XAI_API_KEY missing; skip news poll")
        return

    data = store.get()
    admins = list((data.get("admins") or {}).keys())
    if not admins:
        log.info("no admins yet; skip news poll")
        return

    seen = data.get("seen") or {}
    candidates = fetch_candidates(lookback_minutes=LOOKBACK_MINUTES, seen=seen)
    selected = candidates[:MAX_ITEMS_PER_RUN]
    if not selected:
        return

    for item in selected:
        try:
            fa = await translate_fa(
                api_key=XAI_API_KEY,
                model=XAI_MODEL,
                source=item["source"],
                title=item["title"],
                summary=item["summary"],
            )
        except Exception:
            log.exception("translate failed for %s", item.get("link"))
            continue

        pending_id = f"{int(time.time()):x}{os.urandom(2).hex()}"
        pending = {
            "pendingId": pending_id,
            "link": item["link"],
            "source": item["source"],
            "title_fa": fa["title_fa"],
            "excerpt_fa": fa["excerpt_fa"],
            "body_fa": fa["body_fa"],
            "date_fa": to_jalali(),
            "createdAt": int(time.time() * 1000),
            "status": "pending",
        }
        caption = (
            f"🎮 <b>{pending['title_fa']}</b>\n\n"
            f"{pending['excerpt_fa']}\n\n"
            f"پلتفرم: {pending['source']}\n"
            f"تاریخ مجله: {pending['date_fa']}\n\n"
            "با دکمه‌ها تأیید یا رد کن. بعد از تأیید → کانال + مجله"
        )

        def persist(d, _item=item, _pending=pending):
            d.setdefault("seen", {})[_item["link"]] = int(time.time() * 1000)
            # prune seen
            entries = sorted(d["seen"].items(), key=lambda kv: kv[1], reverse=True)[:500]
            d["seen"] = dict(entries)
            d.setdefault("pending", {})[_pending["pendingId"]] = _pending

        store.update(persist)

        from telegram import InlineKeyboardButton, InlineKeyboardMarkup

        markup = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("✅ تأیید و انتشار", callback_data=f"game_ok_{pending_id}"),
                    InlineKeyboardButton("❌ رد", callback_data=f"game_no_{pending_id}"),
                ]
            ]
        )
        for admin_id in admins:
            try:
                await context.bot.send_message(
                    chat_id=int(admin_id),
                    text=caption,
                    parse_mode=ParseMode.HTML,
                    reply_markup=markup,
                    disable_web_page_preview=True,
                )
            except Exception:
                log.exception("failed to notify admin %s", admin_id)


def main() -> None:
    if not TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN is required")

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE & filters.ALL, handle_menu))

    async def on_start(app_: Application) -> None:
        await app_.bot.delete_webhook(drop_pending_updates=False)

        class Ctx:
            bot = app_.bot

        async def _job():
            await poll_news(Ctx())  # type: ignore[arg-type]

        scheduler = AsyncIOScheduler(timezone=os.getenv("TZ", "Asia/Tehran"))
        scheduler.add_job(_job, "interval", minutes=15, id="news_poll")
        scheduler.start()
        app_.bot_data["scheduler"] = scheduler
        log.info("joorinja_app started; polling every 15 minutes")

    app.post_init = on_start
    app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
