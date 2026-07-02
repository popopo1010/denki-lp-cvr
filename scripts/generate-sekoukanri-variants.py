#!/usr/bin/env python3
"""Generate 建築 / 土木 / 電気施工管理 split LPs from sekoukanri template."""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
IMG_BASE = "https://denkilp.builders-job.com/wp-content/themes/original-thema/assets/img"
BASE_URL = "https://denkilp.builders-job.com/denki-lp-cvr"

QUAL_IMG = {
    "1級建築施工管理技士": "kentiku",
    "2級建築施工管理技士": "kentiku",
    "1級土木施工管理技士": "doboku",
    "2級土木施工管理技士": "doboku",
    "1級電気施工管理技士": "denkisekou",
    "2級電気施工管理技士": "denkisekou",
    "第一種電気工事士": "denkikouji",
    "第二種電気工事士": "denkikouji",
    "1級管工事施工管理技士": "kankou",
    "2級管工事施工管理技士": "kankou",
    "その他の資格": "other",
}

ELECTRICIAN = ["第一種電気工事士", "第二種電気工事士"]
OTHER = ["その他の資格"]

VARIANTS = [
    {
        "slug": "sekoukanri-kentiku",
        "lp_id": "sekoukanri-kentiku",
        "label": "建築施工管理",
        "title": "建築施工管理技士の求人・転職｜1級・2級専門｜施工管理キャリア",
        "description": "建築施工管理技士（1級・2級）の求人を専門紹介。電気工事士資格をお持ちの方も登録可。完全無料。",
        "og_desc": "建築施工管理1級・2級の求人を専門紹介。ハローワーク非掲載のレア求人も。",
        "header": "建築施工管理技士の求人募集・転職サイト | 施工管理キャリア",
        "banner_alt": "建築施工管理専門,あなたの資格から建築現場のオススメ求人を無料で紹介",
        "step01_title": "お持ちの建築施工管理の資格は？",
        "step01_reason": "建築1級・2級に合った求人をご紹介します（電気工事士のみの方も選択可）",
        "step01_reward": "次に届く求人：<strong>建築施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
        "quals": ["1級建築施工管理技士", "2級建築施工管理技士", *ELECTRICIAN, *OTHER],
        "testimonials_title": "建築施工管理の利用者の声",
        "testimonials_lead": "1級・2級ごとに、建築現場向けの求人をご案内しています",
        "testimonials": [
            ("T.Y", "T.Yさん（38歳）", "1級建築施工管理技士", "建築施工管理に特化しているので、<strong>1級として年収100万円アップ</strong>。ゼネコンからの転職でもキャリアを正当に評価してくれる企業に出会えました。"),
            ("K.T", "K.Tさん（29歳）", "2級建築施工管理技士", "2級でも建築現場の経験を評価してもらい、<strong>年収80万円アップ</strong>で転職。同じ2級でも会社選びで待遇が変わると実感しました。"),
            ("S.M", "S.Mさん（32歳）", "第一種電気工事士", "建築現場で電気工事士として働きながら施工管理も担っていました。<strong>両方の資格を評価</strong>してくれる企業を紹介してもらえました。"),
        ],
        "fv_note": "建築施工管理専門｜転職しなくても無料で相談OK",
    },
    {
        "slug": "sekoukanri-doboku",
        "lp_id": "sekoukanri-doboku",
        "label": "土木施工管理",
        "title": "土木施工管理技士の求人・転職｜1級・2級専門｜施工管理キャリア",
        "description": "土木施工管理技士（1級・2級）の求人を専門紹介。電気工事士資格をお持ちの方も登録可。完全無料。",
        "og_desc": "土木施工管理1級・2級の求人を専門紹介。インフラ・土木系の好条件求人も。",
        "header": "土木施工管理技士の求人募集・転職サイト | 施工管理キャリア",
        "banner_alt": "土木施工管理専門,あなたの資格から土木・インフラのオススメ求人を無料で紹介",
        "step01_title": "お持ちの土木施工管理の資格は？",
        "step01_reason": "土木1級・2級に合った求人をご紹介します（電気工事士のみの方も選択可）",
        "step01_reward": "次に届く求人：<strong>土木施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
        "quals": ["1級土木施工管理技士", "2級土木施工管理技士", *ELECTRICIAN, *OTHER],
        "testimonials_title": "土木施工管理の利用者の声",
        "testimonials_lead": "1級・2級ごとに、土木・インフラ向けの求人をご案内しています",
        "testimonials": [
            ("H.S", "H.Sさん（42歳）", "1級土木施工管理技士", "土木施工管理に強く、<strong>同じ1級でも年収200万円以上差</strong>があると知れました。インフラ系の好条件企業を紹介してもらえました。"),
            ("M.K", "M.Kさん（31歳）", "2級土木施工管理技士", "2級土木でも経験を活かせる求人が豊富で、<strong>残業が少なく年収も上がる</strong>企業に転職できました。"),
            ("S.M", "S.Mさん（32歳）", "第一種電気工事士", "土木現場の電気設備工事から施工管理へ。<strong>電気工事士＋土木施工管理</strong>の経験を評価してくれる求人に出会えました。"),
        ],
        "fv_note": "土木施工管理専門｜転職しなくても無料で相談OK",
    },
    {
        "slug": "sekoukanri-denkisekou",
        "lp_id": "sekoukanri-denkisekou",
        "label": "電気施工管理",
        "title": "電気施工管理技士の求人・転職｜1級・2級専門｜施工管理キャリア",
        "description": "電気施工管理技士（1級・2級）の求人を専門紹介。電気工事士・管工事施工管理も選択可。完全無料。",
        "og_desc": "電気施工管理1級・2級の求人を専門紹介。設備・電気施工管理の非公開求人も。",
        "header": "電気施工管理技士の求人募集・転職サイト | 施工管理キャリア",
        "banner_alt": "電気施工管理専門,あなたの資格から設備・電気施工のオススメ求人を無料で紹介",
        "step01_title": "お持ちの電気施工管理・関連資格は？",
        "step01_reason": "電気施工管理1級・2級に合った求人をご紹介します（電気工事士のみの方も選択可）",
        "step01_reward": "次に届く求人：<strong>電気施工管理の1級・2級</strong>に特化したマッチリスト（あと3ステップ）",
        "quals": [
            "1級電気施工管理技士",
            "2級電気施工管理技士",
            *ELECTRICIAN,
            "1級管工事施工管理技士",
            "2級管工事施工管理技士",
            *OTHER,
        ],
        "testimonials_title": "電気施工管理の利用者の声",
        "testimonials_lead": "1級・2級ごとに、設備・電気施工管理向けの求人をご案内しています",
        "testimonials": [
            ("S.N", "S.Nさん（36歳）", "1級電気施工管理技士", "電気施工管理に特化しているので、<strong>1級の監理経験を評価</strong>してくれる企業に出会え、年収120万円アップしました。"),
            ("Y.M", "Y.Mさん（33歳）", "2級電気施工管理技士", "2級電気施工管理でも、設備系の<strong>非公開求人を多数紹介</strong>してもらい、ワークライフバランスと年収を両立できました。"),
            ("S.M", "S.Mさん（28歳）", "第二種電気工事士", "電気工事士から施工管理へステップアップ。<strong>第二種＋2級施工管理</strong>のキャリアで年収アップできました。"),
        ],
        "fv_note": "電気施工管理専門｜転職しなくても無料で相談OK",
    },
]

