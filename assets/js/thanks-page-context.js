/**
 * thanks-v2: LP slug に応じたブランド・ヒーロー（便益ファースト）
 */
(function () {
  var dk = window.dkThanks || {};
  var currentBrand = null;

  var HERO_JOB_COUNT = 3;

  function getLpSlug() {
    return dk.getLpSlug ? dk.getLpSlug() : "";
  }

  function getJobFamily(slug) {
    return dk.getJobFamily ? dk.getJobFamily(slug) : "denki";
  }

  var BRANDS = {
    denki: {
      siteName: "電気工事バンク",
      header: "登録ありがとうございます | 電気工事バンク",
      title: "登録完了 | 電気工事バンク",
      defaultLicense: "電気工事士",
    },
    sekoukanri: {
      siteName: "施工管理キャリア",
      header: "登録ありがとうございます | 施工管理キャリア",
      title: "登録完了 | 施工管理キャリア",
      defaultLicense: "施工管理技士",
    },
  };

  function escHtml(s) {
    return dk.esc ? dk.esc(s) : String(s || "");
  }

  function getUserName() {
    return dk.getName ? dk.getName() : "";
  }

  function readLeadProfile() {
    var profile = { license: "", pref: "", city: "" };
    try {
      var raw = sessionStorage.getItem("dk_lead_profile");
      if (raw) {
        var p = JSON.parse(raw);
        profile.license = String((p && p.license) || "").trim();
        profile.pref = String((p && p.pref) || "").trim();
        profile.city = String((p && p.city) || "").trim();
      }
    } catch (e1) {}
    if (!profile.license) {
      try {
        profile.license = (sessionStorage.getItem("_license") || "").trim();
      } catch (e2) {}
    }
    if (!profile.license && window.dkThanksLicenseProfile) {
      profile.license =
        window.dkThanksLicenseProfile.label ||
        window.dkThanksLicenseProfile.short_label ||
        "";
    }
    return profile;
  }

  /** cookie / session の「姓 名」→ 表示用「姓様」 */
  function formatDisplayName(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    return s.split(/\s+/)[0] + "様";
  }

  function shortLicenseLabel(license, brand) {
    if (!license) return (brand && brand.defaultLicense) || "ご登録資格";
    var s = String(license);
    if (s.indexOf("第二種") >= 0 || s.indexOf("2種") >= 0) return "2種";
    if (
      (s.indexOf("第一種") >= 0 || s.indexOf("1種") >= 0) &&
      s.indexOf("施工") < 0
    ) {
      return "1種";
    }
    if (s.indexOf("主任") >= 0) return "主任";
    if (s.indexOf("1級") >= 0 && s.indexOf("施工") >= 0) return "施工1級";
    if (s.indexOf("2級") >= 0 && s.indexOf("施工") >= 0) return "施工2級";
    if (s.indexOf("建築") >= 0 && s.indexOf("1級") >= 0) return "建築1級";
    if (s.indexOf("建築") >= 0 && s.indexOf("2級") >= 0) return "建築2級";
    if (s.indexOf("土木") >= 0 && s.indexOf("1級") >= 0) return "土木1級";
    if (s.indexOf("土木") >= 0 && s.indexOf("2級") >= 0) return "土木2級";
    if (s.length > 7) return s.slice(0, 7);
    return s;
  }

  function buildHeroTitle(name) {
    var display = formatDisplayName(name);
    return display
      ? display + "、3件届きました"
      : "3件、届きました";
  }

  function buildHeroGiftLine(profile, brand) {
    var b = brand || currentBrand || BRANDS.denki;
    var lic = shortLicenseLabel(profile.license, b);
    var parts = [lic + "向け"];
    if (profile.pref) parts.push(profile.pref);
    parts.push("非公開" + HERO_JOB_COUNT + "件");
    return parts.join(" · ");
  }

  function applyHero() {
    var name = getUserName();
    var profile = readLeadProfile();
    var titleEl = document.getElementById("thanks-hero-title");
    if (titleEl) titleEl.textContent = buildHeroTitle(name);

    var giftLine = document.getElementById("thanks-hero-gift-line");
    if (giftLine) {
      giftLine.textContent = buildHeroGiftLine(profile, currentBrand);
    }

    var moreEl = document.querySelector(".t-hero__more");
    if (moreEl) {
      moreEl.hidden = false;
    }
  }

  dk.buildHeroTitle = buildHeroTitle;
  dk.buildHeroGiftLine = buildHeroGiftLine;
  dk.applyInitialHero = applyHero;
  dk.readLeadProfile = readLeadProfile;

  function applyBrand() {
    var slug = getLpSlug();
    var family = getJobFamily(slug);
    var brand = BRANDS[family] || BRANDS.denki;
    currentBrand = brand;

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

    applyHero();

    window.dkThanksContext = {
      lpSlug: slug,
      family: family,
      brand: brand,
      getLpSlug: getLpSlug,
      getJobFamily: getJobFamily,
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
        applyHero();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBrand);
  } else {
    applyBrand();
  }
})();
