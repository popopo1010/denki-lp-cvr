/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・スクロール連動）
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var flowItems = document.querySelectorAll(".t-flow__item");
  var body = document.body;

  function scrollToTarget(sel) {
    var el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindScrollTriggers(root) {
    (root || document).querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._dkScrollBound) return;
      btn._dkScrollBound = true;
      btn.addEventListener("click", function () {
        scrollToTarget(btn.getAttribute("data-scroll-target"));
      });
    });
  }

  function updateDock() {
    if (!dock) return;
    var y = window.scrollY || window.pageYOffset;
    var show = y > 280;
    dock.classList.toggle("is-visible", show);
    dock.hidden = !show;
    body.classList.toggle("is-dock-visible", show);
  }

  function updateFlowActive() {
    if (!flowItems.length) return;
    var sections = [
      { id: "t-jobs-preview", step: "1" },
      { id: "t-calendar", step: "2" },
      { id: "line-section", step: "3" }
    ];
    var scrollY = (window.scrollY || 0) + 120;
    var current = sections[0].step;
    sections.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el && el.offsetTop <= scrollY) current = s.step;
    });
    flowItems.forEach(function (item) {
      var step = item.getAttribute("data-step");
      item.classList.toggle("is-active", step === current);
      item.classList.toggle(
        "is-done",
        step && parseInt(step, 10) < parseInt(current, 10)
      );
    });
  }

  function onScroll() {
    updateDock();
    updateFlowActive();
  }

  bindScrollTriggers(document);
  if (dock) {
    bindScrollTriggers(dock);
    var lineHref = document.getElementById("line-cta");
    var dockLine = dock.querySelector(".t-dock__btn--line");
    if (lineHref && dockLine) {
      dockLine.href = lineHref.href;
      dockLine.addEventListener("click", function () {
        lineHref.click();
      });
    }
  }

  flowItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      var href = item.getAttribute("href");
      if (!href || href.charAt(0) !== "#") return;
      e.preventDefault();
      scrollToTarget(href);
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.addEventListener("thanks_job_preview_refresh", onScroll);
})();