NENSHU_SALARY = {
    "kentiku": [
        ("1級建築施工管理技士", "550万〜850万円", "680"),
        ("2級建築施工管理技士", "400万〜650万円", "520"),
    ],
    "doboku": [
        ("1級土木施工管理技士", "500万〜800万円", "640"),
        ("2級土木施工管理技士", "380万〜620万円", "500"),
    ],
    "denkisekou": [
        ("1級電気施工管理技士", "520万〜820万円", "660"),
        ("2級電気施工管理技士", "400万〜680万円", "540"),
    ],
}


def enrich_nenshu(v: dict) -> dict:
    key = v["slug"].replace("sekoukanri-", "")
    cards = []
    for header, rng, avg in NENSHU_SALARY[key]:
        cards.append(
            f"""        <div class="ns-salary-data__card">
            <div class="ns-salary-data__card-header">{header}</div>
            <div class="ns-salary-data__card-salary">
                <span class="ns-salary-data__card-range">{rng}</span>
                <span class="ns-salary-data__card-avg">平均 <strong>{avg}万円</strong></span>
            </div>
        </div>"""
        )
    v = dict(v)
    v["nenshu_lp_id"] = f"nenshu-shindan-{key}"
    v["path_slug"] = f"nenshu-shindan/sekoukanri-{key}"
    v["ns_header"] = f"{v['label']}の年収診断"
    v["ns_sub"] = f"{v['label']}1級・2級の適正年収を30秒で無料チェック。転職しなくてもOK。"
    v["ns_fv_title"] = f"その年収、相場より安いかも。<br>{v['label']}専門の年収診断"
    v["salary_card"] = "    <div class=\"ns-salary-data__cards\">\n" + "\n".join(cards) + "\n    </div>"
    v["step01_reason"] = f"{v['label']}1級・2級の年収相場診断のため（電気工事士のみの方も選択可）"
    v["step01_reward"] = f"診断結果：<strong>{v['label']}の1級・2級</strong>の年収相場を表示（あと3ステップ）"
    return v


