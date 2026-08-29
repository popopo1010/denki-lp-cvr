#!/usr/bin/env node
/**
 * LPフォームの「消えやすい配線」を静的に守る番人
 *
 * CLAUDE.md の【頻出バグ】は、どれも同じ壊れ方をしている:
 *   - 直したはずの配線が、別の変更のついでに1実装だけ落ちる
 *   - ローカルでは再現しないので、本番のスマホでオーナーが踏む
 * check-kuma-anchor.mjs が CSS（クマの初期位置）を守っているのと同じことを、
 * JS側の配線に対してやる。ここが落ちたら「触ったつもりのない実装が壊れた」と読む。
 *
 * 対象実装（同じ修正を全部に当てる、が CLAUDE.md のルール）:
 *   assets/js/app.js / app-v2.js（＋ WPLP・自前LP・dk_lp のミラー）
 *   dk_lp/denkikouji/assets/js/main.js
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, dirname } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** 全ステップ実装（app.js系 / v2 / dk_lp参照実装） */
const IMPLS = [
  "assets/js/app.js",
  "assets/js/app-v2.js",
  "dk_lp/denkikouji/assets/js/main.js"
  // dk_lp/sekokanri/assets/js/main.js はどのHTMLからも読まれておらず 2026-08-23 に削除した
  // （同ディレクトリのHTMLは共有の assets/js/app.js を読む）。
].filter((p) => existsSync(join(ROOT, p)));

/** ミラーは正本とバイト一致していること（片方だけ直す事故の検出） */
const MIRRORS = [
  ["assets/js/app.js", ["WPLP/assets/js/app.js", "自前LP/assets/js/app.js", "dk_lp/assets/js/app.js"]],
  ["assets/js/app-v2.js", ["WPLP/assets/js/app-v2.js", "自前LP/assets/js/app-v2.js"]],
  // app.js が無条件に注入するので、ミラーに無いと全ページで404を1本取りに行く（2026-08-22 QA）
  // dk_lp/assets/js/app.js は正本と同一なので、同じ相対パスで
  // dk_lp/assets/js/cvr-boost.js を注入する。ここが取り残されると、
  // 本番の dk_lp/sekokanri だけ古い cvr-boost.js が配られる（2026-08-23 に実際に発生）。
  ["assets/js/cvr-boost.js", ["WPLP/assets/js/cvr-boost.js", "自前LP/assets/js/cvr-boost.js",
                              "dk_lp/assets/js/cvr-boost.js"]]
];

