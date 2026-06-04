/**
 * thanks-v2: LP slug に応じたブランド・フォールバック職種
 */
(function () {
  var dk = window.dkThanks || {};
  var HERO_OBJECTIONS =
    "<ul class=\"t-hero__objections\" aria-label=\"よくある不安\">" +
    "<li>押し売りなし</li>" +
    "<li>10分だけ</li>" +
    "<li>転職しなくてOK</li>" +
    "</ul>";
  var HERO_STEPS =
    "<ol class=\"t-hero__steps\">" +
    "<li><span class=\"t-hero__step-text\">求人の<strong>概要</strong>を見る</span></li>" +
    "<li><span class=\"t-hero__step-text\"><strong>10分</strong>の電話で日時を選ぶ</span></li>" +
    "<li><span class=\"t-hero__step-text\">ヒアリング後、<strong>全文</strong>をお送り</span></li>" +
    "</ol>";

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
      heroSteps: HERO_STEPS
    },
    sekoukanri: {
      siteName: "施工管理キャリア",
      header:
        "施工管理技士の求人募集・転職サイト[国内最大級] | 施工管理キャリア",
      title: "登録完了 | 施工管理キャリア",
      defaultLicense: "施工管理技士",
      heroSteps: HERO_STEPS
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
    var nameLine = name
      ? "<p class=\"t-hero__name\">" + escHtml(name) + "さん</p>"
      : "";
    heroRoot.innerHTML =
      nameLine +
      "<p class=\"t-hero__lead\">登録ありがとうございます</p>" +
      "<p class=\"t-hero__sub\">転職を勧める場所ではありません。現職と選択肢を比べて、納得して選んでください。</p>" +
      HERO_OBJECTIONS +
      (brand.heroSteps || HERO_STEPS);
    if (window.dkThanksSectionVisuals && window.dkThanksSectionVisuals.decorateHeroSteps) {
      window.dkThanksSectionVisuals.decorateHeroSteps();
    }
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
