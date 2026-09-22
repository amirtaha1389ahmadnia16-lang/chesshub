/* ============================================================
   ♛ ChessHub — مرور بازی حرفه‌ای (Game Review)
   ------------------------------------------------------------
   تحلیل کامل بازی با Stockfish — مشترک بین همه‌ی بخش‌ها:
   بازی با بات، بازی آنلاین، پایگاه بازی‌های استادان

   قابلیت‌ها:
     • نمره‌دهی حرکت‌به‌حرکت: برترین / عالی / خوب / بی‌دقتی /
       اشتباه / فاجعه (مثل chess.com)
     • نوار ارزیابی زنده + نمودار تغییر برتری
     • فلش سبز بهترین حرکت انجین روی هر موقعیت
     • دقت درصدی هر طرف + آمار خطاها
     • کش تحلیل (بازی دوم دیگر آنالیز از صفر نمی‌شود)
     • پیمایش حرکات، پخش خودکار، کپی و دانلود PGN

   API:
     GameReview.open({ moves:[uci...], startFen?, title?, subtitle?, meta? })
     GameReview.close()
   ============================================================ */
(function () {
  "use strict";

  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA_DIGITS[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const CACHE_KEY = "chesshub_review_cache_v1";
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
    best:       { fa: "برترین",  icon: "fa-star",          cls: "k-best" },
    excellent:  { fa: "عالی",    icon: "fa-circle-check",  cls: "k-exc" },
    good:       { fa: "خوب",     icon: "fa-thumbs-up",     cls: "k-good" },
    inaccuracy: { fa: "بی‌دقتی", icon: "fa-circle-question", cls: "k-ina" },
    mistake:    { fa: "اشتباه",  icon: "fa-triangle-exclamation", cls: "k-mis" },
    blunder:    { fa: "فاجعه",   icon: "fa-skull",         cls: "k-blun" },
    book:       { fa: "تئوری",   icon: "fa-book",          cls: "k-book" },
  };

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
          '<div class="gr-prog-text" id="grProgText">در صف تحلیل…</div>' +
          '<div class="gr-prog-track"><div class="gr-prog-fill" id="grProgFill" style="width:0%"></div></div>' +
        "</div>" +
        '<div class="gr-body">' +
          '<div class="gr-board-side">' +
            '<div class="gr-players"><span id="grPw"></span><span class="gr-vs">برابر</span><span id="grPb"></span></div>' +
            '<div class="gr-board-wrap">' +
              '<div id="grBoard" class="chessboard gr-board"></div>' +
              '<svg class="board-arrows" id="grArrows" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>' +
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

  /* ---------- تحلیل ---------- */
  async function analyzeMoves(cfg, onDone) {
    const moves = cfg.moves || [];
    const startFen = cfg.startFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const hash = gameHash(startFen, moves);
    const cached = cacheAll()[hash];
    if (cached && cached.reps && cached.reps.length === moves.length) {
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
      $("grProgFill").style.width = pct + "%";
      $("grProgText").textContent = "تحلیل موقعیت " + fa(i + 1) + " از " + fa(fens.length) + "…";
    }

    // نمره‌دهی
    const judged = [];
    for (let i = 0; i < sans.length; i++) {
      const before = reps[i].cp;
      const afterResp = reps[i + 1];
      const after = afterResp && afterResp.cp != null ? -afterResp.cp : null;
      let kind = "good";
      if (i === sans.length - 1 && fens[i + 1]) {
        // حرکت آخر اگر مات باشد همیشه «برترین» است (ارزیابیِ موقعیت پایان‌یافته معنا ندارد)
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
          '<span class="gr-kind"><i class="fas ' + K.icon + '"></i> ' + K.fa + "</span></button>";
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
    const sideRow = function (side, label) {
      const kinds = ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"];
      return '<div class="gr-side"><div class="gr-side-head"><b>' + label +
        '</b><span class="gr-acc">' + fa(avg(acc[side])) + "٪ دقت</span></div><div class='gr-kinds'>" +
        kinds.map(function (k) {
          const n = cnt(side, k);
          if (!n) return "";
          return '<span class="' + KINDS[k].cls + '"><i class="fas ' + KINDS[k].icon + '"></i> ' +
            KINDS[k].fa + " " + fa(n) + "</span>";
        }).join("") + "</div></div>";
    };
    box.innerHTML =
      '<div class="gr-sum-title"><i class="fas fa-chart-simple"></i> گزارش عملکرد</div>' +
      sideRow("w", R.cfg.white || "سفید") + sideRow("b", R.cfg.black || "سیاه");
  }

  function drawGraph() {
    const cv = $("grGraph");
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 300;
    const h = 90;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const reps = R.reps || [];
    if (reps.length < 2) return;
    // پس‌زمینه
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(0, 0, w, h);
    const n = reps.length;
    const pts = reps.map(function (r, i) {
      const wp = winPercent(-(r.cp || 0)); // از دید سفید
      return { x: (i / (n - 1)) * w, y: h - (wp / 100) * h };
    });
    ctx.beginPath();
    ctx.moveTo(0, h);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = "#3182ce";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // خط وسط
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);
    // نشانگر موقعیت جاری
    if (R.idx > 0 && pts[R.idx - 1]) {
      ctx.beginPath();
      ctx.arc(pts[R.idx - 1].x, pts[R.idx - 1].y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f6ad55";
      ctx.fill();
    }
  }

  function showPosition() {
    const idx = R.idx; // ۰ = موقعیت شروع؛ i = بعد از i حرکت
    const g = new Chess();
    if (R.cfg.startFen) g.load(R.cfg.startFen);
    for (let i = 0; i < idx; i++) {
      const u = R.cfg.moves[i];
      if (u) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
    }
    R.viewGame = g;
    const last = idx > 0 ? { from: R.cfg.moves[idx - 1].slice(0, 2), to: R.cfg.moves[idx - 1].slice(2, 4) } : null;
    R.board.render({ lastMove: last });

    // نوار ارزیابی: از دید سفید
    const rep = R.reps ? R.reps[idx] : null;
    if (rep && rep.cp != null) {
      const moverWhite = g.turn() === "w";
      setEvalBar(moverWhite ? rep.cp : -rep.cp);
    } else {
      setEvalBar(null);
    }

    // فلش بهترین حرکت — وقتی حرکتِ بازی‌شده از بهترین بدتر بوده
    R.board.clearArrows();
    const played = idx > 0 ? R.judged[idx - 1] : null;
    if (played && played.best && played.uci !== played.best && rep) {
      R.board.drawArrows([{ from: played.best.slice(0, 2), to: played.best.slice(2, 4), color: "#38a169" }]);
    }
    // هایلایت حرکت فاجعه/اشتباه با فلش نارنجی/قرمز
    if (played && (played.kind === "blunder" || played.kind === "mistake") && played.uci) {
      R.board.drawArrows([
        { from: played.uci.slice(0, 2), to: played.uci.slice(2, 4), color: played.kind === "blunder" ? "#e53e3e" : "#d69e2e" },
      ].concat(played.best && played.uci !== played.best
        ? [{ from: played.best.slice(0, 2), to: played.best.slice(2, 4), color: "#38a169" }] : []));
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
    $("grPlay").innerHTML = '<i class="fas fa-pause"></i>';
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

  /* ---------- باز کردن ---------- */
  // تغییر مجموعه مهره‌ها در حین مرور → رندر مجدد زنده با تصاویر جدید
  function grOnPieceSetChange() {
    if (!window.ChessUtils || !ChessUtils.loadPieces) return;
    ChessUtils.loadPieces().then(function () {
      if (R && !R.closed && R.board) R.board.render({});
    });
  }

  async function open(cfg) {
    if (typeof Chess === "undefined") {
      console.warn("[GameReview] chess.js لود نشده");
      return;
    }
    if (!window.ChessEngine) {
      console.warn("[GameReview] engine-core.js لود نشده — <script src=\"js/engine-core.js\"> را اضافه کن");
      return;
    }
    if (!window.ChessBoardUI) {
      console.warn("[GameReview] board-ui.js لود نشده — <script src=\"js/board-ui.js\"> را اضافه کن");
      if (typeof toast === "function") toast("ماژول تخته لود نشد — صفحه را رفرش کن");
      return;
    }
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
    _opening = false;

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
    };
    const ov = buildOverlay(R.cfg);
    R.ov = ov;

    // تخته فقط نمایشی (بدون تعامل)
    R.board = ChessBoardUI.create({
      boardEl: $("grBoard"),
      arrowsEl: $("grArrows"),
      getGame: function () { return R.viewGame; },
      canMove: function () { return false; },
      userColor: function () { return "w"; },
      onAttempt: function () { return false; },
    });
    R.viewGame = new Chess();
    if (R.cfg.startFen) R.viewGame.load(R.cfg.startFen);
    R.board.build();

    $("grPw").innerHTML = '<i class="fas fa-chess-king" style="color:#e2e8f0"></i> ' + (R.cfg.white || "سفید");
    $("grPb").innerHTML = '<i class="fas fa-chess-king" style="color:#1a202c"></i> ' + (R.cfg.black || "سیاه");

    // رویدادها
    $("grCloseBtn").addEventListener("click", close);
    $("grFirst").addEventListener("click", function () { nav(0); });
    $("grPrev").addEventListener("click", function () { nav(R.idx - 1); });
    $("grNext").addEventListener("click", function () { nav(R.idx + 1); });
    $("grLast").addEventListener("click", function () { nav(R.cfg.moves.length); });
    $("grPlay").addEventListener("click", function () {
      if (R.auto) stopAuto();
      else {
        if (R.idx >= R.cfg.moves.length) nav(0);
        startAuto();
      }
    });
    $("grMoves").addEventListener("click", function (e) {
      const b = e.target.closest(".gr-move");
      if (b) nav(parseInt(b.dataset.i, 10) || 0);
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
      a.download = "chesshub-review.pgn";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.addEventListener("keydown", grKey);
    window.addEventListener("resize", grResize);
    document.addEventListener("pieceSetChanged", grOnPieceSetChange);

    showPosition();
    $("grProgText").textContent = "در صف تحلیل…";

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
      $("grProgWrap").classList.add("done");
      $("grProgText").textContent = "تحلیل کامل شد — " + fa((data.judged || []).length) + " حرکت نمره گرفت";
      renderSummary();
      showPosition();
    });
  }

  function grKey(e) {
    if (!R || R.closed) return;
    if (e.key === "ArrowLeft") nav(R.idx + 1);
    else if (e.key === "ArrowRight") nav(R.idx - 1);
    else if (e.key === "Escape") close();
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

  window.GameReview = { open: open, close: close };
})();
