/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・予約→LINEゲート）
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var flowItems = document.querySelectorAll(".t-flow__item");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var dockBook = document.getElementById("thanks-dock-book");
  var lineGateMsg = document.getElementById("line-gate-msg");
  var lineBadge = document.getElementById("line-section-badge");

  function scrollToTarget(sel) {
    var el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    if (
      el.id === "t-calendar" ||
      (typeof sel === "string" && sel === "#t-calendar")
    ) {
      expandCalendar({ scroll: false });
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function expandCalendar(opts) {
    opts = opts || {};
    var cal = document.getElementById("t-calendar");
    var panel = document.getElementById("t-cal-panel");
    var btn = document.getElementById("t-cal-toggle");
    if (!cal || !panel || !btn) return;
    panel.hidden = false;
    cal.classList.remove("t-cal--collapsed");
    btn.setAttribute("aria-expanded", "true");
    if (opts.scroll !== false) {
      cal.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (window.dataLayer) {
      window.dataLayer.push({
        event: "thanks_calendar_expand",
        page_type: "thanks-v2"
      });
    }
  }

  function collapseCalendar() {
    var cal = document.getElementById("t-calendar");
    var panel = document.getElementById("t-cal-panel");
    var btn = document.getElementById("t-cal-toggle");
    if (!cal || !panel || !btn) return;
    if (body.classList.contains("is-booked") || cal.classList.contains("t-cal--booked")) {
      return;
    }
    panel.hidden = true;
    cal.classList.add("t-cal--collapsed");
    btn.setAttribute("aria-expanded", "false");
  }

  function initCalendarCollapse() {
    var cal = document.getElementById("t-calendar");
    var btn = document.getElementById("t-cal-toggle");
    var panel = document.getElementById("t-cal-panel");
    if (!cal || !btn || !panel) return;

    if (body.classList.contains("is-booked") || cal.classList.contains("t-cal--booked")) {
      expandCalendar({ scroll: false });
      btn.hidden = true;
      return;
    }

    cal.classList.add("t-cal--collapsed");
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");

    btn.addEventListener("click", function () {
      if (btn.getAttribute("aria-expanded") === "true") {
        collapseCalendar();
      } else {
        expandCalendar({ scroll: false });
      }
    });
  }

  window.dkThanksExpandCalendar = expandCalendar;

  function bindScrollTriggers(root) {
    (root || document).querySelectorAll("[data-scroll-target]").forEach(function (btn) {
      if (btn._dkScrollBound) return;
      btn._dkScrollBound = true;
      btn.addEventListener("click", function () {
        scrollToTarget(btn.getAttribute("data-scroll-target"));
      });
    });
  }

  function isLineUnlocked() {
    return (
      body.classList.contains("is-booked") ||
      body.classList.contains("is-line-unlocked")
    );
  }

  function onLockedLineClick(e) {
    if (isLineUnlocked()) return;
    e.preventDefault();
    e.stopPropagation();
    scrollToTarget("#t-calendar");
    if (lineGateMsg) {
      lineGateMsg.classList.add("is-nudge");
      setTimeout(function () {
        lineGateMsg.classList.remove("is-nudge");
      }, 1200);
    }
  }

  function lockLineStep() {
    if (isLineUnlocked()) return;
    body.classList.add("is-line-locked");
    if (lineCta) {
      lineCta.setAttribute("aria-disabled", "true");
      lineCta.addEventListener("click", onLockedLineClick, true);
    }
    if (dockLine) {
      dockLine.setAttribute("aria-disabled", "true");
      dockLine.hidden = true;
    }
    if (dockBook) dockBook.hidden = false;
  }

  function unlockLineStep() {
    body.classList.remove("is-line-locked");
    body.classList.add("is-line-unlocked");
    if (lineCta) {
      lineCta.removeAttribute("aria-disabled");
      lineCta.removeEventListener("click", onLockedLineClick, true);
    }
    if (lineBadge) lineBadge.textContent = "③ 今すぐ — 全文の受取口";
    if (dockLine) {
      dockLine.hidden = false;
      dockLine.removeAttribute("aria-disabled");
    }
    if (dockBook) dockBook.hidden = true;
  }

  window.dkThanksUnlockLine = unlockLineStep;
  window.dkThanksRelockLine = lockLineStep;

  function updateDock() {
    if (!dock) return;
    dock.classList.add("is-visible");
    dock.hidden = false;
    body.classList.add("is-dock-visible");
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
    if (lineCta && dockLine) {
      dockLine.href = lineCta.href;
      dockLine.addEventListener("click", function (e) {
        if (!isLineUnlocked()) {
          onLockedLineClick(e);
          return;
        }
        lineCta.click();
      });
    }
  }

  flowItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      var href = item.getAttribute("href");
      if (!href || href.charAt(0) !== "#") return;
      if (href === "#line-section" && !isLineUnlocked()) {
        e.preventDefault();
        scrollToTarget("#t-calendar");
        return;
      }
      e.preventDefault();
      scrollToTarget(href);
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("thanks_line_unlocked", unlockLineStep);
  if (body.classList.contains("is-booked")) {
    unlockLineStep();
  } else {
    lockLineStep();
  }
  onScroll();

  document.addEventListener("thanks_job_preview_refresh", onScroll);
  initCalendarCollapse();
})();
