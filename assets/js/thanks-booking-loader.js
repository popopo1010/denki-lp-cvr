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
  s.src = src;
  s.async = true;
  document.head.appendChild(s);
})();