// ───────────────────────────────────────────────────────────
// 1. スクロール/フォーカス（2026-07-05〜 「ステップ上部が画面外に隠れる」5クラス）
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);

  // ① 中央寄せ禁止: block:"center" は上部(STEP表示/タイトル)を押し出す
  const centers = src.match(/scrollIntoView\(\s*\{[^}]*block:\s*["']center["'][^}]*\}/g) || [];
  check(`${p}: scrollIntoView に block:"center" を使わない`, centers.length === 0,
    `${centers.length}件: ${centers[0] || ""}`);

  // ④ focus() は必ず preventScroll 付き。
  //    直前に scrollIntoView({block:"nearest"}) で位置を決めていても、preventScroll なしの
  //    focus() がブラウザ主導スクロールでそれを上書きし、STEP表示を画面外へ押し出す
  //    （2026-08-23 QA で step05 の症状として実測。app-v2 には preventScroll:false の明示すらあった）。
  //    素の .focus() が許されるのは try{focus({preventScroll:true})}catch の代替パスだけ。
  const lines = src.split("\n");
  const bareFocus = lines.filter((line, i) => {
    if (!/\.focus\(\s*\)/.test(line)) return false;
    // try{ focus({preventScroll:true}) } catch(e){ focus() } の代替パスは許容（複数行の書き方も見る）
    const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    return !/catch/.test(window);
  });
  check(`${p}: focus() は必ず preventScroll 付き`, bareFocus.length === 0,
    bareFocus.slice(0, 2).map((l) => l.trim()).join(" / "));
  // コメント中の言及は除いて判定する（対策の経緯をコメントに残せるように）
  check(`${p}: preventScroll:false を書かない`,
    !/preventScroll:\s*false/.test(src.replace(/\/\/[^\n]*/g, "")));

  // ⑤(a) アプリ内ブラウザではステップ到達時に自動フォーカスしない
  check(`${p}: html.dk-inapp では autofocus しない`,
    /dk-inapp/.test(src) && /classList\.contains\("dk-inapp"\)/.test(src));

  // 送信ミラー(Zapier/GAS)は form 要素ではなく document に張る。
  // form要素に張ると、外部スクリプトがフォームDOMを差し替えた瞬間にリスナーごと消え、
  // **ステップ遷移は自己修復で生きているのに送信だけ無言で失われる**
  // （2026-08-23 実ブラウザで再現: 差し替え後 Zapier=0 / GAS=0 ＝リードが丸ごと消える）。
  // 「1回だけ送る」もフォーム単位(WeakSet)で持つ。差し替え後の新フォームは別物。
  check(`${p}: 送信ミラーを document 委譲で張る`,
    !/form\.addEventListener\(\s*["']submit["']/.test(src) &&
    /document\.addEventListener\(\s*["']submit["']/.test(src));
  // 送信は原則すべて通す（同一人物の再送信も別人の連続送信も届ける。オーナー方針）。
  // 「1ページ読み込みにつき1回」やフォーム単位で持つと、同じページからの
  // 2件目以降が**無言で消える**（2026-08-23 実測。同一端末で3回テストして
  // 1回しか届かず、ページを変えると復活する、という症状の原因だった）。
  // 止めてよいのは「1タップでsubmitが二重発火した」事故だけ＝短い時間窓のみ。
  check(`${p}: 再送信を止めない（短時間の二重発火のみ抑制）`,
    /DEDUP_MS/.test(src) && /sentAt\s*=\s*new Map\(\)/.test(src) &&
    /now - prev < DEDUP_MS/.test(src) &&
    !/let\s+sentOnce/.test(src) && !/sentForms/.test(src) && !/sentKeys/.test(src));

  // ⑤(c) focusin ナッジ（キーボードで押し上げられた上部を戻す）
  check(`${p}: focusin ナッジがある`, /addEventListener\(\s*["']focusin["']/.test(src));

  // ⑤(c)' ナッジは1回きりでは駄目（2026-08-23 オーナー実機で再々々発）。
  // iOSはキーボード確定時（〜1秒）に入力欄を最上部へもう一度スクロールし直すため、
  // 300ms後1回の補正は必ず負ける。300/700/1200msの多段再補正と
  // visualViewport resize での補正の両方が要る。ここが1回に戻されたらCIで止める。
  check(`${p}: ナッジが多段補正(300/700/1200ms)である`, /\[300,\s*700,\s*1200\]/.test(src));
  check(`${p}: visualViewport resize でも補正する`,
    /visualViewport\.addEventListener\(\s*["']resize["']/.test(src));

  // in-app 判定（UA）自体
  check(`${p}: アプリ内ブラウザ検知(UA)がある`, /Instagram|FBAN|Line\\?\//.test(src));

  // ⑤ CSSだけあってクラスが付かない、を防ぐ。
  // 全フォームLPの critical CSS に `html.dk-inapp body.lp-input-step …{padding-top:96px}` を
  // 置いてあるが（上の全数チェック）、それを効かせる body クラスを付けるのは各実装の showPage。
  // v2実装とdk_lp実装には付与が無く、28本のLPでバー対策が一度も効いていなかった（2026-08-23発覚）。
  // CSS側の番人と対で、必ず両方あることを確かめる。
  check(`${p}: 入力ステップに body.lp-input-step を付ける`,
    /classList\.toggle\(\s*\n?\s*"lp-input-step"/.test(src) &&
    /#step04/.test(src) && /#step05/.test(src) && /#step06/.test(src));
}

// ② ③ ステップ切替時のスクロールは「scroll-behavior を一時的に auto」＋「reflow強制後に scrollTo」
for (const p of ["assets/js/app.js", "assets/js/app-v2.js"]) {
  const src = read(p);
  check(`${p}: 切替スクロールは scrollBehavior="auto" で瞬時`, /scrollBehavior\s*=\s*"auto"/.test(src));
  check(`${p}: scrollTo 前に reflow を強制する`, /void\s+page\.offsetHeight/.test(src));
}

// ───────────────────────────────────────────────────────────
// 2. 「選択/入力しても次へ進めない」（2026-07-10 フォームが死ぬ 4クラス）
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);

  // ① 初期化済み判定は DOM属性でなく WeakSet（DOM差し替えを見抜く）
  check(`${p}: 初期化済み判定が WeakSet`, /new WeakSet\(\)/.test(src));

  // ① 未初期化グループの操作を capture で拾って自己修復する
  const heals = /\[["']click["'],\s*["']change["'],\s*["']input["'],\s*["']focusin["']\]/.test(src);
  check(`${p}: 未初期化グループの操作で自己修復する`, heals);
  check(`${p}: 自己修復を lp_error(form_group_reinit) で計測`, /form_group_reinit/.test(src));

  // ② 遅延ステップの取得失敗を握りつぶさない
  check(`${p}: 遅延ステップ取得失敗を計測する`, /lazy_steps_unavailable/.test(src) || !/lazy-steps-mount/.test(src));
}

// ①/④ ステップ遷移のクリック委譲は document に張る（form差し替えに耐える）
for (const p of IMPLS) {
  const src = read(p);
  if (!/handleStepClick/.test(src)) continue;
  check(`${p}: クリック委譲は document`, /document\.addEventListener\(\s*"click"/.test(src));
  check(`${p}: 委譲は DOMContentLoaded で張る（load前クリック対策）`,
    /DOMContentLoaded[\s\S]{0,400}bindGlobalDelegation\(\)/.test(src));
  check(`${p}: ボタン個別バインドに戻していない`,
    !/querySelectorAll\("\.js-step-button"\)[\s\S]{0,80}addEventListener\("click", handleStepClick\)/.test(src));
}

// ───────────────────────────────────────────────────────────
// 3. クマ（フォロワーアイコン）が「選択したら次のCTAへ移動する」配線
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);
  const calls = (src.match(/moveIconById\(/g) || []).length;
  check(`${p}: クマ移動(moveIconById)の配線が残っている`, calls >= 6, `${calls}箇所`);
  // 次のCTAを指す呼び出し（"#"+nextBtn.id）が必ず在ること
  check(`${p}: 選択完了時にクマを次のCTAへ移動`, /moveIconById\("#"\s*\+\s*nextBtn\.id/.test(src));
}

// ───────────────────────────────────────────────────────────
// 4. ミラーの同一性
// ───────────────────────────────────────────────────────────
for (const [canonical, mirrors] of MIRRORS) {
  const base = read(canonical);
  for (const m of mirrors) {
    if (!existsSync(join(ROOT, m))) { check(`mirror: ${m} が存在する`, false); continue; }
    check(`mirror: ${m} === ${canonical}`, read(m) === base);
  }
}

// ───────────────────────────────────────────────────────────
// 5. 予約カレンダー（LINE一本化で撤去済み）の先読みを、使わないLPでやらない
// ───────────────────────────────────────────────────────────
{
  const thanks = read("thanks-v2/index.html");
  check("thanks-v2 に予約カレンダーが復活していない", !/thanks-booking|booking-slots\.json/.test(thanks));
  for (const p of IMPLS) {
    const src = read(p);
    if (!/prewarmThanksBookingSlots/.test(src)) continue;
    check(`${p}: 予約枠の先読みは予約を使うLPだけ`, /thanksUsesBooking/.test(src));
  }
}

// ───────────────────────────────────────────────────────────
// 5b. 生まれ年の受付範囲が全実装で同じか
//     app-v2.js だけ 2023 まで通っていて、v2系LPから「3歳の候補者」がZohoへ流れていた
//     （2026-08-22 QA）。範囲は業務ルールなので、変えるならオーナー確認の上で全実装同時に。
// ───────────────────────────────────────────────────────────
{
  const ranges = new Map();
  for (const p of IMPLS) {
    const src = read(p);
    const min = src.match(/BIRTH_YEAR_MIN\s*=\s*(\d{4})/);
    // 下限は「16歳以上」という年齢ルール。西暦の直書きは年が変わるたびに1歳ずつ
    // 厳しくなって黙って腐るので、年齢からの導出であることまで固定する（2026-08-23）。
    const age = src.match(/MIN_AGE\s*=\s*(\d{1,2})/);
    const max = src.match(/BIRTH_YEAR_MAX\s*=\s*new Date\(\)\.getFullYear\(\)\s*-\s*MIN_AGE/);
    check(`${p}: 生まれ年の範囲が定数で1箇所に定義されている`, !!(min && age && max));
    check(`${p}: 生まれ年の下限を西暦直書きしない（年齢から導出）`, !/BIRTH_YEAR_MAX\s*=\s*\d{4}/.test(src));
    if (min && age) ranges.set(p, `${min[1]}-(今年-${age[1]}歳)`);
    // 定数を迂回した直書きが残っていないか
    check(`${p}: 生まれ年の範囲を直書きしていない`,
      !/(?:<|>)=?\s*20(?:1[1-9]|2\d)\b/.test(src.replace(/\/\/[^\n]*/g, "")));
  }
  const uniq = new Set(ranges.values());
  check(`生まれ年の範囲が全実装で一致（${[...uniq].join(" / ")}）`, uniq.size <= 1,
    [...ranges].map(([p, r]) => `${p}=${r}`).join(", "));
}

// ───────────────────────────────────────────────────────────
// 5c. ステップ計測(form_step)を二重に送らない
//     cvr-boost.js のクリック計測と app.js の trackStep が両方 push していて、
//     app.js系LPのファネルが二重計上になっていた（2026-08-22 QA）。
// ───────────────────────────────────────────────────────────
{
  // ファイル名を並べて見張ると、並べ忘れたコピーがそのまま生き残る。
  // 実際 dk_lp/assets/js/cvr-boost.js（dk_lp/sekokanri が本番で読む）は
  // このリストに入っておらず、削除したはずの initFormTracking が残っていた
  // ＝二重計上が続いていた（2026-08-23 の全体整合チェックで発覚）。
  // ルールは「form_step を push してよいのは app.js / app-v2.js だけ」なので、
  // リポジトリ内の cvr-boost.js を**全部**見つけて、どれも push しないことを確かめる。
  const boosts = [];
  const findBoosts = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git" || name === "node_modules") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) findBoosts(p);
      else if (name === "cvr-boost.js") boosts.push(p.slice(ROOT.length).replace(/^\//, ""));
    }
  };
  findBoosts(ROOT);
  const pushers = boosts.filter((p) => /event:\s*"form_step"/.test(read(p)));
  check(`form_step を push する cvr-boost.js が無い（${boosts.length}本走査）`,
    pushers.length === 0, pushers.join(", "));
  check("form_step を push するのは app.js / app-v2.js だけ",
    /event:\s*"form_step"/.test(read("assets/js/app.js")) &&
    /event:\s*"form_step"/.test(read("assets/js/app-v2.js")));
}

// ───────────────────────────────────────────────────────────
// 6. アプリ内ブラウザ（LINE/Instagram）の上部バー対策が全LPに入っているか
//    Meta広告の着地はほぼアプリ内ブラウザなので、ここが抜けたLPは
//    入力ステップでSTEP表示がバーの裏に隠れる（オーナー再三報告の症状）。
// ───────────────────────────────────────────────────────────
{
  const skipDirs = new Set([".git", "node_modules", "docs", ".netlify", ".github"]);
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name === "index.html") out.push(p);
    }
    return out;
  };

  /**
   * そのページがフォームLPか。
   * 入力欄は index.html に直接ある場合と、隣の steps-lazy.html から遅延で入る場合がある。
   * 以前は index.html の your-tel だけで判定しており、**入力欄を遅延側に置いている
   * denkikouji / sekoukanri（主力2本）を含む10本が、全数チェックからも全数E2Eからも
   * 外れていた**（2026-08-23 発覚。幸いどれも条件は満たしていたが、見張られていなかった）。
   * 「your-tel が index.html に無い＝フォームLPではない」は成り立たない。
   */
  const isFormLp = (indexPath) => {
    if (readFileSync(indexPath, "utf8").includes('name="your-tel"')) return true;
    const lazy = join(dirname(indexPath), "steps-lazy.html");
    return existsSync(lazy) && readFileSync(lazy, "utf8").includes('name="your-tel"');
  };
  const missing = [];
  const centerScrolls = [];
  let formPages = 0;
  const htmlFiles = [];
  const walkAll = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkAll(p);
      else if (name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walkAll(ROOT);
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!isFormLp(p)) continue;
    formPages++;
    if (!/html\.dk-inapp body\.lp-input-step \.js-page-body\{padding-top:96px!important\}/.test(html)) {
      missing.push(p.slice(ROOT.length));
    }
  }
  check(`全フォームLP(${formPages}本)にアプリ内ブラウザのバー対策(padding-top:96px)がある`,
    missing.length === 0, missing.slice(0, 5).join(", "));

  // 入力ステップ(96px)だけでなく、選択ステップ(step01-03)の余白も全LPに要る。
  // 96pxの方だけ全数チェックしていたため、WPLP/自前LP の20本が
  // 「入力ステップは余白あり・選択ステップは余白なし」という半端な状態で残っていた
  // （別系統のCSSを読んでいて cvr-boost*.css の標準規則が届かない。2026-08-23 発覚）。
  // HTML内の critical CSS か、そのLPが読み込むローカルCSSのどちらかにあればよい。
  const cssCache = new Map();
  const cssHas = (htmlPath, html, needle) => {
    if (html.includes(needle)) return true;
    for (const m of html.matchAll(/href="((?!https?:)[^"]+\.css)(\?[^"]*)?"/g)) {
      const abs = resolve(dirname(htmlPath), m[1]);
      if (!cssCache.has(abs)) {
        cssCache.set(abs, existsSync(abs) ? readFileSync(abs, "utf8") : "");
      }
      if (cssCache.get(abs).includes(needle)) return true;
    }
    return false;
  };
  const noFormPad = [];
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!isFormLp(p)) continue;
    if (!cssHas(p, html, "lp-form-step .js-page-body")) noFormPad.push(p.slice(ROOT.length));
  }
  check("全フォームLPが選択ステップ(lp-form-step)の上部余白を持つ",
    noFormPad.length === 0, noFormPad.slice(0, 5).join(", "));

  // ステップの初期非表示をテーマCSS任せにしない（テーマが遅い/届かないと全ステップが縦積みで出る）
  const noHide = [];
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!isFormLp(p)) continue;
    if (!/js-form-group(:not\(#step-first\))?\{display:none\}|js-page-body\{display:none\}/.test(html)) {
      noHide.push(p.slice(ROOT.length));
    }
  }
  check(`全フォームLPがステップの初期非表示を自前のcritical CSSで持っている`,
    noHide.length === 0, noHide.slice(0, 5).join(", "));

  // GTMは全フォームLPで遅延読み込み（同期スニペットはFVをブロックする）。
  // 主要LPだけ遅延・ミラーやMeta LPは同期、という取り残されが実際に28本あった（2026-08-23）。
  const syncGtm = [];
  for (const p of walk(ROOT)) {
    const html = readFileSync(p, "utf8");
    if (!isFormLp(p)) continue;
    if (!/GTM-[A-Z0-9]+/.test(html)) continue;
    // 関数名(loadGTM)で判定しない。**リポジトリ内で既にminifyされているLPがあり**
    // （sekoukanri など5本）、`loadGTM` が `e` に潰れて「同期読み込み」と誤検知していた。
    // 見るのは挙動: ①gtm.js を <script src> で直に読む同期タグが無いこと
    //             ②アイドル時ロード（requestIdleCallback）の配線があること
    const syncTag = /<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtm\.js/.test(html);
    const idle = /requestIdleCallback/.test(html);
    if (syncTag || !idle) syncGtm.push(p.slice(ROOT.length));
  }
  check(`全フォームLPがGTMを遅延読み込みしている`, syncGtm.length === 0, syncGtm.slice(0, 5).join(", "));

  // WPテーマCSSは本番URLを直接読まず、リポジトリ管理下のスナップショットを読む（2026-08-23 統一）。
  // 本番URLを直接読むと ①テーマ変更が無審査で全LPに即反映される（週次スナップショットPRが
  // 唯一の警告で、最大7日遅れる） ②クロスオリジンのレンダーブロックCSSになる
  // ③ローカル/CIからは WAF 403 で取得できずE2Eが本番と別のCSSで走る。
  // 切替時点で snapshot は本番と**バイト同一**であることをランナー側で確認済み
  // （Snapshot WP theme CSS run#9「No changes in theme CSS」）。
  // theme-snapshot.css は url() を1つも持たないので、置き場所が変わっても解決先は変わらない。
  const liveTheme = [];
  for (const p of htmlFiles) {
    if (/themes\/original-thema\/assets\/css\/style\.css/.test(readFileSync(p, "utf8"))) {
      liveTheme.push(p.slice(ROOT.length));
    }
  }
  check("本番WPテーマCSSを直接読むHTMLが無い（theme-snapshot.css に統一）",
    liveTheme.length === 0, liveTheme.slice(0, 5).join(", "));

  // HTML側（クマのタップ等）にも block:"center" を残さない。中央寄せは上部を押し出す。
  for (const p of htmlFiles) {
    if (/scrollIntoView\(\{[^}]*block:\s*['"]center['"]/.test(readFileSync(p, "utf8"))) {
      centerScrolls.push(p.slice(ROOT.length));
    }
  }
  check(`HTML(${htmlFiles.length}本)に block:"center" のスクロールが無い`,
    centerScrolls.length === 0, centerScrolls.slice(0, 5).join(", "));

  // ── スマホUI/UXの数値（2026-08-29 実測監査。docs/qa-2026-08-22.md 1q） ──
  // LPが読むCSSは家族ごとに別ファイルで、片方だけ直すと半分のLPに届かない。
  // 「LPが実際に読む側のCSS」を全部列挙して、同じ規則が入っているか見る。
  const LP_CSS = [
    "assets/css/cvr-boost.css", "assets/css/cvr-boost-v2.css",
    "assets/css/cvr-boost-denkikouji.css", "assets/css/cvr-boost-sekoukanri.css",
    "WPLP/assets/css/cvr-boost.css", "WPLP/assets/css/cvr-boost-v2.css",
    "dk_lp/assets/css/cvr-boost-denkikouji.css", "dk_lp/assets/css/cvr-boost-sekoukanri.css",
    "dk_lp/denkikouji/assets/css/cvr-boost.css",
    "自前LP/assets/css/style.css", "自前LP/assets/css/style-v2.css"
  ];
  const cssMiss = (re) => LP_CSS.filter((f) => {
    const abs = join(ROOT, f);
    return !existsSync(abs) || !re.test(readFileSync(abs, "utf8"));
  });

  // iOSは16px未満の入力欄にフォーカスするとページを拡大し、ユーザーは自力で戻せない。
  // テーマの .c-select-box select は 14px なので、各家族のCSSで上書きし続ける必要がある。
  const noZoom = cssMiss(/\.c-select-box\s+select\s*\{[^}]*font-size:\s*(1[6-9]|[2-9]\d)px/);
  check(`入力欄が16px以上（iOSの自動ズーム防止）: LPが読むCSS ${LP_CSS.length}本`,
    noZoom.length === 0, noZoom.join(", "));

  // 選択肢グリッドは列数を書き換えず、アイテム側に「縮める許可」を与えて画面内に収める。
  const noShrink = cssMiss(/\.c-button-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  check(`選択肢グリッドが画面幅を超えない（.c-button-grid>*{min-width:0}）: ${LP_CSS.length}本`,
    noShrink.length === 0, noShrink.join(", "));

  // フッターの規約リンクは 44px。step06 の同意文リンクは**あえて24px相当**にとどめる
  // （送信CTAの真横なので、広げると誤タップ離脱が増えCVRを下げる）。
  const noTap = cssMiss(/\.footer-dark\s+\.link\s*\{[^}]*min-height:\s*44px/);
  check(`フッターの規約リンクが44px（タップ領域）: ${LP_CSS.length}本`,
    noTap.length === 0, noTap.join(", "));
}

// ───────────────────────────────────────────────────────────
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
console.log(`\n--- ${checks.length - failures.length}/${checks.length} passed ---`);
if (failures.length) {
  console.error("\n落ちた配線（CLAUDE.md の頻出バグに直結する）:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
