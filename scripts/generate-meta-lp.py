#!/usr/bin/env python3
"""Generate Meta ad short LPs (real form, noindex) from existing specialty / nenshu pages."""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BASE_URL = "https://denkilp.builders-job.com/denki-lp-cvr"

STEP_FIRST_END = re.compile(
    r'<div class="p-first js-page-body js-form-group" id="step-first">.*?</div>\s*\n\n<div class="p-step01 js-page-body',
    re.DOTALL,
)

SOURCES = [
    {
        "src": "sekoukanri-kentiku/index.html",
        "dest": "meta-lp/sekoukanri-kentiku/index.html",
        "lp_id": "sekoukanri-kentiku-meta",
        "canonical": f"{BASE_URL}/sekoukanri-kentiku/",
        "eyebrow": "建築施工管理専門｜1級・2級",
        "title": "あなたの資格に合う<br><strong>高待遇求人</strong>を無料紹介",
        "cta_primary": "無料で求人をチェック",
        "cta_secondary": "まず情報だけ見る",
        "replace_fv": True,
    },
    {
        "src": "sekoukanri-doboku/index.html",
        "dest": "meta-lp/sekoukanri-doboku/index.html",
        "lp_id": "sekoukanri-doboku-meta",
        "canonical": f"{BASE_URL}/sekoukanri-doboku/",
        "eyebrow": "土木施工管理専門｜1級・2級",
        "title": "土木・インフラの<br><strong>好条件求人</strong>を無料紹介",
        "cta_primary": "無料で求人をチェック",
        "cta_secondary": "まず情報だけ見る",
        "replace_fv": True,
    },
    {
        "src": "sekoukanri-denkisekou/index.html",
        "dest": "meta-lp/sekoukanri-denkisekou/index.html",
        "lp_id": "sekoukanri-denkisekou-meta",
        "canonical": f"{BASE_URL}/sekoukanri-denkisekou/",
        "eyebrow": "電気工事施工管理専門",
        "title": "設備・電気施工の<br><strong>高待遇求人</strong>を無料紹介",
        "cta_primary": "無料で求人をチェック",
        "cta_secondary": "まず情報だけ見る",
        "replace_fv": True,
    },
    {
        "src": "denkikouji/index.html",
        "dest": "meta-lp/denkikouji/index.html",
        "lp_id": "denkikouji-meta",
        "canonical": f"{BASE_URL}/denkikouji/",
        "eyebrow": "電気工事士専門",
        "title": "第一種・第二種に合う<br><strong>オススメ求人</strong>を無料紹介",
        "cta_primary": "無料で求人をチェック",
        "cta_secondary": "まず情報だけ見る",
        "replace_fv": True,
    },
    {
        "src": "nenshu-shindan/sekoukanri-kentiku/index.html",
        "dest": "meta-lp/nenshu-shindan-kentiku/index.html",
        "lp_id": "nenshu-shindan-kentiku-meta",
        "canonical": f"{BASE_URL}/nenshu-shindan/sekoukanri-kentiku/",
        "replace_fv": False,
        "nenshu": True,
    },
    {
        "src": "nenshu-shindan/sekoukanri-doboku/index.html",
        "dest": "meta-lp/nenshu-shindan-doboku/index.html",
        "lp_id": "nenshu-shindan-doboku-meta",
        "canonical": f"{BASE_URL}/nenshu-shindan/sekoukanri-doboku/",
        "replace_fv": False,
        "nenshu": True,
    },
    {
        "src": "nenshu-shindan/sekoukanri-denkisekou/index.html",
        "dest": "meta-lp/nenshu-shindan-denkisekou/index.html",
        "lp_id": "nenshu-shindan-denkisekou-meta",
        "canonical": f"{BASE_URL}/nenshu-shindan/sekoukanri-denkisekou/",
        "replace_fv": False,
        "nenshu": True,
    },
]


