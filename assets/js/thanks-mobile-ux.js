/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・LINE一本化）
 * 日程調整カレンダー（③予約）は廃止。日程調整は登録後のLINEで実施するため、
 * thanks ページの主アクションは LINE 登録のみ。
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var lineBadge = document.getElementById("line-section-badge");

  function hasLineClicked() {
    if (window.dkThanks && window.dkThanks.hasLineClicked) {
      return window.dkThanks.hasLineClicked();
    }
    try {
      return sessionStorage.getItem("dk_line_clicked") === "1";
    } catch (e) {
      return false;
    }
  }

  function bindScrollTriggers(root) {
    (root || document).querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._dkScrollBound) return;
      btn._dkScrollBound = true;
      btn.addEventListener("click", function () {
        var el = document.querySelector(btn.getAttribute("data-scroll-target"));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // LINE一本化: クリック済みなら受け取り口の開設完了を表示（CTAは出し続ける）
  function applyLineClickedUi() {
    if (!hasLineClicked()) return;
    body.classList.add("is-line-clicked");
    if (lineBadge) {
      lineBadge.textContent = "② 開設済み — 全文はお電話後に届きます";
    }
    var next = document.getElementById("line-next-step");
    if (next) next.hidden = false;
    var stepLine = document.querySelector('[data-step="line"]');
    if (stepLine) {
      stepLine.classList.remove("is-cur");
      stepLine.classList.add("is-done");
    }
    updateDock();
  }

  function updateDock() {
    if (!dock) return;
    dock.hidden = false;
    body.classList.add("is-dock-visible");
    // LINEが唯一のCVのため、ドックのLINE CTAは常時表示し続ける
    if (dockLine) dockLine.hidden = false;
    dock.classList.add("is-visible");
  }

  bindScrollTriggers(document);
  if (dock) {
    bindScrollTriggers(dock);
    if (lineCta && dockLine) dockLine.href = lineCta.href;
  }

  document.addEventListener("thanks_line_cta_click", applyLineClickedUi);
  applyLineClickedUi();
  updateDock();

  document.addEventListener("thanks_job_preview_refresh", updateDock);
})();
