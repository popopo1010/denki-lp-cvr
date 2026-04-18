(() => {
  "use strict";

  // ========== Cookie utility (lightweight js-cookie replacement) ==========
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
    remove(name) {
      Cookie.set(name, "", -1);
    }
  };

  // ========== DOM refs ==========
  const header = document.getElementById("header");
  let currentIcon = null;
  let currentTarget = null;
  let bounceInterval = null;
  let bounceDir = -1;

  // ========== Icon positioning (replaces GSAP.set/to) ==========
  function positionIcon(target) {
    if (!currentIcon || !target) return;
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.top - header.clientHeight + rect.height / 2;
    currentIcon.style.top = top + "px";
    currentIcon.style.opacity = "1";
    currentIcon.style.transition = "top 0.3s ease";
  }

  function moveIconTo(selector) {
    if (!selector || selector === "#") return;
    const el = document.querySelector(selector);
    if (!el || el === currentTarget) return;
    currentTarget = el;
    positionIcon(el);
  }

  // ========== Icon bounce animation (replaces GSAP yoyo) ==========
  function startBounce() {
    stopBounce();
    if (!currentIcon) return;
    let offset = 0;
    bounceDir = -1;
    bounceInterval = setInterval(() => {
      offset += bounceDir * 0.5;
      if (offset <= -15) bounceDir = 1;
      if (offset >= 0) bounceDir = -1;
      currentIcon.style.transform = "translateX(" + offset + "px)";
    }, 16);
  }

  function stopBounce() {
    if (bounceInterval) {
      clearInterval(bounceInterval);
      bounceInterval = null;
    }
    if (currentIcon) {
      currentIcon.style.transform = "translateX(0)";
    }
  }

  // ========== Page transition (replaces GSAP animations) ==========
  function showPage(pageId, callback) {
    const page = document.querySelector(pageId);
    if (!page) return;
    currentIcon = page.querySelector(".js-fixed-icon");
    currentTarget = page.querySelector(".js-icon-target:not(.is-skip)");
    window.scrollTo(0, 0);

    page.style.display = "block";
    page.style.opacity = "0";
    page.style.transform = "translateX(50px)";
    page.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";

    positionIcon(currentTarget);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        page.style.opacity = "1";
        page.style.transform = "translateX(0)";
        setTimeout(() => {
          window.addEventListener("resize", () => positionIcon(currentTarget));
          startBounce();
          if (callback) callback();
        }, 300);
      });
    });
  }

  function handleStepClick(e) {
    const btn = e.currentTarget;
    const pageTo = btn.dataset.pageTo;
    const currentPage = btn.closest(".js-form-group");

    stopBounce();
    window.removeEventListener("resize", () => positionIcon(currentTarget));

    currentPage.style.display = "none";
    currentPage.style.opacity = "0";
    currentPage.style.transform = "translateX(50px)";

    showPage("#" + pageTo);
  }

  // ========== Constants ==========
  const ACTIVE = "is-active";
  const DISABLE = "is-disable";
  const SKIP = "is-skip";

  // ========== Radio button 02 (experience, employment type) ==========
  function initRadioButtons02(group) {
    const buttons = group.querySelectorAll(".js-radio-button02");
    const hiddenInputs = document.querySelectorAll(".hidden-element02");
    if (!buttons.length) return;

    const titles = group.querySelectorAll(".js-icon-target");
    const nextBtn = group.querySelector(".js-next-button");
    const states = [];

    function checkStates() {
      hiddenInputs.forEach((input, i) => {
        if (input.value) {
          const active = document.querySelector('.js-radio-button02[data-value="' + input.value + '"]');
          if (active) active.classList.add(ACTIVE);
          states[i] = true;
          if (titles[i]) titles[i].classList.add(SKIP);
        } else {
          states[i] = false;
          if (titles[i]) titles[i].classList.remove(SKIP);
        }
      });
      if (states.every(s => s)) nextBtn.classList.remove(DISABLE);
    }

    checkStates();

    function handleClick(e) {
      const btn = e.currentTarget;
      if (btn.classList.contains(ACTIVE)) return;
      const groupName = btn.dataset.group;
      document.querySelector('input[name="' + groupName + '"]').value = btn.dataset.value;

      buttons.forEach(b => b.classList.remove(ACTIVE));
      checkStates();

      if (states.every(s => s)) {
        nextBtn.classList.remove(DISABLE);
        moveIconTo("#" + nextBtn.id);
      } else {
        for (let i = 0; i < states.length; i++) {
          if (!states[i] && titles[i]) {
            moveIconTo("#" + titles[i].id);
            break;
          }
        }
      }

      if (states.every(s => s)) nextBtn.click();
    }

    buttons.forEach(btn => btn.addEventListener("click", handleClick));
  }

  // ========== Checkbox buttons (licenses) ==========
  function initCheckboxButtons(group) {
    const buttons = group.querySelectorAll(".js-checkbox-button");
    if (!buttons.length) return;

    const hiddenInputs = document.querySelectorAll(".hidden-checkbox");
    const iconTarget = group.querySelector(".js-icon-target");
    const nextBtn = group.querySelector(".js-next-button");
    const groups = {};
    let checked = [];
    let lastGroup = "";

    function updateChecked() {
      checked = [];
      buttons.forEach(b => checked.push(b.classList.contains(ACTIVE)));
    }

    function handleClick(e) {
      lastGroup = "";
      e.currentTarget.classList.toggle(ACTIVE);

      buttons.forEach(b => {
        const g = b.dataset.group;
        const v = b.dataset.value;
        if (lastGroup !== g) groups[g] = "";
        if (b.classList.contains(ACTIVE)) {
          if (groups[g]) groups[g] += ", ";
          groups[g] += v;
        }
        lastGroup = g;
      });

      for (const key in groups) {
        const el = document.getElementById(key);
        if (el) el.value = groups[key];
      }

      updateChecked();
      if (checked.includes(true)) {
        nextBtn.classList.remove(DISABLE);
        moveIconTo("#" + nextBtn.id);
        iconTarget.classList.add(SKIP);
      } else {
        nextBtn.classList.add(DISABLE);
        iconTarget.classList.remove(SKIP);
        moveIconTo("#" + iconTarget.id);
      }
    }

    buttons.forEach(b => b.addEventListener("click", handleClick));

    // Restore state
    const existing = [];
    hiddenInputs.forEach(input => {
      input.value.replace(/\s+/g, "").split(",").forEach(v => existing.push(v));
    });
    buttons.forEach(b => {
      if (existing.includes(b.dataset.value)) {
        b.classList.add(ACTIVE);
        nextBtn.classList.remove(DISABLE);
        iconTarget.classList.add(SKIP);
      }
    });
    updateChecked();
  }

  // ========== Radio buttons (first step - feeling) ==========
  function initRadioButtons(group) {
    const buttons = group.querySelectorAll(".js-radio-button");
    if (!buttons.length) return;

    const hidden = document.querySelector('.form-hidden[name=' + buttons[0].dataset.group + ']');
    const nextBtn = group.querySelector(".js-next-button");

    function handleClick(e) {
      const btn = e.currentTarget;
      hidden.value = btn.dataset.value;
      nextBtn.click();
      buttons.forEach(b => b.classList.remove(ACTIVE));
      restoreState();
    }

    buttons.forEach(b => b.addEventListener("click", handleClick));

    function restoreState() {
      nextBtn.style.display = "none";
      if (hidden.value) {
        nextBtn.style.display = "block";
        buttons.forEach(b => {
          if (b.dataset.value === hidden.value) b.classList.add(ACTIVE);
        });
      }
    }
    restoreState();
  }

  // ========== Zip code handling ==========
  function initZipCode(group) {
    const zipInput = group.querySelector("#zip");
    if (!zipInput) return;

    let zipValid = false;
    const notice = group.querySelector("#zip-notice");
    const iconTarget = group.querySelector("#step04-icon-start-target");
    const prefSelect = group.querySelector("#pref");
    const citySelect = group.querySelector("#city");
    const prefHidden = group.querySelector("#your-pref");
    const cityHidden = group.querySelector("#your-city");
    const nextBtn = group.querySelector(".js-next-button");
    const accordion = group.querySelector("#select-box-accordion");
    const trigger = accordion.querySelector("#select-box-accordion-trigger");

    function isNumeric(val) {
      return /^[0-9]+$/.test(val);
    }

    function updateNextBtn() {
      if (zipValid) nextBtn.classList.remove(DISABLE);
      else nextBtn.classList.add(DISABLE);
    }

    function updateIconState() {
      if (prefHidden.value && cityHidden.value) {
        iconTarget.classList.add(SKIP);
        prefSelect.classList.add(SKIP);
        citySelect.classList.add(SKIP);
        moveIconTo("#" + nextBtn.id);
      } else if (prefHidden.value) {
        iconTarget.classList.add(SKIP);
        prefSelect.classList.add(SKIP);
        citySelect.classList.remove(SKIP);
        moveIconTo("#city");
      } else if (!prefHidden.value && !cityHidden.value) {
        iconTarget.classList.remove(SKIP);
        prefSelect.classList.remove(SKIP);
        citySelect.classList.remove(SKIP);
        moveIconTo("#" + iconTarget.id);
      }
      updateNextBtn();
    }

    async function lookupZip(zip) {
      try {
        const res = await fetch("https://zipcloud.ibsnet.co.jp/api/search?zipcode=" + zip);
        const json = await res.json();
        if (!json.results || !json.results[0]) return;
        const addr = json.results[0];
        const prefName = addr.address1;
        const cityName = addr.address2;

        for (let i = 0; i < prefSelect.options.length; i++) {
          if (prefSelect.options[i].textContent === prefName) {
            prefSelect.selectedIndex = i;
            break;
          }
        }
        prefHidden.value = prefName;
        cityHidden.value = cityName;

        await loadCities(prefName, cityName);

        iconTarget.classList.add(SKIP);
        prefSelect.classList.add(SKIP);
        citySelect.classList.add(SKIP);
        zipValid = true;
        updateNextBtn();
      } catch (err) {
        console.warn("Zip lookup error:", err);
      }
    }

    async function loadCities(prefName, selectedCity) {
      try {
        const res = await fetch("https://geoapi.heartrails.com/api/json?method=getCities&prefecture=" + encodeURIComponent(prefName));
        const json = await res.json();
        const cities = json.response.location;
        let opts = '<option selected disabled value="">市区町村</option>';
        const seen = new Set();
        cities.forEach(c => {
          if (!seen.has(c.city)) {
            seen.add(c.city);
            const sel = c.city === selectedCity ? " selected" : "";
            opts += '<option value="' + c.city + '"' + sel + '>' + c.city + '</option>';
          }
        });
        citySelect.innerHTML = opts;
      } catch (err) {
        console.warn("City API error:", err);
      }
    }

    function handleInput() {
      const val = zipInput.value;
      zipValid = false;

      if (val.length === 0) {
        notice.style.display = "block";
        notice.textContent = "ハイフンなし";
      } else if (!isNumeric(val)) {
        notice.textContent = "数字で入力してください";
        zipValid = false;
      } else if (val.length === 7) {
        notice.style.display = "none";
        zipValid = true;
        lookupZip(val);
      } else {
        notice.style.display = "block";
        notice.textContent = "ハイフンなし あと" + (7 - val.length) + "桁";
      }
      updateIconState();
    }

    zipInput.addEventListener("input", handleInput);

    trigger.addEventListener("click", () => {
      if (accordion.open) {
        if (!cityHidden.value || !prefHidden.value) {
          moveIconTo("#" + iconTarget.id);
          iconTarget.classList.remove(SKIP);
        }
      } else {
        updateIconState();
      }
    });

    prefSelect.addEventListener("change", () => {
      prefHidden.value = prefSelect.options[prefSelect.selectedIndex].textContent;
      zipInput.value = "";
      zipValid = false;
      cityHidden.value = "";
      loadCities(prefHidden.value, "");
      updateIconState();
    });

    citySelect.addEventListener("change", () => {
      cityHidden.value = citySelect.options[citySelect.selectedIndex].textContent;
      zipInput.value = "";
      zipValid = true;
      updateIconState();
    });

    // Init
    handleInput();
    updateNextBtn();
  }

  // ========== Name inputs ==========
  function initNameInputs(group) {
    const inputs = group.querySelectorAll(".js-name-input");
    if (!inputs.length) return;

    const iconTarget = group.querySelector("#step05-icon-start-target");
    const nextBtn = group.querySelector(".js-next-button");
    const errorEl = group.querySelector("#error-name");
    const errorText = errorEl ? errorEl.querySelector("p") : null;
    const states = [];

    function check() {
      inputs.forEach((input, i) => {
        states[i] = !!input.value;
      });
    }
    check();

    function handleBlur() {
      check();
      if (states.every(s => s)) {
        moveIconTo("#" + nextBtn.id);
        nextBtn.classList.remove(DISABLE);
        iconTarget.classList.add(SKIP);
        if (errorEl) errorEl.style.display = "none";
      } else {
        moveIconTo("#" + iconTarget.id);
        nextBtn.classList.add(DISABLE);
        iconTarget.classList.remove(SKIP);
        if (errorEl) {
          errorEl.style.display = "block";
          if (errorText) errorText.textContent = "必ず入力してください";
        }
      }
    }

    inputs.forEach(input => input.addEventListener("blur", handleBlur));

    // Initial state: disable button if name is empty
    check();
    if (!states.every(s => s)) {
      nextBtn.classList.add(DISABLE);
    }
  }

  // ========== Required items (tel) ==========
  function initRequiredItems(group) {
    const items = group.querySelectorAll(".js-required-item");
    if (!items.length) return;

    const itemsArr = Array.from(items);
    const states = [];
    const nextBtn = group.querySelector(".js-next-button");

    function updateBtn() {
      if (states.every(s => s)) nextBtn.classList.remove(DISABLE);
      else nextBtn.classList.add(DISABLE);
    }

    items.forEach((item, i) => {
      states.push(false);
      const errorEl = group.querySelector("#error-" + item.name);
      const errorText = errorEl ? errorEl.querySelector("p") : null;

      item.addEventListener("blur", () => {
        if (item.nextElementSibling) {
          if (errorEl) {
            errorEl.style.display = "block";
            if (errorText) errorText.textContent = item.nextElementSibling.textContent;
          }
          states[i] = false;
          itemsArr[i].classList.remove(SKIP);
        } else {
          if (errorEl) errorEl.style.display = "none";
          if (item.value) {
            states[i] = true;
            itemsArr[i].classList.add(SKIP);
          }
        }

        // Tel validation
        if (item.name === "your-tel" && !/^[0-9]+$/.test(item.value)) {
          if (errorEl) {
            errorEl.style.display = "block";
            if (errorText) errorText.textContent = "半角数字で入力してください";
          }
          states[i] = false;
          itemsArr[i].classList.remove(SKIP);
        }

        if (states.every(s => s)) {
          moveIconTo("#" + nextBtn.id);
        } else {
          const idx = states.indexOf(false);
          if (idx >= 0) moveIconTo("#" + itemsArr[idx].id);
        }
        updateBtn();
      });

      nextBtn.addEventListener("click", () => {
        setTimeout(() => { item.focus(); item.blur(); }, 250);
      });
    });

    updateBtn();
  }

  // ========== Prevent Enter key submit ==========
  function preventEnterSubmit() {
    const inputs = document.querySelectorAll("#main input");
    Array.from(inputs)
      .filter(input => ["text", "tel", "number", "email"].includes(input.type))
      .forEach(input => {
        input.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.code === "Enter") {
            e.preventDefault();
            return false;
          }
        });
      });
  }

  // ========== Cookie name save ==========
  function initCookieName() {
    const lastName = document.querySelector("#last-name");
    const firstName = document.querySelector("#first-name");
    const cookieBtn = document.querySelector(".js-set-cookie-button");
    if (!lastName || !cookieBtn) return;

    cookieBtn.addEventListener("click", () => {
      const name = lastName.value + " " + (firstName ? firstName.value : "");
      if (Cookie.get("user-name") !== name) {
        if (Cookie.get("user-name")) Cookie.remove("user-name");
        Cookie.set("user-name", name, 3);
      }
    });
  }

  // ========== Birthday select dynamic generation ==========
  function initBirthdaySelects() {
    const yearSelect = document.getElementById("bday-year");
    const monthSelect = document.getElementById("bday-month");
    const daySelect = document.getElementById("bday-day");

    if (yearSelect) {
      let html = "";
      for (let y = 1924; y <= 2023; y++) {
        const sel = y === 1990 ? ' selected="selected"' : "";
        html += '<option value="' + y + '"' + sel + '>' + y + '</option>';
      }
      yearSelect.innerHTML = html;
    }

    if (monthSelect) {
      let html = "";
      for (let m = 1; m <= 12; m++) {
        html += '<option value="' + m + '">' + m + '</option>';
      }
      monthSelect.innerHTML = html;
    }

    if (daySelect) {
      let html = "";
      for (let d = 1; d <= 31; d++) {
        html += '<option value="' + d + '">' + d + '</option>';
      }
      daySelect.innerHTML = html;
    }
  }

  // ========== Init all ==========
  function initForm() {
    const groups = document.querySelectorAll(".js-form-group");
    if (!groups.length) return;

    // Step buttons
    document.querySelectorAll(".js-step-button").forEach(btn => {
      btn.addEventListener("click", handleStepClick);
    });

    setTimeout(() => {
      groups.forEach(group => {
        initRadioButtons(group);
        initRadioButtons02(group);
        initCheckboxButtons(group);
        initZipCode(group);
        initNameInputs(group);
        initRequiredItems(group);
      });

      initCookieName();
      preventEnterSubmit();
    });
  }

  function initFirst() {
    const first = document.getElementById("step-first");
    if (first) showPage("#step-first");
  }

  // ========== Thanks page ==========
  function initThanks() {
    const nameEl = document.querySelector("#set-user-name");
    if (!nameEl) return;
    const hiddenName = document.querySelector("#hidden-your-name");
    if (Cookie.get("user-name")) {
      nameEl.textContent = Cookie.get("user-name") + "様";
      if (hiddenName) hiddenName.value = Cookie.get("user-name");
    }
  }

  // ========== DOMContentLoaded ==========
  document.addEventListener("DOMContentLoaded", () => {
    initBirthdaySelects();
    if (document.body.classList.contains("p-pageThanks")) {
      initThanks();
    }
  });

  // ========== Load ==========
  window.addEventListener("load", () => {
    if (!document.body.classList.contains("p-pageThanks")) {
      initFirst();
      initForm();
    }
  });
})();
