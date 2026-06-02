(function () {
  var mode = (window.THANKS_BOOKING_MODE || "custom").toLowerCase();
  var src =
    mode === "timerex"
      ? "thanks-booking.js"
      : "thanks-booking-custom.js";
  var base = document.currentScript && document.currentScript.src;
  if (base) {
    src = base.replace(/thanks-booking-loader\.js.*$/, src);
  }
  var s = document.createElement("script");
  s.src = src.split("?")[0] + "?v=7";
  s.async = true;
  document.head.appendChild(s);
})();
