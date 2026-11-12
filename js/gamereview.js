/* ============================================================
   ♛ ChessHub — مرور بازی حرفه‌ای (Game Review)
   ------------------------------------------------------------
   تحلیل کامل بازی با Stockfish — مشترک بین همه‌ی بخش‌ها:
   بازی با بات، بازی آنلاین، پایگاه بازی‌های استادان

   قابلیت‌ها:
     • تخته با Chessground (کتابخانهٔ رسمی لایچز — همان تختهٔ آنالیز)
       انیمیشن نرم مهره‌ها + فلش‌کشی با کلیک‌راست دقیقاً مثل لایچس
     • نمره‌دهی حرکت‌به‌حرکت با آیکن‌های چس‌دات‌کام در گوشهٔ بالا-چپِ خانهٔ مقصد
     • هایلایتِ رنگی خانهٔ مبدا و مقصد — دقیقاً با رنگ برچسب همان حرکت
     • فلش آبیِ بهترین حرکت انجین (براش hub — دقیقاً مثل بخش آنالیز)
     • گزارش عملکرد تمیز با عکس بازیکنان شناخته‌شده + آدمک تولیدی
       برای بقیه (سفید: آدمک سفید روی زمینهٔ تیره — سیاه برعکس)
     • چیپ‌های آمار کلیک‌پذیر: پرش چرخشی روی حرکت‌های هر دسته با
       فلشِ رنگ همان دسته
     • نمودار برتری: برای «همهٔ» حرکت‌ها دایره با رنگ دستهٔ خودش
       (تئوری/بهترین/درخشان هم)، حرکت جاری درشت‌تر با هاله؛ هاور =
       شناسنامهٔ حرکت، کلیک = پرش به همان حرکت
     • کیبورد: فلش راست/چپ = جلو/عقب | فاصله = پخش کامل بازی |
       Home/End = اول/آخر | Esc = بازگشت
     • نوار ارزیابی زنده + نمودار تغییر برتری + دقت درصدی
     • کش تحلیل (بازی دوم دیگر آنالیز از صفر نمی‌شود)

   API:
     GameReview.open({ moves:[uci...], startFen?, title?, subtitle?, meta? })
     GameReview.openPage({...}) — حالت صفحهٔ مستقل (game-review.html)
     GameReview.close()
   ============================================================ */
