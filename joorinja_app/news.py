from __future__ import annotations

import html
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
import httpx

FEEDS = [
    ("PlayStation", "https://blog.playstation.com/feed/"),
    ("Xbox", "https://news.xbox.com/en-us/feed/"),
    ("Nintendo", "https://www.nintendolife.com/feeds/latest"),
    ("Meta Quest", "https://www.meta.com/blog/quest/rss/"),
]


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _detect_source(link: str, fallback: str) -> str:
    u = (link or "").lower()
    if "playstation" in u or "sony" in u:
        return "PlayStation"
    if "xbox" in u or "microsoft" in u:
        return "Xbox"
    if "nintendo" in u:
        return "Nintendo"
    if "meta.com" in u or "oculus" in u or "quest" in u:
        return "Meta Quest"
    return fallback


def fetch_candidates(*, lookback_minutes: int, seen: dict[str, Any]) -> list[dict[str, Any]]:
    cutoff = time.time() - lookback_minutes * 60
    items: list[dict[str, Any]] = []
    for fallback_source, url in FEEDS:
        parsed = feedparser.parse(url)
        for entry in parsed.entries:
            link = entry.get("link") or entry.get("id") or ""
            if not link or link in seen:
                continue
            published_ms = time.time()
            raw_date = entry.get("published") or entry.get("updated")
            if raw_date:
                try:
                    published_ms = parsedate_to_datetime(raw_date).timestamp()
                except Exception:
                    try:
                        published_ms = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).timestamp()
                    except Exception:
                        pass
            if published_ms < cutoff:
                continue
            title = _strip_html(entry.get("title") or "")
            summary = _strip_html(entry.get("summary") or entry.get("description") or "")[:1200]
            if not title:
                continue
            items.append(
                {
                    "link": link,
                    "title": title,
                    "summary": summary,
                    "source": _detect_source(link, fallback_source),
                    "publishedAt": datetime.fromtimestamp(published_ms, tz=timezone.utc).isoformat(),
                }
            )
    items.sort(key=lambda x: x["publishedAt"], reverse=True)
    return items


async def translate_fa(*, api_key: str, model: str, source: str, title: str, summary: str) -> dict[str, str]:
    prompt = (
        "تو یک مترجم خبری بازی هستی. عنوان و خلاصه زیر را به فارسی روان و خبری ترجمه کن.\n"
        "فقط JSON معتبر برگردان با کلیدهای: title_fa, excerpt_fa, body_fa\n"
        "- title_fa: عنوان کوتاه خبری\n"
        "- excerpt_fa: یک جمله خلاصه برای لیست مجله\n"
        "- body_fa: متن کامل فارسی ۲ تا ۴ پاراگراف کوتاه، بدون لینک منبع\n\n"
        f"منبع پلتفرم: {source}\n"
        f"عنوان انگلیسی: {title}\n"
        f"خلاصه انگلیسی: {summary}\n"
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
    import json

    data = json.loads(content)
    return {
        "title_fa": str(data.get("title_fa") or title).strip(),
        "excerpt_fa": str(data.get("excerpt_fa") or summary).strip()[:220],
        "body_fa": str(data.get("body_fa") or summary).strip(),
    }