def meta_fv_block(cfg: dict) -> str:
    return f"""<div class="p-first js-page-body js-form-group meta-fv" id="step-first">
    <p class="meta-fv__eyebrow">{cfg["eyebrow"]}</p>
    <h2 class="meta-fv__title">{cfg["title"]}</h2>
    <p class="meta-fv__sub">30秒・転職しなくても無料・営業電話なし</p>
    <div class="meta-fv__actions">
        <button type="button" class="meta-fv__cta js-radio-button" data-value="近いうちに転職したい" data-group="your-willingness">{cfg["cta_primary"]}</button>
        <button type="button" class="meta-fv__cta meta-fv__cta--ghost js-radio-button" data-value="今は情報収集したい" data-group="your-willingness">{cfg["cta_secondary"]}</button>
    </div>
    <p class="meta-fv__trust">厚生労働大臣許可 13-ユ-316946</p>
    <div class="c-nextLink" style="display:none">
        <button type="button" class="c-nextLinkButton c-nextLinkButton--submit js-submit-button js-next-button js-step-button" data-page-to="step01">
            <span>次へ</span>
        </button>
    </div>
</div>

<div class="p-step01 js-page-body"""


def bump_relative_paths(html: str, nenshu: bool) -> str:
    if nenshu:
        return html.replace(
            'href="../nenshu-shindan.css',
            'href="../../nenshu-shindan/nenshu-shindan.css',
        )
    return html.replace('href="../', 'href="../../').replace('src="../', 'src="../../')


def apply_meta_transforms(html: str, cfg: dict) -> str:
    dest_slug = Path(cfg["dest"]).parent.name
    meta_url = f"{BASE_URL}/meta-lp/{dest_slug}/"
    nenshu = cfg.get("nenshu", False)

    html = bump_relative_paths(html, nenshu)

    if cfg.get("replace_fv"):
        new_html, n = STEP_FIRST_END.subn(meta_fv_block(cfg), html, count=1)
        if n != 1:
            raise ValueError(f"step-first replace failed for {cfg['src']}")
        html = new_html

    html = re.sub(
        r'window\.__LP_ID="[^"]*"',
        f'window.__LP_ID="{cfg["lp_id"]}"',
        html,
        count=1,
    )

    if "meta-short-lp" not in html.split("<body", 1)[-1][:120]:
        html = re.sub(
            r"<body class=\"",
            '<body class="meta-short-lp ',
            html,
            count=1,
        )

    if "meta-short-lp.css" not in html:
        html = re.sub(
            r'(<link rel="stylesheet" href="[^"]*cvr-boost\.css[^"]*">)',
            r'\1\n    <link rel="stylesheet" href="../../assets/css/meta-short-lp.css?v1">',
            html,
            count=1,
        )

    html = re.sub(
        r"<meta name='robots' content='[^']*' */>",
        "<meta name='robots' content='noindex,nofollow' />",
        html,
        count=1,
    )

    html = re.sub(
        r'<link rel="canonical" href="[^"]*" */>',
        f'<link rel="canonical" href="{cfg["canonical"]}" />',
        html,
        count=1,
    )

    if re.search(r'<meta property="og:url"', html):
        html = re.sub(
            r'<meta property="og:url" content="[^"]*">',
            f'<meta property="og:url" content="{meta_url}">',
            html,
            count=1,
        )
    else:
        html = html.replace(
            '<meta property="og:type"',
            f'<meta property="og:url" content="{meta_url}">\n    <meta property="og:type"',
            1,
        )

    html = re.sub(
        r"<title>(?!\[Meta\] )",
        "<title>[Meta] ",
        html,
        count=1,
    )

    if nenshu:
        html = html.replace(
            'class="p-first js-page-body js-form-group" id="step-first"',
            'class="p-first js-page-body js-form-group meta-fv" id="step-first"',
            1,
        )

    return html


def main() -> None:
    for cfg in SOURCES:
        src = REPO / cfg["src"]
        dest = REPO / cfg["dest"]
        if not src.exists():
            raise FileNotFoundError(src)
        html = apply_meta_transforms(src.read_text(encoding="utf-8"), cfg)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html, encoding="utf-8")
        print("wrote", cfg["dest"])


if __name__ == "__main__":
    main()
