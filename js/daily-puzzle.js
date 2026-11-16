/* ============================================================
   ♛ ChessHub — پازل روزانه (daily-puzzle.js v10.2)
   ------------------------------------------------------------
   • پازل هر روز = شمارهٔ روز از ۱ مهر تقویم جلالی (۱ مهر = پازل ۱)
   • تاریخچهٔ حل با تقویم فارسی — روزهای گذشته قابل حل، قبل از ۱ مهر نه
   • فرمت پازل: FEN + حرکات Lichess (اول حرکت حریف، بعد راه‌حل کاربر)
   API: GET /api/puzzle?index=N  (اندیس ۰-بیس = شمارهٔ روز − ۱)
   ============================================================ */
(function () {
  "use strict";

  if (typeof Chess === "undefined" || !window.Jalali) return;

  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function faNum(n) {
    try { return Number(n).toLocaleString("fa-IR"); } catch (e) { return String(n); }
  }

  /* ---------- وضعیت ---------- */
  let game = new Chess();
  let board = null;
  let puzzle = null;              // {fen, moves[uci], rating, themes, userColor}
  let solMoves = [];              // uci های راه‌حل
  let step = 0;                   // چند نیم‌حرکت از راه‌حل اجرا شده (شامل حرکت اول حریف)
  let solved = false;
  let currentKey = null;          // کلید جلالی روز جاری «1405-08-20»
  let currentIndex = 0;
  let hintUsed = false;

  const HISTORY_KEY = "chesshub_daily_history";

  /* ═══════════ 🔑 v11.35 — موتور روان‌شناختی پازل (پشت صحنه) ═══════════
     خطاهای کاربر روی هر «موضوع پازل» (تاکتیک لایچس) ثبت می‌شود؛ نرخ خطا
     با وزنِ تازگی محاسبه و موضوع‌های ضعیف پیدا می‌شوند. پازلِ «امروز» از
     استخرِ همان موضوع‌های ضعیف انتخاب می‌شود — قطعی و ثابت در طول روز،
     شخصی برای هر دستگاه. کاربر هیچ چیزی نمی‌بیند؛ فقط پازل حل می‌کند. */
  const SKILL_KEY = "chesshub_puzzle_skill";
  function skill() {
    try {
      const s = JSON.parse(localStorage.getItem(SKILL_KEY));
      if (s && s.themes && s.total) return s;
    } catch (e) {}
    return { themes: {}, total: { seen: 0, wrong: 0, solved: 0, hint: 0 } };
  }
  function saveSkill(s) {
    try { localStorage.setItem(SKILL_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("chesshub_device_id"); } catch (e) {}
    if (!id) {
      id = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem("chesshub_device_id", id); } catch (e) {}
    }
    return id;
  }
  function recordSkill(kind) {
    if (!puzzle || !puzzle.themes || !puzzle.themes.length) return;
    const s = skill();
    const bump = function (o, k) { o[k] = (o[k] || 0) + 1; };
    bump(s.total, kind);
    s.total.lastAt = Date.now();
    puzzle.themes.slice(0, 4).forEach(function (th) {
      const t = s.themes[th] = s.themes[th] || { seen: 0, wrong: 0, solved: 0, hint: 0 };
      bump(t, kind);
      t.lastAt = Date.now();
    });
    saveSkill(s);
  }
  let lastSeenStamp = "";
  function recordSeenOnce() {
    const stamp = currentKey + ":" + (puzzle && puzzle.puzzleId || "");
    if (stamp === lastSeenStamp) return;
    lastSeenStamp = stamp;
    recordSkill("seen");
    if (puzzle && puzzle.rating) rememberRating(puzzle.rating);
  }
  function weakThemes() {
    const s = skill();
    if ((s.total.seen || 0) < 3) return []; // دادهٔ کافی نیست → انتخاب عادی
    const now = Date.now();
    const scored = Object.keys(s.themes).map(function (th) {
      const t = s.themes[th];
      const seen = t.seen || 0;
      if (seen < 2) return null;
      const wrongRate = (t.wrong || 0) / seen;
      const fresh = Math.exp(-(((now - (t.lastAt || now)) / 864e5)) * 0.35); // وزن تازگی
      return { th: th, score: wrongRate * seen * fresh * (1 + (t.hint || 0) * 0.15) };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 3).filter(function (x) { return x.score > 0.15; }).map(function (x) { return x.th; });
  }
  function rememberRating(r) {
    try {
      const h = JSON.parse(localStorage.getItem("chesshub_daily_seen_ratings") || "[]");
      if (r) { h.push(Number(r) || 0); if (h.length > 20) h.shift(); }
      localStorage.setItem("chesshub_daily_seen_ratings", JSON.stringify(h));
    } catch (e) {}
  }
  function maxRatingFor() {
    try {
      const h = JSON.parse(localStorage.getItem("chesshub_daily_seen_ratings") || "[]");
      if (!h.length) return null;
      const avg = h.reduce(function (a, b) { return a + b; }, 0) / h.length;
      return Math.round(avg * 1.15);
    } catch (e) { return null; }
  }

  function todayJ() {
    const now = new Date();
    return Jalali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /* ---------- تاریخچه ---------- */
  function history() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) {}
  }
  function markSolved(key) {
    const h = history();
    if (!h[key]) h[key] = { solved: 1, at: Date.now() };
    saveHistory(h);
    renderCalendar();
    renderStats();
  }
  function isSolved(key) { return !!(history()[key] && history()[key].solved); }

  // «روزهای پیاپی» — طول زنجیرهٔ حل‌شده که به امروز (یا دیروز) ختم می‌شود
  function streak() {
    const h = history();
    let n = 0;
    const d = todayJ();
    let cursor = { jy: d.jy, jm: d.jm, jd: d.jd };
    // اگر امروز هنوز حل نشده، از دیروز بشمار
    if (!h[Jalali.key(cursor)]) {
      const g = Jalali.toGregorian(cursor.jy, cursor.jm, cursor.jd);
      const prev = new Date(g.gy, g.gm - 1, g.gd - 1);
      cursor = Jalali.toJalaali(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
    }
    const start = { jy: cursor.jy, jm: Jalali.PUZZLE_START_MONTH, jd: 1 };
    while (h[Jalali.key(cursor)] && h[Jalali.key(cursor)].solved) {
      n++;
      const g = Jalali.toGregorian(cursor.jy, cursor.jm, cursor.jd);
      const prev = new Date(g.gy, g.gm - 1, g.gd - 1);
      cursor = Jalali.toJalaali(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
      if (cursor.jy < start.jy) break;
    }
    return n;
  }

  /* ---------- بارگذاری پازل ---------- */
  function setMessage(txt, kind) {
    const el = $("dpMessage");
    el.className = "dp-message show " + (kind || "info");
    el.textContent = txt;
  }
  function loadDay(j) {
    const idx = Jalali.puzzleIndexFor(j.jy, j.jm, j.jd);
    currentKey = Jalali.key(j);
    currentIndex = idx;
    solved = false;
    step = 0;
    hintUsed = false;
    $("dpSolved").classList.remove("show");
    const anHide = $("dpAnalyzeBtn");
    if (anHide) anHide.classList.remove("show");
    setMessage("در حال آماده‌سازی پازل…", "info");
    updateProgress();
    $("dpMeta").innerHTML = '<span class="chip"><i class="fas fa-spinner fa-pulse"></i> بارگذاری…</span>';
    /* 🔑 v11.35 — پازلِ «امروز» اگر پروفایل ضعف داشته باشد از استخرِ
       موضوع‌های ضعیف انتخاب می‌شود؛ روزهای گذشتهٔ تقویم همیشه با پازل
       اصلی همان روز می‌آیند تا تاریخچه‌ی همه یکسان بماند. */
    const isToday = currentKey === Jalali.key(todayJ());
    const weak = isToday ? weakThemes() : [];
    let url = "api/puzzle?index=" + idx;
    if (weak.length) {
      const seed = deviceId() + "|" + currentKey;
      url = "api/puzzle/smart?index=" + idx +
        "&themes=" + encodeURIComponent(weak.join(",")) +
        "&seed=" + encodeURIComponent(seed);
      const mr = maxRatingFor();
      if (mr) url += "&maxRating=" + mr;
    }
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.puzzle) throw new Error(data.error || "پازلی یافت نشد");
        puzzle = data.puzzle;
        solMoves = (puzzle.moves || []).slice();
        setupPuzzle(j);
      })
      .catch(function (err) {
        setMessage("پازل بارگذاری نشد: " + err.message, "err");
      });
  }
  function setupPuzzle(j) {
    /* 🔑 v11.28 — «از نو» هم بنر حل و دکمهٔ تحلیل را می‌بندد */
    const sv = $("dpSolved");
    if (sv) sv.classList.remove("show");
    const anR = $("dpAnalyzeBtn");
    if (anR) anR.classList.remove("show");
    const g = new Chess();
    if (!g.load(puzzle.fen)) {
      setMessage("پوزیشن پازل نامعتبر است", "err");
      return;
    }
    game = g;
    // رنگ کاربر = مخالف نوبتِ FEN
    const userColor = g.turn() === "w" ? "b" : "w";
    $("dpColorLabel").textContent = userColor === "w" ? "سفید ⚪" : "سیاه ⚫";
    // متا
    const chips = [];
    chips.push('<span class="chip"><i class="fas fa-calendar-day"></i> ' + fa(Jalali.format(j)) + "</span>");
    chips.push('<span class="chip"><i class="fas fa-hashtag"></i> پازل ' + fa(Jalali.puzzleNumberFor(j.jy, j.jm, j.jd)) + "</span>");
    if (puzzle.rating) chips.push('<span class="chip rating"><i class="fas fa-gauge-high"></i> ریتینگ ' + faNum(puzzle.rating) + "</span>");
    if (puzzle.themes && puzzle.themes.length) {
      chips.push('<span class="chip"><i class="fas fa-tags"></i> ' + puzzle.themes.slice(0, 3).join("، ") + "</span>");
    }
    $("dpMeta").innerHTML = chips.join("");
    recordSeenOnce(); // 🔑 v11.35 — ثبت «دیده‌شدن» برای پروفایل ضعف‌ها

    // حرکت اول حریف خودکار اجرا می‌شود
    if (solMoves.length) {
      const opp = solMoves[0];
      try { g.move({ from: opp.slice(0, 2), to: opp.slice(2, 4), promotion: opp[4] || "q" }); step = 1; } catch (e) { step = 0; }
    }
    buildBoard(userColor);
    renderBoard({});
    updateProgress();
    setMessage(isSolved(currentKey) ? "این پازل را قبلاً حل کرده‌ای — باز هم حلش کن!" : "حرکت درست را پیدا کن", "info");
  }
  function buildBoard(userColor) {
    if (board) board.destroy();
    board = ChessBoardUI.create({
      boardEl: $("dpBoard"),
      getGame: function () { return game; },
      canMove: function () { return !solved && game.turn() === userColor; },
      userColor: function () { return userColor; },
      orientation: function () { return userColor; },
      onAttempt: function (from, to, promo) {
        if (solved) return false;
        const want = solMoves[step];
        if (!want) return false;
        const uci = from + to + (promo && promo !== "q" ? promo : (promo || ""));
        // مقایسه — ارتقای پیش‌فرض وزیر
        const tryMove = function (pr) {
          try {
            const m = game.move({ from: from, to: to, promotion: pr });
            if (!m) return null;
            const mu = m.from + m.to + (m.promotion || "");
            if (mu === want) return m;
            game.undo();
            return null;
          } catch (e) { return null; }
        };
        let m = tryMove(promo || "q");
        if (!m && promo) m = tryMove("q");
        if (!m) {
          recordSkill("wrong"); // 🔑 v11.35 — ثبت خطا روی موضوع‌های این پازل
          setMessage("حرکت درست نیست — دوباره امتحان کن", "err");
          return false;
        }
        step++;
        window.ChessHub && ChessHub.Sound && ChessHub.Sound.play("move");
        let last = { from: m.from, to: m.to };
        // پاسخ حریف
        const reply = solMoves[step];
        if (reply) {
          try {
            const rm = game.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || "q" });
            step++;
            if (rm) { last = { from: rm.from, to: rm.to }; window.ChessHub && ChessHub.Sound && ChessHub.Sound.play("move"); }
          } catch (e) {}
        }
        renderBoard({ lastMove: last });
        updateProgress();
        if (step >= solMoves.length) {
          solved = true;
          recordSkill(hintUsed ? "hint" : "solved"); // 🔑 v11.35 — ثبت موفقیت
          markSolved(currentKey);
          $("dpSolved").classList.add("show");
          setMessage("عالی بود!", "ok");
          renderStats();
          /* 🔑 v11.27 — مربعِ امروز همان لحظه سبز می‌شود و دکمهٔ
             «تحلیل موقعیت» با FEN نهایی پازل فعال می‌شود */
          renderCalendar();
          const ab = $("dpAnalyzeBtn");
          if (ab) {
            ab.href = "analysis.html?fen=" + encodeURIComponent(game.fen());
            ab.classList.add("show");
          }
        }
        return true;
      },
    });
    board.build();
  }
  function renderBoard(opts) { if (board) board.render(opts || {}); }
  function updateProgress() {
    const total = Math.max(1, Math.ceil((solMoves.length - 1) / 2));
    const done = Math.max(0, Math.floor(step / 2));
    const pct = Math.min(100, Math.round((done / total) * 100));
    $("dpFill").style.width = pct + "%";
    $("dpProgressTxt").textContent = "حرکت " + fa(done) + " از " + fa(total);
  }

  /* ---------- تقویم ---------- */
  let calJ = null; // ماه جاری تقویم {jy, jm}
  function renderCalendar() {
    if (!calJ) calJ = { jy: todayJ().jy, jm: todayJ().jm };
    const startJy = todayJ().jy;
    $("calTitle").textContent = Jalali.monthNames[calJ.jm - 1] + " " + fa(calJ.jy);
    $("calPrev").disabled = calJ.jy === startJy && calJ.jm <= Jalali.PUZZLE_START_MONTH;
    const t = todayJ();
    $("calNext").disabled = calJ.jy === t.jy && calJ.jm >= t.jm;
    // ردیف روزها
    $("calWeek").innerHTML = Jalali.weekDays.map(function (w) { return "<span>" + w + "</span>"; }).join("");
    const grid = $("calGrid");
    grid.innerHTML = "";
    const len = Jalali.monthLength(calJ.jy, calJ.jm);
    const firstWd = Jalali.weekDay(calJ.jy, calJ.jm, 1);
    for (let i = 0; i < firstWd; i++) grid.appendChild(document.createElement("span"));
    for (let d = 1; d <= len; d++) {
      const cell = document.createElement("button");
      cell.className = "cal-day";
      cell.textContent = fa(d);
      const j = { jy: calJ.jy, jm: calJ.jm, jd: d };
      const key = Jalali.key(j);
      const before = Jalali.puzzleNumberFor(j.jy, j.jm, j.jd) < 1;
      const isToday = key === Jalali.key(todayJ());
      const isSolvedDay = isSolved(key);
      const future = Jalali.dayNumber(j.jy, j.jm, j.jd) > Jalali.dayNumber(t.jy, t.jm, t.jd) && j.jy >= t.jy;
      if (isSolvedDay) cell.classList.add("solved");
      if (isToday) cell.classList.add("today");
      if (key === currentKey) cell.classList.add("active");
      if (before || future) { cell.disabled = true; }
      cell.title = fa(Jalali.format(j)) + (before ? " — قبل از ۱ مهر" : "");
      cell.addEventListener("click", function () {
        loadDay(j);
        /* 🔑 v11.28/29 — موبایل: اسکرول خودکار به کارت پازل؛
           لپ‌تاپ: پاپ‌آپ تاریخچه بعد از انتخاب بسته می‌شود */
        if (window.matchMedia("(max-width: 860px)").matches) {
          const mainCard = document.querySelector(".dp-main");
          if (mainCard) mainCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      grid.appendChild(cell);
    }
  }
  function renderStats() {
    const h = history();
    let n = 0;
    Object.keys(h).forEach(function (k) { if (h[k] && h[k].solved) n++; });
    $("stSolved").textContent = faNum(n);
    $("stStreak").textContent = faNum(streak());
    $("stTotal").textContent = faNum(Math.max(1, Jalali.puzzleNumberFor(todayJ().jy, todayJ().jm, todayJ().jd)));
  }

  /* ---------- راهنمایی ---------- */
  function showHint() {
    if (solved || !puzzle) return;
    const want = solMoves[step];
    if (!want) return;
    hintUsed = true;
    /* 🔑 v11.27 — مبدأ «و» مقصد حرکت درست با چشمک سبز نرم (۳ بار)
       مشخص می‌شوند؛ قبلاً فقط مبدأ روشن می‌شد و هایلایت زیر مهره
       پنهان بود و عملاً دیده نمی‌شد */
    const from = want.slice(0, 2);
    const to = want.slice(2, 4);
    const els = [];
    [from, to].forEach(function (sqName) {
      const sqEl = document.querySelector('#dpBoard .square[data-square="' + sqName + '"]');
      if (sqEl) { sqEl.classList.add("hint"); els.push(sqEl); }
    });
    setTimeout(function () {
      els.forEach(function (el) { el.classList.remove("hint"); });
    }, 2700);
    setMessage("مبدأ و مقصد حرکت درست با چشمک سبز مشخص شدند", "info");
  }

  /* ---------- راه‌اندازی ---------- */
  function init() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (s && s.theme) document.body.classList.add("theme-" + s.theme);
    } catch (e) {}

    // نشان روز — پازل شمارهٔ امروز
    const t = todayJ();
    $("dpDayBadge").innerHTML = '<i class="fas fa-bolt"></i> پازل روز ' + faNum(Jalali.puzzleNumberFor(t.jy, t.jm, t.jd)) + " — " + fa(Jalali.format(t));

    const load = function () {
      if (window.ChessUtils && ChessUtils.loadPieces) {
        ChessUtils.loadPieces().finally(function () { loadDay(t); });
      } else loadDay(t);
    };
    load();

    $("dpResetBtn").addEventListener("click", function () {
      if (!puzzle) return;
      setupPuzzle(Jalali.parseKey(currentKey) || t);
    });
    $("dpHintBtn").addEventListener("click", showHint);

    /* 🔑 v11.30 — تاریخچه همیشه سمت راست دیده می‌شود؛ کلیک روی آیکون
       تقویم: موبایل → اسکرول به کارت تاریخچه، دسکتاپ → پالس آبی
       روی همان کارت برای جلب توجه */
    const histPanel = $("dpHistPanel");
    const histToggle = $("dpHistToggle");
    if (histPanel && histToggle) {
      histToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        histPanel.scrollIntoView({ behavior: "smooth", block: "center" });
        histPanel.classList.remove("flash");
        void histPanel.offsetWidth;
        histPanel.classList.add("flash");
        setTimeout(function () { histPanel.classList.remove("flash"); }, 1000);
      });
      histToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); histToggle.click(); }
      });
    }
    $("calPrev").addEventListener("click", function () {
      calJ.jm--;
      if (calJ.jm < 1) { calJ.jm = 12; calJ.jy--; }
      renderCalendar();
    });
    $("calNext").addEventListener("click", function () {
      const tt = todayJ();
      if (calJ.jy === tt.jy && calJ.jm >= tt.jm) return;
      calJ.jm++;
      if (calJ.jm > 12) { calJ.jm = 1; calJ.jy++; }
      renderCalendar();
    });

    document.addEventListener("pieceSetChanged", function () {
      if (window.ChessUtils) ChessUtils.loadPieces().then(function () {
        buildBoard(game.turn() === "w" ? "b" : "w");
        renderBoard({});
      });
    });

    renderCalendar();
    renderStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
