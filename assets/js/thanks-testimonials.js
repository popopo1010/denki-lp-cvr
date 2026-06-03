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

  var root = document.querySelector(".cvr-testimonials--rich");
  if (!root) return;

  var featured = root.querySelector(".cvr-testimonial--featured");
  var trust = root.querySelector(".cvr-testimonial--trust");
  if (featured && trust && trust.previousElementSibling !== featured) {
    featured.insertAdjacentElement("afterend", trust);
  }

  var license = "";
  try {
    license = (sessionStorage.getItem("_license") || "").trim();
  } catch (e) { /* private mode */ }
  if (!license) return;

  var cards = Array.from(root.querySelectorAll(".cvr-testimonial"));
  function tagMatches(tag) {
    if (!tag || !license) return false;
    if (license === tag) return true;
    if (tag.length < 3) return false;
    return license.indexOf(tag) >= 0 || tag.indexOf(license) >= 0;
  }

  function matches(card) {
    var tags = (card.getAttribute("data-license") || "")
      .split(/[,、]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return tags.some(tagMatches);
  }

  var filterNote = root.querySelector(".cvr-testimonials__filter");
  if (!filterNote) {
    filterNote = document.createElement("p");
    filterNote.className = "cvr-testimonials__filter";
    var summary = root.querySelector(".cvr-testimonials__summary");
    if (summary) summary.insertAdjacentElement("afterend", filterNote);
    else root.insertBefore(filterNote, cards[0] || null);
  }
  filterNote.textContent =
    "ご登録の「" + license + "」に近い事例を先に表示しています";

  var matched = [];
  var rest = [];
  cards.forEach(function (card) {
    if (matches(card)) {
      card.classList.add("cvr-testimonial--match");
      matched.push(card);
    } else {
      rest.push(card);
    }
  });
  if (!matched.length) {
    filterNote.hidden = true;
    return;
  }

  var anchor = featured || matched[0];
  matched.forEach(function (card) {
    if (card === anchor) return;
    anchor.insertAdjacentElement("afterend", card);
    anchor = card;
  });
  rest.forEach(function (card) {
    if (card === featured) return;
    anchor.insertAdjacentElement("afterend", card);
    anchor = card;
  });
})();
