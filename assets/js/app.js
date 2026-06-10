(() => {
  "use strict";

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
    const el =
      document.currentScript ||
      document.querySelector('script[src*="app.js"]');
    if (el && el.src && !document.querySelector("link[data-dk-booking-slots-preload]")) {
      const jsonHref = el.src.replace(/app\.js(\?.*)?$/, "../data/booking-slots.json");
      const preload = document.createElement("link");
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
    const bootSrc = el.src.replace(/app\.js(\?.*)?$/, "thanks-booking-bootstrap.js?v=11");
    if (document.querySelector('script[data-dk-booking-bootstrap]')) return;
    const s = document.createElement("script");
    s.src = bootSrc;
    s.async = true;
    s.setAttribute("data-dk-booking-bootstrap", "1");
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
      setTimeout(() => wrapper.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }

  function moveIconById(id, scroll) {
    if (!id || id === "#") return;
    const el = document.querySelector(id);
    if (el) moveIcon(el, scroll);
  }

  const STEP_PROGRESS = {
    "step-first": { pct: 8, label: "" },
    step01: { pct: 25, label: "あと4ステップ" },
    step03: { pct: 42, label: "あと3ステップ" },
    step03b: { pct: 50, label: "あと3ステップ" },
    step04: { pct: 58, label: "あと2ステップ" },
    step05: { pct: 75, label: "あと1ステップ" },
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

  function clearStepTimers() {
    document.querySelectorAll(".js-form-group").forEach((g) => {
      if (typeof g._clearAutoAdvance === "function") g._clearAutoAdvance();
      if (typeof g._clearZipAutoAdvance === "function") g._clearZipAutoAdvance();
      if (typeof g._clearTelAutoSubmit === "function") g._clearTelAutoSubmit();
    });
  }

  function isValidTel(value) {
    return /^[0-9]{11}$/.test(String(value || "").trim());
  }

  const LAZY_STEP_IDS = new Set(["step03", "step04", "step05", "step06"]);
  let lazyStepsPromise = null;
  let lazyStepsReady = false;

  function getLazyStepsMount() {
    return document.getElementById("lazy-steps-mount");
  }

  function resolveLazyStepsUrl() {
    const mount = getLazyStepsMount();
    if (!mount) return "";
    const src = mount.dataset.lazySrc;
    if (!src) return "";
    try {
      return new URL(src, location.href).href;
    } catch (e) {
      return src;
    }
  }

  function prefetchLazySteps() {
    const url = resolveLazyStepsUrl();
    if (!url || lazyStepsReady || lazyStepsPromise) return;
    lazyStepsPromise = fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("lazy steps fetch failed"))))
      .catch(() => {
        lazyStepsPromise = null;
      });
  }

  function initFormGroup(group) {
    if (!group || group.dataset.lpInited === "1") return;
    group.dataset.lpInited = "1";
    initRadioButtons(group);
    initRadioButtons02(group);
    initCheckboxButtons(group);
    initZipCode(group);
    initNameInputs(group);
    initRequiredItems(group);
  }

  function ensureLazySteps() {
    if (lazyStepsReady) return Promise.resolve(true);
    const mount = getLazyStepsMount();
    if (!mount) return Promise.resolve(true);

    const finish = (html) => {
      if (!html || lazyStepsReady) return true;
      mount.insertAdjacentHTML("beforeend", html);
      lazyStepsReady = true;
      mount.removeAttribute("data-lazy-src");
      initPrefSelect();
      initBirthday();
      mount.querySelectorAll(".js-form-group").forEach(initFormGroup);
      preventEnter();
      return true;
    };

    if (lazyStepsPromise) {
      return lazyStepsPromise.then((html) => finish(html)).catch(() => false);
    }

    const url = resolveLazyStepsUrl();
    if (!url) return Promise.resolve(false);

    lazyStepsPromise = fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("lazy steps fetch failed"))));

    return lazyStepsPromise.then((html) => finish(html)).catch(() => {
      lazyStepsPromise = null;
      return false;
    });
  }

  // ========== Page transitions ==========
  function showPage(pageId) {
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
    document.body.classList.toggle(
      "lp-input-step",
      pageId === "#step04" || pageId === "#step05" || pageId === "#step06"
    );
    updateProgress(pageId);

    window.scrollTo(0, 0);

    if (pageId === "#step05") {
      const errBox = document.getElementById("error-name");
      if (errBox) errBox.style.display = "none";
    }

    if (pageId === "#step-first") {
      page.style.cssText = "display:flex;flex-direction:column;min-height:calc(100svh - 200px);opacity:0;transform:translateX(50px);transition:none";
      var mc = page.querySelector(".cvr-micro-copy");
      if (mc) mc.style.marginTop = "auto";
    } else if (pageId === "#step01") {
      page.style.cssText = "display:flex;flex-direction:column;min-height:calc(100svh - 72px);min-height:calc(100dvh - 72px);opacity:0;transform:translateX(50px);transition:none";
      prefetchLazySteps();
    } else {
      page.style.display = "block";
      page.style.opacity = "0";
      page.style.transform = "translateX(50px)";
      page.style.transition = "none";
    }

    const isInputStep = pageId === "#step04" || pageId === "#step05" || pageId === "#step06";
    const firstArea = page.querySelector(".c-button-grid, .c-zip-text, .p-step06__name, .p-step07__tel");
    if (pageId === "#step-first" && icon) {
      // FVのクマはマークアップ定位置（cvr-kuma-wrap）で表示する。
      // firstArea のセレクタは FV の .p-first__buttonArea に一致しないため、
      // ここで分岐しないと初期表示からクマが消える。
      const kumaWrap = page.querySelector(".cvr-kuma-wrap");
      if (kumaWrap && icon.parentNode !== kumaWrap) kumaWrap.appendChild(icon);
      icon.style.cssText = "cursor:pointer";
    } else if (!isInputStep && firstArea && icon) {
      icon.style.display = "";
      firstArea.style.position = "relative";
      firstArea.appendChild(icon);
      icon.style.cssText = "position:absolute;right:0;bottom:-30px;pointer-events:none;z-index:3;opacity:1";
    } else if (icon) {
      icon.style.display = "none";
    }

    const autoFocusEl = page.querySelector(
      'input[type="tel"]:not([type="hidden"]), input[type="text"]:not([type="hidden"])'
    );
    if (autoFocusEl && !autoFocusEl.value) {
      try {
        autoFocusEl.focus({ preventScroll: true });
      } catch (e) {
        autoFocusEl.focus();
      }
      if (isInputStep) {
        requestAnimationFrame(() => {
          autoFocusEl.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        page.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
        page.style.opacity = "1";
        page.style.transform = "translateX(0)";
      });
    });
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const cur = btn.closest(".js-form-group");
    if (!pageTo || !cur) return;

    clearStepTimers();

    const hideOnStep = document.querySelectorAll(".cvr-live-notification, .cvr-social-proof, .cvr-trust-bar");
    hideOnStep.forEach((el) => el.classList.add("is-hidden"));

    const go = () => {
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
    };

    if (LAZY_STEP_IDS.has(pageTo)) {
      ensureLazySteps().then((ok) => {
        if (ok && document.getElementById(pageTo)) go();
      });
      return;
    }

    go();
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
        clearStepTimers();
        nextBtn.classList.remove(DISABLE);
        const cur = nextBtn.closest(".js-form-group");
        cur.style.display = "none";
        cur.style.opacity = "0";
        cur.style.transform = "translateX(50px)";
        showPage("#" + nextBtn.dataset.pageTo);
      } else {
        for (let i = 0; i < states.length; i++) {
          if (!states[i] && titles[i]) {
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
        scheduleZipAutoAdvance();
      } catch (e) {}
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
      scheduleZipAutoAdvance();
    });

    updateBtn();
  }

  function isValidBirthYear(value) {
    const year = parseInt(String(value || "").trim(), 10);
    return year >= 1924 && year <= 2010;
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
    const touched = new Set();

    function allFilled() {
      const namesOk = Array.from(inputs).every((i) => !!(i.value || "").trim());
      const yearOk = !birthYear || isValidBirthYear(birthYear.value);
      return namesOk && yearOk;
    }

    function shouldShowErrors() {
      return touched.size > 0;
    }

    function validate(opts) {
      opts = opts || {};
      if (allFilled()) {
        nextBtn.classList.remove(DISABLE);
        target.classList.add(SKIP);
        if (errBox) errBox.style.display = "none";
        moveIconById("#" + nextBtn.id, true);
      } else {
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
        if (errBox) {
          if (shouldShowErrors()) {
            errBox.style.display = "block";
            if (errText) {
              const namesOk = Array.from(inputs).every((i) => !!(i.value || "").trim());
              errText.textContent = namesOk
                ? "生まれ年（西暦）は1924〜2010で入力してください"
                : "お名前を入力してください";
            }
          } else {
            errBox.style.display = "none";
          }
        }
        const bday = group.querySelector(".p-step06__birthday");
        if (opts.autoAdvance && bday && icon) moveIcon(bday, true);
        else moveIconById("#" + target.id);
      }
    }

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        touched.add(input.id || input.name);
        validate();
      });
      input.addEventListener("blur", () => validate());
    });
    if (birthYear) {
      birthYear.addEventListener("input", () => {
        touched.add("bday-year");
        validate();
      });
      birthYear.addEventListener("blur", () => validate());
    }

    const lastNameInput = group.querySelector("#last-name");
    const firstNameInput = group.querySelector("#first-name");
    if (lastNameInput && firstNameInput) {
      let lastAdvTimer = null;
      let composingLast = false;
      lastNameInput.addEventListener("compositionstart", () => {
        composingLast = true;
      });
      lastNameInput.addEventListener("compositionend", () => {
        composingLast = false;
      });
      lastNameInput.addEventListener("input", () => {
        if (lastAdvTimer) clearTimeout(lastAdvTimer);
        lastAdvTimer = setTimeout(() => {
          if (
            !composingLast &&
            (lastNameInput.value || "").trim() &&
            !(firstNameInput.value || "").trim() &&
            document.activeElement === lastNameInput
          ) {
            firstNameInput.focus();
          }
        }, 700);
      });
    }
    if (firstNameInput) {
      let advTimer = null;
      firstNameInput.addEventListener("input", () => {
        if (advTimer) clearTimeout(advTimer);
        advTimer = setTimeout(() => {
          const namesOk = Array.from(inputs).every((i) => !!(i.value || "").trim());
          if (namesOk && document.activeElement === firstNameInput) {
            const bdayYear = document.getElementById("bday-year");
            if (bdayYear) {
              setTimeout(() => {
                bdayYear.scrollIntoView({ behavior: "smooth", block: "center" });
                bdayYear.focus();
              }, 200);
            }
          }
        }, 700);
      });
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

      // 電話番号の「あと○桁」表示 + 11桁で自動送信
      if (item.name === "your-tel") {
        const telNotice = document.getElementById("tel-notice");
        let telAutoTimer = null;

        function clearTelAutoSubmit() {
          if (telAutoTimer) {
            clearTimeout(telAutoTimer);
            telAutoTimer = null;
          }
        }

        function scheduleTelAutoSubmit() {
          if (nextBtn.id !== "step-last-button") return;
          clearTelAutoSubmit();
          telAutoTimer = setTimeout(() => {
            telAutoTimer = null;
            if (!isValidTel(item.value)) return;
            if (nextBtn.classList.contains(DISABLE)) return;
            if (nextBtn.style.pointerEvents === "none") return;
            nextBtn.click();
          }, 700);
        }

        group._clearTelAutoSubmit = clearTelAutoSubmit;

        item.addEventListener("input", () => {
          const digits = item.value.replace(/\D/g, "");
          if (digits !== item.value) item.value = digits;

          const len = item.value.length;
          if (telNotice) {
            if (len === 0) { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし"; }
            else if (len === 11) { telNotice.style.display = "none"; }
            else { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし あと" + (11 - len) + "桁"; }
          }

          if (isValidTel(item.value)) {
            if (errBox) errBox.style.display = "none";
            states[i] = true;
            item.classList.add(SKIP);
            moveIconById("#" + nextBtn.id);
            updateBtn();
            scheduleTelAutoSubmit();
          } else {
            states[i] = false;
            item.classList.remove(SKIP);
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
        if (item.name === "your-tel" && item.value && !isValidTel(item.value)) {
          if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = "半角数字で入力してください"; }
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

  // ========== Prefecture select ==========
  function initPrefSelect() {
    const sel = document.getElementById("pref");
    if (!sel) return;
    const prefs = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
    let h = '<option value="00" selected disabled>都道府県</option>';
    prefs.forEach((p, i) => { h += '<option value="' + String(i+1).padStart(2,"0") + '">' + p + '</option>'; });
    sel.innerHTML = h;
  }

  // ========== Birthday (legacy select / year input) ==========
  function initBirthday() {
    const y = document.getElementById("bday-year");
    const m = document.getElementById("bday-month");
    const d = document.getElementById("bday-day");
    if (!y || y.tagName === "INPUT") return;
    let h = "";
    for (let i = 1924; i <= 2023; i++) h += '<option value="' + i + '"' + (i === 1990 ? " selected" : "") + ">" + i + "</option>";
    y.innerHTML = h;
    if (m) { h = ""; for (let i = 1; i <= 12; i++) h += '<option value="' + i + '">' + i + "</option>"; m.innerHTML = h; }
    if (d) { h = ""; for (let i = 1; i <= 31; i++) h += '<option value="' + i + '">' + i + "</option>"; d.innerHTML = h; }
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
    const form = document.querySelector(".wpcf7-form");
    if (!form) return;

    if (!form.dataset.stepDelegated) {
      form.dataset.stepDelegated = "1";
      form.addEventListener("click", (e) => {
        const btn = e.target.closest(".js-step-button");
        if (btn) handleStepClick({ currentTarget: btn });
      });
    }

    queueMicrotask(() => {
      form.querySelectorAll(".js-form-group").forEach(initFormGroup);
      initCookieName();
      initZapierMirror();
      preventEnter();
      if (document.getElementById("step01")) prefetchLazySteps();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPrefSelect();
    initBirthday();
    updateProgress("#step-first");
    if (document.body.classList.contains("p-pageThanks")) {
      const el = document.querySelector("#set-user-name");
      const h = document.querySelector("#hidden-your-name");
      if (el && Cookie.get("user-name")) {
        el.textContent = Cookie.get("user-name") + "様";
        if (h) h.value = Cookie.get("user-name");
      }
    }
  });

  function loadCvrBoostDeferred() {
    function inject() {
      if (loadCvrBoostDeferred.done) return;
      loadCvrBoostDeferred.done = true;
      const ref = document.currentScript || document.querySelector('script[src*="app.js"]');
      if (!ref || !ref.src) return;
      const s = document.createElement("script");
      s.src = ref.src.replace(/app\.js(\?.*)?$/, "cvr-boost.js$1");
      s.async = true;
      document.head.appendChild(s);
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(inject, { timeout: 3000 });
    } else {
      window.addEventListener("load", () => setTimeout(inject, 500), { once: true });
    }
  }

  window.addEventListener("load", () => {
    if (!document.body.classList.contains("p-pageThanks")) {
      if (document.getElementById("step-first")) showPage("#step-first");
      initForm();
      loadCvrBoostDeferred();
    }
  });
})();
