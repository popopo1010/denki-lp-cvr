(function () {
  var SALARY = {
    "1級建築施工管理技士": { range: "550万〜850万円", avg: "680" },
    "2級建築施工管理技士": { range: "400万〜650万円", avg: "520" },
    "1級土木施工管理技士": { range: "500万〜800万円", avg: "640" },
    "2級土木施工管理技士": { range: "380万〜620万円", avg: "500" },
    "1級電気施工管理技士": { range: "520万〜820万円", avg: "660" },
    "2級電気施工管理技士": { range: "400万〜680万円", avg: "540" },
    "第一種電気工事士": { range: "420万〜650万円", avg: "520" },
    "第二種電気工事士": { range: "350万〜550万円", avg: "430" },
    "1級管工事施工管理技士": { range: "480万〜780万円", avg: "620" },
    "2級管工事施工管理技士": { range: "380万〜620万円", avg: "490" },
    "その他の資格": { range: "担当が個別に算出", avg: null }
  };

  function displayLabel(value) {
    for (var i = 0; i < 4; i++) {
      var p = ["第一種", "第二種", "1級", "2級"][i];
      if (value.indexOf(p) === 0 && value.indexOf(p + " ") !== 0) {
        return p + " " + value.slice(p.length);
      }
    }
    return value;
  }

  function init() {
    var root = document.getElementById("ns-salary-preview");
    if (!root) return;

    var rangeEl = document.getElementById("ns-salary-preview-range");
    var avgEl = document.getElementById("ns-salary-preview-avg");
    var labelEl = document.getElementById("ns-salary-preview-label");
    var buttons = document.querySelectorAll("#step01 .js-checkbox-button[data-value]");

    function show(value) {
      var data = SALARY[value];
      if (!data) {
        root.hidden = true;
        return;
      }
      if (labelEl) {
        labelEl.textContent =
          value === "その他の資格"
            ? "選択中：その他の資格"
            : displayLabel(value) + " の年収相場";
      }
      if (rangeEl) rangeEl.textContent = data.range;
      if (avgEl) {
        avgEl.textContent = data.avg
          ? "平均 " + data.avg + "万円（当社利用者データ）"
          : "診断後に担当がお伝えします";
      }
      root.hidden = false;
    }

    function sync() {
      var active = document.querySelector("#step01 .js-checkbox-button.is-active[data-value]");
      if (active) show(active.getAttribute("data-value"));
      else root.hidden = true;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTimeout(sync, 0);
      });
    });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
