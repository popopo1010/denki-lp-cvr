/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・予約→LINEゲート）
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var dockBook = document.getElementById("thanks-dock-book");
  var lineGateMsg = document.getElementById("line-gate-msg");
  var lineBadge = document.getElementById("line-section-badge");
  var calInView = false;

  function setCalToggleLabel(btn, expanded) {
    var label = btn && btn.querySelector(".t-cal__toggle-label");
    if (!label) return;
    label.textContent = expanded ? "日時の選択を閉じる" : "希望条件を伝える日時を選ぶ";
  }

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
    setCalToggleLabel(btn, true);
    if (window.dkThanksMountBooking) window.dkThanksMountBooking();
    updateDock();
    try {
      document.dispatchEvent(new CustomEvent("thanks_calendar_expand"));
    } catch (e0) {}
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
    setCalToggleLabel(btn, false);
    updateDock();
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

    // 日時選択が主アクションのため、デフォルトは展開（HTML側も展開状態）。トグルは「閉じる」操作のみ
    panel.hidden = false;
    cal.classList.remove("t-cal--collapsed");
    btn.setAttribute("aria-expanded", "true");
    setCalToggleLabel(btn, true);
    if (window.dkThanksMountBooking) window.dkThanksMountBooking();

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
    updateDock();
  }

  window.dkThanksUnlockLine = unlockLineStep;
  window.dkThanksRelockLine = lockLineStep;

  function isCalExpanded() {
    var panel = document.getElementById("t-cal-panel");
    return !!(panel && !panel.hidden);
  }

  function updateDock() {
    if (!dock) return;
    dock.hidden = false;
    body.classList.add("is-dock-visible");
    // 展開済みカレンダーが画面内にある間は同じCTAが重複するため退避（折りたたみ中・予約後は表示継続）
    var hide = calInView && isCalExpanded() && !isLineUnlocked();
    dock.classList.toggle("is-visible", !hide);
  }

  function initDockCalendarWatch() {
    var cal = document.getElementById("t-calendar");
    if (!dock || !cal || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(
      function (entries) {
        calInView = !!(entries[0] && entries[0].isIntersecting);
        updateDock();
      },
      { threshold: 0.01 }
    ).observe(cal);
  }

  function onScroll() {
    updateDock();
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
  initDockCalendarWatch();
})();
