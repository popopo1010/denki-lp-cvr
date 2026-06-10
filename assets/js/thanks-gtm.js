/**
 * thanks-v2: レガシー互換（v2 は shared.js の bindThanksLineClicks を使用）
 * deferred bundle には含めない。
 */
(function () {
  if (window.dkThanks && window.dkThanks.bindThanksLineClicks) {
    window.dkThanks.bindThanksLineClicks();
  }
})();
