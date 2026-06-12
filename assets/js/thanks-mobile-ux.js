/**
 * thanks-v2: スマホUX（フロー表示・スティッキーCTA・LINE先行→予約の段階表示）
 */
(function () {
  "use strict";

  var dock = document.getElementById("thanks-dock");
  var body = document.body;
  var lineCta = document.getElementById("line-cta");
  var dockLine = document.getElementById("thanks-dock-line");
  var dockBook = document.getElementById("thanks-dock-book");
  var lineBadge = document.getElementById("line-section-badge");
  var calInView = false;

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

  function isBooked() {
    return body.classList.contains("is-booked");
  }

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

  // LINE先行フロー: LINE未クリック→LINE CTA、クリック済み→予約CTA、両方完了→ドック退避
  function applyLineClickedUi() {
    if (!hasLineClicked()) return;
    body.classList.add("is-line-clicked");
    if (lineBadge && !isBooked()) {
      lineBadge.textContent = "② 開設済み — 全文はお電話後に届きます";
    }
    var next = document.getElementById("line-next-step");
    if (next) next.hidden = isBooked();
    var stepLine = document.querySelector('[data-step="line"]');
    var stepBooking = document.querySelector('[data-step="booking"]');
    if (stepLine) {
      stepLine.classList.remove("is-cur");
      stepLine.classList.add("is-done");
    }
    if (stepBooking && !stepBooking.classList.contains("is-done") && !isBooked()) {
      stepBooking.classList.add("is-cur");
    }
    updateDock();
  }

  window.dkThanksUnlockLine = function () {
    var next = document.getElementById("line-next-step");
    if (next) next.hidden = true;
    updateDock();
  };
  window.dkThanksRelockLine = function () {
    updateDock();
  };

  function isCalExpanded() {
    var panel = document.getElementById("t-cal-panel");
    return !!(panel && !panel.hidden);
  }

  function updateDock() {
    if (!dock) return;
    dock.hidden = false;
    body.classList.add("is-dock-visible");
    var lineDone = hasLineClicked();
    var booked = isBooked();
    if (dockLine) dockLine.hidden = lineDone;
    if (dockBook) dockBook.hidden = !lineDone || booked;
    // 両ステップ完了でドック退避。展開済みカレンダーが画面内の間も同じCTAが重複するため退避
    var allDone = lineDone && booked;
    var hideForCal = calInView && isCalExpanded() && !booked;
    dock.classList.toggle("is-visible", !(allDone || hideForCal));
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
    if (lineCta && dockLine) dockLine.href = lineCta.href;
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("thanks_line_cta_click", applyLineClickedUi);
  document.addEventListener("thanks_line_unlocked", function () {
    window.dkThanksUnlockLine();
  });
  applyLineClickedUi();
  onScroll();

  document.addEventListener("thanks_job_preview_refresh", onScroll);
  initCalendarCollapse();
  initDockCalendarWatch();
})();
