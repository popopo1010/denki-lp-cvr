/**
 * thanks-v2: LP slug に応じたブランド・フォールバック職種
 */
(function () {
  var dk = window.dkThanks || {};
  var HERO_POINTS =
    "<ul class=\"t-hero__points\">" +
    "<li><strong>現職</strong>と<strong>選択肢</strong>を比べて、納得して選ぶ</li>" +
    "<li>まず<strong>比較軸の輪郭</strong>をお見せします</li>" +
    "<li>全文は<strong>10分のお電話</strong>ですり合わせ後にお送りします</li>" +
    "</ul>";

  function getLpSlug() {
    return dk.getLpSlug ? dk.getLpSlug() : "";
  }

  function getJobFamily(slug) {
    return dk.getJobFamily ? dk.getJobFamily(slug) : "denki";
  }

  var BRANDS = {
    denki: {
      siteName: "電気工事バンク",
      header:
        "電気工事士の求人募集・転職サイト[国内最大級] | 電気工事バンク",
      title: "登録完了 | 電気工事バンク",
      defaultLicense: "電気工事士",
      heroPoints: HERO_POINTS
    },
    sekoukanri: {
      siteName: "施工管理キャリア",
      header:
        "施工管理技士の求人募集・転職サイト[国内最大級] | 施工管理キャリア",
      title: "登録完了 | 施工管理キャリア",
      defaultLicense: "施工管理技士",
      heroPoints: HERO_POINTS
    }
  };

  function escHtml(s) {
    return dk.esc ? dk.esc(s) : String(s || "");
  }

  function getUserName() {
    return dk.getName ? dk.getName() : "";
  }

  function applyHero(brand) {
    var heroRoot =
      document.getElementById("thanks-hero-sub") ||
      document.querySelector(".t-hero__body");
    if (!heroRoot) return;
    var name = getUserName();
    var lead = name
      ? "<strong>" + escHtml(name) + "</strong>さん、登録ありがとうございます。"
      : "登録ありがとうございます。";
    heroRoot.innerHTML =
      "<p class=\"t-hero__lead\">" +
      lead +
      "転職を勧める場所ではありません。</p>" +
      (brand.heroPoints || HERO_POINTS);
  }

  function applyBrand() {
    var slug = getLpSlug();
    var family = getJobFamily(slug);
    var brand = BRANDS[family] || BRANDS.denki;

    document.documentElement.setAttribute("data-thanks-family", family);
    if (slug) document.documentElement.setAttribute("data-thanks-lp", slug);

    var theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement("meta");
      theme.name = "theme-color";
      document.head.appendChild(theme);
    }
    theme.content = family === "sekoukanri" ? "#1b5e20" : "#314c85";

    var titleEl = document.querySelector("title");
    if (titleEl) titleEl.textContent = brand.title;

    var headerEl =
      document.getElementById("thanks-header-text") ||
      document.querySelector(".l-header__title .adtext");
    if (headerEl) headerEl.textContent = brand.header;

    applyHero(brand);

    window.dkThanksContext = {
      lpSlug: slug,
      family: family,
      brand: brand,
      getLpSlug: getLpSlug,
      getJobFamily: getJobFamily
    };

    if (window.dkThanksWhenProfileReady) {
      window.dkThanksWhenProfileReady(function (profile) {
        if (profile && profile.job_family) {
          document.documentElement.setAttribute(
            "data-thanks-family",
            profile.job_family
          );
          window.dkThanksContext.family = profile.job_family;
          window.dkThanksContext.licenseProfile = profile;
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBrand);
  } else {
    applyBrand();
  }
})();
