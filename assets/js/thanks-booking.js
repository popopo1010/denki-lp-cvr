/**
 * サンクス: TimeRex 埋め込み + 名前・メール事前入力（削除不可のため）
 */
(function () {
  var base = (window.TIMEREX_CALENDAR_BASE || "").replace(/\/$/, "");
  var section = document.getElementById("t-calendar");
  var host = document.getElementById("timerex_calendar");
  if (!section || !host) return;
  if (!base) {
    section.style.display = "none";
    return;
  }

  var tel = "";
  var name = "";
  var email = "";
  try {
    tel = sessionStorage.getItem("_tel") || "";
    name = sessionStorage.getItem("_name") || "";
    email = sessionStorage.getItem("_email") || "";
  } catch (e) {}

  if (!name) {
    var m = document.cookie.match(/(^| )user-name=([^;]+)/);
    if (m) name = decodeURIComponent(m[2]).trim();
  }

  if (!tel) {
    section.style.display = "none";
    return;
  }

  if (!email) {
    var digits = String(tel).replace(/[^0-9]/g, "");
    var domain = (window.TIMEREX_PLACEHOLDER_EMAIL_DOMAIN || "bookings.local").replace(/^@/, "");
    email = "lp+" + digits + "@" + domain;
  }

  var q = new URLSearchParams();
  if (name) q.set("guest_name", name);
  q.set("guest_email", email);

  var paramTel = window.TIMEREX_URL_PARAM_TEL || "your_tel";
  var paramLp = window.TIMEREX_URL_PARAM_LP || "lp_id";
  q.set(paramTel, tel);
  q.set(paramLp, "thanks");
  try {
    var lp = sessionStorage.getItem("_lp") || "";
    if (lp) q.set(paramLp, lp);
  } catch (e2) {}

  var url = base + (base.indexOf("?") >= 0 ? "&" : "?") + q.toString();
  host.setAttribute("data-url", url);

  function trackView() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "calendar_widget_view", page_type: "thanks" });
  }

  function fitTimerexThreeDays() {
    var scaler = document.querySelector(".t-cal__widget-scaler");
    var host = document.getElementById("timerex_calendar");
    if (!scaler || !host) return;

    var minW = Number(window.TIMEREX_EMBED_MIN_WIDTH) || 640;
    var available = scaler.clientWidth || minW;
    var scale = available >= minW ? 1 : available / minW;

    host.style.width = minW + "px";
    host.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
    host.style.transformOrigin = "top left";

    var innerH = host.offsetHeight || 520;
    scaler.style.height = Math.ceil(innerH * scale) + "px";

    var hint = document.querySelector(".t-cal__scroll-hint");
    if (hint) hint.style.display = "none";
  }

  function scheduleFit() {
    fitTimerexThreeDays();
    [400, 900, 1800, 3000].forEach(function (ms) {
      setTimeout(fitTimerexThreeDays, ms);
    });
  }

  function mountWidget() {
    var onReady = function () {
      if (typeof TimerexCalendar === "function") TimerexCalendar();
      trackView();
      scheduleFit();
    };
    if (typeof TimerexCalendar === "function") {
      onReady();
      return;
    }
    var existing = document.getElementById("timerex_embed");
    if (existing) {
      existing.addEventListener("load", onReady);
      return;
    }
    var s = document.createElement("script");
    s.id = "timerex_embed";
    s.src = "https://asset.timerex.net/js/embed.js";
    s.async = true;
    s.onload = onReady;
    document.body.appendChild(s);
  }

  mountWidget();
  window.addEventListener("resize", fitTimerexThreeDays);

  var scalerEl = document.querySelector(".t-cal__widget-scaler");
  if (scalerEl && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(fitTimerexThreeDays).observe(scalerEl);
  }

  /** メール登録後にウィジェットURLを更新（任意） */
  window.refreshTimerexBooking = function () {
    try {
      email = sessionStorage.getItem("_email") || email;
    } catch (e3) {}
    if (!email) return;
    var qq = new URLSearchParams();
    if (name) qq.set("guest_name", name);
    qq.set("guest_email", email);
    qq.set(paramTel, tel);
    try {
      var lp2 = sessionStorage.getItem("_lp") || "";
      qq.set(paramLp, lp2 || "thanks");
    } catch (e4) {}
    host.setAttribute("data-url", base + "?" + qq.toString());
    host.innerHTML = "";
    mountWidget();
    scheduleFit();
  };
})();
