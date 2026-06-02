(function () {
  var base = document.currentScript && document.currentScript.src;
  if (!base) return;

  function loadScript(url, next) {
    var s = document.createElement("script");
    s.src = url;
    s.async = false;
    s.onload = function () {
      if (next) next();
    };
    s.onerror = function () {
      if (next) next();
    };
    document.head.appendChild(s);
  }

  var bootUrl = base.replace(/thanks-booking-loader\.js.*$/, "thanks-booking-bootstrap.js?v=11");
  var mode = (window.THANKS_BOOKING_MODE || "custom").toLowerCase();
  var uiFile = mode === "timerex" ? "thanks-booking.js" : "thanks-booking-custom.js";
  var uiUrl = base.replace(/thanks-booking-loader\.js.*$/, uiFile + "?v=11");

  if (window.dkBookingSlotsFetch) {
    loadScript(uiUrl);
    return;
  }

  loadScript(bootUrl, function () {
    loadScript(uiUrl);
  });
})();
