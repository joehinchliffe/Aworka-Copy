#!/usr/bin/env python3
"""
GET-only crawler for a logged-in aworka.app account.

Reads AWORKA_EMAIL / AWORKA_PASSWORD from the environment (never from argv or files),
logs in through the normal form, then breadth-first walks every same-origin link it
can find. It never submits any form other than the login form and never follows links
whose path or attributes look like actions (delete, send, pay, sync, ...).

Outputs (default research/aworka/):
  html/<slug>.html   raw page HTML
  pages.json         index: url, status, title, headings, nav links, forms + fields
  assets/            linked stylesheets / scripts (fetched once each)
"""
import json, os, re, sys, time, hashlib
from collections import deque
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

BASE = os.environ.get("AWORKA_BASE", "https://aworka.app")
OUT = sys.argv[1] if len(sys.argv) > 1 else "research/aworka"
MAX_PAGES = int(os.environ.get("AWORKA_MAX_PAGES", "600"))
DELAY = float(os.environ.get("AWORKA_DELAY", "0.4"))

EMAIL = os.environ.get("AWORKA_EMAIL")
PASSWORD = os.environ.get("AWORKA_PASSWORD")
if not EMAIL or not PASSWORD:
    sys.exit("Set AWORKA_EMAIL and AWORKA_PASSWORD in the environment first.")

# Path segments that imply a state change even over GET, or that we must not touch.
DENY = re.compile(
    r"(^|/)(logout|sign_out|user_session|destroy|delete|remove|hide|send|email|sms|text|pay|"
    r"mark|approve|reset|anonymi[sz]e|purge|cancel|suspend|close|archive|confirm|link|unlink|"
    r"connect|disconnect|authori[sz]e|oauth|backup|export|import|sync|generate|submit|bulk|"
    r"resend|duplicate|copy|convert|move|shift|optimi[sz]e|auto_book|run|new_mobile|mobile|"
    r"download|upload|clear|refresh|toggle|alias|hmrc|gocardless|paypal|quickbooks|"
    r"password|unsubscribe|questions)(/|$|\?|\.)", re.I)

S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (research crawler; GET-only)"

def slugify(url):
    p = urlparse(url)
    path = (p.path.strip("/") or "root").replace("/", "__")
    if p.query:
        path += "__" + hashlib.sha1(p.query.encode()).hexdigest()[:8]
    return re.sub(r"[^A-Za-z0-9_.-]", "_", path)[:150]

def login():
    r = S.get(f"{BASE}/login", timeout=30)
    soup = BeautifulSoup(r.text, "html.parser")
    tok = soup.find("input", {"name": "authenticity_token"})["value"]
    r = S.post(f"{BASE}/user_session", data={
        "authenticity_token": tok,
        "password_reset_mode": "false",
        "user_session[email]": EMAIL,
        "user_session[password]": PASSWORD,
        "user_session[remember_me]": "0",
        "commit": "Log In",
    }, timeout=30, allow_redirects=True)
    if "user_session[password]" in r.text and "Log In" in r.text and "logout" not in r.text.lower():
        sys.exit("Login appears to have failed (login form still shown).")
    print("Logged in; landed on", r.url)
    return r.url

def describe_form(form, page_url):
    fields = []
    for el in form.find_all(["input", "select", "textarea"]):
        name = el.get("name")
        if not name:
            continue
        f = {"name": name, "type": el.get("type") or el.name, "id": el.get("id")}
        if el.get("value") and f["type"] not in ("password",) and name != "authenticity_token":
            f["value"] = el.get("value")[:200]
        lab = None
        if el.get("id"):
            l = form.find("label", {"for": el["id"]})
            if l: lab = l.get_text(" ", strip=True)
        if lab: f["label"] = lab
        if el.name == "select":
            f["options"] = [(o.get("value"), o.get_text(strip=True)) for o in el.find_all("option")][:200]
        if el.get("placeholder"): f["placeholder"] = el["placeholder"]
        fields.append(f)
    return {"action": urljoin(page_url, form.get("action") or ""), "method": (form.get("method") or "get").lower(),
            "id": form.get("id"), "class": form.get("class"), "fields": fields}

def main():
    os.makedirs(f"{OUT}/html", exist_ok=True)
    os.makedirs(f"{OUT}/assets", exist_ok=True)
    start = login()
    origin = urlparse(BASE).netloc
    seen, queue, pages, assets = set(), deque([start, f"{BASE}/"]), [], set()
    while queue and len(pages) < MAX_PAGES:
        url, _ = urldefrag(queue.popleft())
        if url in seen: continue
        seen.add(url)
        p = urlparse(url)
        if p.netloc != origin or DENY.search(p.path) or DENY.search(p.query):
            continue
        try:
            r = S.get(url, timeout=30)
        except Exception as e:
            pages.append({"url": url, "error": str(e)}); continue
        time.sleep(DELAY)
        ctype = r.headers.get("content-type", "")
        rec = {"url": url, "final_url": r.url, "status": r.status_code, "content_type": ctype}
        if "text/html" not in ctype:
            pages.append(rec); continue
        soup = BeautifulSoup(r.text, "html.parser")
        slug = slugify(r.url)
        with open(f"{OUT}/html/{slug}.html", "w", encoding="utf-8") as fh:
            fh.write(r.text)
        rec.update({
            "file": f"html/{slug}.html",
            "title": (soup.title.get_text(strip=True) if soup.title else None),
            "body_id": (soup.body.get("id") if soup.body else None),
            "headings": [h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2", "h3"])][:60],
            "forms": [describe_form(f, r.url) for f in soup.find_all("form")],
            "links": [],
        })
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith(("mailto:", "tel:", "javascript:", "#")): continue
            if a.get("data-method") and a["data-method"].lower() != "get": continue
            if a.get("data-confirm") or a.get("data-remote"): continue
            full, _ = urldefrag(urljoin(r.url, href))
            rec["links"].append({"text": a.get_text(" ", strip=True)[:80], "href": full})
            if urlparse(full).netloc == origin and full not in seen:
                queue.append(full)
        for tag, attr in (("link", "href"), ("script", "src")):
            for el in soup.find_all(tag, **{attr: True}):
                u = urljoin(r.url, el[attr])
                if urlparse(u).netloc == origin and u not in assets and re.search(r"\.(css|js)(\?|$)", u):
                    assets.add(u)
                    try:
                        ar = S.get(u, timeout=30)
                        with open(f"{OUT}/assets/{slugify(u)}", "wb") as fh: fh.write(ar.content)
                    except Exception: pass
        pages.append(rec)
        print(f"[{len(pages)}] {r.status_code} {r.url} ({len(rec['forms'])} forms, {len(rec['links'])} links)")
    with open(f"{OUT}/pages.json", "w", encoding="utf-8") as fh:
        json.dump({"base": BASE, "pages": pages, "assets": sorted(assets)}, fh, indent=1)
    print(f"Done: {len(pages)} pages, {len(assets)} assets -> {OUT}/pages.json")

if __name__ == "__main__":
    main()
