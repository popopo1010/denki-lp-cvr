/**
 * LINE CTA クリック → GAS へ sendBeacon（Slack/スプシ連携用）
 */
(function () {
  "use strict";
  var dk = window.dkThanks || {};
  var GAS_URL = dk.GAS_URL || window.LP_BOOKING_GAS_URL || "";
  if (!GAS_URL) return;

  var tel = dk.getTel ? dk.getTel() : "";
  var lineNotifiedOnce = false;

  function notifyLineClick() {
    if (lineNotifiedOnce || !tel) return;
    lineNotifiedOnce = true;
    var p = new URLSearchParams();
    p.append("_event", "line_click");
    p.append("your-tel", tel);
    var lpId = "thanks";
    try {
      lpId =
        sessionStorage.getItem("_lp") ||
        new URLSearchParams(location.search).get("lp") ||
        lpId;
    } catch (e2) {}
    p.append("_lp", lpId);
    p.append("_page", location.href);
    var body = p.toString();
    var blob = new Blob([body], {
      type: "application/x-www-form-urlencoded;charset=UTF-8"
    });
    if (!(navigator.sendBeacon && navigator.sendBeacon(GAS_URL, blob))) {
      fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        body: body
      }).catch(function () {});
    }
  }

  var lineBtn = document.getElementById("line-cta");
  if (lineBtn) lineBtn.addEventListener("click", notifyLineClick);
})();
