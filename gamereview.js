/* ============================================================
   ♛ ChessHub — مرور بازی حرفه‌ای (Game Review) — v11.34
   ------------------------------------------------------------
   تحلیل کامل بازی با Stockfish — مشترک بین همه‌ی بخش‌ها:
   بازی با بات، بازی آنلاین، پایگاه بازی‌های استادان

   قابلیت‌ها (v11.33/34):
     • موتور نمره‌دهی «دو مرحله‌ای»: ارزیابی همهٔ موقعیت‌ها + ارزیابی
       مجددِ موقعیت‌های حساس با بودجهٔ ۲.۴ برابر — نویز برچسب عوض نمی‌کند
     • درخشان 💎 سخت‌گیرانه: فقط بهترینِ انجین + قربانیِ واقعیِ
       جبران‌نشده (دیگر روی گرفتن‌های عادی برچسب نمی‌خورد)
     • علامت دسته روی گوشهٔ راست خانهٔ مقصد + آیکن قبل از متن حرکت
     • شمارندهٔ «حرکت کامل» (سفید+سیاه = یک حرکت)
     • نوار ارزیابی با منحنی شانس برد لایچس — دقیق و حس‌شدنی
     • اعداد ارزیابی لاتین تمیز + فونت استاندارد حرکات
     • گزارش عملکرد با داوری متنیِ روان + چیپ‌های منظم دوستونه
     • دکمهٔ «تحلیل در آنالیز»: PGN کامل بازی به بخش آنالیز می‌رود
     • آدمک پیادهٔ شطرنج با رنگ همان طرف برای بازیکنان بی‌عکس
     • تخته Chessground با انیمیشن + فلش‌کشی با کلیک‌راست
     • چیپ‌های آمار کلیک‌پذیر (پرش چرخشی) + نمودار برتری تعاملی
     • کیبورد: فلش چپ/راست، فاصله، Home/End، Esc
     • کش تحلیل (نسخهٔ v4 — فرمت دو مرحله‌ای)

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

  const CACHE_KEY = "chesshub_review_cache_v4";
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
      if (/[a-zA-Z]/.test(c) && c !== "/") n++;
    }
    return n;
  }

  /* 🔑 v11.33 — بودجهٔ تحلیل قوی‌تر: ارزیابیِ پرنویز ریشهٔ برچسب‌های
     اشتباه بود. عمق و زمان هر موقعیت بالا رفت تا دلتاها پایدار شوند. */
  function analysisBudget(fen) {
    const n = pieceCountOf(fen);
    if (n <= 6) return { movetime: 680, depth: 22 };
    if (n <= 12) return { movetime: 420, depth: 18 };
    if (n <= 18) return { movetime: 330, depth: 16 };
    return { movetime: 260, depth: 15 };
  }

  /* ---------- برچسب‌ها + آیکن‌های SVG (تمیز و هم‌خانواده) ---------- */
  const KINDS = {
    brilliant:  { fa: "درخشان",      svg: "brilliant",  cls: "k-bril" },
    best:       { fa: "بهترین",      svg: "best",       cls: "k-best" },
    excellent:  { fa: "عالی",        svg: "excellent",  cls: "k-exc" },
    good:       { fa: "خوب",         svg: "good",       cls: "k-good" },
    book:       { fa: "تئوری",       svg: "book",       cls: "k-book" },
    inaccuracy: { fa: "بی‌دقتی",     svg: "inaccuracy", cls: "k-ina" },
    mistake:    { fa: "اشتباه",      svg: "mistake",    cls: "k-mis" },
    blunder:    { fa: "اشتباه فاحش", svg: "blunder",    cls: "k-blun" },
  };

  const KIND_COLORS = {
    brilliant: "#26c2a3",
    best: "#38a169",
    excellent: "#5ea832",
    good: "#95b1c9",
    book: "#a48f6f",
    inaccuracy: "#f7c631",
    mistake: "#ffa459",
    blunder: "#fa412d",
  };

  function badgeSvg(kind, fill) {
    const c = fill || KIND_COLORS[kind] || "#94a3b8";
    const T = "font-family:'Segoe UI',Tahoma,sans-serif;font-weight:900;font-size:9.5px;text-anchor:middle";
    if (kind === "brilliant") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<path d="M9 3.6l1.5 3.1 3.4.5-2.4 2.4.5 3.4L9 11.4l-3 1.6.5-3.4L4.1 7.2l3.4-.5z" fill="#fff"/></svg>';
    }
    if (kind === "best" || kind === "excellent") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<path d="M4.6 9.4l2.9 2.9 5.9-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (kind === "good") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<circle cx="9" cy="9" r="2.6" fill="#fff"/></svg>';
    }
    if (kind === "book") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<path d="M4.8 5.6c1.6-.8 2.9-.8 4.2 0v7.2c-1.3-.8-2.6-.8-4.2 0zM13.2 5.6c-1.6-.8-2.9-.8-4.2 0v7.2c1.3-.8 2.6-.8 4.2 0z" fill="#fff" opacity=".92"/></svg>';
    }
    if (kind === "inaccuracy") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<text x="9" y="12.6" fill="#3d3123" style="' + T + '">!?</text></svg>';
    }
    if (kind === "mistake") {
      return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
        '<text x="9" y="12.6" fill="#4d2c12" style="' + T + '">?</text></svg>';
    }
    return '<svg class="gr-svgicon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="' + c + '"/>' +
      '<text x="9" y="12.6" fill="#fff" style="' + T + '">??</text></svg>';
  }
  function kindSvg(kind) { return badgeSvg(kind); }

  const CG_BRUSHES = (function () {
    const b = { hub: { key: "hub", color: "#3b82f6", opacity: 0.9, lineWidth: 10 } };
    Object.keys(KIND_COLORS).forEach(function (k) {
      b["kb_" + k] = { key: "kb_" + k, color: KIND_COLORS[k], opacity: 0.85, lineWidth: 8 };
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

  /* بزرگ‌ترین ارزش گرفتنِ فوریِ یک رنگ در موقعیت فعلی (برای تشخیص
     قربانیِ جبران‌شدنی — تبادل عادی نباید درخشان حساب شود) */
  function bestImmediateCaptureGain(g, color) {
    let best = 0;
    try {
      const ms = g.moves({ verbose: true }) || [];
      for (let t = 0; t < ms.length; t++) {
        const mv = ms[t];
        if (mv.color !== color || !mv.captured) continue;
        const v = PIECE_VALS[mv.captured] || 0;
        if (v > best) best = v;
      }
    } catch (e) {}
    return best;
  }

  /* 🔑 v11.33 — درخشانِ واقعی؛ سه شرطِ سخت:
     ۱) قربانی خالصِ حداقل ۲ پیاده بعد از بهترین پاسخ حریف؛
     ۲) بلافاصله جبران‌شدنی نباشد (وگرنه فقط تبادل/گرفتنِ عادی است —
        همان باگِ «الکی درخشان» قبلی)؛
     ۳) بعد از پاسخِ حریف، وضعیت ما فاجعه نباشد. */
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
      const invested = materialOf(fens[i], mover) - materialOf(g.fen(), mover);
      if (invested < 2) return false;
      const regain = bestImmediateCaptureGain(g, mover);
      if (regain >= invested - 1) return false;
      const afterCp = reps[i + 1] && reps[i + 1].cp != null ? -reps[i + 1].cp : null;
      if (afterCp != null && afterCp < -150) return false;
      return true;
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

  /* ---------- آواتار بازیکن‌ها ----------
     استاد شناخته‌شده → عکس واقعی (images/players)؛
     بازیکن ناشناس → پیادهٔ شطرنج با رنگِ همان طرف (سفید/سیاه). */
  function avatarImg(name, side, cls) {
    if (window.ChessUtils && ChessUtils.avatarTag) {
      return ChessUtils.avatarTag(name, side, cls);
    }
    // فالبک داخلی — پیادهٔ شطرنج با رنگ طرف (بدون وابستگی به script.js)
    const bg = side === "b" ? "#e8edf5" : "#22303f";
    const fg = side === "b" ? "#26313d" : "#f4f7fb";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="' + bg + '"/>' +
      '<g fill="' + fg + '">' +
      '<circle cx="32" cy="16.5" r="7.5"/>' +
      '<path d="M27.2 25.5h9.6l1.7 5.6c3.5 3.3 5.6 8.4 5.6 13.9H19.9c0-5.5 2.1-10.6 5.6-13.9z"/>' +
      '<rect x="15.5" y="46.5" width="33" height="6.5" rx="3.2"/>' +
      "</g></svg>";
    const src = "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
    return '<img class="gr-avatar-img' + (cls ? " " + cls : "") + '" src="' + src + '" alt="" draggable="false">';
  }

  /* ---------- انتظار برای آماده‌شدن Chessground ----------
     اگر صفحه لودر لایچز را ندارد، بی‌درنگ false (فالبک ChessBoardUI). */
  function cgReady(maxWait) {
    return new Promise(function (resolve) {
      if (window.Chessground) return resolve(true);
      const loader = document.querySelector('script[src*="chessground/loader"]');
      if (!loader) return resolve(false);
      const t0 = Date.now();
      const iv = setInterval(function () {
        if (window.Chessground) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > (maxWait || 3000)) { clearInterval(iv); resolve(false); }
      }, 120);
    });
  }

  /* ---------- تخته: Chessground + فالبک ---------- */
  function buildBoard(el) {
    if (window.Chessground) {
      const setId = pieceSetId();
      if (window.ChessUtils && ChessUtils.ensureCgPieceSetCss) {
        try { ChessUtils.ensureCgPieceSetCss("gr-board", setId); } catch (e) {}
      }
      el.className = "gr-board set-" + setId + " cg-wrap";
      const cg = Chessground(el, {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        orientation: "white",
        coordinates: true,
        ranksPosition: "right",
        drawable: { enabled: true, brushes: CG_BRUSHES },
        animation: { duration: 220 },
      });
      return {
        render: function (x) {
          try {
            cg.set({
              fen: x.fen,
              lastMove: x.lastMove ? [x.lastMove[0], x.lastMove[1]] : null,
              check: x.check || false,
              turnColor: x.turnColor || "white",
              shapes: x.shapes || [],
              animate: x.animate,
            });
          } catch (e) {}
        },
        redraw: function () {
          try { cg.redrawAll && cg.redrawAll(); } catch (e) { if (R && R.lastRender) cg.set({ fen: R.lastRender.fen }); }
        },
        destroy: function () { try { cg.destroy(); } catch (e) {} },
      };
    }
    if (window.ChessBoardUI && ChessBoardUI.create) {
      // فالبک نسخه‌های قدیمی — ChessBoardUI.create({boardEl, arrowsEl,...})
      const fb = ChessBoardUI.create({
        boardEl: el,
        arrowsEl: $("grArrows"),
        getGame: function () { return R ? R.viewGame : null; },
        canMove: function () { return false; },
        userColor: function () { return "w"; },
        onAttempt: function () { return false; },
      });
      try { fb.build(); } catch (e) {}
      return {
        render: function (x) {
          try {
            if (R && R.viewGame) R.viewGame.load(x.fen);
          } catch (e) {}
          try {
            fb.render({ lastMove: x.lastMove ? { from: x.lastMove[0], to: x.lastMove[1] } : null });
          } catch (e) {}
        },
        redraw: function () {},
        destroy: function () { try { if (fb.destroy) fb.destroy(); } catch (e) {} },
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
            '<span class="gr-eval-num" id="grEvalNum">0.0</span></div>' +
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
              '<button class="gr-btn analyze" id="grAnalyzeBtn"><i class="fas fa-chess-knight"></i> تحلیل در آنالیز</button>' +
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

  /* 🔑 v11.33 — اعداد ارزیابی با رقم لاتین و فونت تمیزِ عددی
     (استاندارد نمودارهای شطرنج؛ خوانا و شیک) */
  function fmtEvalCp(cp, moverIsWhite) {
    const whiteCp = moverIsWhite ? cp : -cp;
    if (whiteCp >= 9000) return "M" + Math.max(1, Math.ceil((10000 - whiteCp) / 100));
    if (whiteCp <= -9000) return "-" + Math.max(1, Math.ceil((10000 + whiteCp) / 100));
    const v = whiteCp / 100;
    return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
  }

  // منحنی شانس برد لایچس — از دید سفید (۰ تا ۱۰۰)
  function winPercent(cp) {
    const CONVERT = [0, 0.5];
    if (cp == null || isNaN(cp)) return 50;
    let c = cp;
    if (c > 6000) c = 6000;
    if (c < -6000) c = -6000;
    const m = Math.min(1, Math.abs(c) / 10000); // مات‌ها هم نرم
    const w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
    return clamp(w, 0, 100);
  }

  /* ---------- نوار ارزیابی + پیشرفت + علامت ---------- */
  function setEvalBar(cpWhite) {
    const fill = $("grEvalFill");
    const num = $("grEvalNum");
    if (num) num.textContent = typeof cpWhite === "number" ? fmtEvalCp(cpWhite, true) : "0.0";
    if (fill) {
      /* 🔑 v11.33 — درصد شانس برد (منحنی لایچس) به‌جای تقسیم خطیِ
         سانتی‌پیاده: −۵ پیاده حالا واقعاً سرخِ سنگین نشان می‌دهد */
      let w = 50;
      if (typeof cpWhite === "number") w = clamp(winPercent(cpWhite), 2, 98);
      fill.style.width = w + "%";
    }
  }

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

  /* 🔑 v11.33 — علامت روی گوشهٔ «راستِ» خانهٔ مقصد (سمت مخالف قبلی) */
  function showBadge(played) {
    const layer = $("grBadges");
    if (!layer) return;
    if (!played || !played.kind || R.idx === 0) { layer.innerHTML = ""; return; }
    const sq = played.sq;
    if (!sq) { layer.innerHTML = ""; return; }
    const f = "abcdefgh".indexOf(sq[0]);
    const r = parseInt(sq[1], 10) - 1;
    if (f < 0 || isNaN(r)) { layer.innerHTML = ""; return; }
    const right = (7 - f) * 12.5 + 0.55;
    const top = (7 - r) * 12.5 + 0.55;
    layer.innerHTML =
      '<div class="gr-badge pop" style="right:' + right + "%;top:" + top + '%">' +
      kindSvg(played.kind) + "</div>";
  }

  /* ---------- تحلیل دو مرحله‌ای ---------- */
  async function analyzeMoves(cfg, onDone) {
    const moves = cfg.moves || [];
    const startFen = cfg.startFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const hash = gameHash(startFen, moves);
    const cached = cacheAll()[hash];
    // 🔧 reps تعدادِ «موقعیت‌ها» است = حرکت‌ها + ۱
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
      setProgress(Math.round(((i + 1) / fens.length) * 84), true);
    }

    /* 🔑 v11.33 — نمره‌دهیِ دو مرحله‌ای (قلبِ دقت):
       مرحلهٔ ۱: قضاوت اولیه → موقعیت‌های «حساس» پیدا می‌شود
       (هر جا دلتا در مرز تصمیم است یا برچسب سنگین دارد)؛
       مرحلهٔ ۲: همان موقعیت‌ها با بودجهٔ ۲.۴ برابر و عمقِ +۵ دوباره
       ارزیابی می‌شوند تا نویزِ لحظهٔ اول برچسب را عوض نکند. */
    const judge1 = judgeMoves(sans, moves, fens, reps);
    const flagged = new Set();
    judge1.forEach(function (m, i) {
      const b = reps[i].cp;
      const a = reps[i + 1] && reps[i + 1].cp != null ? -reps[i + 1].cp : null;
      if (b == null || a == null) return;
      const delta = b - a;
      if (delta > 90 || (delta > 12 && delta <= 130)) { flagged.add(i); flagged.add(i + 1); }
      if (m.kind === "brilliant") { flagged.add(i); flagged.add(i + 1); }
    });
    if (!R.closed && myEpoch === R.epoch && flagged.size) {
      const idxs = Array.from(flagged).filter(function (k) { return k < fens.length; })
        .sort(function (x, y) { return x - y; });
      let done = 0;
      for (let t = 0; t < idxs.length; t++) {
        if (R.closed || myEpoch !== R.epoch) return;
        const k = idxs[t];
        const b2 = analysisBudget(fens[k]);
        const r2 = await ChessEngine.ask(fens[k], { movetime: b2.movetime * 2.4, depth: b2.depth + 5, skill: 20 });
        if (R.closed || myEpoch !== R.epoch) return;
        if (r2 && r2.score != null) {
          reps[k] = {
            cp: cpOf(r2.score),
            best: r2.bestUci || reps[k].best,
            pv: (r2.pv || []).slice(0, 8),
          };
        }
        done++;
        setProgress(84 + Math.round((done / idxs.length) * 15), true);
      }
    }

    // نمره‌دهی نهایی با ارزیابی‌های تأییدشده
    const judged = judgeMoves(sans, moves, fens, reps);
    const data = { reps: reps, judged: judged, t: Date.now() };
    cachePut(hash, data);
    onDone(data);
  }

  /* 🔑 v11.33 — قضاوتِ خالص و قابل‌استفاده‌مجدد + آستانه‌های دقیق‌تر.
     آستانه‌ها بر اساس دلتای ارزیابیِ (قبل − بعد) از دید حرکت‌زننده:
     ≤۲۰ عالی | ≤۹۰ خوب | ≤۲۰۰ بی‌دقتی | ≤۴۵۰ اشتباه | فاحش‌تر از آن.
     سقوطِ کاملِ برتری (از برنده‌بودن به باختن) همیشه فاحش است. */
  function judgeMoves(sans, moves, fens, reps) {
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
          if (delta <= 20) kind = "excellent";
          else if (delta <= 90) kind = "good";
          else if (delta <= 200) kind = "inaccuracy";
          else if (delta <= 450) kind = "mistake";
          else kind = "blunder";
          if (before >= 150 && after <= -150) kind = "blunder";
        }
      }
      // درخشان 💎 فقط برای «بهترینِ انجین» با قربانیِ واقعی (شرط‌های سخت در isSacrifice)
      if (kind === "best" && isSacrifice(fens, i, reps)) {
        kind = "brilliant";
      }
      judged.push({ i: i, san: sans[i], uci: moves[i], kind: kind,
        before: before, after: after, best: reps[i].best,
        bestSan: reps[i].best && reps[i].best !== moves[i] ? (uciToSanObj(fens[i], reps[i].best) || {}).san : null,
        color: sans[i] ? (fens[i].split(" ")[1] === "w" ? "w" : "b") : "w" });
    }
    return judged;
  }

  function cpOf(score) {
    if (window.ChessEngine && ChessEngine.cpOf) return ChessEngine.cpOf(score);
    if (score && score.type === "mate") return score.value > 0 ? 9500 + score.value : -9500 + score.value;
    return score && typeof score.value === "number" ? score.value : 0;
  }

  /* ---------- گزارش عملکرد (v11.34): داوری متنی + چیپ‌های منظم ---------- */
  function renderSummary() {
    const box = $("grSummary");
    if (!box || !R.judged) return;

    // دقت درصدی هر طرف — فرمول لایچس روی افت شانس برد
    const acc = { w: [], b: [] };
    const wps = (R.reps || []).map(function (r) {
      const cp = r.cp || 0;
      return winPercent(cp);
    });
    for (let i = 0; i < R.judged.length; i++) {
      const m = R.judged[i];
      const wpBefore = wps[m.i];
      const wpAfter = wps[m.i + 1];
      if (wpBefore == null || wpAfter == null) continue;
      const side = m.color === "b" ? "b" : "w";
      const drop = side === "w" ? wpBefore - wpAfter : wpAfter - wpBefore;
      if (drop > 0) {
        const a = 103.1668 * Math.exp(-0.04354 * drop) - 3.1668;
        acc[side].push(clamp(a, 0, 100));
      } else {
        acc[side].push(100);
      }
    }
    const avg = function (arr) {
      if (!arr.length) return 100;
      return Math.round(arr.reduce(function (s, x) { return s + x; }, 0) / arr.length);
    };
    const cnt = function (side, kind) {
      let n = 0;
      (R.judged || []).forEach(function (m) { if (m.color === side && m.kind === kind) n++; });
      return n;
    };

    const accW = avg(acc.w), accB = avg(acc.b);
    const bestSide = accW === accB ? null : (accW > accB ? "w" : "b");

    /* 🔑 v11.34 — داوریِ متنیِ روان برای هر بازیکن؛ دقیق و جذاب */
    const verdict = function (side) {
      const a = side === "w" ? accW : accB;
      const bl = cnt(side, "blunder"), mis = cnt(side, "mistake"), ina = cnt(side, "inaccuracy");
      const br = cnt(side, "brilliant");
      let head;
      if (a >= 92) head = "درخشان و تقریباً بی‌نقص — کنترل کامل موقعیت";
      else if (a >= 85) head = "قوی و منسجم با کمترین لغزش";
      else if (a >= 78) head = "خوب و حساب‌شده؛ فقط چند لغزش کوچک";
      else if (a >= 70) head = "قابل‌قبول؛ در لحظات حساس دقت کم آمد";
      else if (a >= 60) head = "پرنوسان — اشتباه‌ها هزینه‌ساز بودند";
      else head = "نیاز به تمرکز روی اصول — چند اشتباه تعیین‌کننده";
      const parts = [];
      if (br) parts.push(fa(br) + " حرکت درخشان");
      if (bl) parts.push(fa(bl) + " اشتباه فاحش");
      else if (mis) parts.push(fa(mis) + " اشتباه");
      else if (ina) parts.push(fa(ina) + " بی‌دقتی");
      if (!parts.length) parts.push("بدون لغزش قابل‌توجه");
      return head + " — " + parts.join("، ");
    };

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
        '<div class="gr-verdict">' + verdict(side) + "</div>" +
        (chips ? '<div class="gr-kinds">' + chips + "</div>"
               : '<div class="gr-nokind">بدون حرکت قابل‌توجه</div>') +
        "</div>";
    };

    box.innerHTML =
      '<div class="gr-sum-title"><i class="fas fa-chart-simple"></i> گزارش عملکرد</div>' +
      '<div class="gr-pcards">' + card("w") +
        '<div class="gr-pvs"><i class="fas fa-bolt"></i><span>در برابر</span></div>' +
      card("b") + "</div>";

    // کلیک چیپ‌ها: پرش چرخشی روی حرکت‌های همان دسته
    box.querySelectorAll(".gr-chip").forEach(function (ch) {
      ch.addEventListener("click", function () {
        const side = ch.getAttribute("data-side");
        const kind = ch.getAttribute("data-kind");
        const key = side + ":" + kind;
        const list = (R.judged || []).filter(function (m) { return m.color === side && m.kind === kind; });
        if (!list.length) return;
        const st = R.chipCycle[key] || { pos: -1 };
        st.pos = (st.pos + 1) % list.length;
        R.chipCycle[key] = st;
        const target = list[st.pos].i + 1;
        R.chipJump = { kind: kind };
        nav(target);
      });
    });
  }

  /* ---------- فهرست حرکات ---------- */
  function renderMovesList() {
    const box = $("grMoves");
    if (!box) return;
    const judged = R.judged;
    if (!judged) { box.innerHTML = '<div class="gr-loading"><i class="fas fa-spinner fa-pulse"></i> در حال نمره‌دهی…</div>'; return; }
    let html = "";
    for (let j = 0; j < judged.length; j++) {
      const m = judged[j];
      const K = KINDS[m.kind] || KINDS.good;
      html += '<button class="gr-move ' + K.cls + (R.idx === j + 1 ? " cur" : "") +
        '" data-i="' + (j + 1) + '"><span class="gr-kind">' + kindSvg(m.kind) + " " + K.fa +
        "</span>" + '<span class="gr-san">' + m.san + "</span></button>";
    }
    box.innerHTML = html;
    box.querySelectorAll(".gr-move").forEach(function (b) {
      b.addEventListener("click", function () { nav(parseInt(b.getAttribute("data-i"), 10)); });
    });
    const cur = box.querySelector(".gr-move.cur");
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  /* ---------- نمایش موقعیت جاری ---------- */
  function showPosition() {
    const idx = R.idx;
    const g = R.viewGame || new Chess();
    if (!R.viewGame) {
      if (R.cfg.startFen) g.load(R.cfg.startFen); else g.reset();
      R.viewGame = g;
    }
    // بازپخش تا idx
    if (R.cfg.startFen) g.load(R.cfg.startFen); else g.reset();
    let last = null;
    const played = { kind: null, sq: null };
    for (let i = 0; i < idx; i++) {
      const u = (R.cfg.moves || [])[i];
      if (!u) break;
      const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      if (!mv) break;
      last = { from: u.slice(0, 2), to: u.slice(2, 4) };
      if (i === idx - 1) {
        const jm = (R.judged || []).find(function (x) { return x.i === i; });
        if (jm) { played.kind = jm.kind; played.sq = u.slice(2, 4); }
      }
    }
    const check = g.in_check() ? (kingSquareOf(g.fen(), g.turn()) || true) : false;

    // هایلایت مبدا/مقصد با رنگ برچسب حرکت + فلش بهترین حرکت انجین
    const shapes = (R.userShapes || []).slice();
    const marks = [];
    if (played.kind && last) {
      const col = KIND_COLORS[played.kind] || KIND_COLORS.good;
      marks.push({ from: last.from, to: last.to, color: col });
    }
    if (R.chipJump) {
      // فلش رنگی یک‌بارمصرف هنگام پرش از چیپ
      const col = KIND_COLORS[R.chipJump.kind] || "#3b82f6";
      if (last) shapes.push({ orig: last.from, dest: last.to, brush: { color: col, opacity: 0.9, lineWidth: 8 } });
      R.chipJump = null;
    }
    const rep = (R.reps || [])[idx];
    if (R.showBest && rep && rep.best && idx < (R.cfg.moves || []).length) {
      const bs = uciToSanObj(g.fen(), rep.best);
      if (bs) shapes.push({ orig: rep.best.slice(0, 2), dest: rep.best.slice(2, 4), brush: CG_BRUSHES.hub });
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

    // 🔑 v11.33 — شمارش «حرکت کامل»: جفت سفید+سیاه = یک حرکت
    const cEl = $("grCounter");
    if (cEl) cEl.textContent =
      fa(Math.ceil(idx / 2)) + "/" + fa(Math.ceil((R.cfg.moves || []).length / 2));
    renderMovesList();
    drawGraph();
  }

  /* ---------- نمودار برتری ---------- */
  function graphGeo(w, h) {
    const reps = R.reps || [];
    const n = reps.length;
    if (n < 2) return { n: n, pts: [] };
    const padX = 6, padY = 8;
    const turnAt = function (i) {
      if (R.fens && R.fens[i]) return R.fens[i].split(" ")[1] === "b" ? "b" : "w";
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
    const h = cv.clientHeight || 90;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const reps = R.reps;
    if (!reps || reps.length < 2) {
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

    // دایرهٔ همهٔ حرکت‌ها — رنگ هرکدام = رنگ برچسب همان حرکت
    const judged = R.judged || [];
    for (let i = 0; i < judged.length; i++) {
      const m = judged[i];
      const p = pts[m.i + 1];
      if (!p) continue;
      const col = KIND_COLORS[m.kind] || KIND_COLORS.good;
      const cur = R.idx === m.i + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cur ? 5.2 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = cur ? col : hexA(col, 0.9);
      ctx.fill();
      if (cur) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(col, 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function graphTipAt(ev) {
    const cv = $("grGraph");
    if (!cv || !R._geo || !R.reps) return;
    const rect = cv.getBoundingClientRect();
    const x = (ev.clientX - rect.left);
    let best = null, bestD = 1e9;
    R._geo.pts.forEach(function (p, i) {
      const d = Math.abs(p.x - x);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best == null || bestD > 18) return;
    const rep = R.reps[best];
    const jm = (R.judged || []).find(function (m) { return m.i === best - 1; });
    const tip = document.querySelector(".gr-graph-tip");
    if (!tip) return;
    const K = jm ? (KINDS[jm.kind] || {}) : null;
    tip.innerHTML =
      (jm ? '<span class="gt-k" style="color:' + (KIND_COLORS[jm.kind] || "#333") + '">' + kindSvg(jm.kind) + " " + (K.fa || "") + "</span> " : "") +
      (jm ? '<span class="gt-san">' + jm.san + "</span> " : "") +
      '<span class="gt-ev">' + fmtEvalCp(rep.cp || 0, (R.fens && R.fens[best] ? R.fens[best].split(" ")[1] === "w" : true)) + "</span>";
    tip.style.left = clamp(rect.left + R._geo.pts[best].x - 60, 8, window.innerWidth - 140) + "px";
    tip.style.top = (rect.top - 42) + "px";
    tip.classList.add("show");
  }
  function graphTipHide() {
    const tip = document.querySelector(".gr-graph-tip");
    if (tip) tip.classList.remove("show");
  }

  /* ---------- ناوبری ---------- */
  function nav(to) {
    R.idx = clamp(to, 0, (R.cfg.moves || []).length);
    stopAuto();
    showPosition();
  }
  function startAuto() {
    if (R.auto) return;
    const b = $("grPlay");
    if (b) b.innerHTML = '<i class="fas fa-pause"></i>';
    R.auto = setInterval(function () {
      if (R.idx < (R.cfg.moves || []).length) { R.idx++; showPosition(); }
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
      if (R.idx >= (R.cfg.moves || []).length) nav(0);
      startAuto();
    }
  }

  /* ---------- PGN + منتقل‌کردن به آنالیز ---------- */
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
  function handoffToAnalysis() {
    try { localStorage.setItem("chesshub_analyze_pgn", buildPgn()); } catch (e) {}
    const url = "analysis.html?autopgn=1";
    if (R.pageMode) window.location.href = url;
    else window.open(url, "_blank");
    toast("بازی به بخش آنالیز منتقل شد");
  }

  function toast(msg) {
    try {
      if (window.ChessHub && ChessHub.toast) return ChessHub.toast(msg);
      if (window.toast) return window.toast(msg);
      const t = document.createElement("div");
      t.className = "gr-toast";
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add("show"); }, 30);
      setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 350); }, 2600);
    } catch (e) {}
  }

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
    if (typeof ChessEngine === "undefined") {
      console.warn("[GameReview] ChessEngine لود نشده");
      return false;
    }
    return true;
  }

  /* ---------- اتصال رویدادها ---------- */
  function bindSession() {
    const cfg = R.cfg;
    // بازیکنان
    const pw = $("grPw"), pb = $("grPb");
    if (pw) pw.innerHTML = avatarImg(cfg.white, "w") + "<b>" + esc(cfg.white || "سفید") + "</b>";
    if (pb) pb.innerHTML = avatarImg(cfg.black, "b") + "<b>" + esc(cfg.black || "سیاه") + "</b>";
    if (cfg.meta) {
      const sub = $("grSub");
      if (sub && cfg.subtitle) sub.textContent = cfg.subtitle;
    }

    // تخته
    const bel = $("grBoard");
    if (bel) R.board = buildBoard(bel);
    R.showBest = true;

    // دکمه‌ها
    const on = function (id, fn) { const e = $(id); if (e) e.addEventListener("click", fn); };
    on("grFirst", function () { nav(0); });
    on("grPrev", function () { nav(R.idx - 1); });
    on("grNext", function () { nav(R.idx + 1); });
    on("grLast", function () { nav((R.cfg.moves || []).length); });
    on("grPlay", toggleAuto);
    on("grCloseBtn", close);
    on("grBackBtn", closeNav);
    on("grCopyPgn", function () {
      const p = buildPgn();
      if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { toast("PGN کپی شد"); },
        function () { toast("کپی نشد — دستی کپی کن"); });
    });
    on("grDlPgn", function () {
      const blob = new Blob([buildPgn()], { type: "application/x-chess-pgn" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = reviewPgnFilename();
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    /* 🔑 v11.33 — «تحلیل در آنالیز»: کل بازی با PGN کامل به بخش آنالیز
       می‌رود تا کاربر خودش حرکت‌به‌حرکت عمیق بررسی کند */
    on("grAnalyzeBtn", handoffToAnalysis);

    // کلیک‌راست و کشیدن = فلش‌کشی (شخصی) — روی تختهٔ Chessground خودش کار می‌کند
    // ولی فلش‌های شخصی بین حرکات باید بمانند:
    if (R.board && R.useCg) {
      try {
        bel.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        document.addEventListener("mousemove", function () {}, { once: true });
      } catch (e) {}
    }

    // نمودار: هاور + کلیک
    const cv = $("grGraph");
    if (cv) {
      cv.addEventListener("mousemove", graphTipAt);
      cv.addEventListener("mouseleave", graphTipHide);
      cv.addEventListener("click", function (ev) {
        if (!R._geo) return;
        const rect = cv.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        let best = null, bestD = 1e9;
        R._geo.pts.forEach(function (p, i) {
          const d = Math.abs(p.x - x);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best != null && bestD <= 18) nav(best);
      });
    }

    // تغییر ست مهره‌ها
    window.addEventListener("chesshub:piece-set-changed", grOnPieceSetChange);

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
      setProgress(100, false);
      renderSummary();
      showPosition();
    });
    showPosition();
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
        e.preventDefault(); toggleAuto(); break;
      case "Home":
        e.preventDefault(); nav(0); break;
      case "End":
        e.preventDefault(); nav((R.cfg.moves || []).length); break;
      case "Escape":
        if (R.pageMode) closeNav(); else close();
        break;
    }
  }
  document.addEventListener("keydown", grKey);

  function close() {
    if (!R) return;
    R.closed = true;
    stopAuto();
    if (R.ov) { R.ov.remove(); R.ov = null; }
    document.body.style.overflow = "";
    if (R.board && R.board.destroy) R.board.destroy();
    R = null;
  }

  /* ---------- بوت صفحهٔ مستقل: خواندن بازی از sessionStorage ---------- */
  (function bootPage() {
    let raw = null;
    try { raw = sessionStorage.getItem("chesshub_review_game"); } catch (e) {}
    if (!raw) return;
    if (!document.getElementById("grBoard")) return; // فقط در صفحهٔ مرور
    let cfg = null;
    try { cfg = JSON.parse(raw); } catch (e) {}
    if (!cfg || !cfg.pgn) return;
    // تبدیل PGN به فهرست UCI
    const g = new Chess();
    try { g.load_pgn(cfg.pgn, { sloppy: true }); } catch (e) {}
    const hist = g.history({ verbose: true });
    if (!hist.length) return;
    const startFen = hist[0].fen ? undefined : undefined; // chess.js: fen قبل از حرکات
    const startObj = new Chess();
    try { startObj.load_pgn(cfg.pgn, { sloppy: true }); } catch (e) {}
    const moves = hist.map(function (m) { return m.from + m.to + (m.promotion || ""); });
    // Fen شروع: اگر PGN SetUp/FEN دارد از همان، وگرنه استاندارد
    let startFen2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
      const h = (cfg.pgn.match(/\[FEN "([^"]+)"\]/) || [])[1];
      if (h) startFen2 = h;
    } catch (e) {}
    openPage({
      moves: moves,
      startFen: startFen2,
      title: (cfg.white || "") + " – " + (cfg.black || ""),
      subtitle: (cfg.opening ? "گشایش: " + cfg.opening : "") + (cfg.date ? " • " + cfg.date : ""),
      white: cfg.white || "سفید",
      black: cfg.black || "سیاه",
      result: cfg.result || "*",
    });
  })();

  window.GameReview = {
    open: open,
    openPage: openPage,
    close: close,
  };
})();
