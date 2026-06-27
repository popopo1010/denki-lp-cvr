/* =========================================================
   年収診断 LP v3 ステップエンジン + 推定年収算出（自己完結）
   - 依存ライブラリなし。新ドメインのルートに置いても動作する。
   - フォーム送信先 / サンクス遷移は data-* 属性で外部設定可能。
   ========================================================= */
(function () {
  "use strict";

  /* ---- 推定年収モデル（万円） ----
     公開求人データ（求人ボックス・建職バンク 等／2026年時点）をもとにした概算レンジ。
     ※ あくまで概算。最新の求人クローリング結果で随時更新する想定（要確認項目）。 */
  var LICENSE = {
    "第一種電気工事士": { min: 450, max: 620, avg: 520 },
    "第二種電気工事士": { min: 350, max: 500, avg: 420 },
    "1級電気工事施工管理技士": { min: 500, max: 800, avg: 590 },
    "2級電気工事施工管理技士": { min: 400, max: 620, avg: 490 },
    "電気主任技術者": { min: 480, max: 780, avg: 560 },
    "その他": null
  };

  var EXP_MULT = {
    "未経験": 0.80,
    "1年未満": 0.85,
    "1〜3年": 0.95,
    "4〜6年": 1.05,
    "7〜9年": 1.15,
    "10年以上": 1.25
  };

  /* 現在年収ラベル → 概算数値（万円） */
  var INCOME_VAL = {
    "400万円未満": 380,
    "400万円台": 450,
    "500万円台": 550,
    "600万円台": 650,
    "700万円台": 750,
    "800万円台": 850,
    "900万円以上": 950
  };

  var PREFS = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
    "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
    "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
    "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
    "熊本県","大分県","宮崎県","鹿児島県","沖縄県"
  ];

  /* 進捗バーに対応するステップ順（first/result は対象外） */
  var PROGRESS_STEPS = ["income", "exp", "license", "field", "intent", "form"];

  /* 診断資格 → 職種区分（thanksのLINE出し分けに使用） */
  function classifyOccupation(license) {
    if (license === "1級電気工事施工管理技士" || license === "2級電気工事施工管理技士") {
      return "sekoukanri"; // 施工管理
    }
    return "denki"; // 電気工事士・電気主任技術者・その他
  }

  var data = {};
  var steps = {};
  var current = "first";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function pushDL(event, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: event, lp_slug: window.__LP_ID || "nenshu-shindan-v3" };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    window.dataLayer.push(o);
  }

  /* ===== リード送信（既存LPと同一パイプライン: Zapier + GAS） ===== */
  var ZAPIER_URL = "https://hooks.zapier.com/hooks/catch/2795777/3sgrmvb/";
  var GAS_URL = "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
  var clientIp = "";

  function fetchClientIp() {
    fetch("https://api.ipify.org?format=json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ip) clientIp = d.ip; })
      .catch(function () {});
  }

  function postTo(url, body) {
    if (!url) return;
    try {
      var blob = new Blob([body], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
      var sent = navigator.sendBeacon && navigator.sendBeacon(url, blob);
      if (!sent) fetch(url, { method: "POST", mode: "no-cors", keepalive: true, body: body }).catch(function () {});
    } catch (e) {
      fetch(url, { method: "POST", mode: "no-cors", keepalive: true, body: body }).catch(function () {});
    }
  }

  function isTestLead(tel, last, first) {
    var t = String(tel || "").trim();
    var ln = String(last || "").trim();
    var fn = String(first || "").trim();
    if (/^09012345678$|^08012345678$|^07012345678$/.test(t)) return true;
    if (/テスト/.test(ln + fn)) return true;
    try { if (/[?&](?:_test|dk_test)=1(?:&|$)/.test(location.search)) return true; } catch (e) {}
    return false;
  }

  /* ---- ステップ遷移 ---- */
  function goTo(key) {
    if (!steps[key]) return;
    Object.keys(steps).forEach(function (k) {
      steps[k].classList.toggle("is-active", k === key);
    });
    current = key;
    window.scrollTo(0, 0);
    updateProgress(key);
    var idx = PROGRESS_STEPS.indexOf(key);
    if (idx >= 0) pushDL("diagnosis_step", { step_no: idx + 1, step_name: key });
    if (key === "result") {
      renderResult();
      pushDL("diagnosis_result_view", { occupation: data.occ || classifyOccupation(data.license) });
    }
  }

  function updateProgress(key) {
    var idx = PROGRESS_STEPS.indexOf(key);
    // form の次（result）でも form を完了扱いにする
    if (key === "result") idx = PROGRESS_STEPS.length - 1;
    $all(".nv-progress__num").forEach(function (el, i) {
      el.classList.remove("is-active", "is-done");
      if (idx < 0) return;
      if (i < idx) el.classList.add("is-done");
      else if (i === idx) el.classList.add("is-active");
    });
    $all(".nv-progress__arrow").forEach(function (el, i) {
      el.classList.toggle("is-done", idx >= 0 && i < idx);
    });
  }

  /* ---- 単一選択（自動遷移） ---- */
  function wireSingleSelect(stepEl) {
    var group = stepEl.getAttribute("data-group");
    var next = stepEl.getAttribute("data-next");
    $all(".nv-opt", stepEl).forEach(function (btn) {
      btn.addEventListener("click", function () {
        $all(".nv-opt", stepEl).forEach(function (b) {
          b.classList.remove("is-active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
        data[group] = btn.getAttribute("data-value");
        // 選択が見えるよう少し待ってから前進
        setTimeout(function () { goTo(next); }, 320);
      });
    });
  }

  /* ---- 戻る ---- */
  function wireBack() {
    $all("[data-back]").forEach(function (btn) {
      btn.addEventListener("click", function () { goTo(btn.getAttribute("data-back")); });
    });
  }

  /* ---- フォーム検証 ---- */
  function showError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-shown");
  }
  function clearError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("is-shown");
  }

  function validateForm() {
    var ok = true;
    var pref = $("#nv-pref").value;
    var year = $("#nv-year").value.trim();
    var lname = $("#nv-lname").value.trim();
    var fname = $("#nv-fname").value.trim();
    var tel = $("#nv-tel").value.replace(/[^0-9]/g, "");
    var consent = $("#nv-consent").checked;

    ["err-pref", "err-name", "err-year", "err-tel", "err-consent"].forEach(clearError);

    if (!pref) { showError("err-pref", "都道府県を選択してください"); ok = false; }
    if (!lname || !fname) { showError("err-name", "姓・名をご入力ください"); ok = false; }
    var y = parseInt(year, 10);
    if (!year || isNaN(y) || y < 1940 || y > 2009) {
      showError("err-year", "生まれ年を西暦4桁でご入力ください（例：1990）"); ok = false;
    }
    if (tel.length !== 11 || tel.charAt(0) !== "0") {
      showError("err-tel", "携帯番号を11桁・ハイフンなしでご入力ください"); ok = false;
    }
    if (!consent) { showError("err-consent", "利用規約・プライバシーポリシーへの同意が必要です"); ok = false; }

    if (ok) {
      data.pref = pref;
      data.birthYear = y;
      data.lastName = lname;
      data.firstName = fname;
      data.name = lname + " " + fname;
      data.tel = tel;
    }
    return ok;
  }

  /* ---- 推定年収算出 ---- */
  function round10(n) { return Math.round(n / 10) * 10; }

  function computeEstimate() {
    var lic = LICENSE[data.license];
    var mult = EXP_MULT[data.exp] || 1;
    if (!lic) {
      return { unknown: true };
    }
    var est = round10(lic.avg * mult);
    if (est < lic.min) est = lic.min;
    if (est > lic.max + 50) est = lic.max + 50;
    var low = Math.max(lic.min, round10(est - 40));
    var high = round10(est + 60);
    var cur = INCOME_VAL[data.income];
    var diff = null;
    if (cur != null && est - cur >= 20) diff = round10(est - cur);
    return { unknown: false, est: est, low: low, high: high, current: cur, diff: diff };
  }

  function renderResult() {
    // 「計算中」演出 → 結果表示（推定の納得感を高める）
    var calc = $("#nv-calc");
    var body = $("#nv-result-body");
    if (calc && body) {
      calc.style.display = "block";
      body.style.display = "none";
      setTimeout(function () {
        calc.style.display = "none";
        body.style.display = "block";
      }, 1100);
    }

    var r = computeEstimate();
    var nameEl = $("#nv-result-name");
    if (nameEl) nameEl.textContent = (data.name ? data.name.split(" ")[0] + " さん、" : "") + "診断おつかれさまでした";

    var box = $("#nv-result-amount");
    var diffBox = $("#nv-result-diff");
    if (r.unknown) {
      box.innerHTML = '<p class="nv-result__caption">あなたの推定適正年収</p>' +
        '<p class="nv-result__big">担当が<br>個別に算出します</p>' +
        '<p class="nv-result__range">資格・経験を踏まえ、無料でお伝えします</p>';
      diffBox.style.display = "none";
      return;
    }
    box.innerHTML = '<p class="nv-result__caption">あなたの推定適正年収</p>' +
      '<p class="nv-result__big"><span class="nv-amt">' + r.est + '</span> 万円</p>' +
      '<p class="nv-result__range">想定レンジ：' + r.low + '万円 〜 ' + r.high + '万円</p>';

    if (r.diff) {
      diffBox.style.display = "block";
      diffBox.innerHTML = '今の年収より <span class="nv-amt">+' + r.diff + '</span> 万円アップの可能性';
    } else {
      diffBox.style.display = "none";
    }
  }

  /* ---- リード送信（既存LPと同一: WPCF7互換フィールド名で Zapier + GAS へ） ---- */
  function submitLead() {
    data.occ = classifyOccupation(data.license);

    // テストリードは送信しない（既存LPと同じガード）
    if (isTestLead(data.tel, data.lastName, data.firstName)) {
      pushDL("lead_form_submit_test", { occupation: data.occ });
      return;
    }

    var params = new URLSearchParams();
    // 既存パイプライン（Googleスプレッドシート/Zapier）が解釈するWPCF7フィールド名に合わせる
    params.append("your-tel", data.tel || "");
    params.append("your-last-name", data.lastName || "");
    params.append("your-first-name", data.firstName || "");
    params.append("your-license01", data.license || "");
    params.append("your-experience", data.exp || "");
    params.append("your-pref", data.pref || "");
    params.append("your-birthday-year", data.birthYear || "");
    params.append("your-willingness", data.intent || "");
    // v3で追加収集する項目
    params.append("your-income", data.income || "");
    params.append("your-field", data.field || "");
    params.append("your-occupation", data.occ || "");
    // メタ情報（既存LPと同じキー）
    params.append("_page", location.href);
    params.append("_referrer", document.referrer || "");
    params.append("_submitted_at", new Date().toISOString());
    params.append("_lp", window.__LP_ID || "nenshu-shindan-v3");
    params.append("_ip", clientIp);
    params.append("_user_agent", navigator.userAgent || "");

    var body = params.toString();
    postTo(ZAPIER_URL, body);
    postTo(GAS_URL, body);

    try {
      sessionStorage.setItem("nv3_occ", data.occ);
    } catch (e) {}
    pushDL("lead_form_submit", {
      occupation: data.occ,
      page_location: location.href,
      page_path: location.pathname
    });
  }

  /* ---- 初期化 ---- */
  function buildPrefOptions() {
    var sel = $("#nv-pref");
    if (!sel) return;
    PREFS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p; o.textContent = p;
      sel.appendChild(o);
    });
  }

  function init() {
    $all(".nv-step").forEach(function (el) { steps[el.getAttribute("data-step")] = el; });
    buildPrefOptions();

    // 送信前に確実に取得するため、アイドル時にクライアントIPを取得（既存LPと同様）
    if (typeof requestIdleCallback === "function") requestIdleCallback(fetchClientIp, { timeout: 5000 });
    else setTimeout(fetchClientIp, 2000);

    // FV: 診断開始
    var startBtn = $("#nv-start");
    if (startBtn) startBtn.addEventListener("click", function () {
      pushDL("diagnosis_start");
      goTo("income");
    });

    // 携帯番号: 数字以外を除去
    var telEl = $("#nv-tel");
    if (telEl) telEl.addEventListener("input", function () {
      var cleaned = telEl.value.replace(/[^0-9]/g, "").slice(0, 11);
      if (cleaned !== telEl.value) telEl.value = cleaned;
    });

    // 単一選択ステップ
    $all(".nv-step[data-group]").forEach(wireSingleSelect);
    wireBack();

    // フォーム送信 → 推定年収表示
    var finalBtn = $("#nv-submit");
    if (finalBtn) {
      finalBtn.addEventListener("click", function () {
        if (!validateForm()) return;
        submitLead();
        goTo("result");
      });
    }

    // result の最終CTA（求人紹介へ）
    var resultCta = $("#nv-result-cta");
    if (resultCta) {
      resultCta.addEventListener("click", function () {
        var thanks = document.body.getAttribute("data-thanks-url");
        if (!thanks) return;
        var occ = data.occ || classifyOccupation(data.license);
        pushDL("result_cta_click", { occupation: occ });
        location.href = thanks + (thanks.indexOf("?") >= 0 ? "&" : "?") + "occ=" + occ;
      });
    }

    updateProgress("first");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
