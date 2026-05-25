#!/usr/bin/env node
/**
 * リポジトリ内の index.html を走査し、LP一覧ページを生成する。
 * 使い方: node scripts/generate-lp-index.js
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  ".git",
  ".playwright-mcp",
  "node_modules",
  "scripts",
  "__pycache__",
  "assets"
]);

const HUB_PAGES = new Set([
  "index.html",
  "WPLP/index.html",
  "自前LP/index.html",
  "ad-cr/index.html"
]);

const PROD_CVR_BASE = "https://denkilp.builders-job.com/denki-lp-cvr/";
const PREVIEW_BASE = "https://popopo1010.github.io/denki-lp-cvr/";

/** 手順書どおり本番と異なるクエリ・パス */
const URL_OVERRIDES = {
  "ad-cr/sekoukanri/index.html": {
    cvr: "https://denkilp.builders-job.com/denki-lp-cvr/ad-cr/sekoukanri/?meta=1"
  },
  "ad-cr/denkikouji/index.html": {
    cvr: "https://denkilp.builders-job.com/denki-lp-cvr/ad-cr/denkikouji/?meta=1"
  }
};

const SECTIONS = [
  {
    id: "production",
    title: "本番LP（ルート配信）",
    note: "本番URLのルートパスに対応。GTM反映・静的配信の主対象。",
    accent: "#314c85",
    match: (rel) =>
      /^(denkikouji|sekoukanri|thanks|privacypolicy)/.test(rel)
  },
  {
    id: "wplp",
    title: "WordPress版 (WPLP)",
    note: "WPテーマ・本番反映用のコピー。",
    accent: "#1565c0",
    match: (rel) => rel.startsWith("WPLP/") && !HUB_PAGES.has(rel)
  },
  {
    id: "jizen",
    title: "自前LP",
    note: "自社ホスティング・検証用の静的LP。",
    accent: "#00695c",
    match: (rel) => rel.startsWith("自前LP/") && rel !== "自前LP/index.html"
  },
  {
    id: "nenshu",
    title: "年収診断LP",
    note: "年収診断フォーム・サンクス・CRリダイレクト。",
    accent: "#e8520e",
    match: (rel) => rel.startsWith("nenshu-shindan/")
  },
  {
    id: "meta",
    title: "Meta広告送客（noindex）",
    note: "ショートLP・Meta送客専用。",
    accent: "#6a1b9a",
    match: (rel) => rel.startsWith("meta-lp/")
  },
  {
    id: "adcr",
    title: "広告CR（録画用）",
    note: "動画広告の画面録画用。送客先URLではない。",
    accent: "#c62828",
    match: (rel) => rel.startsWith("ad-cr/") && rel !== "ad-cr/index.html"
  }
];

function relPath(abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".")) continue;
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue;
      walk(abs, out);
      continue;
    }
    if (name.name === "index.html") out.push(relPath(abs));
  }
  return out;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return "";
  return m[1]
    .replace(/\[Meta\]\s*/i, "")
    .replace(/\s*\|\s*.+$/, "")
    .trim();
}

function shortLabel(rel) {
  const dir = path.dirname(rel);
  return dir === "." ? "(ルート)" : dir;
}

function extractLinkHref(html, relName) {
  const re = new RegExp(
    `<link[^>]+rel=["']${relName}["'][^>]+href=["']([^"']+)["']|` +
      `<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${relName}["']`,
    "i"
  );
  const m = html.match(re);
  if (!m) return "";
  return (m[1] || m[2] || "").trim();
}

function extractMetaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i"
  );
  const m = html.match(re);
  if (!m) return "";
  return (m[1] || m[2] || "").trim();
}

/** denki-lp-cvr 配下の静的反映パス（WPLP/自前LP はルート相当） */
function cvrDeployRel(rel) {
  if (rel.startsWith("WPLP/")) return rel.slice("WPLP/".length);
  if (rel.startsWith("自前LP/")) return rel.slice("自前LP/".length);
  return rel;
}

function joinBase(base, relPath) {
  return base + relPath.replace(/\/index\.html$/, "/");
}

