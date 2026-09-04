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
import { createHash } from "node:crypto";
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
  // 300ms後1回の補正は必ず負ける（iOSはキーボードのアニメーション完了時に
  // もう一度スクロールし直す）。かといって 300/700/1200ms の固定3回にすると、
  // ブラウザが動かしている**最中**にも割り込むため画面が上下に揺れる
  // （2026-08-29 オーナー実機動画。1.5秒で23回位置が変わっていた）。
  // 正解は「スクロールが止まってから1回だけ直す」。何度スクロールし直されても
  // そのたび落ち着いてから直すので、多段補正の強さは保ったまま揺れだけが消える。
  check(`${p}: ナッジがスクロール沈静後に補正する(SETTLE_MS)`,
    /SETTLE_MS/.test(src) && /addEventListener\(\s*["']scroll["']/.test(src));
  check(`${p}: 落ち着かなくても最後に1回直す(DEADLINE_MS)`, /DEADLINE_MS/.test(src));
  check(`${p}: visualViewport resize でも補正する`,
    /visualViewport\.addEventListener\(\s*["']resize["']/.test(src));
  // behavior:"auto" は CSS の scroll-behavior を読む。全LPが html{scroll-behavior:smooth}
  // を持つので、auto だと補正がアニメーションになり iOS の再スクロールに割り込まれて揺れる。
  check(`${p}: 補正は instant（smoothに巻き込まれない）`,
    /scrollBy\(\{[^}]*behavior:\s*["']instant["']/.test(src) &&
    !/scrollBy\(\{[^}]*behavior:\s*["']auto["']/.test(src));

  // in-app 判定（UA）自体
  check(`${p}: アプリ内ブラウザ検知(UA)がある`, /Instagram|FBAN|Line\\?\//.test(src));
  // 余白(64px)は html.dk-inapp.dk-ios にだけ効く。dk-ios を付ける配線が消えると
  // iOSで余白ゼロになり、STEP表示がバーの裏に沈む症状が丸ごと戻る（CSSだけ見張っても
  // 気づけない。lp-input-step で同じ見落としを踏んでいる）。
  check(`${p}: iOS判定(dk-ios)を付けている`,
    /classList\.add\("dk-ios"\)/.test(src) && /iPhone\|iPad\|iPod/.test(src));

  // ⑤ CSSだけあってクラスが付かない、を防ぐ。
  // 全フォームLPの critical CSS に `html.dk-inapp body.lp-form-step …{padding-top:64px}` を
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
    // 2026-08-29: 対象を lp-input-step → lp-form-step に広げた。入力ステップだけ96pxだと
    // 選択ステップ(44px)との間で **ヘッダー下の余白が52px跳ねて見える**（オーナー実機報告）。
    // アプリ内ブラウザでは全ステップ64pxに揃える。通常ブラウザは従来どおり44px。
    // 2026-08-29: 余白は iOS のアプリ内ブラウザ限定にした（html.dk-inapp.dk-ios）。
    // 半透明バーをページに被せるのはiOSだけで、AndroidのLINE等はバーが被らない。
    // Androidは無条件の44pxに戻る。オーナーのAndroid実機で余白が無駄と判明。
    // 2026-08-29: 96pxは余白が多すぎるとオーナー指摘。実測で先頭要素は
    // padding+36px の位置に来るので、64pxでも先頭は約100pxとなりLINEのバー(~83px)を
    // 十分に越える。44pxだと約80pxでバーに潜るため、そこまでは下げられない。
    if (!/html\.dk-inapp\.dk-ios body\.lp-form-step \.js-page-body\{padding-top:64px!important\}/.test(html)) {
      missing.push(p.slice(ROOT.length));
    }
  }
  check(`全フォームLP(${formPages}本)にアプリ内ブラウザのバー対策(padding-top:64px・iOSのみ・全ステップ共通)がある`,
    missing.length === 0, missing.slice(0, 5).join(", "));

  // エラー欄(#error-*)を持つLPは、読んでいるCSSのどれかにエラーの絶対配置
  // （出没してもレイアウトが+40px動かないためのルール）が必要。
  // 2026-08-30: 8本のcvr-boost系には入れたが、独自CSSを読む dk_lp が漏れていた。
  // 「別系統のCSSを読むLPに規則が届かない」は 2026-08-23 の余白と同じ再発パターン。
  {
    const noOverlay = [];
    for (const p of walk(ROOT)) {
      if (!isFormLp(p)) continue;
      const dir = dirname(p);
      let combined = readFileSync(p, "utf8");
      const lazy = join(dir, "steps-lazy.html");
      try { combined += readFileSync(lazy, "utf8"); } catch (e) {}
      if (!/id="error-/.test(combined)) continue;
      const hrefs = [...combined.matchAll(/href="([^"]+\.css)[^"]*"/g)].map((m) => m[1]);
      let ok = false;
      for (const href of hrefs) {
        if (/^https?:/.test(href)) continue;
        try {
          const css = readFileSync(join(dir, href.split("?")[0]), "utf8");
          if (css.includes("> dd > .c-error-message")) { ok = true; break; }
        } catch (e) { /* 参照切れは check-local-refs が見る */ }
      }
      if (!ok) noOverlay.push(p.slice(ROOT.length));
    }
    check("エラー欄を持つ全LPのCSSにエラーの絶対配置（レイアウト非移動）が届いている",
      noOverlay.length === 0, noOverlay.slice(0, 5).join(", "));
  }

  // 入力ステップ(96px)だけでなく、選択ステップ(step01-03)の余白も全LPに要る。
  // 64px(旧96px)の方だけ全数チェックしていたため、WPLP/自前LP の20本が
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

  // 主力LPは theme-snapshot.css から「LPで使う規則だけ」を残した生成物 theme-lp.css を読む
  // （2026-09-04 高速化: minify後 37KB→14KB、gzip 8KB→3.6KB。scripts/build-theme-lp-css.mjs）。
  // 生成物の先頭バナーに生成元スナップショットのハッシュを埋めてあり、スナップショットだけ
  // 更新して再生成を忘れると「テーマ変更が主力LPに届かない」ので、ここでズレを止める。
  {
    const themeLp = existsSync(join(ROOT, "assets/css/theme-lp.css")) ? read("assets/css/theme-lp.css") : "";
    const snapHash = createHash("sha256").update(readFileSync(join(ROOT, "assets/css/theme-snapshot.css"))).digest("hex").slice(0, 16);
    const m = themeLp.match(/theme-snapshot\.css@([0-9a-f]{16})/);
    check("theme-lp.css が現在の theme-snapshot.css から生成されている（node scripts/build-theme-lp-css.mjs）",
      !!m && m[1] === snapHash, m ? `生成元 ${m[1]} ≠ 現在 ${snapHash}` : "theme-lp.css が無い/バナー欠落");
    const MAIN_LPS = ["denkikouji/index.html", "sekoukanri/index.html", "sekoukanri-kentiku/index.html",
      "sekoukanri-doboku/index.html", "sekoukanri-denkisekou/index.html", "denkisekou/index.html"];
    const heavy = MAIN_LPS.filter((p) => !/theme-lp\.css\?v/.test(read(p)));
    check("主力LP(6本)が theme-lp.css を読んでいる（theme-snapshot.css 直読みへ戻さない）",
      heavy.length === 0, heavy.join(", "));
  }

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

  // 同意文リンクの当たり判定は**下方向にだけ**伸ばす。上下に伸ばすと、真上にある
  // 送信CTAの下端を数px奪い、ボタンの端をタップした人がプライバシーポリシーへ飛ぶ
  // （2026-08-29 実測: 自前LP系でCTA下端4pxがリンク側に取られていた）。
  const noPp = cssMiss(/\.cvr-pp-text a\s*\{[^}]*padding:\s*0(px)? \d+px \d+px/);
  check(`同意文リンクの当たり判定が下方向のみ（CTAを奪わない）: ${LP_CSS.length}本`,
    noPp.length === 0, noPp.join(", "));

  // step06 の「戻る」は theme が height:48px を持つが、入力ステップ用の上書きが
  // height:auto + padding:8px にするため実測30pxまで縮む（2026-08-29 実測）。
  const noBack = cssMiss(/\.c-nextLinkButton\s*\{[^}]*(min-height:\s*44px|height:\s*48px)/);
  check(`step06の「戻る」が44px以上: ${LP_CSS.length}本`,
    noBack.length === 0, noBack.join(", "));
}

// ───────────────────────────────────────────────────────────
// 9. テスト送信は「全部記録・数字に乗せない」（2026-08-30 リード件数調査）
//    経緯: Meta「登録完了6件」に対しSlackの本物リードは2件。差分はSTG/本番テストの
//    CV発火（STGフォームは本番thanksへ遷移する）と、テスト通知の手動削除だった。
//    テストを黙って捨てる・通知だけ消す運用は「届いていない」誤認を生むため、
//    ①テストもGAS（シート）には必ず送る ②Slackは【テスト送信】表記 ③Zoho商談なし
//    ④lead_conversion（Meta/Google主CV）は発火させない、を配線で保証する。
// ───────────────────────────────────────────────────────────
for (const p of IMPLS) {
  const src = read(p);
  check(`${p}: テスト判定にSTG(/denki-lp-cvr-stg/)と?dk_test=1がある`,
    /denki-lp-cvr-stg/.test(src) && /dk_test/.test(src));
  check(`${p}: テストでもGASへ送る（_testを同送・Zapierのみ除外）`,
    /params\.append\("_test", testReason\)/.test(src) &&
    /if \(!testReason\) postTo\(ZAPIER_URL/.test(src) &&
    !/if \(isTestLeadSubmission\([^)]*\)\) return;/.test(src));
  check(`${p}: テストフラグをthanksへ引き継ぐ(dk_lp_test_v1)`,
    /dk_lp_test_v1/.test(src) && /persistTestFlag\(testReason\)/.test(src));
}
for (const p of ["assets/js/thanks-v2-shared.js", "dk_lp/denkikouji/assets/js/main.js"]) {
  const src = read(p);
  check(`${p}: テスト時は lead_conversion を発火させない(lead_conversion_test)`,
    /lead_conversion_test/.test(src) && /dk_lp_test_v1/.test(src));
  // STGのフォームは本番thanksへ遷移するため、thanksのURLだけでは判定できない。
  // lead session の href（送信元URL）を見る配線が要（消えるとSTGテストがCV計上に戻る）。
  check(`${p}: 送信元URL(href)からもSTG/dk_testを判定する`,
    /href\.indexOf\("\/denki-lp-cvr-stg\/"\)/.test(src));
  // thanks到達ピン（送信消失の検知網 2026-08-30）。ミラーが両方失敗すると
  // CVだけ発火してリードが無痕跡になる——qualifiedな到達をGASへ報告する配線。
  // 消えると「Metaには乗ったのにどこにも居ないリード」が再び検知不能になる。
  check(`${p}: thanks到達ピンを送る(thanks_reached + 1セッション1回)`,
    /_event",\s*"thanks_reached"/.test(src) && /dk_thanks_ping_v1/.test(src) &&
    /sendThanksReachedPing\(qualified, testReason\)/.test(src));
}
{
  const gas2 = read("gas-recorder/コード.js");
  check("gas-recorder/コード.js: thanks_reached を受けて照合・救済する(handleThanksReached)",
    /handleThanksReached/.test(gas2) &&
    /params\["_event"\]\s*===\s*"thanks_reached"/.test(gas2) &&
    /Utilities\.sleep\(8000\)/.test(gas2) && // 送信ビーコンとの競合を吸収してから消失と判定
    /_recovered/.test(gas2) && /送信消失の疑い/.test(gas2));
}
{
  const gas = read("gas-recorder/コード.js");
  check("gas-recorder/コード.js: テスト判定(detectTestSubmission)と【テスト送信】通知（@channelなし）",
    /function detectTestSubmission/.test(gas) && /【テスト送信】/.test(gas));
  check("gas-recorder/コード.js: Slack通知失敗を slack_error に記録して報告する",
    /slack_error:\s*String\(slackErr\)/.test(gas) && /reportErrorToSlack\("slack_lead_notify/.test(gas));
  const zoho = read("gas-recorder/zoho.js");
  check("gas-recorder/zoho.js: _test/STG送信はZoho商談を作らない",
    /params\["_test"\]/.test(zoho) && /denki-lp-cvr-stg/.test(zoho));
}

// ───────────────────────────────────────────────────────────
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
console.log(`\n--- ${checks.length - failures.length}/${checks.length} passed ---`);
if (failures.length) {
  console.error("\n落ちた配線（CLAUDE.md の頻出バグに直結する）:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
