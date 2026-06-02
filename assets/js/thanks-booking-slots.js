/**
 * @deprecated thanks-booking-bootstrap.js を使用してください。
 * deploy の minify 互換のため残置。読み込まれた場合は bootstrap に委譲します。
 */
(function () {
  if (window.dkBookingSlotsFetch) {
    window.__dkBookingSlotsPromise =
      window.__dkBookingSlotsPromise || window.dkBookingSlotsFetch(false);
    return;
  }
  var base = document.currentScript && document.currentScript.src;
  if (!base) return;
  var url = base.replace(/thanks-booking-slots\.js.*$/, "thanks-booking-bootstrap.js?v=11");
  var s = document.createElement("script");
  s.src = url;
  s.async = false;
  document.head.appendChild(s);
})();
