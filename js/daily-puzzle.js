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
    setMessage("در حال آماده‌سازی پازل…", "info");
    updateProgress();
    $("dpMeta").innerHTML = '<span class="chip"><i class="fas fa-spinner fa-pulse"></i> بارگذاری…</span>';
    fetch("api/puzzle?index=" + idx)
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
          markSolved(currentKey);
          $("dpSolved").classList.add("show");
          setMessage("عالی بود!", "ok");
          renderStats();
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
    const from = want.slice(0, 2);
    // هایلایت خانهٔ مبدأ حرکت درست
    const sqEl = document.querySelector('#dpBoard .square[data-square="' + from + '"]');
    if (sqEl) sqEl.classList.add("hint");
    setTimeout(function () { if (sqEl) sqEl.classList.remove("hint"); }, 2200);
    setMessage("خانهٔ روشن‌شده مبدأ حرکت درست است", "info");
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
