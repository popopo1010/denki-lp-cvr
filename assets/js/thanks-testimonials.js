(function () {
  function setOpen(wrap, open) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    var body = wrap.querySelector(".cvr-testimonial__body");
    if (!btn || !body) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    wrap.classList.toggle("is-open", open);
  }

  document.querySelectorAll(".cvr-testimonial__more").forEach(function (wrap) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      setOpen(wrap, btn.getAttribute("aria-expanded") !== "true");
    });
  });
})();