(function () {
  "use strict";

  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA_DIGITS[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  const CACHE_KEY = "chesshub_review_cache_v2";
  const CACHE_MAX = 40;

  function cacheAll() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function cachePut(key, data) {
    try {
      const all = cacheAll();
      all[key] = data;
      const keys = Object.keys(all);
      if (keys.length > CACHE_MAX) {
        keys.sort(function (a, b) { return (all[a].t || 0) - (all[b].t || 0); })
          .slice(0, keys.length - CACHE_MAX)
          .forEach(function (k) { delete all[k]; });
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function gameHash(startFen, moves) {
    let h = (startFen || "start") + "|" + moves.join(" ");
    let x = 5381;
    for (let i = 0; i < h.length; i++) x = ((x << 5) + x + h.charCodeAt(i)) | 0;
    return "g" + Math.abs(x);
  }

  function pieceCountOf(fen) {
    let n = 0;
    const placement = fen.split(" ")[0];
    for (let i = 0; i < placement.length; i++) {
      const c = placement[i];
      if (/[a-zA-Z]/.test(c)) n++;
    }
    return n;
  }
  function analysisBudget(fen) {
    const n = pieceCountOf(fen);
    if (n <= 6) return { movetime: 260, depth: 20 };
    if (n <= 16) return { movetime: 180, depth: 16 };
    return { movetime: 120, depth: 14 };
  }

  function cpOf(score) { return window.ChessEngine ? ChessEngine.cpOf(score) : 0; }

  // درصد شانس برد از سانتی‌پیاده (فرمول لایچس)
  function winPercent(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -1500, 1500))) - 1);
  }
  function moveAccuracy(winBefore, winAfter) {
    const drop = Math.max(0, winBefore - winAfter);
    return clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669, 0, 100);
  }

  const KINDS = {
    brilliant:  { fa: "درخشان",      svg: "brilliant",  cls: "k-bril" },
    best:       { fa: "بهترین",      svg: "best",       cls: "k-best" },
    excellent:  { fa: "عالی",        svg: "excellent",  cls: "k-exc" },
    good:       { fa: "خوب",         svg: "correct",    cls: "k-good" },
    inaccuracy: { fa: "بی‌دقتی",     svg: "inaccuracy", cls: "k-ina" },
    mistake:    { fa: "اشتباه",      svg: "mistake",    cls: "k-mis" },
    blunder:    { fa: "اشتباه فاحش", svg: "blunder",    cls: "k-blun" },
    book:       { fa: "تئوری",       svg: "book",       cls: "k-book" },
  };

  // 🎨 رنگ هر دسته — همان رنگ رسمی آیکن‌های چس‌دات‌کام (فلش و چیپ)
  const KIND_COLORS = {
    brilliant: "#26c2a3",
    best: "#81b64c",
    excellent: "#81b64c",
    good: "#81b64c",
    inaccuracy: "#f7c631",
    mistake: "#ffa459",
    blunder: "#fa412d",
    book: "#d5a47d",
  };

  /* ---------- 🆕 آیکن‌های چس‌دات‌کام (SVG وکتور — بالای سر مهره‌ها) ----------
     همان آیکن‌های رسمی مرور بازی chess.com: دایرهٔ رنگی + گلیف سفید.
     viewBox ثابت ۰ ۰ ۱۸ ۱۹ — در هر اندازه‌ای شارپ می‌ماند. */
  const ICON_SVGS = {
    brilliant: '<path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#26c2a3" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/><g opacity="0.2"><path d="M12.57,14.6a.51.51,0,0,1,0,.13.44.44,0,0,1-.08.11l-.11.08-.13,0h-2l-.13,0L10,14.84A.41.41,0,0,1,10,14.6V12.7a.32.32,0,0,1,.09-.23.39.39,0,0,1,.1-.08l.13,0h2a.31.31,0,0,1,.24.1.39.39,0,0,1,.08.1.51.51,0,0,1,0,.13Zm-.12-3.93a.17.17,0,0,1,0,.12.41.41,0,0,1-.07.11.4.4,0,0,1-.23.08H10.35a.31.31,0,0,1-.34-.31L9.86,3.9A.36.36,0,0,1,10,3.66a.23.23,0,0,1,.11-.08.27.27,0,0,1,.13,0H12.3a.32.32,0,0,1,.25.1.36.36,0,0,1,.09.24Z"/><path d="M8.07,14.6a.51.51,0,0,1,0,.13.44.44,0,0,1-.08.11l-.11.08-.13,0h-2l-.13,0-.11-.08a.41.41,0,0,1-.08-.24V12.7a.27.27,0,0,1,0-.13.36.36,0,0,1,.07-.1.39.39,0,0,1,.1-.08l.13,0h2a.31.31,0,0,1,.24.1.39.39,0,0,1,.08.1.51.51,0,0,1,0,.13ZM8,10.67a.17.17,0,0,1,0,.12.41.41,0,0,1-.07.11.4.4,0,0,1-.23.08H5.85a.31.31,0,0,1-.34-.31L5.36,3.9a.36.36,0,0,1,.09-.24.23.23,0,0,1,.11-.08.27.27,0,0,1,.13,0H7.8a.35.35,0,0,1,.25.1.36.36,0,0,1,.09.24Z"/></g><g fill="#fff"><path d="M12.57,14.1a.51.51,0,0,1,0,.13.44.44,0,0,1-.08.11l-.11.08-.13,0h-2l-.13,0L10,14.34A.41.41,0,0,1,10,14.1V12.2A.32.32,0,0,1,10,12a.39.39,0,0,1,.1-.08l.13,0h2a.31.31,0,0,1,.24.1.39.39,0,0,1,.08.1.51.51,0,0,1,0,.13Zm-.12-3.93a.17.17,0,0,1,0,.12.41.41,0,0,1-.07.11.4.4,0,0,1-.23.08H10.35a.31.31,0,0,1-.34-.31L9.86,3.4A.36.36,0,0,1,10,3.16a.23.23,0,0,1,.11-.08.27.27,0,0,1,.13,0H12.3a.32.32,0,0,1,.25.1.36.36,0,0,1,.09.24Z"/><path d="M8.07,14.1a.51.51,0,0,1,0,.13.44.44,0,0,1-.08.11l-.11.08-.13,0h-2l-.13,0-.11-.08a.41.41,0,0,1-.08-.24V12.2a.27.27,0,0,1,0-.13.36.36,0,0,1,.07-.1.39.39,0,0,1,.1-.08l.13,0h2A.31.31,0,0,1,8,12a.39.39,0,0,1,.08.1.51.51,0,0,1,0,.13ZM8,10.17a.17.17,0,0,1,0,.12.41.41,0,0,1-.07.11.4.4,0,0,1-.23.08H5.85a.31.31,0,0,1-.34-.31L5.36,3.4a.36.36,0,0,1,.09-.24.23.23,0,0,1,.11-.08.27.27,0,0,1,.13,0H7.8a.35.35,0,0,1,.25.1.36.36,0,0,1,.09.24Z"/></g>',
    best: '<path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#81B64C" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/><path opacity="0.2" d="M9,3.43a.5.5,0,0,0-.27.08.46.46,0,0,0-.17.22L7.24,7.17l-3.68.19a.52.52,0,0,0-.26.1.53.53,0,0,0-.16.23.45.45,0,0,0,0,.28.44.44,0,0,0,.15.23l2.86,2.32-1,3.56a.45.45,0,0,0,0,.28.46.46,0,0,0,.17.22.41.41,0,0,0,.26.09.43.43,0,0,0,.27-.08l3.09-2,3.09,2a.46.46,0,0,0,.53,0,.46.46,0,0,0,.17-.22.53.53,0,0,0,0-.28l-1-3.56L14.71,8.2A.44.44,0,0,0,14.86,8a.45.45,0,0,0,0-.28.53.53,0,0,0-.16-.23.52.52,0,0,0-.26-.1l-3.68-.2L9.44,3.73a.46.46,0,0,0-.17-.22A.5.5,0,0,0,9,3.43Z"/><path fill="#fff" d="M9,2.93A.5.5,0,0,0,8.73,3a.46.46,0,0,0-.17.22L7.24,6.67l-3.68.19A.52.52,0,0,0,3.3,7a.53.53,0,0,0-.16.23.45.45,0,0,0,0,.28.44.44,0,0,0,.15.23L6.15,10l-1,3.56a.45.45,0,0,0,0,.28.46.46,0,0,0,.17.22.41.41,0,0,0,.26.09.43.43,0,0,0,.27-.08l3.09-2,3.09,2a.46.46,0,0,0,.53,0,.46.46,0,0,0,.17-.22.53.53,0,0,0,0-.28l-1-3.56L14.71,7.7a.44.44,0,0,0,.15-.23.45.45,0,0,0,0-.28A.53.53,0,0,0,14.7,7a.52.52,0,0,0-.26-.1l-3.68-.2L9.44,3.23A.46.46,0,0,0,9.27,3,.5.5,0,0,0,9,2.93Z"/>',
    excellent: '<g><path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#81B64C" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/></g><g opacity="0.2"><path d="M13.79,11.34c0-.2.4-.53.4-.94S14,9.72,14,9.58a2.06,2.06,0,0,0,.18-.83,1,1,0,0,0-.3-.69,1.13,1.13,0,0,0-.55-.2,10.29,10.29,0,0,1-2.07,0c-.37-.23,0-1.18.18-1.7S11.9,4,10.62,3.7c-.69-.17-.66.37-.78.9-.05.21-.09.43-.13.57A5,5,0,0,1,7.05,8.23a1.57,1.57,0,0,1-.42.18v4.94A7.23,7.23,0,0,1,8,13.53c.52.12.91.25,1.44.33A11.11,11.11,0,0,0,11,14a6.65,6.65,0,0,0,1.18,0,1.09,1.09,0,0,0,1-.59.66.66,0,0,0,.06-.2,1.63,1.63,0,0,1,.07-.3c.13-.28.37-.3.5-.68S13.74,11.53,13.79,11.34Z"/><path d="M5.49,8.09H4.31a.5.5,0,0,0-.5.5v4.56a.5.5,0,0,0,.5.5H5.49a.5.5,0,0,0,.5-.5V8.59A.5.5,0,0,0,5.49,8.09Z"/></g><g><path fill="#fff" d="M13.79,10.84c0-.2.4-.53.4-.94S14,9.22,14,9.08a2.06,2.06,0,0,0,.18-.83,1,1,0,0,0-.3-.69,1.13,1.13,0,0,0-.55-.2,10.29,10.29,0,0,1-2.07,0c-.37-.23,0-1.18.18-1.7s.51-2.12-.77-2.43c-.69-.17-.66.37-.78.9-.05.21-.09.43-.13.57A5,5,0,0,1,7.05,7.73a1.57,1.57,0,0,1-.42.18v4.94A7.23,7.23,0,0,1,8,13c.52.12.91.25,1.44.33a11.11,11.11,0,0,0,1.62.16,6.65,6.65,0,0,0,1.18,0,1.09,1.09,0,0,0,1-.59.66.66,0,0,0,.06-.2,1.63,1.63,0,0,1,.07-.3c.13-.28.37-.3.5-.68S13.74,11,13.79,10.84Z"/><path fill="#fff" d="M5.49,7.59H4.31a.5.5,0,0,0-.5.5v4.56a.5.5,0,0,0,.5.5H5.49a.5.5,0,0,0,.5-.5V8.09A.5.5,0,0,0,5.49,7.59Z"/></g>',
    correct: '<g><path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#81b64c" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/></g><g><path opacity="0.2" d="M15.11,6.81,9.45,12.47,7.79,14.13a.39.39,0,0,1-.28.11.39.39,0,0,1-.27-.11L2.89,9.78a.39.39,0,0,1-.11-.28.39.39,0,0,1,.11-.27L4.28,7.85a.34.34,0,0,1,.12-.09l.15,0a.37.37,0,0,1,.15,0,.38.38,0,0,1,.13.09l2.69,2.68,5.65-5.65a.38.38,0,0,1,.13-.09.37.37,0,0,1,.15,0,.4.4,0,0,1,.15,0,.34.34,0,0,1,.12.09l1.39,1.38a.41.41,0,0,1,.08.13.33.33,0,0,1,0,.15.4.4,0,0,1,0,.15A.5.5,0,0,1,15.11,6.81Z"/><path fill="#fff" d="M15.11,6.31,9.45,12,7.79,13.63a.39.39,0,0,1-.28.11.39.39,0,0,1-.27-.11L2.89,9.28A.39.39,0,0,1,2.78,9a.39.39,0,0,1,.11-.27L4.28,7.35a.34.34,0,0,1,.12-.09l.15,0a.37.37,0,0,1,.15,0,.38.38,0,0,1,.13.09L7.52,10l5.65-5.65a.38.38,0,0,1,.13-.09.37.37,0,0,1,.15,0,.4.4,0,0,1,.15,0,.34.34,0,0,1,.12.09l1.39,1.38a.41.41,0,0,1,.08.13.33.33,0,0,1,0,.15.4.4,0,0,1,0,.15A.5.5,0,0,1,15.11,6.31Z"/></g>',
    inaccuracy: '<path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#F7C631" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/><g opacity="0.2"><path d="M13.66,14.8a.28.28,0,0,1,0,.13.23.23,0,0,1-.08.11.28.28,0,0,1-.11.08l-.12,0h-2l-.13,0a.27.27,0,0,1-.1-.08A.36.36,0,0,1,11,14.8V12.9a.59.59,0,0,1,0-.13.36.36,0,0,1,.07-.1l.1-.08.13,0h2a.33.33,0,0,1,.23.1.39.39,0,0,1,.08.1.28.28,0,0,1,0,.13Zm-.12-3.93a.31.31,0,0,1,0,.13.3.3,0,0,1-.07.1.3.3,0,0,1-.23.08H11.43a.31.31,0,0,1-.34-.31L10.94,4.1A.5.5,0,0,1,11,3.86l.11-.08.13,0h2.11a.35.35,0,0,1,.26.1.41.41,0,0,1,.08.24Z"/><path d="M7.65,14.82a.27.27,0,0,1,0,.12.26.26,0,0,1-.07.11l-.1.07-.13,0H5.43a.25.25,0,0,1-.12,0,.27.27,0,0,1-.1-.08.31.31,0,0,1-.09-.22V13a.36.36,0,0,1,.09-.23l.1-.07.12,0H7.32a.32.32,0,0,1,.23.09.3.3,0,0,1,.07.1.28.28,0,0,1,0,.13Zm2.2-7.17a3.1,3.1,0,0,1-.36.73A5.58,5.58,0,0,1,9,9a4.85,4.85,0,0,1-.52.49,8,8,0,0,0-.65.63,1,1,0,0,0-.27.7V11a.21.21,0,0,1,0,.12.17.17,0,0,1-.06.1.23.23,0,0,1-.1.07l-.12,0H5.53a.21.21,0,0,1-.12,0,.18.18,0,0,1-.1-.07.2.2,0,0,1-.08-.1.37.37,0,0,1,0-.12v-.35a2.68,2.68,0,0,1,.13-.84,2.91,2.91,0,0,1,.33-.66,3.38,3.38,0,0,1,.45-.55c.16-.15.33-.29.49-.42a7.84,7.84,0,0,0,.65-.64,1,1,0,0,0,.25-.67.77.77,0,0,0-.07-.34.67.67,0,0,0-.23-.27A1.16,1.16,0,0,0,6.49,6,1.61,1.61,0,0,0,6,6.11a3,3,0,0,0-.41.18,1.75,1.75,0,0,0-.29.18l-.11.09A.5.5,0,0,1,5,6.62a.31.31,0,0,1-.21-.13l-1-1.21a.3.3,0,0,1,0-.4A1.36,1.36,0,0,1,4,4.68a3.07,3.07,0,0,1,.56-.38,5.49,5.49,0,0,1,.9-.37,3.69,3.69,0,0,1,1.19-.17,3.92,3.92,0,0,1,2.3.75,2.85,2.85,0,0,1,.77.92A2.82,2.82,0,0,1,10,6.71,3,3,0,0,1,9.85,7.65Z"/></g><g><path fill="#fff" d="M13.66,14.3a.28.28,0,0,1,0,.13.23.23,0,0,1-.08.11.28.28,0,0,1-.11.08l-.12,0h-2l-.13,0a.27.27,0,0,1-.1-.08A.36.36,0,0,1,11,14.3V12.4a.59.59,0,0,1,0-.13.36.36,0,0,1,.07-.1l.1-.08.13,0h2a.33.33,0,0,1,.23.1.39.39,0,0,1,.08.1.28.28,0,0,1,0,.13Zm-.12-3.93a.31.31,0,0,1,0,.13.3.3,0,0,1-.07.1.3.3,0,0,1-.23.08H11.43a.31.31,0,0,1-.34-.31L10.94,3.6A.5.5,0,0,1,11,3.36l.11-.08.13,0h2.11a.35.35,0,0,1,.26.1.41.41,0,0,1,.08.24Z"/><path fill="#fff" d="M7.65,14.32a.27.27,0,0,1,0,.12.26.26,0,0,1-.07.11l-.1.07-.13,0H5.43a.25.25,0,0,1-.12,0,.27.27,0,0,1-.1-.08.31.31,0,0,1-.09-.22V12.49a.36.36,0,0,1,.09-.23l.1-.07.12,0H7.32a.32.32,0,0,1,.23.09.3.3,0,0,1,.07.1.28.28,0,0,1,0,.13Zm2.2-7.17a3.1,3.1,0,0,1-.36.73,5.58,5.58,0,0,1-.49.6A4.85,4.85,0,0,1,8.48,9a8,8,0,0,0-.65.63,1,1,0,0,0-.27.7v.22a.21.21,0,0,1,0,.12.17.17,0,0,1-.06.1.23.23,0,0,1-.1.07l-.12,0H5.53a.21.21,0,0,1-.12,0,.18.18,0,0,1-.1-.07.2.2,0,0,1-.08-.1.37.37,0,0,1,0-.12v-.35a2.68,2.68,0,0,1,.13-.84,2.91,2.91,0,0,1,.33-.66,3.38,3.38,0,0,1,.45-.55c.16-.15.33-.29.49-.42a7.84,7.84,0,0,0,.65-.64,1,1,0,0,0,.25-.67.77.77,0,0,0-.07-.34.67.67,0,0,0-.23-.27,1.16,1.16,0,0,0-.72-.24A1.61,1.61,0,0,0,6,5.61a3,3,0,0,0-.41.18A1.75,1.75,0,0,0,5.3,6l-.11.09A.5.5,0,0,1,5,6.12.31.31,0,0,1,4.74,6l-1-1.21a.3.3,0,0,1,0-.4A1.36,1.36,0,0,1,4,4.18a3.07,3.07,0,0,1,.56-.38,5.49,5.49,0,0,1,.9-.37,3.69,3.69,0,0,1,1.19-.17A3.92,3.92,0,0,1,8.93,4a2.85,2.85,0,0,1,.77.92A2.82,2.82,0,0,1,10,6.21,3,3,0,0,1,9.85,7.15Z"/></g>',
    mistake: '<g><path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#FFA459" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/></g><g><g opacity="0.2"><path d="M9.92,15a.27.27,0,0,1,0,.12.41.41,0,0,1-.07.11.32.32,0,0,1-.23.09H7.7a.25.25,0,0,1-.12,0,.27.27,0,0,1-.1-.08A.31.31,0,0,1,7.39,15V13.19A.32.32,0,0,1,7.48,13l.1-.07.12,0H9.59a.32.32,0,0,1,.23.09.61.61,0,0,1,.07.1.28.28,0,0,1,0,.13Zm2.2-7.17a3.1,3.1,0,0,1-.36.73,5.58,5.58,0,0,1-.49.6,6,6,0,0,1-.52.49,8,8,0,0,0-.65.63,1,1,0,0,0-.27.7v.22a.24.24,0,0,1,0,.12.17.17,0,0,1-.06.1.3.3,0,0,1-.1.07l-.12,0H7.79l-.12,0a.3.3,0,0,1-.1-.07.26.26,0,0,1-.07-.1.37.37,0,0,1,0-.12v-.35A2.42,2.42,0,0,1,7.61,10a2.55,2.55,0,0,1,.33-.66,3.38,3.38,0,0,1,.45-.55c.16-.15.33-.29.49-.42a7.73,7.73,0,0,0,.64-.64,1,1,0,0,0,.26-.67.77.77,0,0,0-.07-.34.75.75,0,0,0-.23-.27,1.16,1.16,0,0,0-.72-.24,1.61,1.61,0,0,0-.49.07,3,3,0,0,0-.41.18,1.41,1.41,0,0,0-.29.18l-.11.09a.5.5,0,0,1-.24.06A.31.31,0,0,1,7,6.69L6,5.48a.29.29,0,0,1,0-.4,1.36,1.36,0,0,1,.21-.2,3.07,3.07,0,0,1,.56-.38,5.38,5.38,0,0,1,.89-.37A3.75,3.75,0,0,1,8.9,4a4.07,4.07,0,0,1,1.2.19,4,4,0,0,1,1.09.56,2.76,2.76,0,0,1,.78.92,2.82,2.82,0,0,1,.28,1.28A3,3,0,0,1,12.12,7.85Z"/></g><path fill="#fff" d="M9.92,14.52a.27.27,0,0,1,0,.12.41.41,0,0,1-.07.11.32.32,0,0,1-.23.09H7.7a.25.25,0,0,1-.12,0,.27.27,0,0,1-.1-.08.31.31,0,0,1-.09-.22V12.69a.32.32,0,0,1,.09-.23l.1-.07.12,0H9.59a.32.32,0,0,1,.23.09.61.61,0,0,1,.07.1.28.28,0,0,1,0,.13Zm2.2-7.17a3.1,3.1,0,0,1-.36.73,5.58,5.58,0,0,1-.49.6,6,6,0,0,1-.52.49,8,8,0,0,0-.65.63,1,1,0,0,0-.27.7v.22a.24.24,0,0,1,0,.12.17.17,0,0,1-.06.1.3.3,0,0,1-.1.07l-.12,0H7.79l-.12,0a.3.3,0,0,1-.1-.07.26.26,0,0,1-.07-.1.37.37,0,0,1,0-.12v-.35A2.42,2.42,0,0,1,7.61,9.5a2.55,2.55,0,0,1,.33-.66,3.38,3.38,0,0,1,.45-.55c.16-.15.33-.29.49-.42a7.73,7.73,0,0,0,.64-.64,1,1,0,0,0,.26-.67.77.77,0,0,0-.07-.34A.75.75,0,0,0,9.48,6a1.16,1.16,0,0,0-.72-.24,1.61,1.61,0,0,0-.49.07A3,3,0,0,0,7.86,6a1.41,1.41,0,0,0-.29.18l-.11.09a.5.5,0,0,1-.24.06A.31.31,0,0,1,7,6.19L6,5a.29.29,0,0,1,0-.4,1.36,1.36,0,0,1,.21-.2A3.07,3.07,0,0,1,6.81,4a5.38,5.38,0,0,1,.89-.37,3.75,3.75,0,0,1,1.2-.17,4.07,4.07,0,0,1,1.2.19,4,4,0,0,1,1.09.56,2.76,2.76,0,0,1,.78.92,2.82,2.82,0,0,1,.28,1.28A3,3,0,0,1,12.12,7.35Z"/></g>',
    blunder: '<path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#FA412D" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/><g opacity="0.2"><path d="M14.74,5.45A2.58,2.58,0,0,0,14,4.54,3.76,3.76,0,0,0,12.89,4a4.07,4.07,0,0,0-1.2-.19A3.92,3.92,0,0,0,10.51,4a5.87,5.87,0,0,0-.9.37,3,3,0,0,0-.32.2,3.46,3.46,0,0,1,.42.63,3.29,3.29,0,0,1,.36,1.47.31.31,0,0,0,.19-.06l.11-.08a2.9,2.9,0,0,1,.29-.19,3.89,3.89,0,0,1,.41-.17,1.55,1.55,0,0,1,.48-.07,1.1,1.1,0,0,1,.72.24.72.72,0,0,1,.23.26.8.8,0,0,1,.07.34,1,1,0,0,1-.25.67,7.71,7.71,0,0,1-.65.63,6.2,6.2,0,0,0-.48.43,2.93,2.93,0,0,0-.45.54,2.55,2.55,0,0,0-.33.66,2.62,2.62,0,0,0-.13.83V11a.24.24,0,0,0,0,.12.35.35,0,0,0,.17.17l.12,0h1.71l.12,0a.23.23,0,0,0,.1-.07.21.21,0,0,0,.06-.1.27.27,0,0,0,0-.12V10.8a1,1,0,0,1,.26-.7q.27-.28.66-.63A5.79,5.79,0,0,0,14.05,9a4.51,4.51,0,0,0,.48-.6,2.56,2.56,0,0,0,.36-.72,2.81,2.81,0,0,0,.14-1A2.66,2.66,0,0,0,14.74,5.45Z"/><path d="M12.38,12.65H10.5l-.12,0a.34.34,0,0,0-.18.29v1.82a.36.36,0,0,0,.08.23.23.23,0,0,0,.1.07l.12,0h1.88a.24.24,0,0,0,.12,0,.26.26,0,0,0,.11-.07.36.36,0,0,0,.07-.1.28.28,0,0,0,0-.13V13a.27.27,0,0,0,0-.12.61.61,0,0,0-.07-.1A.32.32,0,0,0,12.38,12.65Z"/><path d="M6.79,12.65H4.91l-.12,0a.34.34,0,0,0-.18.29v1.82a.36.36,0,0,0,.08.23.23.23,0,0,0,.1.07l.12,0H6.79a.24.24,0,0,0,.12,0A.26.26,0,0,0,7,15a.36.36,0,0,0,.07-.1.28.28,0,0,0,0-.13V13a.27.27,0,0,0,0-.12.61.61,0,0,0-.07-.1A.32.32,0,0,0,6.79,12.65Z"/><path d="M8.39,4.54A3.76,3.76,0,0,0,7.3,4a4.07,4.07,0,0,0-1.2-.19A3.92,3.92,0,0,0,4.92,4a5.87,5.87,0,0,0-.9.37,3.37,3.37,0,0,0-.55.38l-.21.19a.32.32,0,0,0,0,.41l1,1.2a.26.26,0,0,0,.2.12.48.48,0,0,0,.24-.06l.11-.08a2.9,2.9,0,0,1,.29-.19l.4-.17A1.66,1.66,0,0,1,6,6.06a1.1,1.1,0,0,1,.72.24.72.72,0,0,1,.23.26A.77.77,0,0,1,7,6.9a1,1,0,0,1-.26.67,7.6,7.6,0,0,1-.64.63,6.28,6.28,0,0,0-.49.43,2.93,2.93,0,0,0-.45.54,2.72,2.72,0,0,0-.33.66,2.62,2.62,0,0,0-.13.83V11a.43.43,0,0,0,0,.12.39.39,0,0,0,.08.1.18.18,0,0,0,.1.07.21.21,0,0,0,.12,0H6.72l.12,0a.23.23,0,0,0,.1-.07.36.36,0,0,0,.07-.1A.5.5,0,0,0,7,11V10.8a1,1,0,0,1,.27-.7A8,8,0,0,1,8,9.47c.18-.15.35-.31.52-.48A7,7,0,0,0,9,8.39a3.23,3.23,0,0,0,.36-.72,3.07,3.07,0,0,0,.13-1,2.66,2.66,0,0,0-.29-1.27A2.58,2.58,0,0,0,8.39,4.54Z"/></g><g><path fill="#fff" d="M14.74,5A2.58,2.58,0,0,0,14,4a3.76,3.76,0,0,0-1.09-.56,4.07,4.07,0,0,0-1.2-.19,3.92,3.92,0,0,0-1.18.17,5.87,5.87,0,0,0-.9.37,3,3,0,0,0-.32.2,3.46,3.46,0,0,1,.42.63,3.29,3.29,0,0,1,.36,1.47.31.31,0,0,0,.19-.06L10.37,6a2.9,2.9,0,0,1,.29-.19,3.89,3.89,0,0,1,.41-.17,1.55,1.55,0,0,1,.48-.07,1.1,1.1,0,0,1,.72.24.72.72,0,0,1,.23.26.8.8,0,0,1,.07.34,1,1,0,0,1-.25.67,7.71,7.71,0,0,1-.65.63,6.2,6.2,0,0,0-.48.43,2.93,2.93,0,0,0-.45.54,2.55,2.55,0,0,0-.33.66,2.62,2.62,0,0,0-.13.83v.35a.24.24,0,0,0,0,.12.35.35,0,0,0,.17.17l.12,0h1.71l.12,0a.23.23,0,0,0,.1-.07.21.21,0,0,0,.06-.1.27.27,0,0,0,0-.12V10.3a1,1,0,0,1,.26-.7q.27-.28.66-.63a5.79,5.79,0,0,0,.51-.48,4.51,4.51,0,0,0,.48-.6,2.56,2.56,0,0,0,.36-.72,2.81,2.81,0,0,0,.14-1A2.66,2.66,0,0,0,14.74,5Z"/><path fill="#fff" d="M12.38,12.15H10.5l-.12,0a.34.34,0,0,0-.18.29v1.82a.36.36,0,0,0,.08.23.23.23,0,0,0,.1.07l.12,0h1.88a.24.24,0,0,0,.12,0,.26.26,0,0,0,.11-.07.36.36,0,0,0,.07-.1.28.28,0,0,0,0-.13V12.46a.27.27,0,0,0,0-.12.61.61,0,0,0-.07-.1A.32.32,0,0,0,12.38,12.15Z"/><path fill="#fff" d="M6.79,12.15H4.91l-.12,0a.34.34,0,0,0-.18.29v1.82a.36.36,0,0,0,.08.23.23.23,0,0,0,.1.07l.12,0H6.79a.24.24,0,0,0,.12,0A.26.26,0,0,0,7,14.51a.36.36,0,0,0,.07-.1.28.28,0,0,0,0-.13V12.46a.27.27,0,0,0,0-.12.61.61,0,0,0-.07-.1A.32.32,0,0,0,6.79,12.15Z"/><path fill="#fff" d="M8.39,4A3.76,3.76,0,0,0,7.3,3.48a4.07,4.07,0,0,0-1.2-.19,3.92,3.92,0,0,0-1.18.17,5.87,5.87,0,0,0-.9.37,3.37,3.37,0,0,0-.55.38l-.21.19a.32.32,0,0,0,0,.41l1,1.2a.26.26,0,0,0,.2.12.48.48,0,0,0,.24-.06l.11-.08a2.9,2.9,0,0,1,.29-.19l.4-.17A1.66,1.66,0,0,1,6,5.56a1.1,1.1,0,0,1,.72.24.72.72,0,0,1,.23.26A.77.77,0,0,1,7,6.4a1,1,0,0,1-.26.67,7.6,7.6,0,0,1-.64.63,6.28,6.28,0,0,0-.49.43,2.93,2.93,0,0,0-.45.54,2.72,2.72,0,0,0-.33.66,2.62,2.62,0,0,0-.13.83v.35a.43.43,0,0,0,0,.12.39.39,0,0,0,.08.1.18.18,0,0,0,.1.07.21.21,0,0,0,.12,0H6.72l.12,0a.23.23,0,0,0,.1-.07.36.36,0,0,0,.07-.1.5.5,0,0,0,0-.12V10.3a1,1,0,0,1,.27-.7A8,8,0,0,1,8,9c.18-.15.35-.31.52-.48A7,7,0,0,0,9,7.89a3.23,3.23,0,0,0,.36-.72,3.07,3.07,0,0,0,.13-1A2.66,2.66,0,0,0,9.15,5,2.58,2.58,0,0,0,8.39,4Z"/></g>',
    book: '<path opacity="0.3" d="M9,.5a9,9,0,1,0,9,9A9,9,0,0,0,9,.5Z"/><path fill="#D5A47D" d="M9,0a9,9,0,1,0,9,9A9,9,0,0,0,9,0Z"/><g opacity="0.3"><path d="M8.45,5.9c-1-.75-2.51-1.09-4.83-1.09H2.54v8.71H3.62a8.16,8.16,0,0,1,4.83,1.17Z"/><path d="M9.54,14.69a8.14,8.14,0,0,1,4.84-1.17h1.08V4.81H14.38c-2.31,0-3.81.34-4.84,1.09Z"/></g><g fill="#fff"><path d="M8.45,5.4c-1-.75-2.51-1.09-4.83-1.09H3V13h.58a8.09,8.09,0,0,1,4.83,1.17Z"/><path d="M9.54,14.19A8.14,8.14,0,0,1,14.38,13H15V4.31h-.58c-2.31,0-3.81.34-4.84,1.09Z"/></g>',
  };
  function kindSvg(kind, cls) {
    const body = ICON_SVGS[kind] || ICON_SVGS.correct;
    return '<svg viewBox="0 0 18 19" class="gr-svgicon' + (cls ? " " + cls : "") +
      '" aria-hidden="true">' + body + "</svg>";
  }

  // 🖌 براش‌های فلش Chessground — «hub» همان فلش آبیِ بهترین حرکت انجین
  // در بخش آنالیز است؛ «kb_*» فلش رنگ هر دسته هنگام پرش از چیپ آمار.
  const CG_BRUSHES = (function () {
    const b = {
      hub: { key: "hub", color: "#3b82f6", opacity: 0.9, lineWidth: 10 },
    };
    Object.keys(KIND_COLORS).forEach(function (k) {
      b["kb_" + k] = {
        key: "kb_" + k, color: KIND_COLORS[k], opacity: 0.85, lineWidth: 8,
      };
    });
    return b;
  })();

  // ارزش مادی بر حسب پیاده — برای تشخیص قربانی (Brilliant)
  const PIECE_VALS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function materialOf(fen, color) {
    let v = 0;
    const rows = fen.split(" ")[0];
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      if (color === "w" && /[A-Z]/.test(c) && PIECE_VALS[c.toLowerCase()]) v += PIECE_VALS[c.toLowerCase()];
      else if (color === "b" && /[a-z]/.test(c) && PIECE_VALS[c]) v += PIECE_VALS[c];
    }
    return v;
  }
  // آیا حرکتِ «بهترین/عالی» با قربانی دادن همراه بوده؟ → درخشان 💎
  function isSacrifice(fens, i, reps) {
    try {
      if (i + 1 >= fens.length) return false;
      const reply = reps[i + 1] && reps[i + 1].best;
      if (!reply) return false;
      const g = new Chess();
      if (!g.load(fens[i + 1])) return false;
      const mv = g.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || "q" });
      if (!mv) return false;
      const mover = fens[i].split(" ")[1] === "w" ? "w" : "b";
      const before = materialOf(fens[i], mover);
      const after = materialOf(g.fen(), mover);
      return before - after >= 2; // قربانی حداقل ۲ پیاده
    } catch (e) {
      return false;
    }
  }

  let R = null; // وضعیت جلسه‌ی مرور جاری
  let _opening = false; // قفل ضدِ دابل‌کلیک هنگام await پیش‌بارگذاری مهره‌ها

  function uciToSanObj(fen, uci) {
    try {
      const g = new Chess();
      if (!g.load(fen)) return null;
      const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] || "q") });
      return mv;
    } catch (e) { return null; }
  }

  function pieceSetId() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      return (s && s.pieceSet) || "neo";
    } catch (e) { return "neo"; }
  }
  function kingSquareOf(fen, color) {
    try {
      const g = new Chess(fen);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = g.board()[r][c];
          if (p && p.type === "k" && p.color === color) {
            return "abcdefgh"[c] + (8 - r);
          }
        }
      }
    } catch (e) {}
    return null;
  }

  /* ---------- 🆕 آواتار بازیکن‌ها ----------
     استاد شناخته‌شده → عکس واقعی (images/players)؛
     بازیکن ناشناس → آدمکِ تولیدی با رنگِ همان طرف (سفید/سیاه). */
  function avatarImg(name, side, cls) {
    if (window.ChessUtils && ChessUtils.avatarTag) {
      return ChessUtils.avatarTag(name, side, cls);
    }
    return "";
  }

  /* ---------- 🆕 انتظار برای آماده‌شدن Chessground ----------
     اگر صفحه لودر لایچز را ندارد، بی‌درنگ false (فالبک ChessBoardUI). */
  function cgReady(maxWait) {
    return new Promise(function (resolve) {
      if (window.Chessground) return resolve(true);
      const loader = document.querySelector('script[src*="chessground/loader"]');
      if (!loader) return resolve(false);
      let done = false;
      const ok = function () { if (!done) { done = true; resolve(true); } };
      const no = function () { if (!done) { done = true; resolve(false); } };
      document.addEventListener("chessgroundReady", ok, { once: true });
      const t0 = Date.now();
      (function poll() {
        if (done) return;
        if (window.Chessground) return ok();
        if (Date.now() - t0 > (maxWait || 3000)) return no();
        setTimeout(poll, 80);
      })();
    });
  }

  /* ---------- 🆕 لایهٔ تخته — Chessground یا فالبک ChessBoardUI ---------- */
  function makeBoardApi() {
    const boardEl = $("grBoard");
    if (!boardEl) return null;
    // لایهٔ برچسب حرکت — اگر DOM میزبان نداشت، خودمان می‌سازیم
    if (!$("grBadges") && boardEl.parentElement) {
      const layer = document.createElement("div");
      layer.className = "gr-badges";
      layer.id = "grBadges";
      boardEl.parentElement.appendChild(layer);
    }
    if (R.useCg && window.Chessground) {
      const setId = pieceSetId();
      if (window.ChessUtils && ChessUtils.ensureCgPieceSetCss) {
        ChessUtils.ensureCgPieceSetCss("gr-board", setId);
      }
      boardEl.className = "gr-board set-" + setId;
      const cg = window.Chessground(boardEl, {
        fen: (R.cfg.startFen ||
          "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
        orientation: "white",
        coordinates: true,
        highlight: { lastMove: true, check: true },
        animation: { duration: 240 },
        movable: { free: false, color: null, showDests: false, dests: new Map() },
        drawable: {
          enabled: true,
          visible: true,
          brushes: CG_BRUSHES,
          onChange: function (shapes) {
            // فلش‌های خودِ کاربر — فلش انجین/دسته‌ها جدا نگه داشته می‌شوند
            R.userShapes = (shapes || []).filter(function (s) {
              return s.brush !== "hub" && String(s.brush).indexOf("kb_") !== 0;
            });
          },
        },
      });
      const wrap = boardEl.parentElement;
      if (wrap) wrap.classList.add("gr-cg-mode");
      return {
        render: function (x) {
          try {
            const cfg = {
              fen: x.fen,
              // ⬇ [] و null برای پاک‌شدن هایلایت قبلی (undefined یعنی «دست نزن»)
              lastMove: x.lastMove || [],
              check: x.check || null,
              turnColor: x.turnColor || "white",
              // 🎨 هایلایت رنگی مبدا/مقصد — کلاسِ رنگ دسته روی خانه‌ها
              highlight: { lastMove: true, check: true, custom: x.marks || undefined },
            };
            if (x.animate === false) cfg.animate = false;
            cg.set(cfg);
            cg.setShapes((R.userShapes || []).concat(x.shapes || []));
          } catch (e) {}
        },
        redraw: function () { try { cg.redrawAll(); } catch (e) {} },
        destroy: function () { try { cg.destroy(); } catch (e) {} },
      };
    }
    // فالبک — تختهٔ قدیمی سایت (بدون لایچز هم صفحه کار می‌کند)
    if (window.ChessBoardUI) {
      const fb = ChessBoardUI.create({
        boardEl: boardEl,
        arrowsEl: $("grArrows"),
        getGame: function () { return R.viewGame; },
        canMove: function () { return false; },
        userColor: function () { return "w"; },
        onAttempt: function () { return false; },
      });
      fb.build();
      return {
        render: function (x) {
          try { R.viewGame.load(x.fen); } catch (e) {}
          fb.render({
            lastMove: x.lastMove ? { from: x.lastMove[0], to: x.lastMove[1] } : null,
          });
        },
        redraw: function () {},
        destroy: function () { fb.destroy(); },
      };
    }
    return null;
  }

  /* ---------- ساخت اورلی ---------- */
  function buildOverlay(cfg) {
    const ov = document.createElement("div");
    ov.className = "gr-overlay";
    ov.id = "grOverlay";
    ov.innerHTML =
      '<div class="gr-inner">' +
        '<div class="gr-head">' +
          '<div class="gr-title"><i class="fas fa-magnifying-glass-chart"></i>' +
            '<div><b>مرور بازی</b><span id="grSub">' + (cfg.subtitle || "") + "</span></div></div>" +
          '<button class="gr-close" id="grCloseBtn"><i class="fas fa-xmark"></i> بستن</button>' +
        "</div>" +
        '<div class="gr-progress" id="grProgWrap">' +
          '<span class="gr-spin" id="grSpin"><i class="fas fa-spinner fa-pulse"></i></span>' +
          '<div class="gr-prog-pct" id="grProgText">۵٪</div>' +
          '<div class="gr-prog-track"><div class="gr-prog-fill" id="grProgFill" style="width:5%"></div></div>' +
        "</div>" +
        '<div class="gr-body">' +
          '<div class="gr-board-side">' +
            '<div class="gr-players"><span id="grPw"></span><span class="gr-vs">برابر</span><span id="grPb"></span></div>' +
            '<div class="gr-board-wrap">' +
              '<div id="grBoard" class="chessboard gr-board"></div>' +
              '<svg class="board-arrows" id="grArrows" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>' +
              '<div class="gr-badges" id="grBadges"></div>' +
            "</div>" +
            '<div class="eval-bar"><div class="eval-track"><div class="eval-fill" id="grEvalFill"></div><div class="eval-mid"></div></div>' +
            '<span class="gr-eval-num" id="grEvalNum">۰٫۰</span></div>' +
            '<div class="gr-controls">' +
              '<button class="gr-btn" id="grFirst" title="اول"><i class="fas fa-fast-backward"></i></button>' +
              '<button class="gr-btn" id="grPrev" title="قبلی"><i class="fas fa-step-backward"></i></button>' +
              '<button class="gr-btn primary" id="grPlay"><i class="fas fa-play"></i></button>' +
              '<button class="gr-btn" id="grNext" title="بعدی"><i class="fas fa-step-forward"></i></button>' +
              '<button class="gr-btn" id="grLast" title="آخر"><i class="fas fa-fast-forward"></i></button>' +
              '<span class="gr-counter" id="grCounter">۰/۰</span>' +
            "</div>" +
            '<div class="gr-kbd-hint"><i class="fas fa-keyboard"></i> فلش چپ/راست = حرکت قبل/بعد &nbsp;•&nbsp; دکمهٔ فاصله = پخش بازی</div>' +
          "</div>" +
          '<div class="gr-panel">' +
            '<div class="gr-summary" id="grSummary"><div class="gr-loading"><i class="fas fa-spinner fa-pulse"></i> انجین دارد بازی را تحلیل می‌کند…</div></div>' +
            '<div class="gr-graph-wrap"><canvas id="grGraph" height="90"></canvas></div>' +
            '<div class="gr-moves" id="grMoves"></div>' +
            '<div class="gr-actions">' +
              '<button class="gr-btn" id="grCopyPgn"><i class="fas fa-copy"></i> کپی PGN</button>' +
              '<button class="gr-btn" id="grDlPgn"><i class="fas fa-download"></i> دانلود PGN</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    return ov;
  }

  function fmtEvalCp(cp, moverIsWhite) {
    // نمایش از دید سفید برای نوار ارزیابی
    const whiteCp = moverIsWhite ? cp : -cp;
    if (whiteCp >= 9000) return "M" + fa(Math.max(1, Math.ceil((10000 - whiteCp) / 100)));
    if (whiteCp <= -9000) return "-" + fa(Math.max(1, Math.ceil((10000 + whiteCp) / 100)));
    const v = whiteCp / 100;
    const s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
    return s.replace(/\d/g, function (d) { return FA_DIGITS[+d]; }).replace(".", "٫");
  }

  function setEvalBar(cpWhite) {
    const fill = $("grEvalFill");
    const num = $("grEvalNum");
    if (fill) {
      let w = 50;
      if (typeof cpWhite === "number") w = 50 + (clamp(cpWhite, -3000, 3000) / 3000) * 47;
      fill.style.width = w + "%";
    }
    if (num) num.textContent = typeof cpWhite === "number" ? fmtEvalCp(cpWhite, true) : "۰٫۰";
  }

  /* ---------- نوار پیشرفت تحلیل — فقط درصد (۵٪ تا ۱۰۰٪) + اسپینر کوچک ---------- */
  function setProgress(pct, analyzing) {
    const t = $("grProgText");
    const spin = $("grSpin");
    const fill = $("grProgFill");
    const wrap = $("grProgWrap");
    const v = Math.max(5, Math.min(100, Math.round(pct)));
    if (t) t.textContent = fa(v) + "٪";
    if (fill) fill.style.width = v + "%";
    if (wrap) wrap.classList.toggle("done", v >= 100);
    if (spin) spin.classList.toggle("show", !!analyzing && v < 100);
  }

  /* ---------- تحلیل ---------- */
  async function analyzeMoves(cfg, onDone) {
    const moves = cfg.moves || [];
    const startFen = cfg.startFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const hash = gameHash(startFen, moves);
    const cached = cacheAll()[hash];
    // 🔧 reps تعدادِ «موقعیت‌ها» است = حرکت‌ها + ۱ — بررسی قبلی همیشه
    // می‌سوخت و کش تحلیل هرگز استفاده نمی‌شد.
    if (cached && cached.reps && cached.reps.length === moves.length + 1 && cached.judged) {
      onDone(cached);
      return;
    }

    const g = new Chess();
    if (cfg.startFen) g.load(startFen);
    const fens = [g.fen()];
    const sans = [];
    for (let i = 0; i < moves.length; i++) {
      const u = moves[i];
      const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      if (!mv) break;
      sans.push(mv.san);
      fens.push(g.fen());
    }

    const reps = [];      // ارزیابی هر موقعیت از دید نوبت‌دار + بهترین حرکت
    const myEpoch = ++R.epoch;
    for (let i = 0; i < fens.length; i++) {
      if (R.closed || myEpoch !== R.epoch) return;
      const budget = analysisBudget(fens[i]);
      const r = await ChessEngine.ask(fens[i], { movetime: budget.movetime, depth: budget.depth, skill: 20 });
      if (R.closed || myEpoch !== R.epoch) return;
      reps.push({
        cp: r.score ? cpOf(r.score) : null,
        best: r.bestUci || null,
        pv: (r.pv || []).slice(0, 8),
      });
      const pct = Math.round(((i + 1) / fens.length) * 100);
      setProgress(pct, true);
    }

    // نمره‌دهی
    const judged = [];
    for (let i = 0; i < sans.length; i++) {
      const before = reps[i].cp;
      const afterResp = reps[i + 1];
      const after = afterResp && afterResp.cp != null ? -afterResp.cp : null;
      let kind = "good";
      if (i === sans.length - 1 && fens[i + 1]) {
        // حرکت آخر اگر مات باشد همیشه «بهترین» است (ارزیابیِ موقعیت پایان‌یافته معنا ندارد)
        try {
          const gg = new Chess();
          if (gg.load(fens[i + 1]) && gg.in_checkmate()) kind = "best";
        } catch (e) {}
      }
      if (kind !== "best") {
        if (i < 8 && Math.abs(before || 0) < 60 && Math.abs((after || 0) - (before || 0)) < 40) {
          kind = "book";
        } else if (before == null || after == null) {
          kind = "good";
        } else if (reps[i].best && moves[i] === reps[i].best) {
          kind = "best";
        } else {
          const delta = before - after; // مثبت = از دست دادن
          const isWinning = before >= 250;
          if (delta <= 25) kind = "excellent";
          else if (delta <= 80) kind = "good";
          else if (delta <= 180) kind = "inaccuracy";
          else if (delta <= 400) kind = "mistake";
          else kind = "blunder";
          if (isWinning && after < 120 && after > -250) kind = delta > 250 ? "blunder" : "mistake";
        }
      }
      // درخشان 💎 = بهترین/عالی + قربانی دادن ماده
      if ((kind === "best" || kind === "excellent") && isSacrifice(fens, i, reps)) {
        kind = "brilliant";
      }
      judged.push({ i: i, san: sans[i], uci: moves[i], kind: kind,
        before: before, after: after, best: reps[i].best,
        bestSan: reps[i].best && reps[i].best !== moves[i] ? (uciToSanObj(fens[i], reps[i].best) || {}).san : null,
        color: sans[i] ? (fens[i].split(" ")[1] === "w" ? "w" : "b") : "w" });
    }

    const data = { reps: reps, judged: judged, t: Date.now() };
    cachePut(hash, data);
    onDone(data);
  }

  /* ---------- رندر ---------- */
  function renderMovesList() {
    const wrap = $("grMoves");
    if (!wrap) return;
    wrap.innerHTML = "";
    const judged = R.judged || [];
    for (let i = 0; i < judged.length; i += 2) {
      const row = document.createElement("div");
      row.className = "gr-mrow";
      const num = Math.floor(i / 2) + 1;
      let html = '<span class="gr-mnum">' + fa(num) + ".</span>";
      for (let j = i; j < i + 2 && j < judged.length; j++) {
        const m = judged[j];
        const K = KINDS[m.kind] || KINDS.good;
        html += '<button class="gr-move ' + K.cls + (R.idx === j + 1 ? " cur" : "") +
          '" data-i="' + (j + 1) + '"><span class="gr-san">' + m.san + "</span>" +
          '<span class="gr-kind">' + kindSvg(m.kind) + " " + K.fa + "</span></button>";
      }
      row.innerHTML = html;
      wrap.appendChild(row);
    }
    const cur = wrap.querySelector(".gr-move.cur");
    if (cur) scrollMovesBox(wrap, cur);
  }

  // 🔧 رفع باگ پرش صفحه در موبایل:
  // قبلاً scrollIntoView استفاده می‌شد که در صفحات کوچک کل اورلی (اسکرولر صفحه)
  // را به پایین می‌پراند و تخته از دید خارج می‌شد. حالا فقط خودِ لیست حرکات
  // اسکرول می‌شود — هیچ اسکرولر دیگری (اورلی/بدنه) هرگز تکان نمی‌خورد.
  function scrollMovesBox(box, el) {
    try {
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const delta = elRect.top - boxRect.top;
      const target = box.scrollTop + delta - (box.clientHeight - elRect.height) / 2;
      const max = box.scrollHeight - box.clientHeight;
      const clamped = Math.max(0, Math.min(target, Math.max(0, max)));
      if (Math.abs(clamped - box.scrollTop) < 2) return;
      if (typeof box.scrollTo === "function") {
        box.scrollTo({ top: clamped, behavior: "smooth" });
      } else {
        box.scrollTop = clamped;
      }
    } catch (e) {
      box.scrollTop = el.offsetTop;
    }
  }

  /* ---------- 🆕 گزارش عملکرد تمیز — کارت بازیکن‌ها با عکس ---------- */
  function renderSummary() {
    const box = $("grSummary");
    if (!box) return;
    const judged = R.judged || [];
    if (!judged.length) return;
    // دقت هر طرف
    const acc = { w: [], b: [] };
    (R.reps || []).forEach(function (r, i) {
      if (i >= judged.length) return;
      const side = (R.fens[i] || "").split(" ")[1] === "w" ? "w" : "b";
      const winBefore = winPercent(r.cp || 0);
      const after = R.reps[i + 1] ? -(R.reps[i + 1].cp || 0) : (r.cp || 0);
      acc[side].push(moveAccuracy(winBefore, winPercent(after)));
    });
    const avg = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; };
    const cnt = function (side, kind) {
      return judged.filter(function (m) { return m.color === side && m.kind === kind; }).length;
    };
    const accW = avg(acc.w), accB = avg(acc.b);
    const bestSide = accW === accB ? null : (accW > accB ? "w" : "b");

    const card = function (side) {
      const name = side === "w" ? (R.cfg.white || "سفید") : (R.cfg.black || "سیاه");
      const kinds = ["brilliant", "best", "excellent", "good", "inaccuracy", "mistake", "blunder", "book"];
      let chips = "";
      kinds.forEach(function (k) {
        const n = cnt(side, k);
        if (!n) return;
        chips += '<button type="button" class="gr-chip ' + KINDS[k].cls + '" data-side="' + side +
          '" data-kind="' + k + '" title="کلیک: پرش روی حرکت‌های ' + KINDS[k].fa +
          ' — کلیک دوباره: حرکت بعدی">' + kindSvg(k) + KINDS[k].fa + " " + fa(n) + "</button>";
      });
      return '<div class="gr-pcard ' + (side === "w" ? "pw" : "pb") +
        (bestSide === side ? " winner" : "") + '">' +
        '<div class="gr-pava">' + avatarImg(name, side) +
        (bestSide === side ? '<span class="gr-crown" title="دقیق‌تر"><i class="fas fa-crown"></i></span>' : "") +
        "</div>" +
        '<div class="gr-pname">' + esc(name) + "</div>" +
        '<div class="gr-pacc"><b>' + fa(side === "w" ? accW : accB) + "</b><small>٪ دقت</small></div>" +
        (chips ? '<div class="gr-kinds">' + chips + "</div>"
               : '<div class="gr-nokind">بدون حرکت قابل‌توجه</div>') +
        "</div>";
    };

    box.innerHTML =
      '<div class="gr-sum-title"><i class="fas fa-chart-simple"></i> گزارش عملکرد</div>' +
      '<div class="gr-chip-hint"><i class="fas fa-hand-pointer"></i> روی هر آمار کلیک کن تا به حرکت‌هایش بپری — کلیک دوباره = حرکت بعدی، در آخر برگشت به اول</div>' +
      '<div class="gr-pcards">' + card("w") +
        '<div class="gr-pvs"><i class="fas fa-bolt"></i><span>در برابر</span></div>' +
      card("b") + "</div>";
  }

  /* ---------- 🆕 نمودار برتری — هر حرکت یک دایرهٔ رنگی ----------
     مرزِ سفید/سیه مثل نمودار چس‌دات‌کام + برای «همهٔ» حرکت‌ها دایره با
     رنگ برچسب خودش (تئوری، بهترین، درخشان و…) — حرکتِ جاری درشت‌تر و
     با هاله تا خودش را نشان بدهد. هاور: شناسنامهٔ حرکت، کلیک: پرش. */
  function graphGeo(w, h) {
    const reps = R.reps || [];
    const n = reps.length;
    const padX = Math.max(10, w * 0.035);
    const padY = 9;
    const fens = R.fens;
    const turnAt = function (i) {
      if (fens && fens[i]) return fens[i].split(" ")[1] === "b" ? "b" : "w";
      return i % 2 === 0 ? "w" : "b";
    };
    const pts = reps.map(function (r, i) {
      const cp = r.cp || 0;
      const cpW = turnAt(i) === "w" ? cp : -cp;
      const wp = winPercent(cpW);
      return {
        x: padX + (i / Math.max(1, n - 1)) * (w - 2 * padX),
        y: padY + (1 - wp / 100) * (h - 2 * padY),
        cpW: cpW,
      };
    });
    return { n: n, pts: pts };
  }

  function hexA(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }
  function roundRectPath(ctx, x, y, w2, h2, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w2, y, x + w2, y + h2, r);
    ctx.arcTo(x + w2, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r);
    ctx.arcTo(x, y, x + w2, y, r);
    ctx.closePath();
  }

  function drawGraph() {
    const cv = $("grGraph");
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 320;
    const h = cv.clientHeight || 180;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const reps = R.reps;
    if (!reps || reps.length < 2) {
      // تا پایان تحلیل — پیام ملایم داخل کادر (کادر خالی نمی‌ماند)
      ctx.fillStyle = "#eef2f7";
      roundRectPath(ctx, 0, 0, w, h, 10);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 12px Vazir, Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("نمودار برتری پس از تحلیل انجین فعال می‌شود", w / 2, h / 2);
      return;
    }

    const geo = graphGeo(w, h);
    R._geo = geo;
    const pts = geo.pts;

    // ناحیهٔ برتری سفید (بالا) و سیاه (پایین)
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[pts.length - 1].x, h);
    ctx.lineTo(pts[0].x, h);
    ctx.closePath();
    ctx.fillStyle = "#2b3a52";
    ctx.fill();

    // خط مرز + خطِ تعادل
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = "rgba(100, 116, 139, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, h / 2);
    ctx.lineTo(pts[pts.length - 1].x, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // نشانگر عمودی موقعیت جاری
    if (R.idx > 0 && R.idx < pts.length) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[R.idx].x, 3);
      ctx.lineTo(pts[R.idx].x, h - 3);
      ctx.stroke();
    }

    // 🎯 دایرهٔ همهٔ حرکت‌ها — رنگ هرکدام = رنگ برچسب همان حرکت
    const judged = R.judged || [];
    for (let i = 0; i < judged.length; i++) {
      const m = judged[i];
      const p = pts[m.i + 1];
      if (!p) continue;
      const col = KIND_COLORS[m.kind] || KIND_COLORS.good;
      const cur = R.idx === m.i + 1;
      const hov = R.gHover === m.i;
      if (cur) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = hexA(col, 0.3);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, cur ? 6.2 : hov ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = cur ? 2 : 1.3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }

  /* ---------- تعامل نمودار — هاور: شناسنامهٔ حرکت | کلیک: پرش ---------- */
  function bindGraphEvents() {
    const cv = $("grGraph");
    if (!cv || cv.dataset.grBound) return;
    cv.dataset.grBound = "1";
    const wrap = cv.parentElement;
    const tip = document.createElement("div");
    tip.className = "gr-graph-tip";
    tip.style.display = "none";
    wrap.appendChild(tip);

    function dotAt(mx) {
      const geo = R._geo;
      const judged = R.judged;
      if (!geo || !judged || !judged.length) return null;
      let best = null, bestD = 18;
      for (let i = 0; i < judged.length; i++) {
        const p = geo.pts[judged[i].i + 1];
        if (!p) continue;
        const d = Math.abs(p.x - mx);
        if (d < bestD) { bestD = d; best = { m: judged[i], p: p }; }
      }
      return best;
    }
    function showTip(hit, mx) {
      const m = hit.m;
      const K = KINDS[m.kind] || KINDS.good;
      const col = KIND_COLORS[m.kind] || KIND_COLORS.good;
      const moveNo = Math.floor(m.i / 2) + 1;
      const sideFa = m.color === "w" ? "سفید" : "سیاه";
      tip.innerHTML =
        '<span class="gt-dot" style="background:' + col + '"></span>' +
        "<b>" + fa(moveNo) + ". " + esc(m.san) + "</b>" +
        '<span class="gt-side">' + sideFa + "</span>" +
        '<span class="gt-kind" style="color:' + col + '">' + K.fa + "</span>" +
        '<span class="gt-ev">' + fmtEvalCp(hit.p.cpW, true) + "</span>";
      tip.style.display = "flex";
      const tw = tip.offsetWidth;
      const ww = wrap.clientWidth;
      tip.style.left = clamp(mx - tw / 2, 4, Math.max(4, ww - tw - 4)) + "px";
    }
    cv.addEventListener("pointermove", function (e) {
      if (!R || R.closed) return;
      const rc = cv.getBoundingClientRect();
      const mx = e.clientX - rc.left;
      const hit = dotAt(mx);
      const h = hit ? hit.m.i : null;
      if (h !== R.gHover) { R.gHover = h; drawGraph(); }
      if (hit) { showTip(hit, mx); cv.style.cursor = "pointer"; }
      else { tip.style.display = "none"; cv.style.cursor = "default"; }
    });
    cv.addEventListener("pointerleave", function () {
      if (R && R.gHover != null) { R.gHover = null; drawGraph(); }
      tip.style.display = "none";
    });
    cv.addEventListener("pointerdown", function (e) {
      if (!R || R.closed) return;
      const rc = cv.getBoundingClientRect();
      const hit = dotAt(e.clientX - rc.left);
      if (hit) nav(hit.m.i + 1);
    });
  }

  /* ---------- 🆕 برچسب حرکت — گوشهٔ بالا-چپِ خانهٔ مقصد ----------
     آیکنِ دستهٔ حرکت جاری، برای همهٔ مهره‌ها یکنواخت در گوشهٔ بالا-چپِ
     خانه نشسته است؛ همیشه داخل مرزهای خانه و با همان اندازهٔ تناسب. */
  function showBadge(played) {
    const layer = $("grBadges");
    if (!layer) return;
    if (!played || !played.uci) { layer.innerHTML = ""; return; }
    const to = played.uci.slice(2, 4);
    const f = to.charCodeAt(0) - 97;
    const r = parseInt(to[1], 10) - 1;
    const left = f * 12.5 + 0.55;  // گوشهٔ چپِ خانه + کمی تورفتگی
    const top = (7 - r) * 12.5 + 0.55; // گوشهٔ بالای خانه
    layer.innerHTML =
      '<div class="gr-badge pop" style="left:' + left + "%;top:" + top + '%">' +
      kindSvg(played.kind) + "</div>";
  }

  function showPosition() {
    const idx = R.idx; // ۰ = موقعیت شروع؛ i = بعد از i حرکت
    const g = new Chess();
    if (R.cfg.startFen) g.load(R.cfg.startFen);
    for (let i = 0; i < idx; i++) {
      const u = R.cfg.moves[i];
      if (u) {
        try { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) {}
      }
    }
    R.viewGame = g;
    const last = idx > 0 ? [R.cfg.moves[idx - 1].slice(0, 2), R.cfg.moves[idx - 1].slice(2, 4)] : null;
    const check = g.in_check() ? kingSquareOf(g.fen(), g.turn()) : null;

    // فلش‌ها — فلش کامپیوتر (بهترین حرکت انجین، دقیقاً مثل آنالیز) +
    // فلشِ رنگ دسته هنگام پرش از چیپ آمار
    const played = idx > 0 && R.judged ? R.judged[idx - 1] : null;
    const rep = R.reps ? R.reps[idx] : null;
    const shapes = [];
    if (played && played.best && played.uci !== played.best && rep) {
      shapes.push({ orig: played.best.slice(0, 2), dest: played.best.slice(2, 4), brush: "hub" });
    }
    if (played && R.chipJump === idx - 1 && played.uci) {
      shapes.push({
        orig: played.uci.slice(0, 2), dest: played.uci.slice(2, 4),
        brush: "kb_" + (KINDS[played.kind] ? played.kind : "good"),
      });
    }
    R.chipJump = null; // یک‌بار مصرف — هر ناوبری بعدی آن را پاک می‌کند

    // 🎨 هایلایت رنگی خانه‌ها — هم خانهٔ مبدا و هم مقصد، دقیقاً با رنگ
    // برچسب همان حرکت (بی‌دقتی زرد، اشتباه نارنجی، فاحش سرخ و…)
    let marks = null;
    if (played && played.uci && KINDS[played.kind]) {
      const mk = "mk-" + played.kind;
      marks = new Map();
      marks.set(played.uci.slice(0, 2), mk);
      marks.set(played.uci.slice(2, 4), mk);
    }

    const bigJump = Math.abs(idx - (R.lastIdx || 0)) > 1;
    R.lastIdx = idx;
    const renderArg = {
      fen: g.fen(),
      lastMove: last,
      check: check,
      turnColor: g.turn() === "w" ? "white" : "black",
      shapes: shapes,
      marks: marks,
      animate: bigJump ? false : undefined,
    };
    R.lastRender = renderArg;
    if (R.board) R.board.render(renderArg);
    showBadge(played);

    // نوار ارزیابی: از دید سفید
    if (rep && rep.cp != null) {
      setEvalBar(g.turn() === "w" ? rep.cp : -rep.cp);
    } else {
      setEvalBar(null);
    }

    $("grCounter").textContent = fa(idx) + "/" + fa(R.cfg.moves.length);
    renderMovesList();
    drawGraph();
  }

  /* ---------- ناوبری ---------- */
  function nav(to) {
    R.idx = clamp(to, 0, R.cfg.moves.length);
    stopAuto();
    showPosition();
  }
  function startAuto() {
    if (R.auto) return;
    const b = $("grPlay");
    if (b) b.innerHTML = '<i class="fas fa-pause"></i>';
    R.auto = setInterval(function () {
      if (R.idx < R.cfg.moves.length) { R.idx++; showPosition(); }
      else stopAuto();
    }, 1300);
  }
  function stopAuto() {
    if (R.auto) { clearInterval(R.auto); R.auto = null; }
    const b = $("grPlay");
    if (b) b.innerHTML = '<i class="fas fa-play"></i>';
  }
  function toggleAuto() {
    if (R.auto) stopAuto();
    else {
      if (R.idx >= R.cfg.moves.length) nav(0);
      startAuto();
    }
  }

  function buildPgn() {
    const g = new Chess();
    if (R.cfg.startFen) g.load(R.cfg.startFen);
    (R.cfg.moves || []).forEach(function (u) {
      try { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) {}
    });
    const headers =
      '[Event "' + (R.cfg.title || "ChessHub") + '"]\n[Site "ChessHub"]\n[Date "' +
      new Date().toISOString().slice(0, 10).replace(/-/g, ".") + '"]\n' +
      '[White "' + (R.cfg.white || "سفید") + '"]\n[Black "' + (R.cfg.black || "سیاه") + '"]\n[Result "' + (R.cfg.result || "*") + '"]\n\n';
    let body = g.pgn({ maxWidth: 80, newline: "\n" }) || "";
    return headers + body + " " + (R.cfg.result || "*");
  }
  function reviewPgnFilename() {
    const clean = function (s) {
      return String(s || "").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "player";
    };
    return clean(R.cfg.white) + "_vs_" + clean(R.cfg.black) + ".pgn";
  }

  /* ---------- باز کردن ---------- */
  // تغییر مجموعه مهره‌ها در حین مرور → رندر مجدد زنده با تصاویر جدید
  function grOnPieceSetChange() {
    if (!R || R.closed) return;
    if (R.useCg) {
      const setId = pieceSetId();
      if (window.ChessUtils && ChessUtils.ensureCgPieceSetCss) {
        ChessUtils.ensureCgPieceSetCss("gr-board", setId);
      }
      const el = $("grBoard");
      if (el) el.className = "gr-board set-" + setId;
      if (R.board && R.board.redraw) R.board.redraw();
    } else if (window.ChessUtils && ChessUtils.loadPieces) {
      ChessUtils.loadPieces().then(function () {
        if (R && !R.closed && R.board && R.lastRender) R.board.render(R.lastRender);
      });
    }
  }

  // بازگشت صفحهٔ مرور به صفحهٔ قبل (حالت صفحهٔ مستقل)
  function closeNav() {
    if (window.history && window.history.length > 1) window.history.back();
    else window.location.href = "games-database.html";
  }

  function checkDeps() {
    if (typeof Chess === "undefined") {
      console.warn("[GameReview] chess.js لود نشده");
      return false;
    }
    if (!window.ChessEngine) {
      console.warn("[GameReview] engine-core.js لود نشده — <script src=\"js/engine-core.js\"> را اضافه کن");
      return false;
    }
    return true;
  }

  // اتصال جلسهٔ مرور به DOM آمده (اورلی مودال یا صفحهٔ مستقل) —
  // هر دو از همان id ها استفاده می‌کنند؛ فقط رفتار دکمهٔ بستن متفاوت است.
  function bindSession() {
    R.board = makeBoardApi();
    if (!R.board) {
      toast("ماژول تخته لود نشد — صفحه را رفرش کن");
      return;
    }
    R.viewGame = new Chess();
    if (R.cfg.startFen) R.viewGame.load(R.cfg.startFen);

    // 🧑‍🎨 نام بازیکن‌ها با عکس (استاد شناخته‌شده) یا آدمکِ تولیدی
    const wName = R.cfg.white || "سفید";
    const bName = R.cfg.black || "سیاه";
    const pw = $("grPw");
    const pb = $("grPb");
    if (pw) pw.innerHTML = avatarImg(wName, "w", "sm") + "<span>" + esc(wName) + "</span>";
    if (pb) pb.innerHTML = avatarImg(bName, "b", "sm") + "<span>" + esc(bName) + "</span>";

    // رویدادها — دکمهٔ «بازگشت» صفحهٔ مستقل در خود game-review.html بسته شده
    const closeBtn = $("grCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", R.pageMode ? closeNav : close);
    $("grFirst").addEventListener("click", function () { nav(0); });
    $("grPrev").addEventListener("click", function () { nav(R.idx - 1); });
    $("grNext").addEventListener("click", function () { nav(R.idx + 1); });
    $("grLast").addEventListener("click", function () { nav(R.cfg.moves.length); });
    $("grPlay").addEventListener("click", toggleAuto);
    $("grMoves").addEventListener("click", function (e) {
      const b = e.target.closest(".gr-move");
      if (b) nav(parseInt(b.dataset.i, 10) || 0);
    });
    bindGraphEvents(); // هاور/کلیک نمودار برتری
    // چیپ‌های آمار — کلیک: پرش به اولین حرکتِ آن دسته؛ کلیک‌های بعدی:
    // حرکت بعدی؛ رسیدن به آخر → برمی‌گردد به اول (چرخهٔ کامل)
    $("grSummary").addEventListener("click", function (e) {
      const chip = e.target.closest(".gr-chip");
      if (!chip || !R || R.closed || !R.judged) return;
      const side = chip.getAttribute("data-side");
      const kind = chip.getAttribute("data-kind");
      const list = R.judged.filter(function (m) {
        return m.color === side && m.kind === kind;
      });
      if (!list.length) return;
      const key = side + ":" + kind;
      const prev = R.chipCycle[key];
      const p = prev === undefined ? 0 : (prev + 1) % list.length;
      R.chipCycle[key] = p;
      const m = list[p];
      R.chipJump = m.i; // فلش رنگی + برچسب روی حرکت مقصد
      nav(m.i + 1);
    });
    $("grCopyPgn").addEventListener("click", function () {
      navigator.clipboard.writeText(buildPgn())
        .then(function () { toast("PGN کپی شد"); })
        .catch(function () { toast("کپی نشد"); });
    });
    $("grDlPgn").addEventListener("click", function () {
      const blob = new Blob([buildPgn()], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = reviewPgnFilename();
      a.click();
      URL.revokeObjectURL(a.href);
      toast("دانلود PGN شروع شد");
    });
    document.addEventListener("keydown", grKey);
    window.addEventListener("resize", grResize);
    document.addEventListener("pieceSetChanged", grOnPieceSetChange);

    showPosition();
    setProgress(5, true); // شروع نمایش: فقط ۵٪ + اسپینر کوچک

    // شروع تحلیل
    const fensCollector = [];
    const g0 = new Chess();
    if (R.cfg.startFen) g0.load(R.cfg.startFen);
    fensCollector.push(g0.fen());
    const gt = new Chess();
    if (R.cfg.startFen) gt.load(R.cfg.startFen);
    (R.cfg.moves || []).forEach(function (u) {
      try { gt.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); fensCollector.push(gt.fen()); } catch (e) {}
    });

    analyzeMoves(R.cfg, function (data) {
      if (!R || R.closed) return;
      R.reps = data.reps;
      R.judged = data.judged;
      R.fens = fensCollector;
      setProgress(100, false); // پایان: فقط ۱۰۰٪ — بدون متن اضافه
      renderSummary();
      showPosition();
    });
  }

  async function startSession(cfg, pageMode) {
    if (!checkDeps()) return;
    if (_opening) return; // اگر همان لحظه یک باز شدنِ دیگر در جریان است
    _opening = true;

    ChessEngine.init();
    close();

    // 🔑 پیش‌بارگذاری تصاویر مهره‌ها قبل از ساخت تخته — بدون این، صفحاتی که
    // در شروع خود ChessUtils.loadPieces را صدا نمی‌زنند (مثل پایگاه بازی‌ها)
    // در مرور بازی به جای عکس مهره‌ها، گلیف یونیکد نشان می‌دادند.
    if (window.ChessUtils && ChessUtils.loadPieces) {
      try { await ChessUtils.loadPieces(); } catch (e) {}
    }
    // 🆕 انتظار کوتاه برای Chessground (کتابخانهٔ لایچز) — فالبک خودکار
    const hasCg = await cgReady(3000);
    _opening = false;
    if (!hasCg && !window.ChessBoardUI) {
      toast("ماژول تخته لود نشد — صفحه را رفرش کن");
      return;
    }

    R = {
      cfg: cfg || {},
      epoch: 0,
      closed: false,
      idx: 0,
      reps: null,
      judged: null,
      fens: null,
      auto: null,
      viewGame: null,
      pageMode: !!pageMode,
      chipCycle: {},  // نشانگر چرخش هر چیپ آمار (کلید side:kind)
      chipJump: null, // پرش فعلی از چیپ — فلش رنگی یک‌بار مصرف
      lastIdx: 0,     // برای تشخیص پرش بزرگ (بدون انیمیشن)
      lastRender: null,
      userShapes: [], // فلش‌های خود کاربر (کلیک‌راست) — بین حرکات می‌ماند
      gHover: null,   // حرکتِ زیرِ نشانگر در نمودار برتری
      useCg: hasCg,
    };
    if (!R.pageMode) {
      R.ov = buildOverlay(R.cfg);
    }
    bindSession();
  }

  // حالت مودال (analysis.html، بازی آنلاین، بازی با بات و…)
  function open(cfg) {
    return startSession(cfg, false);
  }

  // حالت صفحهٔ مستقل (game-review.html) — داخل DOM موجود رندر می‌شود
  function openPage(cfg) {
    return startSession(cfg, true);
  }

  // ⌨️ کیبورد — مثل آنالیز و لایچس:
  //   فلش راست = حرکت بعد | فلش چپ = حرکت قبل | فاصله = پخش/توقف کامل بازی
  //   Home/End = اول/آخر | Esc = بازگشت
  function grKey(e) {
    if (!R || R.closed) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault(); nav(R.idx + 1); break;
      case "ArrowLeft":
        e.preventDefault(); nav(R.idx - 1); break;
      case " ":
      case "Spacebar":
        e.preventDefault(); toggleAuto(); break;
      case "Home":
        e.preventDefault(); nav(0); break;
      case "End":
        e.preventDefault(); nav(R.cfg.moves.length); break;
      case "Escape":
        if (R.pageMode) closeNav(); else close();
        break;
    }
  }
  function grResize() { if (R && !R.closed) drawGraph(); }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "settings-toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function close() {
    if (!R) return;
    R.closed = true;
    R.epoch++;
    stopAuto();
    if (R.board) R.board.destroy();
    document.removeEventListener("keydown", grKey);
    window.removeEventListener("resize", grResize);
    document.removeEventListener("pieceSetChanged", grOnPieceSetChange);
    const ov = $("grOverlay");
    if (ov) ov.remove();
    document.body.style.overflow = "";
    R = null;
  }

  window.GameReview = {
    open: open,
    openPage: openPage,
    close: close,
    showToast: toast,
  };
})();
