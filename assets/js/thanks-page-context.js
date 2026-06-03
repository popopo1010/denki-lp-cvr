/**
 * thanks-v2: LP slug に応じたブランド・フォールバック職種
 */
(function () {
  var LEAD_SESSION_KEY = "dk_lp_lead_v1";

  function getLpSlug() {
    try {
      var params = new URLSearchParams(location.search);
      var fromQs = params.get("lp");
      if (fromQs) return fromQs;
      var raw = sessionStorage.getItem(LEAD_SESSION_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.lp) return data.lp;
      }
      return sessionStorage.getItem("_lp") || "";
    } catch (e) {
      return "";
    }
  }

  function getJobFamily(slug) {
    var s = String(slug || "").toLowerCase();
    if (!s) return "denki";
    if (s.indexOf("nenshu-shindan") >= 0) return "nenshu";
    if (
      s.indexOf("sekoukanri") >= 0 ||
      s.indexOf("kentiku") >= 0 ||
      s.indexOf("doboku") >= 0 ||
      s.indexOf("denkisekou") >= 0
    ) {
      return "sekoukanri";
    }
    return "denki";
  }

  var BRANDS = {
    denki: {
      siteName: "電気工事バンク",
      header:
        "電気工事士の求人募集・転職サイト[国内最大級] | 電気工事バンク",
      title: "仮登録完了 | 電気工事バンク",
      defaultLicense: "電気工事士",
      heroSub:
        "ご登録内容に合う<strong>非公開求人のイメージ</strong>を下に表示しています。<br>気になる案件は<strong>10分で相談</strong>、全文・新着は<strong>LINE本登録後</strong>に届きます。"
    },
    sekoukanri: {
      siteName: "施工管理キャリア",
      header:
        "施工管理技士の求人募集・転職サイト[国内最大級] | 施工管理キャリア",
      title: "仮登録完了 | 施工管理キャリア",
      defaultLicense: "施工管理技士",
      heroSub:
        "ご登録の<strong>資格・勤務地</strong>に合う<strong>非公開求人のイメージ</strong>を下に表示しています。<br>全文・<strong>企業からの声がけ</strong>はLINE本登録後に届きます。"
    }
  };

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

    var heroP = document.querySelector(".t-hero p");
    if (heroP && !document.cookie.match(/(^| )user-name=/)) {
      heroP.innerHTML = brand.heroSub;
    }

    window.dkThanksContext = {
      lpSlug: slug,
      family: family,
      brand: brand,
      getLpSlug: getLpSlug,
      getJobFamily: getJobFamily
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBrand);
  } else {
    applyBrand();
  }
})();
