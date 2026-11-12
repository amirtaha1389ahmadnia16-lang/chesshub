/* ============================================================
   ⚡ ChessHub — پازل عجله‌ای (Puzzle Rush)
   ------------------------------------------------------------
   حالت‌ها: ۳ دقیقه / ۵ دقیقه / بی‌زمان (۳ خطا = پایان)

   منبع داده (به ترتیب اولویت):
     ۱) api/rush-puzzles        → بک‌اند (data/puzzles.txt)
     ۲) data/puzzles.txt        → خواندن مستقیم فایل
     ۳) data/puzzle_rush.txt    → نام جایگزین
     ۴) پازل‌های نمونه داخلی    → وقتی هیچ منبعی نیست

   فرمت فایل داده:  FEN,Moves,Rating,Themes
     مثال: 3QR3/... w - - 1 34,g2g3 f4f2 h2h1 f5g3,1325,deflection endgame
     * حرکت اول = حریف؛ کاربر با رنگ مقابل بازی می‌کند
   ============================================================ */

(function () {
  "use strict";

  /* ============================================
     ۰) وابستگی‌های مشترک سایت
     ============================================ */

  const U = window.ChessUtilsBound;
  const Hub = window.ChessHub || {};

  // رقم فارسی بدون جداکننده:  toFa("3:00") → «۳:۰۰»
  const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  function toFa(v) {
    return String(v).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
  }

  /* ============================================
     ۱) ثابت‌ها و وضعیت
     ============================================ */

  const RUSH_SOURCES = ["api/rush-puzzles", "data/puzzles.txt", "data/puzzle_rush.txt"];
  const RECORD_KEY = "chesshub_puzzle_records";
  const MODE_SECONDS = { "3": 180, "5": 300, unlimited: 0 };
  const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

  // پازل‌های نمونه — فقط وقتی هیچ فایل داده‌ای در دسترس نباشد
  const FALLBACK_PUZZLES = [
    {
      fen: "rnb1k2r/p2n1p1p/2p2qp1/1pb2N2/4P3/1BN3P1/PPP4P/R1BQK2R w KQkq - 0 13",
      uci: ["f5h4", "f6f2"],
      rating: 995,
      themes: "mate mateIn1 oneMove opening",
    },
    {
      fen: "3QR3/1pp2p1k/p5pp/5n2/5q2/1P5P/6PK/6N1 w - - 1 34",
      uci: ["g2g3", "f4f2", "h2h1", "f5g3"],
      rating: 1325,
      themes: "deflection endgame mate mateIn2 short",
    },
    {
      fen: "8/4k1K1/3b4/3Bp3/4P3/1p4P1/1B6/3b4 b - - 2 48",
      uci: ["d1c2", "g3g4", "d6c5", "g4g5"],
      rating: 1571,
      themes: "bishopEndgame crushing defensiveMove endgame master quietMove short",
    },
  ];

  // وضعیت پازل جاری
  let game = null;
  let puzzleMoves = []; // [{color, uci}]
  let step = 0;
  let userColor = "w";
  let selected = null;
  let oppMove = null; // آخرین حرکت حریف برای هایلایت
  let busy = true;
  let currentMeta = { rating: 0, themes: "" };

  // وضعیت کلی بازی
  let gameActive = false;
  let allPuzzles = [];
  let usedPuzzleIndices = new Set();
  let usedFallback = false;

  // حالت و تایمر
  let currentMode = "3";
  let timeLeft = 0;
  let timerStarted = false;
  let timerInterval = null;
  let opponentTimer = null;

  // آمار
  let solvedCount = 0;
  let mistakes = 0;
  let streak = 0;
  let bestRecord = { "3": 0, "5": 0, unlimited: 0 };

  // درگ
  let press = null;

  /* ---------- عناصر DOM ---------- */

  const boardEl = document.getElementById("chessboard");
  const msgEl = document.getElementById("message");
  const resetBtn = document.getElementById("resetGameBtn");
  const counterEl = document.getElementById("puzzleCounter");
  const ratingEl = document.getElementById("ratingDisplay");
  const timerEl = document.getElementById("timerDisplay");
  const mistakeEl = document.getElementById("mistakeDisplay");
  const turnEl = document.getElementById("turnDisplay");
  const recordEl = document.getElementById("recordDisplay");
  const bestRecordEl = document.getElementById("bestRecordDisplay");

  const squareEls = {};

  /* ============================================
     ۲) پیام‌ها و صدا
     ============================================ */

  let msgTimer = null;

  function showMessage(html, type, autoHide) {
    if (!msgEl) return;
    const icons = {
      success: '<i class="fas fa-circle-check"></i>',
      error: '<i class="fas fa-circle-exclamation"></i>',
      info: '<i class="fas fa-circle-info"></i>',
      warning: '<i class="fas fa-triangle-exclamation"></i>',
    };
    msgEl.className = "message " + (type || "info");
    msgEl.innerHTML = (icons[type] || "") + " " + html;

    if (msgTimer) clearTimeout(msgTimer);
    if (autoHide !== false) {
      msgTimer = setTimeout(() => {
        msgEl.innerHTML = "";
        msgEl.className = "message";
      }, 3000);
    }
  }

  function playSound(name) {
    try {
      if (Hub.Sound && typeof Hub.Sound.play === "function") Hub.Sound.play(name);
    } catch (e) {}
  }

  /* ============================================
     ۳) بارگذاری داده — فرمت FEN,Moves,Rating,Themes
     ============================================ */

  function buildMovesWithColor(turn, uciList) {
    const out = [];
    let color = turn;
    for (const uci of uciList) {
      out.push({ color: color, uci: uci });
      color = color === "w" ? "b" : "w";
    }
    return out;
  }

  // یک سطر داده → پازل | خط خراب/هدر → null
  function parseRushLine(line) {
    const parts = line.split(",");
    if (parts.length < 2) return null;

    const fen = parts[0].trim();
    const movesStr = (parts[1] || "").trim();
    if (!fen || !movesStr) return null;

    const fenFields = fen.split(/\s+/);
    if (fenFields.length < 4) return null; // هدر یا سطر ناقص
    if (!/^[pnbrqkPNBRQK1-8/]+$/.test(fenFields[0])) return null;
    const turn = fenFields[1];
    if (turn !== "w" && turn !== "b") return null;

    const uciList = movesStr.split(/\s+/).filter(Boolean);
    if (!uciList.length) return null;
    for (const uci of uciList) {
      if (!UCI_RE.test(uci)) return null;
    }

    const rating = parseInt(parts[2], 10) || 0;
    const themes = (parts[3] || "").trim();

    return {
      fen: fen,
      moves: buildMovesWithColor(turn, uciList),
      rating: rating,
      themes: themes,
    };
  }

  function parseRushText(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = parseRushLine(line);
      if (p) out.push(p);
    }
    return out;
  }

  function normalizeApiPuzzle(item) {
    if (!item || typeof item.fen !== "string") return null;
    const fenFields = item.fen.trim().split(/\s+/);
    if (fenFields.length < 4) return null;
    const turn = fenFields[1];
    if (turn !== "w" && turn !== "b") return null;

    const uciList = (Array.isArray(item.moves) ? item.moves : String(item.moves || "").split(/\s+/))
      .map((m) => String(m).trim())
      .filter(Boolean);
    if (!uciList.length) return null;
    for (const uci of uciList) {
      if (!UCI_RE.test(uci)) return null;
    }

    return {
      fen: item.fen.trim(),
      moves: buildMovesWithColor(turn, uciList),
      rating: Number(item.rating) || 0,
      themes: Array.isArray(item.themes) ? item.themes.join(" ") : String(item.themes || "").trim(),
    };
  }

  async function loadRushPuzzles() {
    usedFallback = false;

    // ---- لایه ۱: بک‌اند ----
    try {
      const res = await fetch(RUSH_SOURCES[0], { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const list = (json && json.puzzles ? json.puzzles : []).map(normalizeApiPuzzle).filter(Boolean);
        if (list.length) {
          allPuzzles = list;
          console.info("[Rush] منبع: بک‌اند — " + list.length + " پازل");
          return true;
        }
      }
    } catch (e) {
      /* بک‌اند نیست → لایه بعد */
    }

    // ---- لایه ۲ و ۳: فایل داده ----
    for (let i = 1; i < RUSH_SOURCES.length; i++) {
      try {
        const res = await fetch(RUSH_SOURCES[i], { cache: "no-store" });
        if (!res.ok) continue;
        const text = await res.text();
        const list = parseRushText(text);
        if (list.length) {
          allPuzzles = list;
          console.info("[Rush] منبع: " + RUSH_SOURCES[i] + " — " + list.length + " پازل");
          return true;
        }
      } catch (e) {
        /* این مسیر نیست → بعدی */
      }
    }

    // ---- لایه ۴: نمونه داخلی ----
    usedFallback = true;
    allPuzzles = FALLBACK_PUZZLES.map((p) => ({
      fen: p.fen,
      moves: buildMovesWithColor(p.fen.split(/\s+/)[1], p.uci),
      rating: p.rating,
      themes: p.themes,
    }));
    console.warn("[Rush] فایل داده پیدا نشد — پازل‌های نمونه داخلی");
    return allPuzzles.length > 0;
  }

  /* ============================================
     ۴) انتخاب پازل تصادفی (بدون تکرار تا اتمام مخزن)
     ============================================ */

  function getRandomPuzzleIndex() {
    if (!allPuzzles.length) return -1;
    if (usedPuzzleIndices.size >= allPuzzles.length) usedPuzzleIndices.clear();
    const available = [];
    for (let i = 0; i < allPuzzles.length; i++) {
      if (!usedPuzzleIndices.has(i)) available.push(i);
    }
    if (!available.length) {
      usedPuzzleIndices.clear();
      for (let i = 0; i < allPuzzles.length; i++) available.push(i);
    }
    const idx = available[Math.floor(Math.random() * available.length)];
    usedPuzzleIndices.add(idx);
    return idx;
  }

  /* ============================================
     ۵) ساخت و رندر تخته (هم‌سبک با مسئله روز)
     ============================================ */

  function buildBoard() {
    boardEl.innerHTML = "";

    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const fOrder = userColor === "w" ? files : [...files].reverse();
    const rOrder = userColor === "w" ? ranks : [...ranks].reverse();

    rOrder.forEach((r) => {
      fOrder.forEach((f) => {
        const sq = f + r;
        const isLight = (files.indexOf(f) + r) % 2 === 0;
        const d = document.createElement("div");
        d.className = "square " + (isLight ? "light" : "dark");
        d.dataset.square = sq;
        boardEl.appendChild(d);
        squareEls[sq] = d;
      });
    });
    updateGlyphSize();
  }

  function updateGlyphSize() {
    const sq = boardEl.querySelector(".square");
    if (!sq) return;
    const w = sq.clientWidth;
    if (w) boardEl.style.setProperty("--glyph-size", Math.round(w * 0.78) + "px");
  }

  function renderAll() {
    renderBoard();
    renderDots();
  }

  function renderBoard() {
    if (!game) return;
    const board = game.board();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = "abcdefgh"[f] + (8 - r);
        const el = squareEls[sq];
        if (!el) continue;
        const p = board[r][f];

        el.innerHTML = "";
        el.classList.remove(
          "selected", "dot", "dot-capture", "last-move",
          "hint", "check", "correct", "wrong",
          "computer-from", "computer-to"
        );

        if (p) {
          const cached = U.getPieceImage(p.color + p.type);
          if (cached) {
            const img = new Image();
            img.src = cached.src;
            img.className = "piece-img";
            img.alt = "";
            img.draggable = false;
            el.appendChild(img);
          } else {
            const glyph = document.createElement("span");
            glyph.className = "piece-glyph " + p.color;
            glyph.textContent = Hub.ChessUtils ? Hub.ChessUtils.GLYPHS[p.type] : "";
            el.appendChild(glyph);
          }
        }
      }
    }

    // هایلایت حرکت حریف
    if (oppMove) {
      const from = squareEls[oppMove.from];
      const to = squareEls[oppMove.to];
      if (from) from.classList.add("computer-from");
      if (to) to.classList.add("computer-to");
    }

    // نشانگر کیش روی شاه
    if (game.in_check()) {
      const turn = game.turn();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (p && p.type === "k" && p.color === turn) {
            const el = squareEls["abcdefgh"[f] + (8 - r)];
            if (el) el.classList.add("check");
          }
        }
      }
    }

    updateGlyphSize();
  }

  function renderDots() {
    if (!selected) return;
    const selEl = squareEls[selected];
    if (selEl) selEl.classList.add("selected");

    const moves = game.moves({ square: selected, verbose: true });
    const seen = {};
    moves.forEach((m) => {
      if (seen[m.to]) return;
      seen[m.to] = 1;
      const t = squareEls[m.to];
      if (t) t.classList.add(m.captured ? "dot-capture" : "dot");
    });
  }

  function flashSquare(sq, cls) {
    const el = squareEls[sq];
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 700);
  }

  function shakeBoard() {
    boardEl.classList.add("shake");
    setTimeout(() => boardEl.classList.remove("shake"), 450);
  }

  /* ============================================
     ۶) تعامل — درگ‌ودراپ (ماوس + لمس + قلم) و کلیک
     ------------------------------------------------
     دقیقاً همان سیستم مسئله روز: Pointer Events با
     آستانه ۶ پیکسل، گوست شناور و فالبک کلیک‌کلیک.
     ============================================ */

  function canPlay() {
    return (
      !!game &&
      gameActive &&
      !busy &&
      game.turn() === userColor
    );
  }

  function isLegalTarget(sq) {
    if (!selected || !game) return false;
    return game.moves({ square: selected, verbose: true }).some((m) => m.to === sq);
  }

  function squareAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const sq = el && el.closest ? el.closest("#chessboard .square") : null;
    return sq ? sq.dataset.square : null;
  }

  function onPointerDown(e) {
    if (press) return; // یک اشاره در هر لحظه
    if (e.pointerType === "mouse" && e.button !== 0) return; // فقط کلیک چپ

    const sqEl = e.target.closest ? e.target.closest("#chessboard .square") : null;
    if (!sqEl) return;
    const sq = sqEl.dataset.square;
    if (!sq) return;

    press = {
      pointerId: e.pointerId,
      from: sq,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      consumed: false,
      ghost: null,
      overSq: null,
    };

    // لمس روی مقصد مجاز با انتخاب فعال → حرکت فوری (سبک لایچس)
    if (canPlay() && selected && selected !== sq && isLegalTarget(sq)) {
      press.consumed = true;
      attemptMove(selected, sq);
      return;
    }

    e.preventDefault(); // جلوگیری از انتخاب متن / منوی لمسی
  }

  function onPointerMove(e) {
    const p = press;
    if (!p || e.pointerId !== p.pointerId || p.consumed) return;

    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    if (!p.dragging) {
      if (dx * dx + dy * dy < 36) return; // آستانه شروع درگ: ۶ پیکسل

      // فقط مهره‌ی خودی در نوبت خودش کشیده می‌شود
      const piece = game && game.get(p.from);
      if (!piece || !canPlay() || piece.color !== userColor) return;

      p.dragging = true;
      if (selected !== p.from) {
        selected = p.from;
        renderAll();
      }

      p.ghost = createGhost(p.from);
      if (p.ghost) {
        const srcEl = squareEls[p.from];
        if (srcEl) srcEl.classList.add("dragging");
        boardEl.classList.add("dragging-active");
      }
    }

    if (p.ghost) {
      p.ghost.style.left = e.clientX + "px";
      p.ghost.style.top = e.clientY + "px";

      const over = squareAt(e.clientX, e.clientY);
      if (over !== p.overSq) {
        if (p.overSq && squareEls[p.overSq]) {
          squareEls[p.overSq].classList.remove("drag-over");
        }
        p.overSq = over;
        if (over && squareEls[over] && isLegalTarget(over)) {
          squareEls[over].classList.add("drag-over");
        }
      }
    }
  }

  function onPointerUp(e) {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    press = null;

    if (p.consumed) {
      cleanupDrag(p);
      return;
    }

    if (p.dragging) {
      const from = p.from;
      const to = squareAt(e.clientX, e.clientY);
      cleanupDrag(p);

      if (to && to !== from && isLegalTarget(to)) {
        attemptMove(from, to);
      } else {
        // رها کردن روی خانه نامعتبر — مهره برمی‌گردد (بدون جریمه)
        renderAll();
      }
      return;
    }

    // بدون کشیدن = کلیک/تپ ساده
    onSquareClick(p.from);
  }

  function onPointerCancel(e) {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    press = null;
    cleanupDrag(p);
    renderAll();
  }

  function createGhost(fromSq) {
    const srcEl = squareEls[fromSq];
    if (!srcEl) return null;
    const pieceNode =
      srcEl.querySelector(".piece-img") || srcEl.querySelector(".piece-glyph");
    if (!pieceNode) return null;

    const rect = srcEl.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.left = rect.left + rect.width / 2 + "px";
    ghost.style.top = rect.top + rect.height / 2 + "px";

    const clone = pieceNode.cloneNode(true);
    if (clone.classList && clone.classList.contains("piece-glyph")) {
      clone.style.fontSize = getComputedStyle(pieceNode).fontSize;
    }
    ghost.appendChild(clone);
    document.body.appendChild(ghost);
    return ghost;
  }

  function cleanupDrag(p) {
    if (p && p.ghost) {
      p.ghost.remove();
      p.ghost = null;
    }
    if (p && p.overSq && squareEls[p.overSq]) {
      squareEls[p.overSq].classList.remove("drag-over");
    }
    boardEl.classList.remove("dragging-active");
    Object.keys(squareEls).forEach((k) => {
      squareEls[k].classList.remove("dragging", "drag-over");
    });
  }

  function onSquareClick(sq) {
    if (!canPlay()) return;

    if (selected === sq) {
      selected = null;
    } else if (selected && isLegalTarget(sq)) {
      attemptMove(selected, sq);
      return;
    } else {
      const piece = game.get(sq);
      if (piece && piece.color === userColor) {
        selected = sq;
        playSound("select");
      } else {
        selected = null;
      }
    }
    renderAll();
  }

  /* ============================================
     ۷) جریان حرکت‌ها
     ============================================ */

  function attemptMove(from, to) {
    if (busy || !gameActive || !game) return;
    ensureTimerStarted();

    const expected = puzzleMoves[step];
    if (!expected || expected.color !== userColor) return;

    if (from === expected.uci.slice(0, 2) && to === expected.uci.slice(2, 4)) {
      const piece = game.get(from);
      const isPromotion =
        piece && piece.type === "p" && (to[1] === "8" || to[1] === "1");

      if (isPromotion) {
        const expPromo = expected.uci.slice(4);

        // ارتقای وزیر خودکار انجام می‌شود (سرعت در پازل عجله‌ای)
        if (!expPromo || expPromo === "q") {
          commitUserMove(from, to, "q");
          return;
        }

        // ارتقای غیرعادی (اسب/رخ/فیل) باید خود کاربر انتخاب کند
        busy = true;
        U.showPromotion(userColor, (chosen) => {
          busy = false;
          if (chosen === expPromo) commitUserMove(from, to, chosen);
          else wrongMove(to);
        });
        return;
      }

      commitUserMove(from, to, null);
      return;
    }

    // حرکت مجاز ولی اشتباه → خطا | حرکت غیرمجاز → فقط برگشت
    const legal = game
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to);

    if (legal) {
      wrongMove(to);
    } else {
      selected = null;
      renderAll();
    }
  }

  function commitUserMove(from, to, promo) {
    const mv = game.move({ from: from, to: to, promotion: promo || undefined });
    if (!mv) {
      wrongMove(to);
      return;
    }

    step++;
    oppMove = null; // هایلایت حریف پاک می‌شود
    selected = null;
    playSound("correct");
    afterMove();
    flashSquare(mv.to, "correct");
  }

  function wrongMove(to) {
    mistakes++;
    playSound("wrong");
    selected = null;
    renderAll();
    flashSquare(to, "wrong");
    shakeBoard();
    updateStats();

    if (currentMode === "unlimited" && mistakes >= 3) {
      endGame("strikes");
      return;
    }

    const extra =
      currentMode === "unlimited"
        ? " — " + toFa(3 - mistakes) + " فرصت باقی مانده"
        : "";
    showMessage("این حرکت درست نیست! دوباره امتحان کن" + extra, "error");
  }

  function afterMove() {
    renderAll();

    if (step >= puzzleMoves.length) {
      puzzleSolved();
      return;
    }

    if (game.turn() !== userColor) {
      // نوبت حریف — حرکت بعدی دنباله به‌صورت خودکار
      busy = true;
      setTurn("computer");
      if (opponentTimer) clearTimeout(opponentTimer);
      opponentTimer = setTimeout(opponentMove, 500);
    } else {
      busy = false;
      setTurn("user");
    }
  }

  function opponentMove() {
    if (!gameActive || !game) return;

    const expected = puzzleMoves[step];
    if (!expected || expected.color === userColor) {
      afterMove();
      return;
    }

    let mv = null;
    try {
      mv = game.move({
        from: expected.uci.slice(0, 2),
        to: expected.uci.slice(2, 4),
        promotion: expected.uci.slice(4) || undefined,
      });
    } catch (e) {
      mv = null;
    }

    if (!mv) {
      // سطر خراب در داده — رد شدن به پازل بعدی
      console.warn("[Rush] حرکت نامعتبر در دنباله:", expected.uci);
      showMessage("این پازل داده خرابی داشت — پازل بعدی", "warning");
      loadNextPuzzle();
      return;
    }

    step++;
    oppMove = { from: mv.from, to: mv.to };
    renderAll();

    if (game.in_checkmate() || game.game_over()) {
      puzzleSolved();
      return;
    }

    afterMove();
  }

  function puzzleSolved() {
    busy = true;
    solvedCount++;
    streak++;
    playSound("win");
    updateStats();

    boardEl.classList.add("board-solved");
    setTimeout(() => boardEl.classList.remove("board-solved"), 700);

    const combo = streak >= 2 ? " — 🔥 کامبو ×" + toFa(streak) : "";
    showMessage("پازل " + toFa(solvedCount) + " حل شد!" + combo, "success");

    // رکورد جدید برای این حالت؟
    if (solvedCount > (bestRecord[currentMode] || 0)) {
      bestRecord[currentMode] = solvedCount;
      saveRecords();
      updateBestRecordDisplay();
      recordEl.innerHTML =
        '<i class="fas fa-trophy"></i> رکورد جدید: ' + toFa(solvedCount) + " پازل!";
      recordEl.style.display = "flex";
      setTimeout(() => {
        recordEl.style.display = "none";
      }, 2500);
    }

    if (gameActive) {
      if (opponentTimer) clearTimeout(opponentTimer);
      opponentTimer = setTimeout(loadNextPuzzle, 450);
    }
  }

  function loadNextPuzzle() {
    if (!allPuzzles.length) {
      showMessage("هیچ پازلی در دسترس نیست", "error");
      return;
    }

    // انتخاب پازل سالم (FEN معتبر) — حداکثر ۵ تلاش
    let loaded = false;
    for (let attempt = 0; attempt < 5 && !loaded; attempt++) {
      const idx = getRandomPuzzleIndex();
      const candidate = allPuzzles[idx];
      if (!candidate) continue;

      try {
        game = new Chess();
        if (!game.load(candidate.fen)) continue;
      } catch (e) {
        continue;
      }

      puzzleMoves = candidate.moves;
      currentMeta = { rating: candidate.rating, themes: candidate.themes };
      userColor = game.turn() === "w" ? "b" : "w";
      loaded = true;
    }

    if (!loaded) {
      showMessage("پازل معتبری پیدا نشد — فایل داده را بررسی کن", "error");
      return;
    }

    step = 0;
    selected = null;
    oppMove = null;
    busy = false;
    updatePuzzleMeta();
    buildBoard();
    renderAll();

    const colorName = userColor === "w" ? "سفید" : "سیاه";
    turnEl.innerHTML =
      '<i class="fas fa-hourglass-start"></i> شروع (شما: ' + colorName + ")";

    // حرکت اول با حریف است
    afterMove();
  }

  function updatePuzzleMeta() {
    if (!ratingEl) return;
    ratingEl.innerHTML =
      '<i class="fas fa-chart-line"></i> ' +
      (currentMeta.rating > 0 ? toFa(currentMeta.rating) : "—");
    ratingEl.title = currentMeta.themes || "";
  }

  function setTurn(who) {
    if (!turnEl) return;
    if (who === "computer") {
      turnEl.innerHTML = '<i class="fas fa-robot"></i> حریف…';
    } else if (who === "user") {
      turnEl.innerHTML = '<i class="fas fa-user"></i> نوبت شما';
    } else {
      turnEl.innerHTML = '<i class="fas fa-hourglass-end"></i> پایان';
    }
  }

  /* ============================================
     ۸) تایمر و آمار — ساعت از اولین حرکت شروع می‌شود
     ============================================ */

  function ensureTimerStarted() {
    if (timerStarted || !gameActive || currentMode === "unlimited") return;
    timerStarted = true;
    startTimer(MODE_SECONDS[currentMode] || 180);
  }

  function startTimer(seconds) {
    stopTimer();
    timeLeft = seconds;
    updateStats();

    timerInterval = setInterval(() => {
      if (!gameActive || document.hidden) return; // توقف خودکار در تب مخفی
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateStats();
        endGame("time");
        return;
      }
      updateStats();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function formatTime(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return toFa(m + ":" + String(s).padStart(2, "0"));
  }

  function updateStats() {
    if (counterEl) counterEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + toFa(solvedCount);

    if (currentMode === "unlimited") {
      if (mistakeEl) mistakeEl.innerHTML = '<i class="fas fa-times-circle"></i> خطا: ' + toFa(mistakes) + "/۳";
      if (timerEl) timerEl.innerHTML = '<i class="far fa-clock"></i> ∞';
    } else {
      if (mistakeEl) mistakeEl.innerHTML = '<i class="fas fa-times-circle"></i> خطا: ' + toFa(mistakes);
      if (timerEl) timerEl.innerHTML = '<i class="far fa-clock"></i> ' + formatTime(Math.max(0, timeLeft));
    }
  }

  /* ============================================
     ۹) پایان بازی و رکوردها
     ============================================ */

  function endGame(reason) {
    gameActive = false;
    busy = true;
    stopTimer();
    if (opponentTimer) clearTimeout(opponentTimer);
    boardEl.classList.add("locked");
    setTurn("end");

    if (reason === "time") {
      showMessage("زمان تمام شد!", "error");
    } else if (reason === "strikes") {
      showMessage("سه خطا انجام شد! بازی تمام شد.", "error");
    }

    recordEl.innerHTML =
      '<i class="fas fa-flag-checkered"></i> امتیاز نهایی: ' +
      toFa(solvedCount) +
      " پازل" +
      (solvedCount > 0 && solvedCount >= (bestRecord[currentMode] || 0)
        ? " — رکورد این حالت!"
        : "");
    recordEl.style.display = "flex";
  }

  function loadRecords() {
    try {
      const stored = localStorage.getItem(RECORD_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed["3"]) bestRecord["3"] = Number(parsed["3"]) || 0;
      if (parsed["5"]) bestRecord["5"] = Number(parsed["5"]) || 0;
      if (parsed.unlimited) bestRecord.unlimited = Number(parsed.unlimited) || 0;
    } catch (e) {}
  }

  function saveRecords() {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(bestRecord));
    } catch (e) {}
  }

  function updateBestRecordDisplay() {
    if (!bestRecordEl) return;
    const best = bestRecord[currentMode] || 0;
    bestRecordEl.innerHTML =
      '<i class="fas fa-trophy"></i> رکورد این حالت: ' + toFa(best);
  }

  /* ============================================
     ۱۰) شروع/ریست و حالت‌ها
     ============================================ */

  function resetGame() {
    stopTimer();
    if (opponentTimer) clearTimeout(opponentTimer);
    boardEl.classList.remove("locked");
    gameActive = true;
    busy = false;
    solvedCount = 0;
    mistakes = 0;
    streak = 0;
    timerStarted = false;
    selected = null;
    oppMove = null;
    usedPuzzleIndices.clear();
    press = null;
    recordEl.style.display = "none";
    recordEl.innerHTML = "";

    if (currentMode === "unlimited") {
      timeLeft = 0;
    } else {
      timeLeft = MODE_SECONDS[currentMode] || 180;
    }
    updateStats();

    loadNextPuzzle();
  }

  function applyModeVisuals() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === String(currentMode));
    });
  }

  function setMode(mode) {
    if (!Object.prototype.hasOwnProperty.call(MODE_SECONDS, mode)) return;
    if (gameActive && (solvedCount > 0 || mistakes > 0)) {
      if (!confirm("آیا می‌خواهی حالت را عوض کنی؟ بازی فعلی ریست می‌شود.")) return;
    }
    currentMode = mode;
    applyModeVisuals();
    updateBestRecordDisplay();
    resetGame();
  }

  /* ============================================
     ۱۱) راه‌اندازی
     ============================================ */

  function initPointer() {
    if (window.PointerEvent) {
      boardEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    } else {
      // مرورگرهای خیلی قدیمی — کلیک/تپ ساده
      boardEl.addEventListener("click", (e) => {
        const sq = e.target.closest(".square");
        if (sq && sq.dataset.square) onSquareClick(sq.dataset.square);
      });
    }

    // منوی راست‌کلیک / لمس طولانی روی تخته نباید باز شود
    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function init() {
    if (!boardEl || !msgEl || !resetBtn) {
      console.warn("[Rush] عناصر صفحه پازل عجله‌ای پیدا نشد");
      return;
    }
    if (typeof Chess === "undefined") {
      showMessage("کتابخانه شطرنج (chess.js) لود نشد — اینترنت را چک کن", "error", false);
      return;
    }
    if (!U || typeof U.loadPieces !== "function") {
      showMessage("هسته مشترک (script.js) درست لود نشد", "error", false);
      return;
    }

    loadRecords();
    updateBestRecordDisplay();

    U.loadPieces().then(async () => {
      const ok = await loadRushPuzzles();
      if (!ok) {
        showMessage("هیچ پازلی بارگذاری نشد", "error", false);
        return;
      }
      if (usedFallback) {
        showMessage("فایل data/puzzles.txt پیدا نشد — پازل‌های نمونه اجرا شد", "warning");
      }

      // دکمه‌های حالت
      document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => setMode(btn.dataset.mode));
      });
      applyModeVisuals();

      // تخته و کنترل‌ها
      initPointer();
      resetBtn.addEventListener("click", resetGame);

      // تغییر اسکین مهره‌ها → رندر مجدد
      document.addEventListener("pieceSetChanged", () => {
        U.loadPieces().then(() => {
          if (game) renderAll();
        });
      });

      // پاک‌سازی هنگام بستن صفحه
      window.addEventListener("beforeunload", () => {
        stopTimer();
        if (opponentTimer) clearTimeout(opponentTimer);
      });

      // شروع
      resetGame();
    });
  }

  init();
})();