LOCAL_ICONS = {"kentiku", "doboku", "kankou"}


def qual_display_label(value: str) -> str:
    for prefix in ("第一種", "第二種", "1級", "2級"):
        if value.startswith(prefix) and not value.startswith(prefix + " "):
            return prefix + " " + value[len(prefix):]
    return value


def qual_button(value: str) -> str:
    img = QUAL_IMG[value]
    if img in LOCAL_ICONS:
        icon_html = (
            f'<span class="c-button__img"><img loading="lazy" decoding="async" '
            f'src="../assets/icons/{img}.svg" alt="" width="48" height="48"></span>'
        )
    else:
        icon_html = (
            f'<span class="c-button__img"><picture><source srcset="{IMG_BASE}/{img}.webp" type="image/webp">'
            f'<img loading="lazy" decoding="async" src="{IMG_BASE}/{img}.png" alt=""></picture></span>'
        )
    return (
        f'        <button type="button" class="p-step01__button c-button c-check-button js-checkbox-button" '
        f'data-value="{value}" data-group="license01" data-license-icon="{img}">\n'
        f"            {icon_html}\n"
        f'            <span class="c-button__text">{qual_display_label(value)}</span>\n'
        f"        </button>"
    )


def build_step01(v: dict, *, nenshu: bool = False) -> str:
    preview = ""
    if nenshu:
        preview = (
            '<div class="ns-salary-preview" id="ns-salary-preview" hidden aria-live="polite">\n'
            '    <p class="ns-salary-preview__label" id="ns-salary-preview-label">選択中の資格の年収相場</p>\n'
            '    <p class="ns-salary-preview__range" id="ns-salary-preview-range"></p>\n'
            '    <p class="ns-salary-preview__avg" id="ns-salary-preview-avg"></p>\n'
            "</div>\n"
        )
    buttons = "\n".join(qual_button(q) for q in v["quals"])
    return (
        f'    <p class="c-title01">\n        <span class="js-icon-target">{v["step01_title"]}</span>\n    </p>\n'
        f'<p class="cvr-step-reason">{v["step01_reason"]}</p>\n'
        f'<p class="cvr-step-reward">{v["step01_reward"]}</p>\n'
        f"{preview}"
        f'    <div class="p-step01__buttonArea c-button-grid">\n{buttons}\n    </div>'
    ).replace("<div ", "<div ")


def build_testimonials(v: dict) -> str:
    lines = [
        '<div class="cvr-testimonials">',
        f'    <h3 class="cvr-testimonials__title">{v["testimonials_title"]}</h3>',
        f'    <p class="cvr-testimonials__lead">{v["testimonials_lead"]}</p>',
    ]
    for avatar, name, role, text in v["testimonials"]:
        lines.extend(
            [
                '    <div class="cvr-testimonial">',
                '        <div class="cvr-testimonial__header">',
                f'            <div class="cvr-testimonial__avatar">{avatar}</div>',
                '            <div class="cvr-testimonial__meta">',
                f'                <span class="cvr-testimonial__name">{name}</span>',
                f'                <span class="cvr-testimonial__role">{role}</span>',
                "            </div>",
                '            <div class="cvr-testimonial__stars"><span>&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>',
                "        </div>",
                f'        <p class="cvr-testimonial__text">{text}</p>',
                "    </div>",
            ]
        )
    lines.append("</div>")
    return "\n".join(lines)


