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

  // ========== Page transitions ==========
  function showPage(pageId) {
    const page = document.querySelector(pageId);
    if (!page) return;

    stopBounce();
    icon = page.querySelector(".js-fixed-icon");

    window.scrollTo(0, 0);

    page.style.display = "block";
    page.style.opacity = "0";
    page.style.transform = "translateX(50px)";
    page.style.transition = "none";

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
          if (autoFocus && !autoFocus.value) autoFocus.focus();
        }, 320);
      });
    });
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const cur = btn.closest(".js-form-group");

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
        stopBounce();
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

    buttons.forEach(b => b.addEventListener("click", () => {
      b.classList.toggle(ACTIVE);
      updateHiddens();
      if (hasAny()) {
        nextBtn.classList.remove(DISABLE);
        // クマを次へボタンの親(c-nextLink)に移動
        const linkArea = nextBtn.closest(".c-nextLink");
        if (linkArea && icon) { linkArea.style.position = "relative"; linkArea.appendChild(icon); }
        target.classList.add(SKIP);
      } else {
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
      } catch (e) { console.warn("Zip error:", e); }
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

    function allFilled() { return Array.from(inputs).every(i => !!i.value); }

    function validate() {
      if (allFilled()) {
        nextBtn.classList.remove(DISABLE);
        target.classList.add(SKIP);
        if (errBox) errBox.style.display = "none";
        moveIconById("#" + nextBtn.id);
      } else {
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
        if (errBox) { errBox.style.display = "block"; if (errText) errText.textContent = "必ず入力してください"; }
        moveIconById("#" + target.id);
      }
    }

    inputs.forEach(input => input.addEventListener("blur", validate));

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

      // 電話番号の「あと○桁」表示
      if (item.name === "your-tel") {
        const telNotice = document.getElementById("tel-notice");
        if (telNotice) {
          item.addEventListener("input", () => {
            const len = item.value.length;
            if (len === 0) { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし"; }
            else if (len === 11) { telNotice.style.display = "none"; }
            else { telNotice.style.display = "block"; telNotice.textContent = "ハイフンなし あと" + (11 - len) + "桁"; }
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
        if (item.name === "your-tel" && item.value && !/^[0-9]+$/.test(item.value)) {
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
          setTimeout(() => { location.href = "/thanks/"; }, 1500);
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

  // ========== Birthday selects ==========
  function initBirthday() {
    const y = document.getElementById("bday-year");
    const m = document.getElementById("bday-month");
    const d = document.getElementById("bday-day");
    if (y) { let h = ""; for (let i = 1924; i <= 2023; i++) h += '<option value="'+i+'"'+(i===1990?' selected':'')+'>'+i+'</option>'; y.innerHTML = h; }
    if (m) { let h = ""; for (let i = 1; i <= 12; i++) h += '<option value="'+i+'">'+i+'</option>'; m.innerHTML = h; }
    if (d) { let h = ""; for (let i = 1; i <= 31; i++) h += '<option value="'+i+'">'+i+'</option>'; d.innerHTML = h; }
  }

  // ========== Zapier Webhook mirror ==========
  function initZapierMirror() {
    const ZAPIER_URL = "https://hooks.zapier.com/hooks/catch/2795777/3sgrmvb/";
    const form = document.querySelector(".wpcf7-form");
    if (!form) return;
    let sentOnce = false;
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

    function sendToZapier() {
      if (sentOnce) return;
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
        const blob = new Blob([params.toString()], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
        const sent = navigator.sendBeacon && navigator.sendBeacon(ZAPIER_URL, blob);
        if (!sent) fetch(ZAPIER_URL, { method: "POST", mode: "no-cors", keepalive: true, body: params.toString() }).catch(() => {});
      } catch (e) { sentOnce = false; }
    }

    form.addEventListener("submit", sendToZapier, { capture: true });
    const submitBtn = form.querySelector('#submit-button, input[type="submit"]');
    if (submitBtn) submitBtn.addEventListener("click", sendToZapier, { capture: true });
  }

  // ========== Init ==========
  function initForm() {
    const groups = document.querySelectorAll(".js-form-group");
    if (!groups.length) return;

    document.querySelectorAll(".js-step-button").forEach(b => b.addEventListener("click", handleStepClick));

    queueMicrotask(() => {
      groups.forEach(g => {
        initRadioButtons(g);
        initRadioButtons02(g);
        initCheckboxButtons(g);
        initZipCode(g);
        initNameInputs(g);
        initRequiredItems(g);
      });
      initCookieName();
      initZapierMirror();
      preventEnter();
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
      if (document.getElementById("step-first")) showPage("#step-first");
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

  // ========== リアルタイム通知ローテーション ==========
  var notifications = [
    { area: "東京都", time: "3分前" },
    { area: "大阪府", time: "5分前" },
    { area: "神奈川県", time: "8分前" },
    { area: "愛知県", time: "12分前" },
    { area: "福岡県", time: "15分前" },
    { area: "埼玉県", time: "18分前" },
    { area: "千葉県", time: "22分前" },
    { area: "北海道", time: "25分前" },
    { area: "兵庫県", time: "28分前" },
    { area: "広島県", time: "32分前" },
  ];

  function initNotifications() {
    var el = document.getElementById("live-notification");
    if (!el) return;
    var textEl = el.querySelector(".cvr-live-notification__text");
    if (!textEl) return;
    var index = Math.floor(Math.random() * notifications.length);

    function show() {
      var n = notifications[index];
      textEl.innerHTML = "<strong>" + n.area + "</strong>の方が<strong>" + n.time + "</strong>に登録しました";
      el.classList.add("is-visible");
    }

    setTimeout(function () {
      show();
      setInterval(function () {
        el.classList.remove("is-visible");
        setTimeout(function () { index = (index + 1) % notifications.length; show(); }, 500);
      }, 8000);
    }, 2000);
  }

  // ========== 離脱防止 ==========
  function initExitIntent() {
    var shown = false;

    function showExitMessage() {
      if (shown) return;
      var feeling = document.querySelector('input[name="your-feeling"]');
      if (!feeling || !feeling.value) return;
      shown = true;

      var overlay = document.createElement("div");
      overlay.className = "cvr-exit-overlay";
      overlay.innerHTML =
        '<div class="cvr-exit-modal">' +
        '<p class="cvr-exit-modal__title">まだ登録が完了していません</p>' +
        '<p class="cvr-exit-modal__text">あなたの条件に合った求人が<strong>多数</strong>見つかっています。<br>あと少しで完了です！</p>' +
        '<button class="cvr-exit-modal__btn" id="cvr-exit-continue">登録を続ける</button>' +
        '<button class="cvr-exit-modal__close" id="cvr-exit-close">閉じる</button>' +
        "</div>";

      document.body.appendChild(overlay);

      function close() { overlay.remove(); }
      document.getElementById("cvr-exit-continue").addEventListener("click", close);
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
      });
    });
  }

  // ========== フローティングCTA ==========
  function initFloatingCta() {
    var cta = document.getElementById("floating-cta");
    var btn = document.getElementById("floating-cta-btn");
    if (!cta || !btn) return;

    var shown = false;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var range = document.body.scrollHeight - window.innerHeight;
        var scrollPct = range > 0 ? window.scrollY / range : 0;
        if (scrollPct > 0.15 && !shown) {
          shown = true;
          cta.classList.add("is-visible");
        } else if (scrollPct <= 0.1 && shown) {
          shown = false;
          cta.classList.remove("is-visible");
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      cta.classList.remove("is-visible");
      shown = false;
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
        var target = parseInt(el.textContent.replace(/,/g, ""), 10);
        var duration = 1500;
        var start = 0;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var val = Math.floor(progress * target);
          el.textContent = val.toLocaleString();
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toLocaleString();
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    observer.observe(els[0].closest(".cvr-social-proof"));
  }

  // ========== 初期化 ==========
  document.addEventListener("DOMContentLoaded", function () {
    var h4 = document.getElementById("hidden4");
    if (h4) h4.value = getParam("utm_term") || "";

    initNotifications();
    initExitIntent();
    initFormTracking();
    initFloatingCta();
    initCountUp();
  });
})();
