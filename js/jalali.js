/* ============================================================
   ♛ ChessHub — تقویم جلالی (jalali.js v10.2)
   ------------------------------------------------------------
   تبدیل گرجی ↔ جلالی + ابزارهای تاریخ فارسی
   الگوریتم استاندارد jalaali (Behrang Noruzi-Nia) — عمومی
   API:
     Jalali.toJalaali(gy, gm, gd) → {jy, jm, jd}
     Jalali.toGregorian(jy, jm, jd) → {gy, gm, gd}
     Jalali.monthLength(jy, jm)
     Jalali.isLeap(jy)
     Jalali.dayNumber(jy, jm, jd)   ← شمارهٔ روز از ۱ فروردین همان سال (۱-بیس)
     Jalali.format({jy,jm,jd})      ← «۲۰ آبان ۱۴۰۴»
     Jalali.key({jy,jm,jd})         ← «1404-08-20» برای ذخیره‌سازی
     Jalali.parseKey(s)             ← {jy,jm,jd}
     Jalali.monthNames / weekDays
   ============================================================ */
(function () {
  "use strict";

  var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  function jalCal(jy, withoutLeap) {
    var bl = breaks.length;
    var gy = jy + 621;
    var leapJ = -14;
    var jp = breaks[0];
    var jm, jump = 0, leap, leapG, march, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error("Invalid Jalaali year " + jy);
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (!withoutLeap) {
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
    }
    return { leap: leap, gy: gy, march: march };
  }

  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5)
      + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    var j, i;
    j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1;
    var gm = mod(div(i, 153), 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).gy;
    var jy = gy - 621;
    var r = jalCal(jy, false);
    var jdn1f = g2d(gy, 3, r.march);
    var k = jdn - jdn1f;
    var jm, jd;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy: jy, jm: jm, jd: jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }

  function toJalaali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function isLeap(jy) { return jalCal(jy, false).leap === 0; }
  function monthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeap(jy) ? 30 : 29;
  }

  var MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  var WEEK = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

  // شمارهٔ روز از ۱ فروردین همان سال (۱-بیس)
  function dayNumber(jy, jm, jd) { return j2d(jy, jm, jd) - j2d(jy, 1, 1) + 1; }
  // روز هفته: ۰=شنبه … ۶=جمعه
  function weekDay(jy, jm, jd) {
    var g = toGregorian(jy, jm, jd);
    return (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function key(j) { return j.jy + "-" + pad2(j.jm) + "-" + pad2(j.jd); }
  function parseKey(s) {
    if (!s) return null;
    var p = String(s).split("-");
    if (p.length !== 3) return null;
    return { jy: parseInt(p[0], 10), jm: parseInt(p[1], 10), jd: parseInt(p[2], 10) };
  }
  function format(j) { return j.jd + " " + MONTHS[j.jm - 1] + " " + j.jy; }

  // پازل روزانه از «۱ مهر» آغاز می‌شود — شمارهٔ پازل = روز از ۱ مهر + ۱
  var PUZZLE_START_MONTH = 7; // مهر
  function puzzleNumberFor(jy, jm, jd) {
    var n = dayNumber(jy, jm, jd) - dayNumber(jy, PUZZLE_START_MONTH, 1) + 1;
    return n; // ۱ مهر = ۱
  }
  function puzzleStartJy(jy) { return jy; }
  // ایندیس پازل (۰-بیس) برای API — بر پایهٔ شمارهٔ روز از ۱ مهر
  function puzzleIndexFor(jy, jm, jd) { return Math.max(0, puzzleNumberFor(jy, jm, jd) - 1); }
  // اولین سال مجاز: محاسبه از تاریخ امروز (سال جلالی جاری)
  function firstAllowedDate(todayJ) {
    return { jy: todayJ.jy, jm: PUZZLE_START_MONTH, jd: 1 };
  }

  window.Jalali = {
    toJalaali: toJalaali,
    toGregorian: toGregorian,
    isLeap: isLeap,
    monthLength: monthLength,
    dayNumber: dayNumber,
    weekDay: weekDay,
    key: key,
    parseKey: parseKey,
    format: format,
    monthNames: MONTHS,
    weekDays: WEEK,
    puzzleNumberFor: puzzleNumberFor,
    puzzleIndexFor: puzzleIndexFor,
    PUZZLE_START_MONTH: PUZZLE_START_MONTH,
  };
})();
