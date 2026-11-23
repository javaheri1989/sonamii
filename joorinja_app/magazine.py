from __future__ import annotations

from typing import Any

import httpx


async def publish_magazine_post(
    *,
    site_url: str,
    basic_user: str,
    basic_pass: str,
    post: dict[str, Any],
) -> None:
    base = site_url.rstrip("/")
    auth = (basic_user, basic_pass)
    async with httpx.AsyncClient(timeout=30.0) as client:
        get_resp = await client.get(f"{base}/api/shop-state.json", auth=auth)
        get_resp.raise_for_status()
        state = get_resp.json()
        if not isinstance(state, dict) or not isinstance(state.get("hubs"), list):
            raise RuntimeError("shop-state نامعتبر است")

        posts = list(state.get("magazinePosts") or [])
        posts = [p for p in posts if p and p.get("id") != post["id"] and p.get("title") != post["title"]]
        posts.insert(0, post)
        state["magazinePosts"] = posts

        put_resp = await client.put(f"{base}/api/shop-state", auth=auth, json=state)
        put_resp.raise_for_status()