def apply_variant(html: str, v: dict, *, nenshu: bool = False) -> str:
    slug = v.get("path_slug", v["slug"])
    url = f"{BASE_URL}/{slug}/"

    html = re.sub(r"<title>[^<]+</title>", f"<title>{v['title']}</title>", html, count=1)
    html = re.sub(
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{v["description"]}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:title" content="[^"]*">',
        f'<meta property="og:title" content="{v["title"]}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:description" content="[^"]*">',
        f'<meta property="og:description" content="{v["og_desc"]}">',
        html,
        count=1,
    )
    html = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', html, count=1)
    html = re.sub(r'<link rel="canonical" href="[^"]*" */?>', f'<link rel="canonical" href="{url}" />', html, count=1)

    html = re.sub(r'window\.__LP_ID="[^"]+";', f'window.__LP_ID="{v["lp_id"]}";', html, count=1)
    html = re.sub(
        r'<span class="adtext">[^<]+</span>',
        f'<span class="adtext">{v["header"]}</span>',
        html,
        count=1,
    )
    html = html.replace(
        'alt="日本最大級の求人数,あなたの条件から施工管理特化でオススメの求人を無料で紹介"',
        f'alt="{v["banner_alt"]}"',
    )

    if nenshu:
        html = html.replace(
            "<h1 class=\"ns-header-bar__title\">施工管理の年収診断サイト <span class=\"ns-badge\">業界初</span></h1>",
            f"<h1 class=\"ns-header-bar__title\">{v['ns_header']} <span class=\"ns-badge\">業界初</span></h1>",
        )
        html = html.replace(
            '<p class="ns-header-bar__sub">診断しないと相場がわからないまま。1級・2級の適正年収を30秒で無料チェック</p>',
            f"<p class=\"ns-header-bar__sub\">{v['ns_sub']}</p>",
        )
        html = html.replace(
            '<p class="ns-fv__card-title">その年収、相場より安いかも。<br>施工管理専門の年収診断</p>',
            f"<p class=\"ns-fv__card-title\">{v['ns_fv_title']}</p>",
        )
        if v.get("salary_card"):
            m_sal = re.search(r'<motion class="ns-salary-data__cards">.*?</motion>\n    </div>', html, re.DOTALL)
            if not m_sal:
                m_sal = re.search(r'<div class="ns-salary-data__cards">.*?</motion>\n    </div>', html, re.DOTALL)
            if not m_sal:
                m_sal = re.search(r'<div class="ns-salary-data__cards">.*?</div>\n    </div>', html, re.DOTALL)
            if m_sal:
                html = html[: m_sal.start()] + v["salary_card"] + "\n    </motion>" + html[m_sal.end() :]
                html = html.replace("\n    </motion>", "\n    </div>", 1)
    else:
        fv = (
            f'<p class="cvr-specialty-badge">{v["label"]}専門</p>\n'
            f'<p class="cvr-fv-note">{v["fv_note"]}</p>\n'
        )
        html = html.replace(
            '<p class="c-title01 c-title-top"><span class="js-icon-target">お気持ちはどちらに近いですか？</span></p>',
            fv + '<p class="c-title01 c-title-top"><span class="js-icon-target">お気持ちはどちらに近いですか？</span></p>',
        )

    step01_q = "お持ちの資格を選んでください" if nenshu else "どの資格をお持ちですか？"
    m = re.search(
        rf'    <p class="c-title01">\s*<span class="js-icon-target">{re.escape(step01_q)}</span>\s*</p>.*?    </div>\n<div class="c-nextLink">',
        html,
        re.DOTALL,
    )
    if not m:
        raise RuntimeError("step01 block not found")
    html = html[: m.start()] + build_step01(v, nenshu=nenshu) + "\n" + html[m.end() - len('<div class="c-nextLink">'):]

    m2 = re.search(r'<div class="cvr-testimonials">.*?</div>\n\n<div class="cvr-faq">', html, re.DOTALL)
    if not m2:
        raise RuntimeError("testimonials block not found")
    html = html[: m2.start()] + build_testimonials(v) + "\n\n<div class=\"cvr-faq\">" + html[m2.end() :]

    return html


TEMPLATES = {
    "": "sekoukanri/index.html",
    "WPLP": "WPLP/sekoukanri/index.html",
    "自前LP": "自前LP/sekoukanri/index.html",
}


def main() -> None:
    for prefix, template_rel in TEMPLATES.items():
        template = (REPO / template_rel).read_text()
        for v in VARIANTS:
            out_html = apply_variant(template, v)
            out_dir = REPO / prefix / v["slug"] if prefix else REPO / v["slug"]
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "index.html").write_text(out_html)
            print("wrote", out_dir.relative_to(REPO) / "index.html")

    nenshu_tpl = (REPO / "nenshu-shindan/sekoukanri/index.html").read_text()
    for v in VARIANTS:
        nv = enrich_nenshu(v)
        nv["lp_id"] = nv["nenshu_lp_id"]
        nv["title"] = nv["title"].replace("求人・転職", "年収診断").replace("施工管理キャリア", "年収診断")
        out_dir = REPO / nv["path_slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(apply_variant(nenshu_tpl, nv, nenshu=True))
        print("wrote", out_dir.relative_to(REPO) / "index.html")


if __name__ == "__main__":
    main()
