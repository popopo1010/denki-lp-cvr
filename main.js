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

  // ========== Icon system ==========
  const header = document.getElementById("header");
  let icon = null;
  let iconTarget = null;
  let bounceId = null;

  function resizeHandler() { positionIcon(); }

  function positionIcon() {
    if (!icon || !iconTarget) return;
    // クマはposition:absoluteなので、親(js-form-group)からの相対位置で計算
    const parent = icon.closest(".js-form-group");
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const targetRect = iconTarget.getBoundingClientRect();
    icon.style.top = (targetRect.top - parentRect.top + targetRect.height / 2) + "px";
    icon.style.opacity = "1";
  }

  function moveIcon(el) {
    if (!el) return;
    iconTarget = el;
    icon.style.transition = "top 0.3s ease";
    positionIcon();
  }

  function moveIconById(id) {
    if (!id || id === "#") return;
    const el = document.querySelector(id);
    if (el) moveIcon(el);
  }

  function startBounce() {
    stopBounce();
    if (!icon) return;
    let x = 0, dir = -1;
    bounceId = setInterval(() => {
      x += dir * 0.5;
      if (x <= -15) dir = 1;
      if (x >= 0) dir = -1;
      icon.style.transform = "translateX(" + x + "px)";
    }, 16);
  }

  function stopBounce() {
    if (bounceId) { clearInterval(bounceId); bounceId = null; }
    if (icon) icon.style.transform = "";
  }

  // ========== Page transitions ==========
  function showPage(pageId) {
    const page = document.querySelector(pageId);
    if (!page) return;

    window.removeEventListener("resize", resizeHandler);
    stopBounce();

    icon = page.querySelector(".js-fixed-icon");
    iconTarget = page.querySelector(".js-icon-target:not(.is-skip)");

    window.scrollTo(0, 0);

    // Set initial hidden state
    page.style.display = "block";
    page.style.opacity = "0";
    page.style.transform = "translateX(50px)";
    page.style.transition = "none";

    // Position icon after layout
    requestAnimationFrame(() => {
      positionIcon();

      // Trigger transition
      requestAnimationFrame(() => {
        page.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
        page.style.opacity = "1";
        page.style.transform = "translateX(0)";

        setTimeout(() => {
          window.addEventListener("resize", resizeHandler);
          startBounce();
        }, 320);
      });
    });
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const cur = btn.closest(".js-form-group");

    stopBounce();
    window.removeEventListener("resize", resizeHandler);

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
        // 両方選択済み → ボタンへスクロール誘導（自動遷移しない）
        moveIconById("#" + nextBtn.id);
        nextBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        // 未選択のセクションへスクロール誘導
        for (let i = 0; i < states.length; i++) {
          if (!states[i] && titles[i]) {
            moveIconById("#" + titles[i].id);
            titles[i].scrollIntoView({ behavior: "smooth", block: "center" });
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
        moveIconById("#" + nextBtn.id);
        target.classList.add(SKIP);
      } else {
        nextBtn.classList.add(DISABLE);
        target.classList.remove(SKIP);
        moveIconById("#" + target.id);
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
      // 最終ステップに名前を挿入
      const nameTxt = document.getElementById("nametxt");
      if (nameTxt && nameTxt.innerHTML.includes("{name}")) {
        nameTxt.innerHTML = nameTxt.innerHTML.replace("{name}", last.value);
      }
    });
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

  // ========== Init ==========
  function initForm() {
    const groups = document.querySelectorAll(".js-form-group");
    if (!groups.length) return;

    document.querySelectorAll(".js-step-button").forEach(b => b.addEventListener("click", handleStepClick));

    setTimeout(() => {
      groups.forEach(g => {
        initRadioButtons(g);
        initRadioButtons02(g);
        initCheckboxButtons(g);
        initZipCode(g);
        initNameInputs(g);
        initRequiredItems(g);
      });
      initCookieName();
      preventEnter();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
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
