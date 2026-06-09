(function () {
  var STORIES_URL =
    (window.dkThanks && window.dkThanks.assetUrl
      ? window.dkThanks.assetUrl("data/thanks-testimonial-stories.json")
      : null) || "../assets/data/thanks-testimonial-stories.json";
  var storiesCache = null;
  var storiesPromise = null;

  function setOpen(wrap, open) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    var body = wrap.querySelector(".cvr-testimonial__body");
    if (!btn || !body) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    wrap.classList.toggle("is-open", open);
  }

  function esc(s) {
    var dk = window.dkThanks;
    if (dk && dk.esc) return dk.esc(s);
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function storyParagraphs(story) {
    if (story.paragraphs && story.paragraphs.length) {
      return story.paragraphs;
    }
    var text = (story.text || "").trim();
    if (!text) return [];
    if (text.indexOf("\n") >= 0) {
      return text
        .split(/\n+/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
    }
    return [text];
  }

  function renderStory(story) {
    if (!story) return "";
    var needs = (story.needs || [])
      .map(function (n) {
        return '<span class="cvr-story__need">' + esc(n) + "</span>";
      })
      .join("");
    var paras = storyParagraphs(story)
      .map(function (p) {
        return '<p class="cvr-story__para">' + esc(p) + "</p>";
      })
      .join("");
    return (
      '<div class="cvr-story">' +
      '<p class="cvr-story__lead-label">転職の背景・ニーズ</p>' +
      '<div class="cvr-story__needs">' +
      needs +
      "</div>" +
      '<div class="cvr-story__text">' +
      paras +
      "</div>" +
      "</div>"
    );
  }

  function mountStories(stories) {
    if (!stories) return;
    document.querySelectorAll(".cvr-testimonial[data-story-id]").forEach(function (card) {
      var id = card.getAttribute("data-story-id");
      var mount = card.querySelector(".cvr-story-mount");
      var story = stories[id];
      if (!mount || !story || mount.dataset.storyMounted) return;
      mount.innerHTML = renderStory(story);
      mount.dataset.storyMounted = "1";
    });
  }

  function loadStories() {
    if (storiesCache) return Promise.resolve(storiesCache);
    if (storiesPromise) return storiesPromise;
    storiesPromise = fetch(STORIES_URL, { credentials: "same-origin", cache: "default" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        storiesCache = (json && json.stories) || null;
        return storiesCache;
      })
      .catch(function () {
        return null;
      });
    return storiesPromise;
  }

  function ensureStoriesMounted() {
    return loadStories().then(function (stories) {
      if (stories) mountStories(stories);
      return stories;
    });
  }

  document.querySelectorAll(".cvr-testimonial__more").forEach(function (wrap) {
    var btn = wrap.querySelector(".cvr-testimonial__toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var opening = btn.getAttribute("aria-expanded") !== "true";
      if (opening) {
        ensureStoriesMounted().finally(function () {
          setOpen(wrap, true);
        });
        return;
      }
      setOpen(wrap, false);
    });
  });

  function readUserLicense() {
    if (window.dkThanks && window.dkThanks.readLeadProfile) {
      return window.dkThanks.readLeadProfile().license || "";
    }
    if (window.dkThanksLicenseProfile && window.dkThanksLicenseProfile.label) {
      return window.dkThanksLicenseProfile.label;
    }
    try {
      return sessionStorage.getItem("_license") || "";
    } catch (e0) {
      return "";
    }
  }

  function scoreLicenseMatch(cardLicenses, userLicense) {
    if (!userLicense) return 0;
    var user = String(userLicense).toLowerCase();
    var parts = String(cardLicenses || "")
      .split(",")
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);
    var best = 0;
    parts.forEach(function (part) {
      if (!part) return;
      if (user === part) best = Math.max(best, 14);
      else if (user.indexOf(part) >= 0 || part.indexOf(user) >= 0) {
        best = Math.max(best, 10);
      } else if (part.indexOf("電気") >= 0 && user.indexOf("電気") >= 0) {
        best = Math.max(best, 6);
      } else if (part.indexOf("施工管理") >= 0 && user.indexOf("施工管理") >= 0) {
        best = Math.max(best, 6);
      }
    });
    return best;
  }

  function pickSocialTestimonialCard(profile) {
    var cards = Array.from(
      document.querySelectorAll(".cvr-testimonial[data-story-id]")
    ).filter(function (card) {
      return card.style.display !== "none";
    });
    if (!cards.length) return null;

    if (profile && profile.featured_story) {
      var featured = cards.find(function (card) {
        return card.getAttribute("data-story-id") === profile.featured_story;
      });
      if (featured) return featured;
    }

    var userLic = (profile && profile.label) || readUserLicense();
    var bestScore = 0;
    var bestCard = null;
    cards.forEach(function (card) {
      var score = scoreLicenseMatch(card.getAttribute("data-license") || "", userLic);
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    });
    if (bestCard) return bestCard;

    var family =
      (window.dkThanksContext && window.dkThanksContext.family) ||
      document.documentElement.getAttribute("data-thanks-family") ||
      "denki";
    var fallbackId = family === "sekoukanri" ? "kt" : "sm";
    return (
      cards.find(function (card) {
        return card.getAttribute("data-story-id") === fallbackId;
      }) || cards[0]
    );
  }

  function applySocialStrip(profile) {
    var strip = document.getElementById("thanks-social-strip");
    if (!strip) return;

    var card = pickSocialTestimonialCard(profile);
    if (!card) return;

    var avatarSrc = card.querySelector(".cvr-testimonial__avatar img");
    var avatarEl = strip.querySelector(".t-social-strip__avatar");
    if (avatarEl && avatarSrc && avatarSrc.getAttribute("src")) {
      avatarEl.src = avatarSrc.getAttribute("src");
    }

    var nameEl = card.querySelector(".cvr-testimonial__name");
    var roleEl = card.querySelector(".cvr-testimonial__role");
    var metaEl = strip.querySelector(".t-social-strip__meta");
    if (metaEl && nameEl) {
      var roleText = roleEl ? roleEl.textContent.trim() : "";
      metaEl.innerHTML =
        "<strong>" +
        esc(nameEl.textContent.trim()) +
        "</strong>" +
        (roleText ? " · " + esc(roleText) : "");
    }

    var teaserEl = card.querySelector(".cvr-testimonial__teaser");
    var quoteEl = strip.querySelector(".t-social-strip__quote");
    if (quoteEl && teaserEl) {
      var quote = teaserEl.textContent.trim();
      if (quote.charAt(0) !== "「") quote = "「" + quote;
      if (quote.slice(-1) !== "」") quote = quote + "」";
      quoteEl.textContent = quote;
    }

    var storyId = card.getAttribute("data-story-id") || "";
    var linkEl = strip.querySelector(".t-social-strip__link");
    if (linkEl && storyId) {
      linkEl.href = "#t-testi";
      linkEl.setAttribute("data-story-target", storyId);
    }
    strip.setAttribute("data-story-id", storyId);
  }

  function applyLicenseProfile(profile) {
    var root = document.querySelector(".cvr-testimonials--rich");
    if (!root || !profile) return;

    var cards = Array.from(root.querySelectorAll(".cvr-testimonial"));
    var byStory = {};
    cards.forEach(function (card) {
      byStory[card.getAttribute("data-story-id")] = card;
    });

    cards.forEach(function (card) {
      card.style.display = "";
      card.classList.remove("cvr-testimonial--featured", "cvr-testimonial--match");
    });

    (profile.hidden_stories || []).forEach(function (id) {
      if (byStory[id]) byStory[id].style.display = "none";
    });

    var order = [];
    if (profile.featured_story) order.push(profile.featured_story);
    (profile.story_order || []).forEach(function (id) {
      if (order.indexOf(id) === -1) order.push(id);
    });

    var anchor =
      root.querySelector(".cvr-testimonials__filter") ||
      root.querySelector(".cvr-testimonials__summary");

    order.forEach(function (id) {
      var card = byStory[id];
      if (!card || card.style.display === "none") return;
      if (id === profile.featured_story) {
        card.classList.add("cvr-testimonial--featured");
      }
      card.classList.add("cvr-testimonial--match");
      if (anchor) {
        anchor.insertAdjacentElement("afterend", card);
        anchor = card;
      }
    });

    cards.forEach(function (card) {
      if (card.style.display === "none") return;
      if (order.indexOf(card.getAttribute("data-story-id")) >= 0) return;
      if (anchor) {
        anchor.insertAdjacentElement("afterend", card);
        anchor = card;
      }
    });

    var filterNote = root.querySelector(".cvr-testimonials__filter");
    if (!filterNote) {
      filterNote = document.createElement("p");
      filterNote.className = "cvr-testimonials__filter";
      var summary = root.querySelector(".cvr-testimonials__summary");
      if (summary) summary.insertAdjacentElement("afterend", filterNote);
      else root.insertBefore(filterNote, cards[0] || null);
    }
    filterNote.textContent =
      "ご登録の「" + (profile.label || "資格") + "」に近い事例を先に表示しています";
    filterNote.hidden = !profile.label;

    limitVisibleTestimonials(root);
    applySocialStrip(profile);
  }

  function limitVisibleTestimonials(root) {
    if (!root) return;
    root.querySelectorAll(".cvr-testimonials__more-btn").forEach(function (b) {
      b.remove();
    });
    root.querySelectorAll(".cvr-testimonial--extra").forEach(function (c) {
      c.classList.remove("cvr-testimonial--extra");
    });
    var visible = Array.from(root.querySelectorAll(".cvr-testimonial")).filter(function (c) {
      return c.style.display !== "none";
    });
    if (visible.length <= 3) return;
    var hiddenCount = visible.length - 3;
    visible.forEach(function (card, i) {
      if (i >= 3) card.classList.add("cvr-testimonial--extra");
    });
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cvr-testimonials__more-btn";
    btn.textContent = "他の体験談を見る（" + hiddenCount + "件）";
    btn.addEventListener("click", function () {
      visible.forEach(function (c) {
        c.classList.remove("cvr-testimonial--extra");
      });
      btn.remove();
    });
    root.appendChild(btn);
  }

  function initTestimonials() {
    if (window.dkThanksWhenProfileReady) {
      window.dkThanksWhenProfileReady(applyLicenseProfile);
    } else if (window.dkThanksLicenseProfile) {
      applyLicenseProfile(window.dkThanksLicenseProfile);
    } else {
      applySocialStrip(null);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTestimonials);
  } else {
    initTestimonials();
  }
})();
