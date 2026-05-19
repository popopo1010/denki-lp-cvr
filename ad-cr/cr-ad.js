(function () {
  var cfg = window.CR_AD_CONFIG;
  if (!cfg || !cfg.amounts || !cfg.amounts.length) return;

  var amountEl = document.getElementById("cr-amount");

  function setText(id, text, asHtml) {
    var el = document.getElementById(id);
    if (!el || text == null) return;
    if (asHtml) el.innerHTML = text;
    else el.textContent = text;
  }

  if (cfg.hook) {
    var hookLabel = document.querySelector("#cr-hook .cr-ad__hook-label");
    if (hookLabel) hookLabel.textContent = cfg.hook;
  }
  setText("cr-card-title", cfg.cardTitle);
  setText("cr-niche", cfg.niche);
  setText("cr-tagline", cfg.tagline);
  setText("cr-sub", cfg.sub);
  if (cfg.brand) setText("cr-brand", "<small>無料</small>" + cfg.brand, true);

  var phases = cfg.amounts.map(function (v, i) {
    return {
      value: v,
      duration: cfg.durations ? cfg.durations[i] : (i === 0 ? 2800 : i === 1 ? 4500 : 5000),
      hold: cfg.holds ? cfg.holds[i] : 400
    };
  });

  var loopPause = typeof cfg.loopPause === "number" ? cfg.loopPause : 1200;
  var running = true;

  function formatYen(n) {
    return "¥" + Math.round(n).toLocaleString("ja-JP") + "円";
  }

  function fitAmountSize() {
    if (!amountEl) return;
    var text = amountEl.textContent || "";
    amountEl.classList.remove("is-long", "is-xlong", "is-xxlong");
    if (text.length > 13) amountEl.classList.add("is-xxlong");
    else if (text.length > 11) amountEl.classList.add("is-xlong");
    else if (text.length > 9) amountEl.classList.add("is-long");
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCount(from, to, duration, onDone) {
    var start = null;
    function frame(ts) {
      if (!running) return;
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var val = from + (to - from) * easeOutCubic(p);
      if (amountEl) {
        amountEl.textContent = formatYen(val);
        fitAmountSize();
        if (p < 1 && p > 0.02) amountEl.classList.add("is-tick");
        else amountEl.classList.remove("is-tick");
      }
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        if (amountEl) {
          amountEl.textContent = formatYen(to);
          fitAmountSize();
        }
        amountEl && amountEl.classList.remove("is-tick");
        onDone && onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function runSequence() {
    var from = 0;
    var i = 0;

    function nextPhase() {
      if (!running || i >= phases.length) {
        return delay(loopPause).then(function () {
          if (amountEl) amountEl.style.opacity = "0.6";
          return delay(300).then(function () {
            if (amountEl) {
              amountEl.style.opacity = "1";
              amountEl.textContent = formatYen(0);
            }
            i = 0;
            from = 0;
            return runSequence();
          });
        });
      }
      var phase = phases[i];
      var target = phase.value;
      return new Promise(function (resolve) {
        animateCount(from, target, phase.duration, resolve);
      })
        .then(function () {
          return delay(phase.hold);
        })
        .then(function () {
          from = target;
          i += 1;
          return nextPhase();
        });
    }

    return nextPhase();
  }

  if (amountEl) {
    amountEl.textContent = formatYen(0);
    fitAmountSize();
  }

  var qs = location.search;
  if (qs.indexOf("meta=1") !== -1) {
    document.body.classList.add("cr-meta");
    document.body.classList.add("cr-record");
  } else if (qs.indexOf("record=1") !== -1) {
    document.body.classList.add("cr-record");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(runSequence, 500);
    });
  } else {
    setTimeout(runSequence, 500);
  }

  if (qs.indexOf("guide=1") !== -1) {
    var g = document.querySelector(".cr-guide");
    if (g) g.classList.add("is-show");
    if (qs.indexOf("meta=1") !== -1) {
      document.body.classList.add("cr-guide-on");
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "g" && e.shiftKey) {
      var g = document.querySelector(".cr-guide");
      if (g) g.classList.toggle("is-show");
    }
  });
})();
