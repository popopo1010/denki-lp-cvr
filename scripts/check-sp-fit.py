"""SP 1画面収まりチェッカー

各LPを SP viewport で開き、#step-first（FV）と #step01（資格選択）の
実測高さを取得して、viewport に収まるかを表で出す。

使い方:
  source .venv-pw/bin/activate
  python scripts/check-sp-fit.py
"""

import asyncio
import http.server
import socketserver
import threading
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8917

LPS = [
    "index.html",
    "sekoukanri/index.html",
    "denkikouji/index.html",
    "sekoukanri-denkisekou/index.html",
    "sekoukanri-doboku/index.html",
    "sekoukanri-kentiku/index.html",
    "nenshu-shindan/sekoukanri/index.html",
    "nenshu-shindan/denkikouji/index.html",
    "nenshu-shindan/sekoukanri-denkisekou/index.html",
    "nenshu-shindan/sekoukanri-doboku/index.html",
    "nenshu-shindan/sekoukanri-kentiku/index.html",
    "meta-lp/sekoukanri-doboku/index.html",
    "meta-lp/sekoukanri-kentiku/index.html",
    "meta-lp/sekoukanri-denkisekou/index.html",
    "meta-lp/denkikouji/index.html",
    "meta-lp/nenshu-shindan-doboku/index.html",
    "meta-lp/nenshu-shindan-kentiku/index.html",
    "meta-lp/nenshu-shindan-denkisekou/index.html",
]

VIEWPORTS = [
    ("iPhone SE 375x667", 375, 667),
    ("iPhone 14 390x844", 390, 844),
]


def start_server():
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=str(ROOT), **kw
    )
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    httpd.allow_reuse_address = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


async def measure(browser, path, label, w, h):
    ctx = await browser.new_context(
        viewport={"width": w, "height": h},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    )
    page = await ctx.new_page()
    url = f"http://127.0.0.1:{PORT}/{path}"
    try:
        await page.goto(url, wait_until="networkidle", timeout=15000)
    except Exception as e:
        await ctx.close()
        return {"path": path, "viewport": label, "error": str(e)[:80]}

    # FV(#step-first) の実測高さ
    fv_h = await page.evaluate(
        """() => {
          const el = document.querySelector('#step-first');
          if (!el) return null;
          return Math.round(el.getBoundingClientRect().height);
        }"""
    )

    # FV CTA をクリックして、本物の遷移ロジック（handleStepClick + showPage）を走らせる。
    # これで trust-bar/social-proof/live-notification が .is-hidden になる。
    clicked = await page.evaluate(
        """() => {
          const btn = document.querySelector('#step-first .js-submit-button.js-next-button.js-step-button')
                    || document.querySelector('#step-first .js-next-button')
                    || document.querySelector('#step-first .c-nextLinkButton');
          if (!btn) return false;
          btn.click();
          return true;
        }"""
    )
    # CSS transition 完了待ち
    await page.wait_for_timeout(600)

    s01 = await page.evaluate(
        """() => {
          const el = document.querySelector('#step01');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const buttons = el.querySelectorAll('.p-step01__button').length;
          const cta = el.querySelector('.c-next-button, .c-nextLinkButton');
          const ctaBottom = cta ? Math.round(cta.getBoundingClientRect().bottom) : null;
          const docScroll = document.documentElement.scrollHeight;
          return {
            top: Math.round(r.top),
            height: Math.round(r.height),
            scrollHeight: el.scrollHeight,
            buttons,
            ctaBottom,
            docScroll,
          };
        }"""
    )

    await ctx.close()
    return {
        "path": path,
        "viewport": label,
        "vp_h": h,
        "fv_h": fv_h,
        "s01_top": s01 and s01.get("top"),
        "s01_h": s01 and s01.get("height"),
        "s01_scroll": s01 and s01.get("scrollHeight"),
        "buttons": s01 and s01.get("buttons"),
        "doc_scroll": s01 and s01.get("docScroll"),
        "cta_bottom": s01 and s01.get("ctaBottom"),
    }


def fmt_row(r):
    if "error" in r:
        return f"  ! ERROR: {r['error']}"
    vp_h = r["vp_h"]
    fv_h = r["fv_h"]
    s01_h = r["s01_h"]
    cta_b = r["cta_bottom"]
    fv_fit = "OK" if fv_h and fv_h <= vp_h else ("--" if fv_h is None else "OVER")
    cta_fit = "OK" if cta_b and cta_b <= vp_h else ("--" if cta_b is None else "OVER")
    return (
        f"  FV(#step-first): {fv_h}px / vp {vp_h}px [{fv_fit}]\n"
        f"  step01: top={r.get('s01_top')}px h={s01_h}px (scroll {r['s01_scroll']}px, btns {r['buttons']}, CTA下端 {cta_b}px) [{cta_fit}] | doc {r.get('doc_scroll')}px"
    )


async def main():
    httpd = start_server()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            for path in LPS:
                print(f"\n=== {path} ===")
                for label, w, h in VIEWPORTS:
                    r = await measure(browser, path, label, w, h)
                    print(f"[{label}]")
                    print(fmt_row(r))
            await browser.close()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