function resolveUrls(rel, html) {
  const override = URL_OVERRIDES[rel];
  const canonical = extractLinkHref(html, "canonical");
  const ogUrl = extractMetaContent(html, "og:url");
  const preview = joinBase(PREVIEW_BASE, rel);
  const cvr =
    override?.cvr ||
    joinBase(PROD_CVR_BASE, cvrDeployRel(rel));

  const urls = [];
  const seen = new Set();

  function push(label, url) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push({ label, url });
  }

  push("本番", canonical || ogUrl || cvr);
  if (canonical && canonical !== cvr) push("CVR反映", cvr);
  else if (!canonical && ogUrl && ogUrl !== cvr) push("og:url", ogUrl);
  push("GitHub確認", preview);

  return urls;
}

function remapItemForSubfolder(item, prefix) {
  const rel = item.rel.startsWith(prefix) ? item.rel.slice(prefix.length) : item.rel;
  return { ...item, rel };
}

function renderUrlLines(urls) {
  if (!urls.length) return "";
  return urls
    .map(
      (u) =>
        `            <p class="url-line"><span class="url-label">${escapeHtml(u.label)}</span>` +
        `<a class="url" href="${escapeHtml(u.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u.url)}</a></p>`
    )
    .join("\n");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPage({ title, lead, baseHref, backHref, sections, showBack }) {
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const nav = sections
    .map((s) => `<a href="#${s.id}">${escapeHtml(s.title)} <span class="count">${s.items.length}</span></a>`)
    .join("\n      ");

  const body = sections
    .map((section) => {
      const cards = section.items
        .map((item) => {
          const href = baseHref + item.rel.replace(/\/index\.html$/, "/");
          const search = [
            item.rel,
            item.title,
            item.label,
            ...(item.urls || []).map((u) => `${u.label} ${u.url}`)
          ]
            .join(" ")
            .toLowerCase();
          const urlLines = renderUrlLines(item.urls);
          return `        <article class="lp-card" data-search="${escapeHtml(search)}" data-local="${escapeHtml(href)}">
          <a class="lp-card-main" href="${escapeHtml(href)}">
            <span class="path">${escapeHtml(item.label)}</span>
            <span class="name">${escapeHtml(item.title || item.rel)}</span>
            <span class="open-hint">クリックでローカルプレビュー →</span>
          </a>
          <div class="url-lines">${urlLines.replace(/^\s+/gm, "")}</div>
        </article>`;
        })
        .join("\n");
      return `    <section id="${section.id}" class="section" style="--accent:${section.accent}">
      <h2>${escapeHtml(section.title)}</h2>
      <p class="note">${escapeHtml(section.note)}</p>
      <div class="grid">
${cards}
      </div>
    </section>`;
    })
    .join("\n\n");

  const back = showBack
    ? `<p class="back"><a href="${escapeHtml(backHref || baseHref)}">← 全LP一覧に戻る</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      margin: 0; padding: 32px 20px 64px; line-height: 1.5; color: #1a1a1a;
      background: #f4f6f9;
    }
    .wrap { max-width: 920px; margin: 0 auto; }
    h1 { font-size: 1.35rem; margin: 0 0 6px; }
    .lead { color: #555; font-size: 0.95rem; margin: 0 0 12px; }
    .server-box {
      background: #fff8e1; border: 1px solid #ffcc80; border-radius: 10px;
      padding: 14px 16px; margin-bottom: 16px; font-size: 0.9rem;
    }
    .server-box strong { color: #e65100; }
    .server-box code {
      display: block; margin: 8px 0; padding: 10px 12px; background: #fff;
      border-radius: 6px; font-size: 0.82rem; word-break: break-all;
      border: 1px solid #eee;
    }
    .server-box a.local-root {
      font-weight: 700; color: #1565c0; font-size: 1rem;
    }
    .file-warn {
      display: none; background: #ffebee; border: 1px solid #ef9a9a;
      border-radius: 10px; padding: 12px 14px; margin-bottom: 16px;
      font-size: 0.88rem; color: #b71c1c;
    }
    .file-warn.is-on { display: block; }
    .meta { font-size: 0.85rem; color: #666; margin-bottom: 20px; }
    .back { margin: 0 0 16px; }
    .back a { color: #314c85; font-weight: 600; }
    .search-wrap { margin-bottom: 16px; }
    #q {
      width: 100%; padding: 12px 14px; font-size: 1rem; border: 1px solid #ccc;
      border-radius: 10px; background: #fff;
    }
    nav {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px;
    }
    nav a {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 12px; background: #fff; border: 1px solid #dde3ec;
      border-radius: 999px; text-decoration: none; color: #314c85;
      font-size: 0.82rem; font-weight: 600;
    }
    nav a .count {
      background: #eef2f8; color: #314c85; padding: 1px 7px; border-radius: 999px;
      font-size: 0.75rem;
    }
    .section { margin-bottom: 36px; }
    .section h2 {
      font-size: 1.05rem; margin: 0 0 4px; padding-left: 10px;
      border-left: 4px solid var(--accent, #314c85);
    }
    .section .note { color: #666; font-size: 0.85rem; margin: 0 0 12px; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
    }
    .lp-card {
      display: block; padding: 0; background: #fff;
      border: 1px solid #dde3ec; border-radius: 10px; color: inherit;
      transition: box-shadow 0.15s, border-color 0.15s; overflow: hidden;
    }
    .lp-card:hover {
      border-color: var(--accent, #314c85);
      box-shadow: 0 4px 12px rgba(49, 76, 133, 0.12);
    }
    .lp-card-main {
      display: block; padding: 14px 16px 10px; text-decoration: none; color: inherit;
    }
    .lp-card-main:hover .open-hint { text-decoration: underline; }
    .lp-card .path {
      display: block; font-size: 0.78rem; font-weight: 700;
      color: var(--accent, #314c85); margin-bottom: 4px; word-break: break-all;
    }
    .lp-card .name {
      display: block; font-size: 0.88rem; color: #333; line-height: 1.4;
    }
    .open-hint {
      display: block; margin-top: 6px; font-size: 0.72rem; font-weight: 700;
      color: var(--accent, #314c85);
    }
    .url-lines {
      padding: 0 16px 12px; border-top: 1px solid #eef2f8;
    }
    .url-line {
      margin: 6px 0 0; font-size: 0.72rem; line-height: 1.45;
      word-break: break-all;
    }
    .url-label {
      display: inline-block; min-width: 4.8em; font-weight: 700;
      color: #666; margin-right: 4px;
    }
    .url {
      color: #1565c0; text-decoration: none;
    }
    .url:hover { text-decoration: underline; }
    .lp-card.is-hidden { display: none; }
    .empty { display: none; color: #888; font-size: 0.9rem; padding: 12px 0; }
    .empty.is-visible { display: block; }
    footer { margin-top: 40px; font-size: 0.8rem; color: #888; }
    footer code { font-size: 0.78rem; }
  </style>
</head>
<body>
  <div class="wrap">
    ${back}
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(lead)}</p>
    <p id="file-warn" class="file-warn" hidden>
      <strong>ファイル直開（file://）ではリンクが動きません。</strong>
      下の手順でローカルサーバーを起動してから
      <a class="local-root" href="http://localhost:8080/">http://localhost:8080/</a>
      を開いてください。
    </p>
    <div class="server-box">
      <strong>ローカルで見る（推奨）</strong>
      ターミナルでリポジトリ直下から実行:
      <code>cd ${escapeHtml(root)}<br>python3 -m http.server 8080</code>
      ブラウザで開く:
      <a class="local-root" href="http://localhost:8080/${baseHref === "./" ? "" : baseHref}">http://localhost:8080/${baseHref === "./" ? "" : baseHref}</a>
    </div>
    <p class="meta">全 <strong>${total}</strong> ページ · 生成: <code>node scripts/generate-lp-index.js</code></p>
    <div class="search-wrap">
      <input type="search" id="q" placeholder="パス・タイトルで絞り込み（例: meta, 土木, thanks）" autocomplete="off">
    </div>
    <nav aria-label="セクション">
      ${nav}
    </nav>
    <p class="empty" id="empty">該当するLPがありません。</p>

${body}

    <footer>
      広告CRの入稿用一覧は <a href="${escapeHtml(baseHref)}ad-cr/">ad-cr/</a> も参照。
    </footer>
  </div>
  <script>
    (function () {
      if (location.protocol === "file:") {
        var w = document.getElementById("file-warn");
        if (w) { w.hidden = false; w.classList.add("is-on"); }
      }
      var input = document.getElementById("q");
      var cards = document.querySelectorAll(".lp-card");
      var empty = document.getElementById("empty");
      function filter() {
        var q = (input.value || "").trim().toLowerCase();
        var visible = 0;
        cards.forEach(function (card) {
          var show = !q || (card.getAttribute("data-search") || "").indexOf(q) !== -1;
          card.classList.toggle("is-hidden", !show);
          if (show) visible++;
        });
        empty.classList.toggle("is-visible", visible === 0);
      }
      input.addEventListener("input", filter);
    })();
  </script>
</body>
</html>
`;
}

function groupPages(allRel) {
  const pages = allRel
    .filter((rel) => !HUB_PAGES.has(rel))
    .map((rel) => {
      const html = fs.readFileSync(path.join(root, rel), "utf8");
      return {
        rel,
        label: shortLabel(rel),
        title: extractTitle(html),
        urls: resolveUrls(rel, html)
      };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel, "ja"));

  const assigned = new Set();
  const sections = SECTIONS.map((def) => {
    const items = pages.filter((p) => {
      if (assigned.has(p.rel)) return false;
      if (!def.match(p.rel)) return false;
      assigned.add(p.rel);
      return true;
    });
    return { id: def.id, title: def.title, note: def.note, accent: def.accent, items };
  });

  const uncategorized = pages.filter((p) => !assigned.has(p.rel));
  if (uncategorized.length) {
    console.warn("Uncategorized index.html (added to「その他」):");
    uncategorized.forEach((p) => console.warn(`  - ${p.rel}`));
    sections.push({
      id: "other",
      title: "その他",
      note: "分類未定義のページ。generate-lp-index.js の SECTIONS を更新してください。",
      accent: "#546e7a",
      items: uncategorized
    });
  }

  return sections.filter((s) => s.items.length > 0);
}

function write(rel, html) {
  const out = path.join(root, rel);
  fs.writeFileSync(out, html, "utf8");
  console.log(`wrote ${rel}`);
}

const allIndex = walk(root);
const allSections = groupPages(allIndex);

write(
  "index.html",
  buildPage({
    title: "LP 一覧 | 施工管理LP",
    lead: "カード上部をクリックするとローカルプレビューが開きます。下のURLは本番・GitHub用（別タブ）。",
    baseHref: "./",
    sections: allSections,
    showBack: false
  })
);

const wplpSections = allSections
  .filter((s) => s.id === "wplp")
  .map((s) => ({
    ...s,
    items: s.items.map((item) => remapItemForSubfolder(item, "WPLP/"))
  }));

if (wplpSections[0]?.items.length) {
  write(
    "WPLP/index.html",
    buildPage({
      title: "LP 一覧 (WPLP) | 施工管理LP",
      lead: "WordPress版（WPLP）フォルダ内のLPのみ。",
      baseHref: "./",
      sections: wplpSections,
      showBack: true,
      backHref: "../"
    })
  );
}

const jizenSections = allSections
  .filter((s) => s.id === "jizen")
  .map((s) => ({
    ...s,
    items: s.items.map((item) => remapItemForSubfolder(item, "自前LP/"))
  }));

if (jizenSections[0]?.items.length) {
  write(
    "自前LP/index.html",
    buildPage({
      title: "LP 一覧 (自前LP) | 施工管理LP",
      lead: "自前LPフォルダ内の静的ページのみ。",
      baseHref: "./",
      sections: jizenSections,
      showBack: true,
      backHref: "../"
    })
  );
}

console.log(`Done. ${allIndex.length - HUB_PAGES.size} LP pages indexed.`);
