(() => {
  "use strict";

  // アプリ内ブラウザ（Instagram/LINE/Facebook等）検知。半透明バーが上部に被さり
  // 最上部のSTEP表示が隠れて見えるため、CSS側(html.dk-inapp)で余白を確保する（2026-07-05）。
  try {
    if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|Messenger/i.test(navigator.userAgent)) {
      document.documentElement.classList.add("dk-inapp");
      // 半透明バーをページに被せるのは iOS のアプリ内ブラウザだけ。Android の
      // LINE等はバーが被らないので、余白を足すと純粋な無駄になる（2026-08-29 オーナー実機）。
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.documentElement.classList.add("dk-ios");
      }
    }
  } catch (e) { /* no-op */ }

  // アプリ内ブラウザ: ユーザーが入力欄をタップしてキーボードが開くと、ブラウザが入力欄を
  // 可視ビューポート最上部へスクロールし、STEP表示・タイトルが上部バーの裏に隠れる
  // （2026-07-08 再々発。autofocus廃止では「ユーザー自身のタップ」は防げない）。
  // 【2026-08-23 オーナー実機報告で再々々発】300ms後に1回だけ戻す実装だったが、
  // iOSはキーボードのアニメーション完了時（〜1秒）に入力欄を最上部へ**もう一度**
  // スクロールし直すため、一発の補正では負ける（キーボード高ビューポートで再現済み）。
  // 対策: フォーカス保持中に限り 300/700/1200ms の3回再補正し、さらに
  // visualViewport の縮み（キーボード確定）でも補正する。補正は毎回
  // 「ステップ上部が隠れている」かつ「戻しても入力欄がキーボード上に残る」場合のみ
  // 動く冪等な処理なので、既に見えていれば何もしない。CSS側のscroll-margin-topとセット。
  (function () {
    var BAR = 96; // アプリ内上部バー相当（LINE実測~83pt+余裕。2026-07-08）
    var SETTLE_MS = 140;    // スクロールがこれだけ止まったら「ブラウザが動かし終えた」
    var DEADLINE_MS = 1500; // 落ち着かなくても最後に1回は直す
    var MIN_MOVE = 8;       // これ未満は動かさない（数pxの微揺れが目に付くため）
    var MAX_FIX = 4;        // 同じフォーカス中の補正回数の上限
    function restoreHead(t) {
      var group = t.closest(".js-form-group");
      if (!group) return;
      // **表示中の**見出しを選ぶ。`.c-step` を display:none にしてタイトルだけ出す構成
      // （nenshu-shindan系など）で querySelector をそのまま使うと、隠れた要素の矩形 0 を
      // 「上端が0px＝隠れている」と誤読し、delta=-BAR で**逆向きに**スクロールして
      // かえって上部を沈めていた（2026-08-23 E2Eレース再現で発覚）。
      var head = null, cands = group.querySelectorAll(".c-step, .c-title01");
      for (var i = 0; i < cands.length; i++) {
        if (cands[i].offsetParent !== null) { head = cands[i]; break; }
      }
      if (!head) head = group;
      var hr = head.getBoundingClientRect();
      if (hr.top >= BAR) return; // 隠れていない
      var delta = hr.top - BAR; // 負値: この分だけ戻す
      var vvh = (window.visualViewport && window.visualViewport.height) || window.innerHeight * 0.55;
      var ir = t.getBoundingClientRect();
      // 「入力欄がキーボード上に見える範囲で」戻す（CLAUDE.md の仕様どおり部分復元）。
      // 全量戻す/戻さないの二択にすると、.c-step→入力欄の距離が長いレイアウト
      // （v2系・dk_lp系のstep04）では常に「戻さない」を選んでしまい、
      // ナッジが実質無効だった（2026-08-23 E2Eレース再現で発覚）。
      var d = Math.max(delta, ir.bottom - (vvh - 8));
      // **instant** で動かす。behavior:"auto" は CSS の scroll-behavior を読むため、
      // 全LPが持つ html{scroll-behavior:smooth} の下では補正がアニメーションになり、
      // iOSの再スクロールに毎回割り込まれて画面がガクガク揺れる
      // （2026-08-29 オーナー実機動画。1.5秒で23回位置が変わっていた）。
      // MIN_MOVE 未満の微補正もしない（数pxの揺れが目に付くため）。
      if (d < 0 && -d >= MIN_MOVE) {
        window.scrollBy({ top: d, left: 0, behavior: "instant" });
        return true;
      }
      return false;
    }
    function isNudgeTarget(el) {
      return el && el.matches && el.matches('input[type="tel"], input[type="text"]');
    }
    // 300/700/1200ms の固定3回で補正していたが、ブラウザが動かしている最中にも
    // 割り込むため、画面が上下に揺れて見えた（2026-08-29 オーナー実機報告）。
    // 「スクロールが SETTLE_MS 止まった＝ブラウザが動かし終えた」ときにだけ、
    // 1回だけ直す。iOSが何度スクロールし直しても、そのたび**落ち着いてから**
    // 1回直すので、多段補正の強さは保ったまま揺れだけが消える。
    document.addEventListener("focusin", function (e) {
      if (!document.documentElement.classList.contains("dk-inapp")) return;
      var t = e.target;
      if (!isNudgeTarget(t)) return;
      var settle = null, deadline = null, fixes = 0, done = false;
      function stop() {
        if (done) return;
        done = true;
        clearTimeout(settle);
        clearTimeout(deadline);
        window.removeEventListener("scroll", onMove, true);
        if (window.visualViewport) window.visualViewport.removeEventListener("resize", onMove);
        t.removeEventListener("blur", stop);
      }
      function fix() {
        if (done) return;
        if (document.activeElement !== t) { stop(); return; }
        if (restoreHead(t)) {
          fixes++;
          // iOSと補正が押し合いになって動き続けるのを防ぐ。ただし下の else で
          // 「落ち着いた」たびに数え直すので、通常利用で打ち切られることはない。
          if (fixes >= MAX_FIX) stop();
        } else {
          fixes = 0; // 直す必要が無かった＝安定した。回数の予算を戻す
        }
      }
      function onMove() {
        if (done) return;
        clearTimeout(settle);
        settle = setTimeout(fix, SETTLE_MS);
      }
      window.addEventListener("scroll", onMove, true);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", onMove);
      t.addEventListener("blur", stop);
      // 一度もスクロールが起きない端末でも、最後に必ず1回は見る。
      // ここで stop() してはいけない——フォーカス中はずっと見張り続ける必要がある
      // （iOSはキーボードの開閉や予測変換バーの出入りで、数秒後にもスクロールし直す）。
      deadline = setTimeout(fix, DEADLINE_MS);
      onMove();
    }, true);
  })();



  // ========== Cookie ==========
  const Cookie = {
    set(name, value, days) {
      let expires = "";
      if (days) {
        const d = new Date();
        d.setTime(d.getTime() + days * 864e5);
        expires = "; expires=" + d.toUTCString();
      }
      document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
    },
    get(name) {
      const match = document.cookie.match(new RegExp("(^| )" + encodeURIComponent(name) + "=([^;]+)"));
      return match ? decodeURIComponent(match[2]) : null;
    },
    remove(name) { Cookie.set(name, "", -1); }
  };

  // ========== GTM / サンクス連携 ==========
  const LP_SLUG = "denkikouji";
  window.__LP_ID = LP_SLUG;
  const THANKS_BASE = "https://denkilp.builders-job.com/denki-lp-cvr/thanks-v2/";
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
  const ZAPIER_URL = "https://hooks.zapier.com/hooks/catch/2795777/3sgrmvb/";
  const CVR_ASSETS_BASE = "https://denkilp.builders-job.com/denki-lp-cvr/assets";
  const LEAD_SESSION_KEY = "dk_lp_lead_v1";
  const LEAD_SESSION_TTL_MS = 30 * 60 * 1000;
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];

  function pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function storageSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function storageGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function getDisplayName() {
    const last = document.getElementById("last-name");
    const first = document.getElementById("first-name");
    if (last) {
      const name = ((last.value || "").trim() + " " + (first ? (first.value || "").trim() : "")).trim();
      if (name) return name;
    }
    return Cookie.get("user-name") || storageGet("dk_lp_user_name") || "";
  }

  // 予約カレンダーを使うサンクスは nenshu-shindan 系だけ。thanks-v2 は 2026-06-23 の
  // LINE一本化でカレンダーを撤去済み。ここ（dk_lp参照実装）の遷移先は常に thanks-v2 なので
  // 予約枠JSON(約54KB)+bootstrapの先読みは常に無駄になる（2026-08-22 QA。app.js/app-v2.jsと同形）。
  function thanksUsesBooking() {
    return location.pathname.indexOf("/nenshu-shindan") !== -1;
  }

  function prewarmThanksBookingSlots() {
    if (!thanksUsesBooking()) return;
    const slotsUrl = CVR_ASSETS_BASE + "/data/booking-slots.json";
    if (!document.querySelector("link[data-dk-booking-slots-preload]")) {
      const preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "fetch";
      preload.href = slotsUrl;
      preload.crossOrigin = "anonymous";
      preload.setAttribute("data-dk-booking-slots-preload", "1");
      document.head.appendChild(preload);
    }
    if (window.dkBookingSlotsFetch) {
      window.dkBookingSlotsFetch(false);
      return;
    }
    if (document.querySelector("script[data-dk-booking-bootstrap]")) return;
    const s = document.createElement("script");
    s.src = CVR_ASSETS_BASE + "/js/thanks-booking-bootstrap.js?v=12";
    s.async = true;
    s.setAttribute("data-dk-booking-bootstrap", "1");
    s.onload = function () {
      if (window.dkBookingSlotsFetch) window.dkBookingSlotsFetch(false);
    };
    document.head.appendChild(s);
  }

  function persistThanksBridgeSession() {
    const name = getDisplayName();
    if (name) {
      if (Cookie.get("user-name") !== name) {
        Cookie.remove("user-name");
        Cookie.set("user-name", name, 3);
      }
      storageSet("dk_lp_user_name", name);
      storageSet("_name", name);
    }
    const telEl = document.querySelector('input[name="your-tel"]');
    const tel = telEl && telEl.value ? telEl.value.trim() : "";
    if (tel) storageSet("_tel", tel);
    storageSet("_lp", LP_SLUG);

    const licEl = document.getElementById("license01");
    let firstLic = "";
    if (licEl && licEl.value) {
      firstLic = licEl.value.split(",")[0].trim();
      if (firstLic) storageSet("_license", firstLic);
    }

    const feelingEl = document.querySelector('input[name="your-feeling"]');
    if (feelingEl && feelingEl.value) storageSet("dk_job_intent", feelingEl.value.trim());

    const prefEl = document.getElementById("your-pref");
    const cityEl = document.getElementById("your-city");
    const expEl = document.querySelector('[name="your-experience"]');
    const willEl = document.querySelector('[name="your-willingness"]');
    storageSet("dk_lead_profile", JSON.stringify({
      license: firstLic,
      pref: (prefEl && prefEl.value) || "",
      city: (cityEl && cityEl.value) || "",
      experience: (expEl && expEl.value) || "",
      willingness: (willEl && willEl.value) || ""
    }));

    storageSet(LEAD_SESSION_KEY, JSON.stringify({
      ts: Date.now(),
      lp: LP_SLUG,
      href: location.href
    }));
  }

  function isQualifiedThanksVisit() {
    const raw = storageGet(LEAD_SESSION_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      return data && data.lp && Date.now() - data.ts < LEAD_SESSION_TTL_MS;
    } catch (e) {
      return false;
    }
  }

  function buildThanksUrl() {
    const u = new URL(THANKS_BASE);
    u.searchParams.set("lp", LP_SLUG);
    const incoming = new URLSearchParams(location.search);
    UTM_KEYS.forEach((key) => {
      const val = incoming.get(key);
      if (val) u.searchParams.set(key, val);
    });
    return u.toString();
  }

  function completeLeadSubmit() {
    persistThanksBridgeSession();
    pushDataLayer({
      event: "lead_form_submit",
      lp_slug: LP_SLUG,
      page_location: location.href,
      page_path: location.pathname
    });
    prewarmThanksBookingSlots();
    location.href = buildThanksUrl();
  }

  function initThanksPageTracking() {
    const params = new URLSearchParams(location.search);
    const lpSlug = params.get("lp") || "unknown";
    const qualified = isQualifiedThanksVisit();

    const el = document.querySelector("#set-user-name");
    const hidden = document.querySelector("#hidden-your-name");
    const name = getDisplayName();
    if (el && name) {
      el.textContent = name + "様";
      if (hidden) hidden.value = name;
    }

    pushDataLayer({
      event: "thanks_page_view",
      lp_slug: lpSlug,
      thanks_qualified: qualified,
      page_location: location.href,
      page_path: location.pathname
    });

    if (qualified && !storageGet("dk_lp_conversion_fired")) {
      storageSet("dk_lp_conversion_fired", "1");
      pushDataLayer({
        event: "lead_conversion",
        lp_slug: lpSlug,
        conversion_source: "lp_form"
      });
    }

    document.querySelectorAll('a[href*="line.me"]').forEach((link) => {
      link.addEventListener("click", () => {
        pushDataLayer({
          event: "thanks_line_click",
          lp_slug: lpSlug,
          thanks_qualified: qualified
        });
      });
    });
  }

  // ========== Icon system (DOM移動方式) ==========
  let icon = null;
  let bounceId = null;

  function moveIcon(targetEl) {
    if (!icon || !targetEl) return;
    // クマをターゲット要素の親に挿入（ターゲットの直後に配置）
    const wrapper = targetEl.closest(".c-section, .p-first__buttonArea, .p-step05__address, .p-step06__name, .p-step07__tel, .c-nextLink, .js-form-group");
    if (wrapper) {
      wrapper.style.position = "relative";
      if (icon.parentNode !== wrapper) wrapper.appendChild(icon);
    }
    icon.style.opacity = "1";
  }

  // 生まれ年の受付範囲は全実装で1つに揃える。下限は「16歳以上」という年齢ルールなので、
  // 西暦を直書きすると年が変わるたびに条件が1歳ずつ厳しくなって黙って腐る
  // （2026時点で2010固定＝16歳以上。2030年には20歳未満お断りになってしまう）。
  // 年齢から毎回導出して、ルールの意味と実装を一致させる（2026-08-23）。
  const MIN_AGE = 16;
  const BIRTH_YEAR_MIN = 1924;
  const BIRTH_YEAR_MAX = new Date().getFullYear() - MIN_AGE;

  // 携帯番号のみ受け付ける（060/070/080/090 始まりの11桁）。
  // 本番 app.js と同じ規則に揃える（2026-08-23）。従来ここだけ 10〜11桁の数字なら
  // 何でも通しており、固定電話が混ざると折り返しの運用が崩れる。
  const TEL_PREFIX_ERROR = "090・080・070・060から始まる携帯番号を入力してください";

  function isValidTel(value) {
    return /^0[6789]0[0-9]{8}$/.test(String(value || "").trim());
  }

  function moveIconById(id) {
    if (!id || id === "#") return;
    const el = document.querySelector(id);
    if (el) moveIcon(el);
  }

  function startBounce() {
    stopBounce();
    if (!icon) return;
    let x = 0;
    let dir = -1;
    function tick() {
      bounceId = requestAnimationFrame(tick);
      x += dir * 0.5;
      if (x <= -15) dir = 1;
      if (x >= 0) dir = -1;
      icon.style.transform = "translateX(" + x + "px)";
    }
    bounceId = requestAnimationFrame(tick);
  }

  function stopBounce() {
    if (bounceId != null) {
      cancelAnimationFrame(bounceId);
      bounceId = null;
    }
    if (icon) icon.style.transform = "";
  }

  const STEP_PROGRESS = {
    "step-first": { pct: 8, label: "" },
    step01: { pct: 22, label: "あと5ステップ" },
    step03: { pct: 36, label: "あと4ステップ" },
    step03b: { pct: 50, label: "あと3ステップ" },
    step04: { pct: 64, label: "あと2ステップ" },
    step05: { pct: 78, label: "あと1ステップ" },
    step06: { pct: 92, label: "最後のステップ" }
  };

  function updateProgress(pageId) {
    const key = pageId.replace("#", "");
    const meta = STEP_PROGRESS[key];
    const wrap = document.getElementById("cvr-progress");
    const bar = document.getElementById("cvr-progress-bar");
    const label = document.getElementById("cvr-progress-label");
    if (!wrap || !bar || !label || !meta) return;
    wrap.classList.toggle("is-visible", key !== "step-first");
    bar.style.width = meta.pct + "%";
    label.textContent = meta.label;
  }

  // ========== Page transitions ==========
  function showPage(pageId) {
    const page = document.querySelector(pageId);
    if (!page) return;

    if (pageId === "#step-first") {
      document.querySelectorAll(".is-hidden").forEach((el) => el.classList.remove("is-hidden"));
    }
    document.body.classList.toggle("lp-form-step", pageId !== "#step-first");
    // 入力ステップ(step04-06)の目印。アプリ内ブラウザ(LINE/Instagram)の上部バーは
    // 実測~83ptあり、フォームステップ共通の padding-top:44px では STEP表示が潜る。
    // 各LPのcritical CSSに `html.dk-inapp body.lp-input-step .js-page-body{padding-top:96px!important}`
    // を置いてあるが、**このクラスを付ける側がv2実装に無く、28本のLPで一度も効いていなかった**
    // （2026-07-08にCSSだけ入れて、クラス付与はapp.jsにしか入れなかった。2026-08-23に全数E2Eで発覚）。
    document.body.classList.toggle(
      "lp-input-step",
      pageId === "#step04" || pageId === "#step05" || pageId === "#step06"
    );
    updateProgress(pageId);

    stopBounce();
    icon = page.querySelector(".js-fixed-icon");

    page.style.display = "block";
    page.style.opacity = "0";
    page.style.transform = "translateX(50px)";
    page.style.transition = "none";

    // ページ切替「後」に瞬時スクロールでトップへ戻す（step06で上部が隠れる問題 2026-07-03）。
    // レイアウトが未反映(dirty)のまま scrollTo すると、直後のレイアウト確定時に
    // スクロールアンカリングが旧位置を復元してしまうため、reflow を強制してから戻す。
    // scroll-behavior:smooth もアニメーション化で他スクロールに割り込まれるため一時的に無効化。
    var deSB = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    void page.offsetHeight;
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = deSB;

    // クマを最初のボタンエリアに配置
    const firstBtnArea = page.querySelector(".p-first__buttonArea, .c-button-grid, .c-zip-text, .p-step06__name, .p-step07__tel");
    if (firstBtnArea && icon) {
      firstBtnArea.style.position = "relative";
      firstBtnArea.appendChild(icon);
      icon.style.opacity = "1";
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        page.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
        page.style.opacity = "1";
        page.style.transform = "translateX(0)";

        setTimeout(() => {
          startBounce();
          const autoFocus = page.querySelector('input[type="tel"]:not([type="hidden"]), input[type="text"]:not([type="hidden"])');
          // アプリ内ブラウザではキーボードオープン時のブラウザ主導スクロールでSTEP表示が隠れるため
          // 自動フォーカスしない（再発 2026-07-08。preventScrollでは防げない）
          if (autoFocus && !autoFocus.value && !document.documentElement.classList.contains("dk-inapp")) {
            // preventScroll無しのfocus()は入力欄まで自動スクロールし上部が隠れる（2026-07-03）
            try { autoFocus.focus({ preventScroll: true }); } catch (e) { autoFocus.focus(); }
            autoFocus.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }, 320);
      });
    });
  }

  function clearStepTimers() {
    document.querySelectorAll(".js-form-group").forEach((g) => {
      if (typeof g._clearAutoAdvance === "function") g._clearAutoAdvance();
      if (typeof g._clearZipAutoAdvance === "function") g._clearZipAutoAdvance();
    });
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const cur = btn.closest(".js-form-group");
    if (!pageTo || !cur) return; // 委譲経由では対象外の要素も届くのでガードする

    clearStepTimers();

    document.querySelectorAll(".cvr-live-notification, .cvr-social-proof, .cvr-trust-bar").forEach((el) => {
      el.classList.add("is-hidden");
    });

    // step05→step06遷移時に名前を挿入
    if (pageTo === "step06") {
      const last = document.getElementById("last-name");
      const nameTxt = document.getElementById("nametxt");
      if (last && nameTxt && nameTxt.innerHTML.includes("{name}")) {
        nameTxt.innerHTML = nameTxt.innerHTML.replace("{name}", last.value);
      }
    }

    stopBounce();

    cur.style.display = "none";
    cur.style.opacity = "0";
    cur.style.transform = "translateX(50px)";

    showPage("#" + pageTo);
  }

  // ========== Constants ==========
  const ACTIVE = "is-active";
  const DISABLE = "is-disable";
  const SKIP = "is-skip";

  // ========== Radio buttons (first step) ==========
  function initRadioButtons(group) {
    const buttons = group.querySelectorAll(".js-radio-button");
    if (!buttons.length) return;
    const hidden = document.querySelector(".form-hidden[name=" + buttons[0].dataset.group + "]");
    const nextBtn = group.querySelector(".js-next-button");

    buttons.forEach(b => b.addEventListener("click", () => {
      hidden.value = b.dataset.value;
      nextBtn.click();
      buttons.forEach(x => x.classList.remove(ACTIVE));
      restore();
    }));

    function restore() {
      nextBtn.style.display = hidden.value ? "block" : "none";
      if (hidden.value) {
        buttons.forEach(b => {
          if (b.dataset.value === hidden.value) b.classList.add(ACTIVE);
        });
      }
    }
    restore();
  }

  // ========== Radio buttons 02 (experience, employment) ==========
  function initRadioButtons02(group) {
    const buttons = group.querySelectorAll(".js-radio-button02");
    if (!buttons.length) return;
    const groupNames = new Set(Array.from(buttons, (b) => b.dataset.group));
    const hiddens = Array.from(document.querySelectorAll(".hidden-element02"))
      .filter((h) => groupNames.has(h.name));
    const titles = group.querySelectorAll(".js-icon-target");
    const nextBtn = group.querySelector(".js-next-button");
    const states = [];

    function sync() {
      hiddens.forEach((input, i) => {
        if (input.value) {
          const el = group.querySelector('.js-radio-button02[data-value="' + input.value + '"]');
          if (el) el.classList.add(ACTIVE);
          states[i] = true;
          if (titles[i]) titles[i].classList.add(SKIP);
        } else {
          states[i] = false;
          if (titles[i]) titles[i].classList.remove(SKIP);
        }
      });
      nextBtn.classList.toggle(DISABLE, !states.every(Boolean));
    }
    sync();

    buttons.forEach(btn => btn.addEventListener("click", () => {
      if (btn.classList.contains(ACTIVE)) return;
      document.querySelector('input[name="' + btn.dataset.group + '"]').value = btn.dataset.value;
      buttons.forEach(b => b.classList.remove(ACTIVE));
      btn.classList.add(ACTIVE);
      sync();

      if (states.every(Boolean)) {
        nextBtn.classList.remove(DISABLE);
        nextBtn.style.opacity = "1";
        nextBtn.style.pointerEvents = "auto";
        const linkArea = nextBtn.closest(".c-nextLink");
        if (linkArea && icon) { linkArea.style.position = "relative"; linkArea.appendChild(icon); }
        setTimeout(() => nextBtn.click(), 100);
      }
    }));
  }

  // ========== Checkbox buttons (licenses) ==========
  function initCheckboxButtons(group) {
    const buttons = group.querySelectorAll(".js-checkbox-button");
    if (!buttons.length) return;
    const hiddens = document.querySelectorAll(".hidden-checkbox");
    const target = group.querySelector(".js-icon-target");
    const nextBtn = group.querySelector(".js-next-button");
    const vals = {};

    function updateHiddens() {
      let lastG = "";
      buttons.forEach(b => {
        const g = b.dataset.group;
        if (lastG !== g) vals[g] = "";
        if (b.classList.contains(ACTIVE)) {
          if (vals[g]) vals[g] += ", ";
          vals[g] += b.dataset.value;
        }
        lastG = g;
      });
      for (const k in vals) {
        const el = document.getElementById(k);
        if (el) el.value = vals[k];
      }
    }

    function hasAny() {
      return Array.from(buttons).some(b => b.classList.contains(ACTIVE));
    }

    const autoAdvanceMs = parseInt(group.dataset.autoAdvanceMs || "0", 10);
    let autoAdvanceTimer = null;

    function scheduleAutoAdvance() {
      if (!autoAdvanceMs || !nextBtn) return;
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = setTimeout(() => {
        if (hasAny() && !nextBtn.classList.contains(DISABLE)) nextBtn.click();
      }, autoAdvanceMs);
    }
    group._clearAutoAdvance = () => clearTimeout(autoAdvanceTimer);

    buttons.forEach(b => b.addEventListener("click", () => {
      b.classList.toggle(ACTIVE);
      updateHiddens();
      if (hasAny()) {
        nextBtn.classList.remove(DISABLE);
        const linkArea = nextBtn.closest(".c-nextLink");
        if (linkArea && icon) { linkArea.style.position = "relative"; linkArea.appendChild(icon); }
        target.classList.add(SKIP);
        scheduleAutoAdvance();
      } else {
        clearTimeout(autoAdvanceTimer);
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
      }
    }));

    // Restore
    const existing = [];
    hiddens.forEach(h => h.value.replace(/\s+/g, "").split(",").forEach(v => existing.push(v)));
    buttons.forEach(b => {
      if (existing.includes(b.dataset.value)) {
        b.classList.add(ACTIVE);
        nextBtn.classList.remove(DISABLE);
        target.classList.add(SKIP);
      }
    });
  }

  // ========== Zip code ==========
  function initZipCode(group) {
    const zipInput = group.querySelector("#zip");
    if (!zipInput) return;
    let valid = false;
    const notice = group.querySelector("#zip-notice");
    const target = group.querySelector("#step04-icon-start-target");
    const prefSel = group.querySelector("#pref");
    const citySel = group.querySelector("#city");
    const prefH = group.querySelector("#your-pref");
    const cityH = group.querySelector("#your-city");
    const nextBtn = group.querySelector(".js-next-button");
    const accordion = group.querySelector("#select-box-accordion");
    const trigger = accordion.querySelector("#select-box-accordion-trigger");

    function updateBtn() {
      nextBtn.classList.toggle(DISABLE, !valid);
    }

    function updateIcons() {
      if (prefH.value && cityH.value) {
        target.classList.add(SKIP);
        prefSel.classList.add(SKIP);
        citySel.classList.add(SKIP);
        moveIconById("#" + nextBtn.id);
      } else if (prefH.value) {
        target.classList.add(SKIP);
        prefSel.classList.add(SKIP);
        citySel.classList.remove(SKIP);
        moveIconById("#city");
      } else {
        target.classList.remove(SKIP);
        prefSel.classList.remove(SKIP);
        citySel.classList.remove(SKIP);
        moveIconById("#" + target.id);
      }
      updateBtn();
    }

    async function lookupZip(zip) {
      try {
        const r = await fetch("https://zipcloud.ibsnet.co.jp/api/search?zipcode=" + zip);
        const j = await r.json();
        if (!j.results || !j.results[0]) return;
        const a = j.results[0];
        for (let i = 0; i < prefSel.options.length; i++) {
          if (prefSel.options[i].textContent === a.address1) { prefSel.selectedIndex = i; break; }
        }
        prefH.value = a.address1;
        cityH.value = a.address2;
        await loadCities(a.address1, a.address2);
        target.classList.add(SKIP);
        prefSel.classList.add(SKIP);
        citySel.classList.add(SKIP);
        valid = true;
        updateBtn();
        scheduleZipAutoAdvance();
      } catch (e) { console.warn("Zip error:", e); }
    }

    let zipAutoTimer = null;
    function scheduleZipAutoAdvance() {
      clearTimeout(zipAutoTimer);
      zipAutoTimer = setTimeout(() => {
        if (valid && !nextBtn.classList.contains(DISABLE)) nextBtn.click();
      }, 700);
    }
    group._clearZipAutoAdvance = () => clearTimeout(zipAutoTimer);

    async function loadCities(pref, sel) {
      try {
        const r = await fetch("https://geoapi.heartrails.com/api/json?method=getCities&prefecture=" + encodeURIComponent(pref));
        const j = await r.json();
        let html = '<option selected disabled value="">市区町村</option>';
        const seen = new Set();
        j.response.location.forEach(c => {
          if (!seen.has(c.city)) {
            seen.add(c.city);
            html += '<option value="' + c.city + '"' + (c.city === sel ? " selected" : "") + '>' + c.city + '</option>';
          }
        });
        citySel.innerHTML = html;
      } catch (e) { console.warn("City error:", e); }
    }

    zipInput.addEventListener("input", () => {
      const v = zipInput.value;
      valid = false;
      if (!v.length) { notice.style.display = "block"; notice.textContent = "ハイフンなし"; }
      else if (!/^[0-9]+$/.test(v)) { notice.textContent = "数字で入力してください"; }
      else if (v.length === 7) { notice.style.display = "none"; valid = true; lookupZip(v); }
      else { notice.style.display = "block"; notice.textContent = "ハイフンなし あと" + (7 - v.length) + "桁"; }
      updateIcons();
    });

    trigger.addEventListener("click", () => {
      if (accordion.open) {
        if (!cityH.value || !prefH.value) { moveIconById("#" + target.id); target.classList.remove(SKIP); }
      } else { updateIcons(); }
    });

    prefSel.addEventListener("change", () => {
      prefH.value = prefSel.options[prefSel.selectedIndex].textContent;
      zipInput.value = ""; valid = false; cityH.value = "";
      loadCities(prefH.value, "");
      updateIcons();
    });

    citySel.addEventListener("change", () => {
      cityH.value = citySel.options[citySel.selectedIndex].textContent;
      zipInput.value = ""; valid = true;
      updateIcons();
      scheduleZipAutoAdvance();
    });

    updateBtn();
  }

  function isValidBirthYear(value) {
    const year = parseInt(String(value || "").trim(), 10);
    return year >= BIRTH_YEAR_MIN && year <= BIRTH_YEAR_MAX;
  }

  // ========== Name inputs ==========
  function initNameInputs(group) {
    const inputs = group.querySelectorAll(".js-name-input");
    if (!inputs.length) return;
    const birthYear = group.querySelector(".js-birth-year-input");
    const target = group.querySelector("#step05-icon-start-target");
    const nextBtn = group.querySelector(".js-next-button");
    const errBox = group.querySelector("#error-name");
    const errText = errBox ? errBox.querySelector("p") : null;

    function allFilled() {
      const namesOk = Array.from(inputs).every((i) => !!(i.value || "").trim());
      const yearOk = !birthYear || isValidBirthYear(birthYear.value);
      return namesOk && yearOk;
    }

    function validate(opts) {
      opts = opts || {};
      if (allFilled()) {
        nextBtn.classList.remove(DISABLE);
        target.classList.add(SKIP);
        if (errBox) errBox.style.display = "none";
        moveIconById("#" + nextBtn.id);
      } else {
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
        // この実装は未入力項目を全部列挙する方式で、touched（触れた項目）を持たない。
        // 即時表示にすると1文字目から「姓・名・生まれ年」の赤帯が出続けるので、
        // タイピング中は切り替えない（2026-08-29）。絶対配置でレイアウトは動かないため、
        // 以前の「入力がバグる」体感は解消済み。
        if (errBox && !opts.silent) {
          errBox.style.display = "block";
          if (errText) {
            const namesOk = Array.from(inputs).every((i) => !!(i.value || "").trim());
            errText.textContent = namesOk
              ? `生年月日（西暦）は${BIRTH_YEAR_MIN}〜${BIRTH_YEAR_MAX}で入力してください`
              : "必ず入力してください";
          }
        }
        moveIconById("#" + target.id);
      }
    }

    inputs.forEach((input) => {
      input.addEventListener("blur", () => validate());
      input.addEventListener("input", () => validate({ silent: true }));
    });
    if (birthYear) {
      birthYear.addEventListener("blur", () => validate());
      birthYear.addEventListener("input", () => validate({ silent: true }));
    }

    nextBtn.classList.add(DISABLE);
  }

  // ========== Required items (tel) ==========
  function initRequiredItems(group) {
    const items = group.querySelectorAll(".js-required-item");
    if (!items.length) return;
    const arr = Array.from(items);
    const states = arr.map(() => false);
    const nextBtn = group.querySelector(".js-next-button");

    function updateBtn() {
      nextBtn.classList.toggle(DISABLE, !states.every(Boolean));
    }

    items.forEach((item, i) => {
      const errBox = group.querySelector("#error-" + item.name);
      const errText = errBox ? errBox.querySelector("p") : null;

      // 電話番号の「あと○桁」表示
      if (item.name === "your-tel") {
        const telNotice = document.getElementById("tel-notice");
        if (telNotice) {
          item.addEventListener("input", () => {
            const len = item.value.length;
            if (len === 0) { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし"; }
            else if (len >= 10) { telNotice.style.display = "none"; }
            else { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし あと" + (10 - len) + "桁以上"; }
            // 入力中にもCTAの有効/無効を更新する（本番app.jsと同じ挙動）。
            // blur だけで判定していたため、番号を打ち終えてもボタンが無効のままに見えていた。
            // タイピング中はエラー表示を出さない（1文字ごとに出没するとレイアウトが跳ねる）。
            const okNow = isValidTel(item.value);
            if (states[i] !== okNow) { states[i] = okNow; updateBtn(); }
            if (okNow) arr[i].classList.add(SKIP); else arr[i].classList.remove(SKIP);
          });
        }
      }

      item.addEventListener("blur", () => {
        if (item.nextElementSibling) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = item.nextElementSibling.textContent; }
          states[i] = false; arr[i].classList.remove(SKIP);
        } else {
          if (errBox) errBox.style.display = "none";
          if (item.value) { states[i] = true; arr[i].classList.add(SKIP); }
        }
        if (item.name === "your-tel" && item.value && !isValidTel(item.value)) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = TEL_PREFIX_ERROR; }
          states[i] = false; arr[i].classList.remove(SKIP);
        }
        if (states.every(Boolean)) moveIconById("#" + nextBtn.id);
        else { const idx = states.indexOf(false); if (idx >= 0) moveIconById("#" + arr[idx].id); }
        updateBtn();
      });

      nextBtn.addEventListener("click", () => {
        setTimeout(() => { try { item.focus({ preventScroll: true }); } catch (e) { item.focus(); } item.blur(); }, 250);
      });
    });

    // 送信ボタン(step-last-button)の場合、バリデーション通過後にサンクスページへ
    if (nextBtn.id === "step-last-button") {
      nextBtn.addEventListener("click", () => {
        // 250ms後にバリデーション結果を確認して遷移
        setTimeout(() => {
          if (!states.every(Boolean)) return;
          const textEl = nextBtn.querySelector(".c-submit-button__text");
          if (textEl) textEl.innerText = "検索中...";
          nextBtn.style.pointerEvents = "none";
          // Zapier送信（存在すれば）
          const form = document.querySelector(".wpcf7-form");
          if (form) form.dispatchEvent(new Event("submit", { bubbles: true }));
          setTimeout(completeLeadSubmit, 600);
        }, 500);
      });
    }

    updateBtn();
  }

  // ========== Enter key prevention ==========
  function preventEnter() {
    document.querySelectorAll('#main input[type="text"], #main input[type="tel"], #main input[type="number"], #main input[type="email"]').forEach(input => {
      input.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
    });
  }

  // ========== Cookie name + 名前挿入 ==========
  function initCookieName() {
    const last = document.getElementById("last-name");
    const first = document.getElementById("first-name");
    const btn = document.querySelector(".js-set-cookie-button");
    if (!last || !btn) return;
    btn.addEventListener("click", () => {
      const name = last.value + " " + (first ? first.value : "");
      if (Cookie.get("user-name") !== name) {
        Cookie.remove("user-name");
        Cookie.set("user-name", name, 3);
      }
      storageSet("dk_lp_user_name", name.trim());
    });
  }

  // ========== Prefecture select ==========
  function initPrefSelect() {
    const sel = document.getElementById("pref");
    if (!sel) return;
    const prefs = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
    let h = '<option value="00" selected disabled>都道府県</option>';
    prefs.forEach((p, i) => { h += '<option value="' + String(i+1).padStart(2,"0") + '">' + p + '</option>'; });
    sel.innerHTML = h;
  }


  // ========== Form mirror (Zapier + GAS / スプシ・Slack連携) ==========
  function initFormMirrors() {
    // form要素を掴んで保持しない。外部スクリプトがフォームDOMを差し替えると
    // その要素に張った submit リスナーごと消え、ステップ遷移は自己修復で生きているのに
    // 送信だけが無言で失われる（2026-08-23 実ブラウザで再現）。document委譲に統一する。
    if (!document.querySelector(".wpcf7-form")) return;
    // 送信は原則すべて通す（同一人物の再送信も別人の連続送信も届ける）。
    // 止めるのは「1タップでsubmitが二重発火した」事故だけ。
    const DEDUP_MS = 3000;
    const sentAt = new Map();
    let clientIp = "";

    function fetchClientIp() {
      fetch("https://api.ipify.org?format=json")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.ip) clientIp = d.ip; })
        .catch(() => {});
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(fetchClientIp, { timeout: 5000 });
    } else {
      setTimeout(fetchClientIp, 2000);
    }

    function postTo(url, body) {
      if (!url) return;
      const blob = new Blob([body], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
      const sent = navigator.sendBeacon && navigator.sendBeacon(url, blob);
      if (!sent) fetch(url, { method: "POST", mode: "no-cors", keepalive: true, body }).catch(() => {});
    }

    function sendToMirrors(form) {
      if (!form) return;
      const tel = (form.querySelector('input[name="your-tel"]') || {}).value || "";
      const last = (form.querySelector('input[name="your-last-name"]') || {}).value || "";
      const first = (form.querySelector('input[name="your-first-name"]') || {}).value || "";
      if (!isValidTel(tel) || !last.trim() || !first.trim()) return;
      const sendKey = tel + "|" + last.trim() + "|" + first.trim();
      const now = Date.now();
      const prev = sentAt.get(sendKey);
      if (prev && now - prev < DEDUP_MS) return;
      sentAt.set(sendKey, now);
      try {
        const fd = new FormData(form);
        const params = new URLSearchParams();
        fd.forEach((v, k) => { if (!k.startsWith("_wpcf7")) params.append(k, v == null ? "" : String(v)); });
        params.append("_page", location.href);
        params.append("_referrer", document.referrer || "");
        params.append("_submitted_at", new Date().toISOString());
        params.append("_lp", LP_SLUG);
        params.append("_ip", clientIp);
        params.append("_user_agent", navigator.userAgent || "");
        const body = params.toString();
        postTo(ZAPIER_URL, body);
        postTo(GAS_URL, body);
      } catch (e) {
        sentAt.delete(sendKey);
      }
    }

    // document のcapture段階で受けるので、フォームDOMが差し替わっても生き残る。
    if (!document.__lpMirrorBound) {
      document.__lpMirrorBound = true;
      document.addEventListener("submit", (e) => {
        const form = e.target && e.target.closest ? e.target.closest(".wpcf7-form") : null;
        if (form) sendToMirrors(form);
      }, true);
    }
  }

  // ========== フォームの自己修復（本番 app.js から移植 2026-08-23）==========
  // 外部スクリプト（最適化ツール等）が初期化後のフォームDOMを差し替えると、
  // ボタンへ直接張ったリスナーが全部消え、data属性だけ残った「死んだフォーム」になる。
  // オーナー再三報告の「選択しても進めない」はこれ（app.js 2026-07-10 / app-v2.js 2026-08-19 で対策済み）。
  // ここは参照実装なので、WP直貼りLPへコピーされたときに弱点ごと持っていかれないよう同じ形にする。
  const initedGroups = typeof WeakSet === "function" ? new WeakSet() : null;

  function isGroupInited(group) {
    return initedGroups ? initedGroups.has(group) : group.dataset.lpInited === "1";
  }

  function initFormGroup(group) {
    if (!group || isGroupInited(group)) return;
    if (initedGroups) initedGroups.add(group);
    group.dataset.lpInited = "1";
    initRadioButtons(group);
    initRadioButtons02(group);
    initCheckboxButtons(group);
    initZipCode(group);
    initNameInputs(group);
    initRequiredItems(group);
  }

  // ステップ遷移の委譲は form ではなく document に張る（form ごと差し替えられても生き残る）。
  let globalDelegationBound = false;
  function bindGlobalDelegation() {
    if (globalDelegationBound) return;
    globalDelegationBound = true;

    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".js-step-button") : null;
      if (btn) handleStepClick({ currentTarget: btn });
    });

    // 未初期化グループ内の操作を capture で検知して即座に張り直す。
    // capture 中に張ったリスナーには、この操作イベント自体もターゲット到達時に届く。
    ["click", "change", "input", "focusin"].forEach((type) => {
      document.addEventListener(type, (e) => {
        const group = e.target && e.target.closest ? e.target.closest(".js-form-group") : null;
        if (!group || isGroupInited(group)) return;
        const pref = document.getElementById("pref");
        if (pref && pref.options.length <= 1) initPrefSelect();
        initFormGroup(group);
        preventEnter();
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: "lp_error", error_type: "form_group_reinit", step_name: group.id || "" });
      }, true);
    });
  }

  // ========== Init ==========
  function initForm() {
    const groups = document.querySelectorAll(".js-form-group");
    if (!groups.length) return;

    bindGlobalDelegation();

    queueMicrotask(() => {
      groups.forEach(initFormGroup);
      initCookieName();
      initFormMirrors();
      preventEnter();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // load前（画像やGTM待ち中）のクリックが無反応になる窓を無くすため、ここで委譲を張る
    if (!document.body.classList.contains("p-pageThanks")) bindGlobalDelegation();
    initPrefSelect();
    updateProgress("#step-first");
    if (document.body.classList.contains("p-pageThanks")) {
      initThanksPageTracking();
    }
  });

  window.addEventListener("load", () => {
    if (!document.body.classList.contains("p-pageThanks")) {
      if (document.getElementById("step-first")) showPage("#step-first");
      initForm();
    }
  });
})();
