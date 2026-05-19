(function () {
  var THEME = "https://denkilp.builders-job.com/wp-content/themes/original-thema/assets/img";
  var LOCAL = "../assets/icons";

  var ICON_SRC = {
    kentiku: LOCAL + "/kentiku.svg",
    doboku: LOCAL + "/doboku.svg",
    denkisekou: THEME + "/denkisekou.png",
    denkikouji: THEME + "/denkikouji.png",
    denkishunin: THEME + "/denkishunin.png",
    kankou: LOCAL + "/kankou.svg",
    other: THEME + "/other.png"
  };

  var RULES = [
    [/その他/, "other"],
    [/電気主任技術者/, "denkishunin"],
    [/電気工事士|第一種|第二種/, "denkikouji"],
    [/電気工事施工管理|電気施工管理/, "denkisekou"],
    [/管工事施工管理/, "kankou"],
    [/土木施工管理/, "doboku"],
    [/建築施工管理/, "kentiku"]
  ];

  function iconKey(value) {
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(value)) return RULES[i][1];
    }
    return "other";
  }

  function setButtonIcon(btn) {
    var value = btn.getAttribute("data-value") || "";
    var key = iconKey(value);
    var src = ICON_SRC[key];
    if (!src) return;

    var wrap = btn.querySelector(".c-button__img");
    if (!wrap) return;

    wrap.innerHTML =
      '<img loading="lazy" decoding="async" src="' +
      src +
      '" alt="" width="48" height="48">';
    btn.setAttribute("data-license-icon", key);
  }

  function init() {
    document.querySelectorAll(".p-step01__button[data-value]").forEach(setButtonIcon);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
