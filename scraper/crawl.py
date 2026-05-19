#!/usr/bin/env python3
"""
Crawl skintyeefirstnation.org and produce a manifest of pages + downloaded media.

Output layout:
    scraped/
        raw/<slug>.html           # raw HTML response (for debugging / re-extraction)
        media/<sha1>.<ext>        # all downloaded images / PDFs, content-addressed
        manifest.json             # list of page records (see PageRecord below)

Each page record:
    {
        "url":         original URL
        "slug":        normalized WP slug (last path segment, or "home" for /)
        "parent_slug": parent slug for hierarchical pages, or null
        "title":       <title> minus the site suffix
        "html":        cleaned content HTML (with media URLs rewritten to {{MEDIA:sha1.ext}})
        "media":       list of {"sha1": ..., "ext": ..., "original_url": ...}
        "fetched_at":  ISO timestamp
    }

The {{MEDIA:...}} placeholders are resolved by the importer once each media file
has been uploaded to WordPress and assigned its final URL.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

SOURCE_HOST = "www.skintyeefirstnation.org"
BASE_URL = f"https://{SOURCE_HOST}"
USER_AGENT = "skintyee-migrator/1.0 (+authorized site rebuild)"
REQUEST_DELAY_SEC = 1.0  # polite throttle between requests
REQUEST_TIMEOUT = 30

OUT_DIR = Path(__file__).resolve().parent.parent / "scraped"
RAW_DIR = OUT_DIR / "raw"
MEDIA_DIR = OUT_DIR / "media"
MANIFEST_PATH = OUT_DIR / "manifest.json"

# Content-area selectors for Site123 pages — different page types use different wrappers:
#   - standard pages (e.g. /our-history):     .s123-content-area.s123-modules-container
#   - sub-pages     (e.g. /announcements/...): .s123-content-area.s123-page-container
#   - homepage:                                 .s123-modules-container (no s123-content-area)
# Listed in priority order; first match wins.
CONTENT_SELECTORS = [
    "div.s123-content-area",
    "div.s123-modules-container",
]

# Strip these UI chrome elements from the extracted content.
STRIP_SELECTORS = [
    "script", "style", "noscript",
    ".s123-edit-mode-only",
    ".s123-share-buttons",
    ".s123-comments",
    "[data-s123-edit]",
]

# Background-image URLs hidden inside `style="background-image:url(...)"`.
BG_URL_RE = re.compile(r"background-image\s*:\s*url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", re.I)

# Treat these extensions as media we want to mirror locally.
MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf", ".mp4", ".mp3"}


def slugify_path(path: str) -> tuple[str, str | None]:
    """Return (slug, parent_slug) from a URL path."""
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
        return "home", None
    if len(parts) == 1:
        return parts[0], None
    return parts[-1], parts[-2]


def is_internal(url: str) -> bool:
    p = urlparse(url)
    return p.netloc in ("", SOURCE_HOST) and p.scheme in ("", "http", "https")


def normalize(url: str) -> str:
    p = urlparse(urljoin(BASE_URL, url))
    # strip fragments + querystrings (Site123 pages are not parameterized)
    return f"{p.scheme}://{p.netloc}{p.path.rstrip('/') or '/'}"


def hash_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def guess_ext(url: str, content_type: str | None) -> str:
    """Determine the on-disk extension for a media response.

    Content-Type wins over URL extension: Site123's CDN returns HTML error pages
    (with Content-Type: text/html) at URLs ending in .pdf when the asset is
    missing. Trusting the URL would save a 404 page as a "PDF" that WP then
    rejects as a MIME mismatch.
    """
    ct_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "application/pdf": ".pdf",
        "video/mp4": ".mp4",
        "audio/mpeg": ".mp3",
    }
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct in ct_map:
            return ct_map[ct]
        if ct.startswith("text/") or ct == "application/xhtml+xml":
            return ""  # error page masquerading as media
    path_ext = Path(urlparse(url).path).suffix.lower()
    if path_ext in MEDIA_EXTS:
        return path_ext
    return ""


class Crawler:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.seen_pages: set[str] = set()
        self.seen_media: dict[str, dict] = {}  # original_url -> {sha1, ext}
        self.records: list[dict] = []

    def fetch(self, url: str) -> requests.Response:
        time.sleep(REQUEST_DELAY_SEC)
        r = self.session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        r.raise_for_status()
        return r

    def download_media(self, url: str) -> str | None:
        """Download a media URL; return the {{MEDIA:...}} placeholder or None on failure."""
        if url in self.seen_media:
            entry = self.seen_media[url]
            return f"{{{{MEDIA:{entry['sha1']}{entry['ext']}}}}}"
        try:
            r = self.fetch(url)
        except Exception as e:
            print(f"  [media-fail] {url}: {e}", file=sys.stderr)
            return None
        ext = guess_ext(url, r.headers.get("content-type"))
        if not ext:
            print(f"  [media-skip] {url}: unknown ext", file=sys.stderr)
            return None
        sha1 = hashlib.sha1(r.content).hexdigest()
        target = MEDIA_DIR / f"{sha1}{ext}"
        if not target.exists():
            target.write_bytes(r.content)
        entry = {"sha1": sha1, "ext": ext, "original_url": url}
        self.seen_media[url] = entry
        return f"{{{{MEDIA:{sha1}{ext}}}}}"

    def extract(self, url: str, html: str) -> dict | None:
        soup = BeautifulSoup(html, "lxml")

        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""
        # Site123 titles look like "Page - Site Name - tagline..."; keep the first segment.
        title = title.split(" - ")[0].strip() or url

        content = None
        for sel in CONTENT_SELECTORS:
            content = soup.select_one(sel)
            if content:
                break
        if not content:
            print(f"  [no-content] {url}", file=sys.stderr)
            return None

        for sel in STRIP_SELECTORS:
            for el in content.select(sel):
                el.decompose()

        # Site123 puts hero/section images as inline background-image styles on
        # empty <div>s. Without Site123's CSS those divs are 0px tall, so the
        # image never renders. Promote each to a real <img>.
        for el in content.find_all(True):
            if not isinstance(el, Tag) or not el.get("style"):
                continue
            m = BG_URL_RE.search(el["style"])
            if not m:
                continue
            img = soup.new_tag("img", src=m.group(1))
            img["loading"] = "lazy"
            el.insert(0, img)

        # Rewrite media references inside the content block.
        page_media: list[dict] = []
        for tag in content.find_all(["img", "a", "source", "video", "audio"]):
            for attr in ("src", "href", "data-src", "data-original", "srcset"):
                if not isinstance(tag, Tag) or attr not in tag.attrs:
                    continue
                val = tag.attrs[attr]
                if attr == "srcset":
                    # srcset is "url 1x, url 2x" — rewrite the first url only, drop the rest
                    first = val.split(",")[0].strip().split(" ")[0]
                    placeholder = self.maybe_mirror(first, page_media)
                    if placeholder:
                        tag.attrs[attr] = placeholder
                    continue
                placeholder = self.maybe_mirror(val, page_media)
                if placeholder:
                    tag.attrs[attr] = placeholder

        # Strip Site123-specific class names + all data-* attrs + inline styles +
        # HTML comments, then drop empty layout divs. This is a markup tidy pass;
        # text content and real links/images survive.
        for el in content.find_all(True):
            if not isinstance(el, Tag):
                continue
            classes = [c for c in el.get("class", []) if not c.startswith(("s123-", "m-h-", "hpm-", "aos-"))
                       and c not in {"container-fluid", "headers-text-orders", "headers-container",
                                     "headers-text-wrap", "headers-text-resize-container",
                                     "headers-img-wrap", "headers-carousel-deactivated",
                                     "carousel-inner", "headers-item", "headers-image",
                                     "headers-text-separator", "header-spacer", "item active",
                                     "one-item", "carousel", "slide", "carousel-fade",
                                     "header-modules-header-font", "custom-font-settings",
                                     "weight700"}]
            if classes:
                el["class"] = classes
            else:
                el.attrs.pop("class", None)
            for k in list(el.attrs):
                if k.startswith("data-") or k in {"style", "id"}:
                    del el.attrs[k]
        # Drop HTML comments
        from bs4 import Comment
        for c in content.find_all(string=lambda s: isinstance(s, Comment)):
            c.extract()
        # Collapse divs/sections that have no text and no descendant img/a/video.
        for el in list(content.find_all(["div", "section", "span"])):
            if not isinstance(el, Tag):
                continue
            if el.find(["img", "a", "video", "audio", "iframe"]):
                continue
            if el.get_text(strip=True):
                continue
            el.decompose()

        # Rewrite internal page links to relative WP slugs.
        for a in content.find_all("a", href=True):
            href = a["href"]
            abs_href = urljoin(url, href)
            if is_internal(abs_href) and not any(
                abs_href.lower().endswith(ext) for ext in MEDIA_EXTS
            ):
                p = urlparse(abs_href).path or "/"
                a["href"] = p  # keep as path; WP will resolve to the matching post slug

        path = urlparse(url).path or "/"
        slug, parent_slug = slugify_path(path)

        return {
            "url": url,
            "slug": slug,
            "parent_slug": parent_slug,
            "title": title,
            "html": str(content),
            "media": page_media,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    def maybe_mirror(self, raw: str, page_media: list[dict]) -> str | None:
        if not raw or raw.startswith(("data:", "mailto:", "tel:", "#", "javascript:")):
            return None
        abs_url = urljoin(BASE_URL, raw)
        # only mirror things that look like media
        ext = Path(urlparse(abs_url).path).suffix.lower()
        if ext not in MEDIA_EXTS and not any(
            host in abs_url for host in ("files.cdn-files-a.com", "images.cdn-files-a.com")
        ):
            return None
        placeholder = self.download_media(abs_url)
        if placeholder:
            entry = self.seen_media[abs_url]
            page_media.append(entry)
        return placeholder

    def discover_links(self, html: str, base: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        urls: set[str] = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            abs_url = urljoin(base, href)
            if not is_internal(abs_url):
                continue
            if any(abs_url.lower().endswith(ext) for ext in MEDIA_EXTS):
                continue
            urls.add(normalize(abs_url))
        return sorted(urls)

    def run(self) -> None:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)

        queue: deque[str] = deque([normalize(BASE_URL + "/")])
        while queue:
            url = queue.popleft()
            if url in self.seen_pages:
                continue
            self.seen_pages.add(url)
            print(f"[fetch] {url}")
            try:
                r = self.fetch(url)
            except Exception as e:
                print(f"  [page-fail] {url}: {e}", file=sys.stderr)
                continue
            slug, _ = slugify_path(urlparse(url).path)
            (RAW_DIR / f"{hash_url(url)}_{slug}.html").write_text(r.text, encoding="utf-8")
            record = self.extract(url, r.text)
            if record:
                self.records.append(record)
                print(f"  -> {record['title']!r} ({len(record['media'])} media)")
            for link in self.discover_links(r.text, url):
                if link not in self.seen_pages:
                    queue.append(link)

        MANIFEST_PATH.write_text(
            json.dumps(
                {
                    "source": BASE_URL,
                    "crawled_at": datetime.now(timezone.utc).isoformat(),
                    "pages": self.records,
                    "media": list(self.seen_media.values()),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nDone. {len(self.records)} pages, {len(self.seen_media)} media files.")
        print(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    Crawler().run()
