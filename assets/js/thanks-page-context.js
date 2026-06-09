/**
 * thanks-v2: LP slug に応じたブランド・ヒーロー（感情→返報→行動→大分類）
 */
(function () {
  var dk = window.dkThanks || {};
  var currentBrand = null;

  var HERO_REASSURE =
    "<p class=\"t-hero__reassure\">" +
    "「転職エージェント＝長い面談・押し売り」というイメージは<strong>当社では当てはまりません</strong>" +
    "（10分・合わなければその場で終了）" +
    "</p>";

  var HERO_ROUTE =
    "<p class=\"t-hero__route\">" +
    "まず下の<strong>概要</strong>をご覧ください。気になる方は<strong>日時</strong>を選ぶだけ。" +
    "</p>";

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
      header:
        "電気工事士の求人募集・転職サイト[国内最大級] | 電気工事バンク",
      title: "登録完了 | 電気工事バンク",
      defaultLicense: "電気工事士",
    },
    sekoukanri: {
      siteName: "施工管理キャリア",
      header:
        "施工管理技士の求人募集・転職サイト[国内最大級] | 施工管理キャリア",
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

  function buildHeroStatsHtml(profile, brand) {
    var lic = escHtml(shortLicenseLabel(profile.license, brand));
    var items = [
      '<li class="t-hero__stat"><strong>' +
        HERO_JOB_COUNT +
        '</strong><span>件 非公開</span></li>',
      '<li class="t-hero__stat"><strong>' + lic + '</strong><span>向け</span></li>',
    ];
    if (profile.pref) {
      items.push(
        '<li class="t-hero__stat"><strong>' +
          escHtml(profile.pref) +
          '</strong><span>エリア</span></li>'
      );
    }
    items.push(
      '<li class="t-hero__stat"><strong>10分</strong><span>· 1回</span></li>'
    );
    return (
      '<ul class="t-hero__stats" id="thanks-hero-stats" aria-label="返報の内容">' +
      items.join("") +
      "</ul>"
    );
  }

  function buildHeroGiftHtml(profile, brand) {
    var lic = escHtml(shortLicenseLabel(profile.license, brand));
    var area = profile.pref ? escHtml(profile.pref) : "";
    var qualPart = area
      ? "（<strong>" + lic + "</strong> · <strong>" + area + "</strong>向け）"
      : "（<strong>" + lic + "</strong>向け）";
    return (
      '<p class="t-hero__lead" id="thanks-hero-gift">非公開求人<strong>' +
      HERO_JOB_COUNT +
      "件</strong>" +
      qualPart +
      "の概要を表示中</p>" +
      buildHeroStatsHtml(profile, brand)
    );
  }

  function buildHeroTitle(name) {
    var display = formatDisplayName(name);
    return display
      ? display + "、登録だけで終わってOKです"
      : "登録だけで終わってOKです";
  }

  function buildHeroBody(profile, brand) {
    var p = profile || readLeadProfile();
    var b = brand || currentBrand || BRANDS.denki;
    return buildHeroGiftHtml(p, b) + HERO_ROUTE + HERO_REASSURE;
  }

  function applyHero() {
    var name = getUserName();
    var titleEl = document.getElementById("thanks-hero-title");
    if (titleEl) titleEl.textContent = buildHeroTitle(name);

    var heroRoot =
      document.getElementById("thanks-hero-sub") ||
      document.querySelector(".t-hero__body");
    if (!heroRoot) return;
    heroRoot.innerHTML = buildHeroBody(readLeadProfile(), currentBrand);
  }

  dk.buildHeroTitle = buildHeroTitle;
  dk.buildHeroBody = buildHeroBody;
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
