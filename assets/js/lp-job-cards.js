/**
 * FV直下の求人カード。
 *
 * 設計の要点（どれも壊すと本番で事故る）:
 *  - 取得は遅延。FVの画像とCTAの表示を邪魔しない（LCPを守る）。
 *  - 枠は固定高さ。データが何件来ても・来なくても枠が動かない（CLS対策。
 *    2026-07-08 に FV の picture で同じ問題を踏んでいる）。
 *  - 0件・取得失敗ならセクションごと消す。空カードや「準備中」を
 *    広告の着地に出さないため。
 *  - 出典と日付を必ず出す。仮データのうちは「求人例」と明記する。
 *
 * データは assets/data/lp-job-cards-<family>.json。実フィードに
 * 差し替えるときはJSONだけ入れ替えればよく、このJSは触らない。
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-lp-job-cards]");
  if (!root) return;

  var src = root.getAttribute("data-src");
  var limit = parseInt(root.getAttribute("data-limit"), 10) || 3;
  if (!src) return;

  var loaded = false;

  function hide() {
    root.hidden = true;
    root.style.minHeight = "0";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function salary(job) {
    if (job.salary_min == null && job.salary_max == null) return "";
    if (job.salary_min != null && job.salary_max != null)
      return "年収 " + job.salary_min + "〜" + job.salary_max + "万円";
    return "年収 " + (job.salary_min != null ? job.salary_min + "万円〜" : "〜" + job.salary_max + "万円");
  }

  function card(job) {
    var tags = (job.tags || []).slice(0, 2).map(function (t) {
      return '<span class="lp-job__tag">' + esc(t) + "</span>";
    }).join("");
    var pay = salary(job);
    return (
      '<article class="lp-job">' +
        '<p class="lp-job__title">' + esc(job.title) + "</p>" +
        '<p class="lp-job__meta">' +
          '<span class="lp-job__pref">' + esc(job.pref || "") + "</span>" +
          (pay ? '<b class="lp-job__pay">' + esc(pay) + "</b>" : "") +
        "</p>" +
        (tags ? '<p class="lp-job__tags">' + tags + "</p>" : "") +
      "</article>"
    );
  }

  function render(data) {
    var jobs = (data && data.jobs ? data.jobs : []).filter(function (j) {
      return j && j.is_public !== false && j.title;
    });
    if (!jobs.length) return hide();

    var shown = jobs.slice(0, limit);
    var note = data.is_sample
      ? "掲載条件の一例です（実在の求人ではありません）"
      : "掲載中の求人から抜粋" + (data.generated_at ? "（" + esc(data.generated_at) + " 時点）" : "");

    root.querySelector("[data-lp-job-cards-list]").innerHTML =
      shown.map(card).join("");
    root.querySelector("[data-lp-job-cards-note]").textContent = note;
    root.setAttribute("data-state", "ready");
    // 中身が決まったので高さの予約を解除する
    root.style.minHeight = "0";
  }

  function load() {
    if (loaded) return;
    loaded = true;
    fetch(src, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
      .then(render)
      .catch(hide);
  }

  // ビューポートに近づいてから取りに行く。IOが無い環境では load 後に取る。
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        load();
      }
    }, { rootMargin: "200px" });
    io.observe(root);
  } else if (document.readyState === "complete") {
    load();
  } else {
    window.addEventListener("load", load);
  }
})();
