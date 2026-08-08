# ============================================================
# MADO Backend - Web Search / Fetch Utility
# 使用 DuckDuckGo HTML 抓取实现免费搜索（无需 API Key）
# 移植自 frontend src/lib/tools/builtin-web-search.ts
# ============================================================

from __future__ import annotations

import html
import re
from typing import Optional

import httpx

_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

_CARD_RE = re.compile(
    r'<a class="result__a" href="([^"]+)"[^>]*>([^<]+)</a>[\s\S]*?'
    r'<a class="result__snippet"[^>]*>([\s\S]*?)</a>'
)
_LINK_RE = re.compile(r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]+)</a>')


def _decode_html_entities(text: str) -> str:
    return html.unescape(text)


def search(query: str, max_results: int = 5) -> list[dict]:
    """DuckDuckGo HTML search, no API key required."""
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                "https://duckduckgo.com/html/",
                params={"q": query, "kl": "zh-cn"},
                headers={"User-Agent": _USER_AGENT},
            )
        if resp.status_code != 200:
            raise RuntimeError(f"Search failed: {resp.status_code}")
        return _parse_duckduckgo_html(resp.text, max_results)
    except Exception:
        return _fallback_search(query, max_results)


def _parse_duckduckgo_html(html_text: str, max_results: int) -> list[dict]:
    results = []
    for m in _CARD_RE.finditer(html_text):
        if len(results) >= max_results:
            break
        url, title, snippet = m.group(1), m.group(2), m.group(3)
        results.append(
            {
                "title": _decode_html_entities(title.strip()),
                "url": url,
                "snippet": _decode_html_entities(re.sub(r"<[^>]+>", "", snippet.strip())),
            }
        )
    if not results:
        return _fallback_parse(html_text, max_results)
    return results


def _fallback_parse(html_text: str, max_results: int) -> list[dict]:
    results = []
    seen: set[str] = set()
    for m in _LINK_RE.finditer(html_text):
        if len(results) >= max_results:
            break
        url, title = m.group(1), m.group(2)
        title_decoded = _decode_html_entities(title.strip())
        if url in seen or "duckduckgo" in url or "yahoo.com" in url or len(title_decoded) < 10:
            continue
        seen.add(url)
        results.append({"title": title_decoded, "url": url, "snippet": title_decoded})
    return results


def _fallback_search(query: str, max_results: int) -> list[dict]:
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                "https://serpapi.com/search.json",
                params={"q": query, "num": max_results, "source": "html"},
            )
        if resp.status_code == 200:
            data = resp.json()
            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("link", ""),
                    "snippet": r.get("snippet", ""),
                }
                for r in (data.get("organic_results") or [])[:max_results]
            ]
    except Exception:
        pass
    return []


def fetch_page(url: str, query: str = "") -> str:
    """Fetch a web page's readable text content via a CORS proxy."""
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            resp = client.get(
                "https://api.allorigins.win/raw",
                params={"url": url},
                headers={"User-Agent": _USER_AGENT},
            )
        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code}")

        page_html = resp.text
        page_html = re.sub(r"<script[\s\S]*?</script>", "", page_html, flags=re.I)
        page_html = re.sub(r"<style[\s\S]*?</style>", "", page_html, flags=re.I)

        body_match = re.search(r"<body[^>]*>([\s\S]*?)</body>", page_html, re.I)
        body_content = body_match.group(1) if body_match else page_html

        text = body_content
        text = re.sub(r"<header[\s\S]*?</header>", "", text, flags=re.I)
        text = re.sub(r"<nav[\s\S]*?</nav>", "", text, flags=re.I)
        text = re.sub(r"<footer[\s\S]*?</footer>", "", text, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = text.replace("&nbsp;", " ")
        text = re.sub(r"\s+", " ", text).strip()

        if query:
            keywords = [w for w in query.lower().split() if len(w) > 2]
            sentences = re.split(r"[.。!！?？]", text)
            scored: list[tuple[int, str]] = []
            for s in sentences:
                s = s.strip()
                if len(s) < 20:
                    continue
                lower = s.lower()
                score = sum(1 for k in keywords if k in lower)
                if score > 0:
                    scored.append((score, s))
            scored.sort(key=lambda x: x[0], reverse=True)
            if scored:
                text = "。\n".join(s for _, s in scored[:5])
                if len(text) < 100:
                    text = "。".join(sentences[:10])
            else:
                text = "。".join(sentences[:15])
        else:
            text = text[:2000]

        return _decode_html_entities(text)
    except Exception as e:
        raise RuntimeError(f"无法获取页面: {e}")

