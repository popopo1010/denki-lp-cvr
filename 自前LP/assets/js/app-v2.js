(() => {
  "use strict";

  // アプリ内ブラウザ（Instagram/LINE/Facebook等）検知。半透明バーが上部に被さり
  // 最上部のSTEP表示が隠れて見えるため、CSS側(html.dk-inapp)で余白を確保する（2026-07-05）。
  try {
    if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|Messenger/i.test(navigator.userAgent)) {
      document.documentElement.classList.add("dk-inapp");
    }
  } catch (e) { /* no-op */ }

  // アプリ内ブラウザ: ユーザーが入力欄をタップしてキーボードが開くと、ブラウザが入力欄を
  // 可視ビューポート最上部へスクロールし、STEP表示・タイトルが上部バーの裏に隠れる
  // （2026-07-08 再々発。autofocus廃止では「ユーザー自身のタップ」は防げない）。
  // フォーカス確定後、入力欄がキーボード上に見えることを保証できる場合のみ、
  // ステップ上部が見える位置までスクロールを戻す。CSS側のscroll-margin-topとセット。
  (function () {
    var BAR = 96; // アプリ内上部バー相当（LINE実測~83pt+余裕。2026-07-08）
    document.addEventListener("focusin", function (e) {
      if (!document.documentElement.classList.contains("dk-inapp")) return;
      var t = e.target;
      if (!t || !t.matches || !t.matches('input[type="tel"], input[type="text"]')) return;
      var group = t.closest(".js-form-group");
      if (!group) return;
      setTimeout(function () {
        var head = group.querySelector(".c-step, .c-title01") || group;
        var hr = head.getBoundingClientRect();
        if (hr.top >= BAR) return; // 隠れていない
        var delta = hr.top - BAR; // 負値: この分だけ戻す
        var vvh = (window.visualViewport && window.visualViewport.height) || window.innerHeight * 0.55;
        var ir = t.getBoundingClientRect();
        if (ir.bottom - delta < vvh - 8) {
          window.scrollBy({ top: delta, left: 0, behavior: "auto" });
        }
      }, 300);
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

  // ========== 携帯番号バリデーション（060/070/080/090 始まりの11桁） ==========
  const TEL_PREFIX_ERROR = "090・080・070・060から始まる携帯番号を入力してください";
  const isValidMobileTel = (v) => /^0[6789]0[0-9]{8}$/.test(String(v || "").trim());
  function hasInvalidTelPrefix(v) {
    const s = String(v || "").trim();
    if (!s) return false;
    if (s.charAt(0) !== "0") return true;
    if (s.length >= 2 && "6789".indexOf(s.charAt(1)) === -1) return true;
    if (s.length >= 3 && s.charAt(2) !== "0") return true;
    return false;
  }

  // ========== サンクス遷移（thanks-v2 + GTM qualified） ==========
  const THANKS_V2_PATH = "/denki-lp-cvr/thanks-v2/";
  const NENSHU_THANKS_V1_PATH = "/denki-lp-cvr/nenshu-shindan/thanks/";
  const LEAD_SESSION_KEY = "dk_lp_lead_v1";
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];

  function buildThanksQuery() {
    const params = new URLSearchParams();
    const lp = window.__LP_ID || "";
    if (lp) params.set("lp", lp);
    const incoming = new URLSearchParams(location.search);
    UTM_KEYS.forEach((key) => {
      const val = incoming.get(key);
      if (val) params.set(key, val);
    });
    const q = params.toString();
    return q ? `?${q}` : "";
  }

  /** 職種LP → thanks-v2、年収診断 → 専用サンクス */
  function buildThanksUrl() {
    const path = location.pathname;
    if (path.includes("/nenshu-shindan-v2/") && !path.includes("/thanks")) {
      return path.replace(/\/[^/]+\/?$/, "/thanks/") + buildThanksQuery();
    }
    if (path.includes("/nenshu-shindan/") && !path.includes("/thanks")) {
      return NENSHU_THANKS_V1_PATH + buildThanksQuery();
    }
    return THANKS_V2_PATH + buildThanksQuery();
  }

  function prewarmThanksBookingSlots() {
    var el =
      document.currentScript ||
      document.querySelector('script[src*="app-v2.js"]');
    if (el && el.src && !document.querySelector('link[data-dk-booking-slots-preload]')) {
      var jsonHref = el.src.replace(/app-v2\.js(\?.*)?$/, "../data/booking-slots.json");
      var preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "fetch";
      preload.href = jsonHref;
      preload.crossOrigin = "anonymous";
      preload.setAttribute("data-dk-booking-slots-preload", "1");
      document.head.appendChild(preload);
    }
    if (window.dkBookingSlotsFetch) {
      window.dkBookingSlotsFetch(false);
      return;
    }
    if (!el || !el.src) return;
    var bootSrc = el.src.replace(
      /app-v2\.js(\?.*)?$/,
      "thanks-booking-bootstrap.js?v=11"
    );
    var s = document.createElement("script");
    s.src = bootSrc;
    s.async = true;
    s.onload = function () {
      if (window.dkBookingSlotsFetch) window.dkBookingSlotsFetch(false);
    };
    document.head.appendChild(s);
  }

  function persistLeadForThanks() {
    const lp = window.__LP_ID || "unknown";
    try {
      sessionStorage.setItem(
        LEAD_SESSION_KEY,
        JSON.stringify({ ts: Date.now(), lp, href: location.href })
      );
    } catch (e) { /* private mode */ }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "lead_form_submit",
      lp_slug: lp,
      page_location: location.href,
      page_path: location.pathname
    });
    if (window.clarity) {
      try { window.clarity("set", "lp_step", "submitted"); } catch (e) { /* no-op */ }
    }
  }

  // ========== Icon system (DOM移動方式) ==========
  let icon = null;

  function moveIcon(targetEl, scroll) {
    if (!icon || !targetEl) return;
    const wrapper = targetEl.closest(".c-section, .p-first__buttonArea, .p-step05__address, .p-step06__name, .p-step07__tel, .c-nextLink, .p-step06__birthday, .js-form-group");
    if (wrapper) {
      wrapper.style.position = "relative";
      if (icon.parentNode !== wrapper) wrapper.appendChild(icon);
    }
    icon.style.cssText = "position:absolute;right:0;bottom:-30px;pointer-events:none;z-index:3;opacity:1";
    if (scroll && wrapper) {
      // block:"center"は上部(STEP表示/タイトル)を画面外へ押し出す(頻出バグ 2026-07-05)。
      // nearestならCTAが見えていればスクロールせず、見えない時だけ最小限で表示する。
      setTimeout(() => wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    }
  }

  function moveIconById(id, scroll) {
    if (!id || id === "#") return;
    const el = document.querySelector(id);
    if (el) moveIcon(el, scroll);
  }

  // ========== Page transitions ==========
  // skipAnim: 初回表示（load時のstep-first）用。opacity:0→フェードインの掛け直しと
  // load時のscrollTo(0,0)をスキップする。終着状態(opacity:1/transform)は必ず明示する
  // （2026-07-08 FV非表示インシデント: WPテーマCSSの .js-page-body{opacity:0} を
  //   旧アニメ終着インラインが偶然打ち消していた。app.jsと同一パターン）。
  function showPage(pageId, skipAnim) {
    const page = document.querySelector(pageId);
    if (!page) return;

    // step-firstからスタートしたkumaを各ステップで使い回す。
    // 各stepにkuma要素は無いので、見つかった時だけ更新（無ければ前回のicon参照を保持）。
    const foundIcon = page.querySelector(".cvr-kuma, .js-fixed-icon");
    if (foundIcon) icon = foundIcon;

    // step-firstに戻った場合は通知等を再表示
    if (pageId === "#step-first") {
      document.querySelectorAll(".is-hidden").forEach(el => el.classList.remove("is-hidden"));
    }

    document.body.classList.toggle("lp-form-step", pageId !== "#step-first");

    if (pageId === "#step06" || pageId === "#step-last") {
      prewarmThanksBookingSlots();
    }

    if (pageId === "#step-first") {
      page.style.cssText = skipAnim
        ? "display:flex;flex-direction:column;min-height:calc(100svh - 200px);opacity:1;transform:translateX(0)"
        : "display:flex;flex-direction:column;min-height:calc(100svh - 200px);opacity:0;transform:translateX(50px);transition:none";
      var mc = page.querySelector(".cvr-micro-copy");
      if (mc) mc.style.marginTop = "auto";
    } else if (pageId === "#step01") {
      page.style.cssText = "display:flex;flex-direction:column;min-height:calc(100svh - 72px);min-height:calc(100dvh - 72px);opacity:0;transform:translateX(50px);transition:none";
      initLicenseIcons();
    } else {
      page.style.display = "block";
      page.style.opacity = "0";
      page.style.transform = "translateX(50px)";
      page.style.transition = "none";
    }

    // ページ切替「後」に瞬時スクロールでトップへ戻す（step06で上部が隠れる問題 2026-07-03）。
    // レイアウトが未反映(dirty)のまま scrollTo すると、直後のレイアウト確定時に
    // スクロールアンカリングが旧位置を復元してしまうため、reflow を強制してから戻す。
    // html{scroll-behavior:smooth} もアニメーション化で他スクロールに割り込まれるため一時的に無効化。
    // 初回表示（skipAnim）はページ切替ではないためスクロールを動かさない。
    if (!skipAnim) {
      var deSB = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      void page.offsetHeight;
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = deSB;
    }

    // step-firstはCSS制御の元位置(.cvr-kuma-wrap)に戻し、それ以外は入力エリアに移動
    if (pageId === "#step-first") {
      const wrap = page.querySelector(".cvr-kuma-wrap");
      if (wrap && icon && icon.parentNode !== wrap) {
        icon.style.cssText = "";
        wrap.appendChild(icon);
      }
    } else {
      const firstArea = page.querySelector(".c-button-grid, .c-zip-text, .p-step05__accordionBodyInner, .p-step06__name, .p-step07__tel");
      if (firstArea && icon) {
        firstArea.style.position = "relative";
        firstArea.appendChild(icon);
        icon.style.cssText = "position:absolute;right:0;bottom:-30px;pointer-events:none;z-index:3;opacity:1";
      }
    }

    // iOS Safari でキーボードを自動で開くには、ユーザータップ直後の同期focusが必須。
    // setTimeoutの中で focus() してもキーボードは開かないため、ここで先に同期で focus する。
    // (transition前にfocusしてもinputは見えているのでUX的に問題ない)
    const autoFocusEl = page.querySelector('input[type="tel"]:not([type="hidden"]), input[type="text"]:not([type="hidden"])');
    // アプリ内ブラウザ(LINE/Instagram等)ではステップ到達時の自動フォーカスをしない
    // （キーボードオープン時のブラウザ主導スクロールでSTEP表示が隠れる。2026-07-08 再発対策）
    if (autoFocusEl && !autoFocusEl.value && !document.documentElement.classList.contains("dk-inapp")) {
      try { autoFocusEl.focus({ preventScroll: true }); } catch (e) { autoFocusEl.focus(); }
    }

    if (skipAnim) {
      // アニメーション無しでも終着状態は必ず明示（FV非表示インシデント対策）
      page.style.opacity = "1";
      page.style.transform = "translateX(0)";
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          page.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
          page.style.opacity = "1";
          page.style.transform = "translateX(0)";
        });
      });
    }
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const cur = btn.closest(".js-form-group");

    // ステップ遷移時に通知・社会的証明・信頼バーを非表示
    const hideOnStep = document.querySelectorAll(".cvr-live-notification, .cvr-social-proof, .cvr-trust-bar");
    hideOnStep.forEach(el => el.classList.add("is-hidden"));

    // step05→step06遷移時に名前を挿入
    if (pageTo === "step06") {
      const last = document.getElementById("last-name");
      const nameTxt = document.getElementById("nametxt");
      if (last && nameTxt && nameTxt.innerHTML.includes("{name}")) {
        nameTxt.innerHTML = nameTxt.innerHTML.replace("{name}", last.value);
      }
    }

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
    const hiddens = document.querySelectorAll(".hidden-element02");
    if (!buttons.length) return;
    const titles = group.querySelectorAll(".js-icon-target");
    const nextBtn = group.querySelector(".js-next-button");
    const states = [];

    function sync() {
      hiddens.forEach((input, i) => {
        if (input.value) {
          const el = document.querySelector('.js-radio-button02[data-value="' + input.value + '"]');
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
      sync();

      if (states.every(Boolean)) {
        // 両方選択済み → 直接ページ遷移
        nextBtn.classList.remove(DISABLE);
        const cur = nextBtn.closest(".js-form-group");
        cur.style.display = "none";
        cur.style.opacity = "0";
        cur.style.transform = "translateX(50px)";
        showPage("#" + nextBtn.dataset.pageTo);
      } else {
        // 未選択のセクションへクマ移動+スクロール誘導
        for (let i = 0; i < states.length; i++) {
          if (!states[i] && titles[i]) {
            // 次のボタングリッドにクマを移動
            const nextSection = titles[i].closest(".c-section");
            const nextGrid = nextSection ? nextSection.querySelector(".c-button-grid") : null;
            if (nextGrid && icon) { nextGrid.style.position = "relative"; nextGrid.appendChild(icon); }
            titles[i].scrollIntoView({ behavior: "smooth", block: "start" });
            break;
          }
        }
      }
    }));
  }

  // ========== License icons (step01・資格ごと) ==========
  const THEME_IMG = "https://denkilp.builders-job.com/wp-content/themes/original-thema/assets/img";
  const LICENSE_ICON_SRC = {
    // 人物系アイコンを資格ごとに割当（全て同系統のイラストで統一感を保ちつつ差別化）
    kentiku: THEME_IMG + "/step03_icon02.png",      // 建築: 緑作業着 + 設計図
    doboku: THEME_IMG + "/step03_icon03.png",       // 土木: 黄ヘル + 水色作業着 + 腕組み
    denkisekou: THEME_IMG + "/denkisekou.png",      // 電気施工管理: 白ヘル + 図面
    denkikouji: THEME_IMG + "/denkikouji.png",      // 電気工事士: 青作業着 + 工具
    denkishunin: THEME_IMG + "/denkishunin.png",    // 電気主任: 黄ヘル + ネクタイ + 腕組み
    kankou: THEME_IMG + "/step03_icon01.png",       // 管工事: メガネ + 白衣 + ヘル
    other: THEME_IMG + "/other.png"                  // その他: 拳上げ
  };

  function licenseIconKey(value) {
    const rules = [
      [/その他/, "other"],
      [/電気主任技術者/, "denkishunin"],
      [/電気工事士|第一種|第二種/, "denkikouji"],
      [/電気施工管理|電気施工管理/, "denkisekou"],
      [/管工事施工管理/, "kankou"],
      [/土木施工管理/, "doboku"],
      [/建築施工管理/, "kentiku"]
    ];
    for (let i = 0; i < rules.length; i++) {
      if (rules[i][0].test(value)) return rules[i][1];
    }
    return "other";
  }

  function initLicenseIcons() {
    const step01Buttons = document.querySelectorAll("#step01 .p-step01__button[data-value]");
    if (step01Buttons.length >= 7) return;
    step01Buttons.forEach((btn) => {
      const key = licenseIconKey(btn.getAttribute("data-value") || "");
      const src = LICENSE_ICON_SRC[key];
      if (!src) return;
      const wrap = btn.querySelector(".c-button__img");
      if (!wrap) return;
      wrap.innerHTML =
        '<img loading="lazy" decoding="async" src="' +
        src +
        '" alt="" width="52" height="52">';
      btn.setAttribute("data-license-icon", key);
    });
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
      if (vals.license01) {
        try {
          const first = vals.license01.split(",")[0].trim();
          if (first) sessionStorage.setItem("_license", first);
        } catch (e) { /* private mode */ }
      }
    }

    function hasAny() {
      return Array.from(buttons).some(b => b.classList.contains(ACTIVE));
    }

    // 資格選択後の自動遷移（HTMLの data-auto-advance-ms が有るときだけ）
    const autoAdvanceMs = parseInt(group.dataset.autoAdvanceMs || "0", 10);
    let autoAdvanceTimer = null;
    function scheduleAutoAdvance() {
      if (!autoAdvanceMs || !nextBtn) return;
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = setTimeout(() => {
        if (hasAny() && !nextBtn.classList.contains(DISABLE) && getComputedStyle(group).display !== "none") nextBtn.click();
      }, autoAdvanceMs);
    }

    buttons.forEach(b => b.addEventListener("click", () => {
      b.classList.toggle(ACTIVE);
      updateHiddens();
      if (hasAny()) {
        nextBtn.classList.remove(DISABLE);
        moveIconById("#" + nextBtn.id, true);
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

  // ========== Prefecture only (zip廃止版) ==========
  function initPrefOnly(group) {
    const prefSel = group.querySelector("#pref");
    if (!prefSel) return;
    // 旧zip併用画面は initZipCode に任せる
    if (group.querySelector("#zip")) return;
    const prefH = group.querySelector("#your-pref");
    const nextBtn = group.querySelector(".js-next-button");
    const target = group.querySelector("#step04-icon-start-target");
    let valid = false;
    function updateBtn() {
      nextBtn.classList.toggle(DISABLE, !valid);
      if (valid) {
        if (target) target.classList.add(SKIP);
        prefSel.classList.add(SKIP);
        moveIconById("#" + nextBtn.id, true);
      } else {
        if (target) target.classList.remove(SKIP);
        prefSel.classList.remove(SKIP);
        if (target) moveIconById("#" + target.id);
      }
    }
    let prefAdvTimer = null;
    prefSel.addEventListener("change", () => {
      const opt = prefSel.options[prefSel.selectedIndex];
      if (opt && opt.value && opt.value !== "00" && opt.textContent) {
        if (prefH) prefH.value = opt.textContent;
        valid = true;
      } else {
        if (prefH) prefH.value = "";
        valid = false;
      }
      updateBtn();
      // 都道府県を選んだら自動で次へ（他ステップと挙動を統一）
      // window.__noAreaAutoAdvance が true のLPでは無効（既定は従来通り）
      clearTimeout(prefAdvTimer);
      if (valid && !window.__noAreaAutoAdvance) {
        prefAdvTimer = setTimeout(() => {
          if (valid && !nextBtn.classList.contains(DISABLE)) nextBtn.click();
        }, 450);
      }
    });
    group._clearPrefAdvance = () => clearTimeout(prefAdvTimer);
    updateBtn();
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
        moveIconById("#" + nextBtn.id, true);
      } catch (e) {}
    }

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
      } catch (e) {}
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
    });

    updateBtn();
  }

  // ========== Name inputs ==========
  function initNameInputs(group) {
    const inputs = group.querySelectorAll(".js-name-input");
    if (!inputs.length) return;
    const target = group.querySelector("#step05-icon-start-target");
    const nextBtn = group.querySelector(".js-next-button");
    const errBox = group.querySelector("#error-name");
    const errText = errBox ? errBox.querySelector("p") : null;
    const bdayYearInput = group.querySelector("#bday-year");
    const isYearInput = bdayYearInput && bdayYearInput.tagName === "INPUT";

    function allFilled() {
      if (!Array.from(inputs).every(i => !!i.value)) return false;
      // bday-year が input の場合: 西暦4桁が入っているかチェック
      if (isYearInput) {
        const v = (bdayYearInput.value || "").trim();
        if (!/^[0-9]{4}$/.test(v)) return false;
        const n = parseInt(v, 10);
        if (n < 1924 || n > 2023) return false;
      }
      return true;
    }

    // 生年月日 input の変更も validation に反映。
    // タイピング中はエラー表示を切り替えない（1文字ごとに「19→199…」が不正扱いで
    // エラーが出没しレイアウトがジャンプ＝「入力がバグる」体感 2026-07-05 オーナー報告）
    if (isYearInput) {
      bdayYearInput.addEventListener("input", () => validate({ silent: true }));
      bdayYearInput.addEventListener("blur", () => validate());
    }

    function validate(opts) {
      opts = opts || {};
      if (allFilled()) {
        nextBtn.classList.remove(DISABLE);
        target.classList.add(SKIP);
        if (errBox) errBox.style.display = "none";
        // 入力が揃ったらクマをCTA（次へ）へ移動（旧実装は生年月日エリアに留まり誘導が切れていた）
        // タイピング中(silent)はスクロールさせない（4桁目入力の瞬間に画面が動くのを防止 2026-07-05）
        moveIconById("#" + nextBtn.id, !opts.silent);
        // 姓+名 両方埋まったら生年月日に視覚的誘導（first-name の入力完了時のみ）
        // iOS Safari の <select> は focus() ではピッカーが開かない仕様。
        // スクロール + ハイライトでユーザーにタップを促す。
        if (opts.autoAdvance) {
          const bdayYear = document.getElementById("bday-year");
          if (bdayYear) {
            setTimeout(() => {
              bdayYear.scrollIntoView({ behavior: "smooth", block: "nearest" }); // center禁止(上部が隠れる 2026-07-05)
              bdayYear.focus();
              bdayYear.classList.add("js-pulse-highlight");
              setTimeout(() => bdayYear.classList.remove("js-pulse-highlight"), 2400);
            }, 200);
          }
        }
      } else {
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
        if (errBox && !opts.silent) {
          errBox.style.display = "block";
          if (errText) {
            // どの項目が未入力かで具体的に出し分け
            const missing = [];
            const lastN = group.querySelector("#last-name");
            const firstN = group.querySelector("#first-name");
            if (lastN && !lastN.value) missing.push("姓");
            if (firstN && !firstN.value) missing.push("名");
            if (isYearInput) {
              const v = (bdayYearInput.value || "").trim();
              if (!/^[0-9]{4}$/.test(v)) {
                missing.push("生まれ年(西暦4桁)");
              } else {
                const n = parseInt(v, 10);
                if (n < 1924 || n > 2023) missing.push("生まれ年(1924〜2023)");
              }
            }
            if (missing.length === 0) {
              errText.textContent = "入力内容をご確認ください";
            } else if (missing.length === 1) {
              errText.textContent = missing[0] + "を入力してください";
            } else {
              errText.textContent = missing.join("・") + "を入力してください";
            }
          }
        }
        moveIconById("#" + target.id);
      }
    }

    inputs.forEach(input => input.addEventListener("blur", () => validate()));

    // 姓・名を「入力し終えてフィールドを離れた(blur)」ときだけ生年月日(西暦)へ誘導する。
    // 旧実装は input 中（姓・名が各1文字入った瞬間）に focus を奪い、名前が中途半端に
    // 確定する事故が多発したため、blur（名フィールドを離れた）かつ両方入力済み・一度だけに変更。
    function namesAllFilled() {
      return Array.from(inputs).every(i => !!(i.value || "").trim());
    }
    const firstNameInput = group.querySelector("#first-name") || inputs[inputs.length - 1];
    let didAutoAdvanceYear = false;
    function maybeAdvanceToYear() {
      if (didAutoAdvanceYear) return;
      if (!namesAllFilled()) return;
      if (!(bdayYearInput && isYearInput) || bdayYearInput.value) return;
      didAutoAdvanceYear = true;
      try { bdayYearInput.focus({ preventScroll: false }); } catch (e) { bdayYearInput.focus(); }
    }
    if (firstNameInput) firstNameInput.addEventListener("blur", maybeAdvanceToYear);

    // Initial: disable
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

      // 電話番号: 桁表示 + プレフィックス検証(060/070/080/090) + 11桁で自動送信
      if (item.name === "your-tel") {
        const telNotice = document.getElementById("tel-notice");
        let telAutoTimer = null;
        const clearTelAutoSubmit = () => { if (telAutoTimer) { clearTimeout(telAutoTimer); telAutoTimer = null; } };
        const scheduleTelAutoSubmit = () => {
          clearTelAutoSubmit();
          telAutoTimer = setTimeout(() => {
            if (!isValidMobileTel(item.value)) return;
            if (nextBtn.classList.contains(DISABLE)) return;
            if (nextBtn.style.pointerEvents === "none") return;
            nextBtn.click();
          }, 700);
        };
        item.addEventListener("input", () => {
          const digits = item.value.replace(/\D/g, "");
          if (digits !== item.value) item.value = digits;
          const len = item.value.length;
          if (telNotice) {
            if (len === 0) { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし"; }
            else if (len === 11 || hasInvalidTelPrefix(item.value)) { telNotice.style.display = "none"; }
            else { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし あと" + (11 - len) + "桁"; }
          }
          if (isValidMobileTel(item.value)) {
            if (errBox) errBox.style.display = "none";
            states[i] = true; item.classList.add(SKIP);
            moveIconById("#" + nextBtn.id);
            updateBtn();
            scheduleTelAutoSubmit();
          } else {
            if (errBox) {
              if (hasInvalidTelPrefix(item.value)) {
                errBox.style.display = "block";
                if (errText) errText.textContent = TEL_PREFIX_ERROR;
              } else if (errText && errText.textContent === TEL_PREFIX_ERROR) {
                errBox.style.display = "none";
              }
            }
            states[i] = false; item.classList.remove(SKIP);
            updateBtn();
            clearTelAutoSubmit();
          }
        });
      }

      item.addEventListener("blur", () => {
        if (item.nextElementSibling) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = item.nextElementSibling.textContent; }
          states[i] = false; arr[i].classList.remove(SKIP);
        } else {
          if (errBox) errBox.style.display = "none";
          if (item.value) { states[i] = true; arr[i].classList.add(SKIP); }
        }
        if (item.name === "your-tel" && item.value && !/^[0-9]+$/.test(item.value)) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = "電話番号は半角数字で入力してください"; }
          states[i] = false; arr[i].classList.remove(SKIP);
        }
        if (item.name === "your-tel" && item.value && /^[0-9]+$/.test(item.value) && item.value.length < 11) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = "電話番号を11桁で入力してください（あと" + (11 - item.value.length) + "桁）"; }
          states[i] = false; arr[i].classList.remove(SKIP);
        }
        if (item.name === "your-tel" && item.value && /^[0-9]{11}$/.test(item.value) && !isValidMobileTel(item.value)) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = TEL_PREFIX_ERROR; }
          states[i] = false; arr[i].classList.remove(SKIP);
        }
        if (states.every(Boolean)) moveIconById("#" + nextBtn.id);
        else { const idx = states.indexOf(false); if (idx >= 0) moveIconById("#" + arr[idx].id); }
        updateBtn();
      });

      nextBtn.addEventListener("click", () => {
        setTimeout(() => { item.focus(); item.blur(); }, 250);
      });
    });

    // 送信ボタン(step-last-button)の場合
    if (nextBtn.id === "step-last-button") {
      nextBtn.addEventListener("click", () => {
        setTimeout(() => {
          if (!states.every(Boolean)) return;
          const textEl = nextBtn.querySelector(".c-submit-button__text");
          if (textEl) textEl.innerText = "検索中...";
          nextBtn.style.pointerEvents = "none";
          const form = document.querySelector(".wpcf7-form");
          if (form) form.dispatchEvent(new Event("submit", { bubbles: true }));
          // Store phone for email correlation on thanks page
          const tel = document.querySelector('input[name="your-tel"]');
          try {
            if (tel && tel.value) sessionStorage.setItem("_tel", tel.value);
            var lastEl = document.querySelector('input[name="your-last-name"]');
            var firstEl = document.querySelector('input[name="your-first-name"]');
            var fullName = ((lastEl && lastEl.value) || "") + " " + ((firstEl && firstEl.value) || "");
            fullName = fullName.trim();
            if (fullName) sessionStorage.setItem("_name", fullName);
            if (window.__LP_ID) sessionStorage.setItem("_lp", window.__LP_ID);
            var licEl = document.getElementById("license01");
            var firstLic = "";
            if (licEl && licEl.value) {
              firstLic = licEl.value.split(",")[0].trim();
              if (firstLic) sessionStorage.setItem("_license", firstLic);
            }
            var feelingEl = document.querySelector('input[name="your-feeling"]');
            if (feelingEl && feelingEl.value) {
              sessionStorage.setItem("dk_job_intent", feelingEl.value.trim());
            }
            var prefEl = document.getElementById("your-pref");
            var cityEl = document.getElementById("your-city");
            var expEl = document.querySelector('[name="your-experience"]');
            var willEl = document.querySelector('[name="your-willingness"]');
            sessionStorage.setItem(
              "dk_lead_profile",
              JSON.stringify({
                license: firstLic,
                pref: (prefEl && prefEl.value) || "",
                city: (cityEl && cityEl.value) || "",
                experience: (expEl && expEl.value) || "",
                willingness: (willEl && willEl.value) || ""
              })
            );
          } catch (e) {}
          prewarmThanksBookingSlots();
          persistLeadForThanks();
          setTimeout(() => { location.href = buildThanksUrl(); }, 600);
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
    });
  }

  // ========== Prefecture select (エリア別 optgroup) ==========
  function initPrefSelect() {
    const sel = document.getElementById("pref");
    if (!sel) return;
    const REGIONS = [
      ["関東", ["東京都","神奈川県","埼玉県","千葉県","栃木県","群馬県","茨城県"]],
      ["関西", ["大阪府","兵庫県","京都府","滋賀県","奈良県","和歌山県"]],
      ["東海", ["愛知県","静岡県","岐阜県","三重県"]],
      ["北海道・東北", ["北海道","宮城県","福島県","青森県","山形県","秋田県","岩手県"]],
      ["北陸・甲信越", ["新潟県","長野県","石川県","富山県","山梨県","福井県"]],
      ["中国・四国", ["広島県","岡山県","山口県","愛媛県","香川県","徳島県","高知県","鳥取県","島根県"]],
      ["九州・沖縄", ["福岡県","熊本県","鹿児島県","長崎県","大分県","宮崎県","佐賀県","沖縄県"]]
    ];
    let h = '<option value="" selected disabled>都道府県を選択</option>';
    let idx = 0;
    REGIONS.forEach(r => {
      h += '<optgroup label="' + r[0] + '">';
      r[1].forEach(p => {
        idx++;
        h += '<option value="' + String(idx).padStart(2,"0") + '">' + p + '</option>';
      });
      h += '</optgroup>';
    });
    sel.innerHTML = h;
  }

  // ========== Birthday selects (year は input になったらスキップ) ==========
  function initBirthday() {
    const y = document.getElementById("bday-year");
    const m = document.getElementById("bday-month");
    const d = document.getElementById("bday-day");
    if (y && y.tagName === "SELECT") { let h = ""; for (let i = 1924; i <= 2023; i++) h += '<option value="'+i+'"'+(i===1990?' selected':'')+'>'+i+'</option>'; y.innerHTML = h; }
    if (m && m.tagName === "SELECT") { let h = ""; for (let i = 1; i <= 12; i++) h += '<option value="'+i+'">'+i+'</option>'; m.innerHTML = h; }
    if (d && d.tagName === "SELECT") { let h = ""; for (let i = 1; i <= 31; i++) h += '<option value="'+i+'">'+i+'</option>'; d.innerHTML = h; }
  }

  // ========== Form mirror (Zapier + Google Sheets via GAS) ==========
  function isTestLeadSubmission(tel, last, first) {
    const t = String(tel || "").trim();
    const ln = String(last || "").trim();
    const fn = String(first || "").trim();
    if (/^09012345678$|^08012345678$|^07012345678$/.test(t)) return true;
    if (ln === "テスト" && (fn === "太郎" || fn === "テスト")) return true;
    if (/テスト/.test(ln + fn)) return true;
    try {
      if (/[?&](?:_test|dk_test)=1(?:&|$)/.test(location.search)) return true;
    } catch (e) { /* noop */ }
    return false;
  }

  function initZapierMirror() {
    const ZAPIER_URL = "https://hooks.zapier.com/hooks/catch/2795777/3sgrmvb/";
    // GAS Web App URL（デプロイ後にここへ貼る。空のままなら GAS送信は無効）
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzC4fMEbOhaymimRwaLDJ34eKwSRyfYVVRMeNGl_cMjR8p7dC9cVw84YZJUvggkROiKRw/exec";
    const form = document.querySelector(".wpcf7-form");
    if (!form) return;
    let sentOnce = false;
    let clientIp = "";

    // IP取得は初期ロード後アイドル時に実行（送信前に確実に取得するため）
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
      if (!sent) fetch(url, { method: "POST", mode: "no-cors", keepalive: true, body: body }).catch(() => {});
    }

    function sendToMirrors() {
      if (sentOnce) return;
      // 必須項目（電話番号11桁・姓・名）が埋まっていなければ送信しない。
      // form内の type="submit" がネイティブsubmitイベントを発火させても、
      // 未入力のゴミデータがZapier/GASに飛ばないように最終ガード。
      const tel = (form.querySelector('input[name="your-tel"]') || {}).value || "";
      const last = (form.querySelector('input[name="your-last-name"]') || {}).value || "";
      const first = (form.querySelector('input[name="your-first-name"]') || {}).value || "";
      if (!/^[0-9]{10,11}$/.test(tel) || !last.trim() || !first.trim()) return;
      if (isTestLeadSubmission(tel, last, first)) return;
      sentOnce = true;
      try {
        const fd = new FormData(form);
        const params = new URLSearchParams();
        fd.forEach((v, k) => { if (!k.startsWith("_wpcf7")) params.append(k, v == null ? "" : String(v)); });
        params.append("_page", location.href);
        params.append("_referrer", document.referrer || "");
        params.append("_submitted_at", new Date().toISOString());
        params.append("_lp", window.__LP_ID || "unknown");
        params.append("_ip", clientIp);
        params.append("_user_agent", navigator.userAgent || "");
        const body = params.toString();
        postTo(ZAPIER_URL, body);
        postTo(GAS_URL, body);
      } catch (e) { sentOnce = false; }
    }

    // required(電話番号)チェック通過後に dispatchEvent('submit') 経由で発火する。
    // submit ボタンの click capture には登録しない（未入力でゴミデータが飛ぶのを防ぐため）。
    form.addEventListener("submit", sendToMirrors, { capture: true });
  }

  // ========== Init ==========
  function initForm() {
    const groups = document.querySelectorAll(".js-form-group");
    if (!groups.length) return;

    initLicenseIcons();
    document.querySelectorAll(".js-step-button").forEach(b => b.addEventListener("click", handleStepClick));

    queueMicrotask(() => {
      groups.forEach(g => {
        initRadioButtons(g);
        initRadioButtons02(g);
        initCheckboxButtons(g);
        initZipCode(g);
        initPrefOnly(g);
        initNameInputs(g);
        initRequiredItems(g);
      });
      initCookieName();
      initZapierMirror();
      preventEnter();
      // initZipCode等のupdateIcons()が初期化時にkumaをstep04入力エリアへ移動する場合があるため、
      // FV表示中はkumaを定位置(.cvr-kuma-wrap)へ戻す（FVでクマが消える不具合の防止）
      if (!document.body.classList.contains("lp-form-step")) {
        const fvWrap = document.querySelector("#step-first .cvr-kuma-wrap");
        const kuma = document.querySelector(".cvr-kuma");
        if (fvWrap && kuma && kuma.parentNode !== fvWrap) { kuma.style.cssText = ""; fvWrap.appendChild(kuma); }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPrefSelect();
    initBirthday();
    if (document.body.classList.contains("p-pageThanks")) {
      const el = document.querySelector("#set-user-name");
      const h = document.querySelector("#hidden-your-name");
      if (el && Cookie.get("user-name")) {
        el.textContent = Cookie.get("user-name") + "様";
        if (h) h.value = Cookie.get("user-name");
      }
    }
  });

  window.addEventListener("load", () => {
    if (!document.body.classList.contains("p-pageThanks")) {
      if (document.getElementById("step-first")) showPage("#step-first", true);
      initForm();
    }
  });
})();
/**
 * CVR Boost Script - 電気工事バンク LP改善
 */
(function () {
  "use strict";

  // ========== URL パラメータ取得 ==========
  function getParam(name) {
    var match = new RegExp("[?&]" + name.replace(/[\[\]]/g, "\\$&") + "(=([^&#]*)|&|#|$)").exec(location.href);
    return match && match[2] ? decodeURIComponent(match[2].replace(/\+/g, " ")) : null;
  }

  // ========== 離脱防止 ==========
  function initExitIntent() {
    var shown = false;

    function showExitMessage() {
      if (shown) return;
      var feeling = document.querySelector('input[name="your-willingness"]');
      if (!feeling || !feeling.value) return;
      shown = true;

      var overlay = document.createElement("div");
      overlay.className = "cvr-exit-overlay";
      overlay.innerHTML =
        '<div class="cvr-exit-modal">' +
        '<p class="cvr-exit-modal__title">入力が大変な方へ</p>' +
        '<p class="cvr-exit-modal__text">LINEに登録するだけで<strong>あなたに合った求人</strong>をお届けします。<br>入力作業は一切不要です。</p>' +
        '<a class="cvr-exit-modal__btn cvr-exit-modal__btn--line" id="cvr-exit-line" href="https://lin.ee/PzFJp7H" target="_blank" rel="noopener" style="background:#06C755;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;color:#fff">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" fill="#fff"/></svg>' +
        'LINEで求人を受け取る</a>' +
        '<button class="cvr-exit-modal__close" id="cvr-exit-close">閉じてフォームに戻る</button>' +
        "</div>";

      document.body.appendChild(overlay);

      function close() { overlay.remove(); }
      var lineBtn = document.getElementById("cvr-exit-line");
      if (lineBtn) lineBtn.addEventListener("click", function () {
        // LINE遷移はそのまま、計測のためにoverlayは閉じる
        setTimeout(close, 100);
        try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: "exit_intent_line_click" }); } catch (e) {}
      });
      document.getElementById("cvr-exit-close").addEventListener("click", close);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    }

    document.addEventListener("mouseleave", function (e) { if (e.clientY < 10) showExitMessage(); });

    if ("pushState" in history) {
      history.pushState(null, "", location.href);
      window.addEventListener("popstate", function () {
        history.pushState(null, "", location.href);
        showExitMessage();
      });
    }
  }

  // ========== フォームトラッキング ==========
  function initFormTracking() {
    document.querySelectorAll(".js-step-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.pageTo && window.dataLayer) {
          window.dataLayer.push({ event: "form_step", step_name: btn.dataset.pageTo });
        }
        // ClarityのExport APIはステップ別ファネルを返さないため、到達ステップをタグ付けする
        if (btn.dataset.pageTo && window.clarity) {
          try { window.clarity("set", "lp_step", btn.dataset.pageTo); } catch (e) { /* no-op */ }
        }
      });
    });
  }

  // ========== 数値カウントアップ ==========
  function initCountUp() {
    var els = document.querySelectorAll(".cvr-social-proof__number");
    if (!els.length) return;
    var done = false;
    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || done) return;
      done = true;
      els.forEach(function (el) {
        var raw = el.textContent;
        var suffix = raw.replace(/[\d,]/g, "");
        var target = parseFloat(raw.replace(/[^\d.]/g, ""));
        var dec = (raw.match(/\.(\d+)/) || [0, ""])[1].length;
        var duration = 1500;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var val = progress * target;
          el.textContent = (dec ? val.toFixed(dec) : Math.floor(val).toLocaleString()) + suffix;
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = (dec ? target.toFixed(dec) : target.toLocaleString()) + suffix;
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    observer.observe(els[0].closest(".cvr-social-proof"));
  }

  // ========== 初期化（離脱防止は即時、その他 CVR はアイドル時・最大 ~2s で実行） ==========
  document.addEventListener("DOMContentLoaded", function () {
    var h4 = document.getElementById("hidden4");
    if (h4 && !h4.value) {
      // 流入URLの検索KW（utm_term > keyword > kw）を拾い、URLから消えても
      // sessionStorage に保持する（app.js / cvr-boost.js と挙動を統一）。
      // 空で上書きしないよう、値を拾えたときだけ反映する。
      var term = getParam("utm_term") || getParam("keyword") || getParam("kw") || "";
      try {
        if (term) sessionStorage.setItem("dk_utm_term", term);
        else term = sessionStorage.getItem("dk_utm_term") || "";
      } catch (e) {}
      if (term) h4.value = term.slice(0, 200);
    }

    initExitIntent();

    function runCvrBoostRest() {
      initFormTracking();
      initCountUp();
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runCvrBoostRest, { timeout: 2000 });
    } else {
      setTimeout(runCvrBoostRest, 0);
    }
  });
})();
