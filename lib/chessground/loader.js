/* ============================================================
   Chessground (کتابخانهٔ رسمی لایچز) — لودر سازگار با اسکریپت کلاسیک
   ------------------------------------------------------------
   🔑 v11.35 — نسخهٔ قبلی با «import» استاتیک نوشته شده بود و در
   صفحاتی که <script type="module"> نداشتند SyntaxError می‌داد
   («Cannot use import statement outside a module») و مرور بازی و
   آنالیز را می‌شکست. حالا با import() پویا — که در اسکریپت کلاسیک
   کاملاً مجاز است — Chessground روی window گذاشته می‌شود.
   ============================================================ */
(function () {
  "use strict";
  function boot(m) {
    window.Chessground = (m && (m.Chessground || (m.default && m.default.Chessground))) || null;
    if (window.Chessground) {
      document.dispatchEvent(new CustomEvent("chessgroundReady"));
    } else {
      console.warn("[Chessground] ماژول لود شد ولی Chessground در آن نبود");
    }
  }
  try {
    // مسیر نسبت به همین فایل — با یا بدون ?v= کار می‌کند
    var here = document.currentScript && document.currentScript.src;
    var target = "./chessground.min.js";
    if (here) {
      target = here.replace(/loader\.js.*$/, "chessground.min.js");
    }
    import(target)
      .then(boot)
      .catch(function (e) {
        console.warn("[Chessground] خطا در بارگذاری پویا:", e && e.message);
      });
  } catch (e) {
    console.warn("[Chessground] import پویا پشتیبانی نمی‌شود:", e && e.message);
  }
})();
