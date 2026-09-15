/**
 * 会社情報の下の「エリアから探す」（2026-09-15 オーナー依頼）。
 *
 * 設計の要点:
 *  - タップは FV の選択肢を「実際にクリックする」ことでフォームへ進める
 *    （lp-job-cards.js と同じ流儀。遷移・クマ移動・form_step 計測は既存ハンドラに任せ、
 *    ここで新しい経路を作らない）。
 *  - 押したエリアは、都道府県ステップ(step04)の <select id="pref"> で
 *    そのエリアの都道府県を先頭の optgroup にまとめて出す（1手減らす）。
 *    絞り込みは「先頭に寄せる」だけで、他エリアは下に残す（誤タップの行き止まりを作らない）。
 *  - steps-lazy.html は遅延取得なので、タップ時点で #pref が無いことがある。
 *    注入・初期化（app.js の initPrefSelect）を MutationObserver で待ってから並べ替える。
 *    並べ替えは option 要素を移動するだけ（value/テキストは触らない。app.js は
 *    selectedIndex のテキストを your-pref に入れるので、移動しても壊れない）。
 *  - 計測: dataLayer に lp_area_click（lp_area=エリア名）。
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-lp-area-nav]");
  if (!root) return;

  // app.js の REGIONS（都道府県セレクトの optgroup）と同じ区分。北海道・東北だけ2つに分ける。
  var AREAS = {
    "北海道": ["北海道"],
    "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "関東": ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"],
    "北陸・甲信越": ["新潟県", "長野県", "山梨県", "石川県", "富山県", "福井県"],
    "東海": ["愛知県", "静岡県", "岐阜県", "三重県"],
    "関西": ["大阪府", "兵庫県", "京都府", "滋賀県", "奈良県", "和歌山県"],
    "中国・四国": ["広島県", "岡山県", "山口県", "鳥取県", "島根県", "愛媛県", "香川県", "徳島県", "高知県"],
    "九州・沖縄": ["福岡県", "熊本県", "鹿児島県", "長崎県", "大分県", "宮崎県", "佐賀県", "沖縄県"]
  };

  var pending = null;   // 並べ替え待ちのエリア名
  var observer = null;
  var deadline = null;

  function prefReady() {
    var sel = document.getElementById("pref");
    return sel && sel.options && sel.options.length > 1 ? sel : null;
  }

  // 選んだエリアの都道府県を先頭の optgroup にまとめる。冪等（同じエリアで何度呼んでもよい）。
  function applyArea(sel, area) {
    var wanted = AREAS[area];
    if (!wanted) return false;
    var byText = {};
    Array.prototype.forEach.call(sel.options, function (o) { byText[o.textContent.trim()] = o; });
    var group = document.createElement("optgroup");
    group.label = area + "（選択したエリア）";
    group.setAttribute("data-lp-area", area);
    wanted.forEach(function (name) {
      var o = byText[name];
      if (o) group.appendChild(o); // appendChild は移動（元の optgroup から外れる）
    });
    if (!group.children.length) return false;
    // 既に付けたエリア用グループは外す（別エリアを押し直したとき）
    Array.prototype.slice.call(sel.querySelectorAll("optgroup[data-lp-area]")).forEach(function (g) {
      Array.prototype.slice.call(g.children).forEach(function (o) { sel.appendChild(o); });
      g.remove();
    });
    // 空になった optgroup を片付ける
    Array.prototype.slice.call(sel.querySelectorAll("optgroup")).forEach(function (g) {
      if (!g.children.length) g.remove();
    });
    // 先頭の「都道府県を選択」(disabled placeholder) の直後に入れる
    var first = sel.options[0];
    if (first && first.disabled && first.parentNode === sel) sel.insertBefore(group, first.nextSibling);
    else sel.insertBefore(group, sel.firstChild);
    sel.setAttribute("data-lp-area", area);
    return true;
  }

  function stopWaiting() {
    if (observer) { observer.disconnect(); observer = null; }
    if (deadline) { clearTimeout(deadline); deadline = null; }
  }

  function tryApply() {
    if (!pending) return;
    var sel = prefReady();
    if (!sel) return;
    if (applyArea(sel, pending)) { pending = null; stopWaiting(); }
  }

  function waitForPref() {
    stopWaiting();
    if (!("MutationObserver" in window)) return;
    observer = new MutationObserver(tryApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // 遅延ステップの取得に失敗した等で永久に来ないときのため、待ち続けない
    deadline = setTimeout(stopWaiting, 20000);
  }

  root.addEventListener("click", function (e) {
    var hit = e.target && e.target.closest && e.target.closest("[data-lp-area]");
    if (!hit || !root.contains(hit)) return;
    var area = hit.getAttribute("data-lp-area");
    if (!AREAS[area]) return;
    pending = area;
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "lp_area_click", lp_area: area });
    } catch (err) {}
    // #pref が既にあれば即並べ替え、無ければ注入を待つ
    tryApply();
    if (pending) waitForPref();
    // FV の選択肢を実際にクリックしてフォームへ（求人カードと同じ選択肢）
    var opt = document.querySelector(
      '#step-first .js-radio-button[data-value="今は情報収集したい"]'
    ) || document.querySelector("#step-first .js-radio-button:last-of-type");
    if (opt) opt.click();
  });
})();
