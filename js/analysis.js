/* ============================================================
   ♛ ChessHub — صفحهٔ آنالیز حرفه‌ای (js/analysis.js)
   ------------------------------------------------------------
   • تخته در مرکز + تحلیل زندهٔ انجین با «سه لاین برتر» (MultiPV 3)
   • هاور روی هر حرکتِ لاین → پاپ‌آپ پیش‌نمایش موقعیت (مثل لایچس)
   • کلیک روی حرکتِ هر لاین → ساخت واریانت جدید و رفتن به آن پوزیشن
   • واریانت‌ها (شاخه‌ها): عوض‌کردن حرکت، حرکات قبلی را پاک نمی‌کند —
     لاین جدید باز می‌شود؛ منوی کلیک‌راست/نگه‌داشتن برای حذف
   • فلش‌کشیدن با کلیک راست روی تخته + پیمایش با کلیدهای جهت‌دار
   • نمایش PGN استاندارد و تمیز + کپی/دانلود
   ============================================================ */
(function () {
  "use strict";

  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- وضعیت ---------- */
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  let startFen = START;
  let game = new Chess();          // موقعیت جاریِ نمایش
  let board = null;
  let flipped = false;
  let live = true;
  let analysisEpoch = 0;

  // مدل واریانت‌ها — lines[0] همیشه لاین اصلی است
  let lines = [{ id: "L1", name: "اصلی", moves: [] }];
  let curLineId = "L1";
  let viewIdx = null;              // null = آخرِ خط جاری؛ عدد = اندیس در خط جاری
  let lineSeq = 2;                 // نام‌گذاری واریانت‌ها از ۲

  let engineLines = [];            // [{score, pv:[uci...]}] — سه لاین برتر

  function curLine() {
    return lines.find(function (l) { return l.id === curLineId; }) || lines[0];
  }
  function viewCount() {
    const L = curLine();
    return viewIdx == null ? L.moves.length : Math.min(viewIdx, L.moves.length);
  }

  function replayTo(idx) {
    const L = curLine();
    game = new Chess();
    if (startFen && startFen !== START) {
      try { game.load(startFen); } catch (e) {}
    }
    const n = Math.min(idx, L.moves.length);
    for (let i = 0; i < n; i++) {
      const u = L.moves[i].uci;
      try {
        game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      } catch (e) { break; }
    }
  }

  /* ---------- اعلان ---------- */
  function toast(msg) {
    const el = $("anToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  /* ---------- ارزیابی ---------- */
  function fmtEvalWhite(cpWhite) {
    if (cpWhite >= 9000) return "M" + fa(Math.max(1, Math.ceil((10000 - cpWhite) / 100)));
    if (cpWhite <= -9000) return "-" + fa(Math.max(1, Math.ceil((10000 + cpWhite) / 100)));
    const v = cpWhite / 100;
    let s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
    return s.replace(/\d/g, function (d) { return FA[+d]; }).replace(".", "٫");
  }
  function scoreWhiteCp(score, moverWhite) {
    if (!score) return 0;
    let cp;
    if (score.type === "mate") cp = score.value > 0 ? 10000 - score.value * 100 : -10000 + Math.abs(score.value) * 100;
    else cp = score.value;
    return moverWhite ? cp : -cp;
  }
  function fmtScoreSide(score) {
    // امتیاز از دید نوبت‌دار — برای نشانِ هر لاین
    if (!score) return "—";
    if (score.type === "mate") {
      return (score.value > 0 ? "M" : "-M") + fa(Math.abs(score.value));
    }
    const v = score.value / 100;
    const s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
    return s.replace(/\d/g, function (d) { return FA[+d]; }).replace(".", "٫");
  }
  function setEvalUI(score, moverWhite) {
    const fill = $("anEvalFill");
    const num = $("anEvalNum");
    let cpWhite = 0, show = "۰٫۰";
    if (score) {
      cpWhite = scoreWhiteCp(score, moverWhite);
      show = fmtEvalWhite(cpWhite);
    }
    const w = 50 + (clamp(cpWhite, -3000, 3000) / 3000) * 47;
    if (fill) fill.style.width = w + "%";
    if (num) num.textContent = show;
  }

  /* ---------- تحلیل انجین (MultiPV 3) ---------- */
  let analyzeTimer = null;
  function scheduleAnalysis(delay) {
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(runAnalysis, delay == null ? 130 : delay);
  }

  async function runAnalysis() {
    if (!window.ChessEngine) return;
    const myEpoch = ++analysisEpoch;
    const fen = game.fen();

    if (game.game_over()) {
      engineLines = [];
      renderPvLines();
      setEvalUI(game.in_checkmate() ? { type: "mate", value: game.turn() === "w" ? -1 : 1 } : { type: "cp", value: 0 }, true);
      engineStatus("بازی تمام شده — " +
        (game.in_checkmate() ? "کیش‌ومات" : game.in_stalemate() ? "پات" : "پایان بازی"));
      if (board) board.clearArrows();
      return;
    }
    if (!ChessEngine.isAvailable()) {
      engineStatus("انجین در حال راه‌اندازی…");
      setTimeout(function () {
        if (myEpoch === analysisEpoch && live) runAnalysis();
      }, 1500);
      return;
    }
    engineStatus("انجین در حال تحلیل…");

    const pieces = (fen.split(" ")[0].match(/[a-zA-Z]/g) || []).length;
    const budget = pieces <= 6 ? { movetime: 800, depth: 26 } : pieces <= 16 ? { movetime: 550, depth: 22 } : { movetime: 420, depth: 20 };

    const r = await ChessEngine.ask(fen, {
      movetime: budget.movetime, depth: budget.depth, skill: 20, multiPV: 3,
    });
    if (myEpoch !== analysisEpoch) return;
    if (!r.score) {
      const off = $("anOffline");
      if (off) off.classList.add("show");
      engineStatus("انجین در دسترس نیست");
      return;
    }
    const off = $("anOffline");
    if (off) off.classList.remove("show");

    setEvalUI(r.score, fen.split(" ")[1] === "w");
    engineLines = (r.lines && r.lines.length ? r.lines : [{ score: r.score, pv: r.pv || [] }]).slice(0, 3);
    renderPvLines();

    // فلش بهترین حرکت (لاین ۱) روی تخته
    if (board) {
      const best = engineLines[0] && engineLines[0].pv && engineLines[0].pv[0];
      if (best) {
        board.drawArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), color: "#60a5fa" }]);
      } else {
        board.clearArrows();
      }
    }
    engineStatus("انجین فعال: " + (ChessEngine.label() || "—") +
      " — تا عمق " + fa(budget.depth));
  }

  function engineStatus(txt) {
    const el = $("anEngineStatus");
    if (el) el.textContent = txt;
  }

  /* ---------- سه لاین برتر + پاپ‌آپ هاور ---------- */
  function renderPvLines() {
    const box = $("anPvLines");
    if (!box) return;
    if (!engineLines.length) {
      box.innerHTML = '<div class="an-status">در انتظار تحلیل…</div>';
      return;
    }
    const fen = game.fen();
    let moveNo = 1;
    let blackFirst = false;
    try {
      moveNo = parseInt(fen.split(" ")[5], 10) || 1;
      blackFirst = fen.split(" ")[1] === "b";
    } catch (e) {}

    box.innerHTML = engineLines.map(function (ln, li) {
      // SAN حرکت‌های لاین با شماره‌گذاری استاندارد PGN
      const gg = new Chess();
      try { gg.load(fen); } catch (e) {}
      let no = moveNo;
      const tokens = [];
      for (let i = 0; i < (ln.pv || []).length && i < 12; i++) {
        const u = ln.pv[i];
        let mv = null;
        try { mv = gg.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) { break; }
        if (!mv) break;
        let numHtml = "";
        if (mv.color === "w") {
          // حرکت سفید — شمارهٔ فعلی
          numHtml = '<span class="pv-num">' + (blackFirst ? no + 1 : no) + ".</span> ";
          if (blackFirst) no++;
        } else {
          // حرکت سیاه — فقط اولین حرکتِ شروع-از-سیاه شماره دارد
          if (i === 0 && blackFirst) numHtml = '<span class="pv-num">' + no + "…</span> ";
          no++;
        }
        tokens.push('<button type="button" class="pv-move" data-l="' + li + '" data-j="' + i + '" data-fenj="' + (i + 1) + '">' + numHtml + mv.san + "</button>");
      }
      const cls = "an-pv" + (li === 0 ? " pv1" : "");
      return '<div class="' + cls + '">' +
        '<div class="pv-head">' +
          '<span class="pv-badge"><i class="fas fa-code-branch"></i> لاین ' + fa(li + 1) + "</span>" +
          '<span class="pv-score">' + fmtScoreSide(ln.score) + "</span>" +
        "</div>" +
        '<div class="pv-moves">' + tokens.join(" ") + (ln.pv && ln.pv.length > 12 ? " …" : "") + "</div>" +
      "</div>";
    }).join("");
  }

  function pvFen(lineIdx, count) {
    const ln = engineLines[lineIdx];
    if (!ln) return game.fen();
    const g = new Chess();
    try { g.load(game.fen()); } catch (e) { return game.fen(); }
    const n = Math.min(count, (ln.pv || []).length);
    for (let i = 0; i < n; i++) {
      const u = ln.pv[i];
      try { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) { break; }
    }
    return g.fen();
  }

  /* پاپ‌آپ پیش‌نمایش موقعیت */
  const pop = $("pvPop");
  function hidePop() {
    if (pop) pop.classList.remove("show");
  }
  function showPop(fen, anchor) {
    if (!pop) return;
    const g = new Chess();
    try { g.load(fen); } catch (e) { return; }
    const b = g.board();
    const grid = pop.querySelector(".pop-grid");
    let html = "";
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const light = (r + f) % 2 === 1;
        const p = b[r][f];
        let inner = "";
        if (p) {
          const key = p.color + p.type;
          const img = (window.ChessUtils && ChessUtils.getPieceImage) ? ChessUtils.getPieceImage(key) : null;
          if (img) inner = '<img src="' + img.src + '" alt="">';
          else {
            const glyphs = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
            inner = '<span class="glyph ' + p.color + '">' + glyphs[p.type] + "</span>";
          }
        }
        html += '<div class="pc ' + (light ? "l" : "d") + '">' + inner + "</div>";
      }
    }
    grid.innerHTML = html;
    pop.querySelector(".pop-cap").textContent = "پیش‌نمایش پوزیشن";
    pop.classList.add("show");
    const rect = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth || 178;
    const ph = pop.offsetHeight || 190;
    let x = rect.left + rect.width / 2 - pw / 2;
    x = clamp(x, 8, window.innerWidth - pw - 8);
    let y = rect.top - ph - 8;
    if (y < 8) y = rect.bottom + 8;
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  }

  document.addEventListener("mouseover", function (e) {
    const t = e.target && e.target.closest ? e.target.closest(".pv-move") : null;
    if (t) {
      const fen = pvFen(parseInt(t.dataset.l, 10), parseInt(t.dataset.fenj, 10));
      showPop(fen, t);
      return;
    }
    if (!e.target || !e.target.closest || !e.target.closest(".an-pv")) hidePop();
  });
  document.addEventListener("click", hidePop, true);
  window.addEventListener("scroll", hidePop, true);

  // کلیک روی حرکتِ هر لاین → واریانت جدید از آن نقطه + پرش به آن پوزیشن
  function applyEngineLine(lineIdx, count) {
    const L = curLine();
    const base = viewCount();
    const ln = engineLines[lineIdx];
    if (!ln) return;
    const pv = (ln.pv || []).slice(0, count);
    const gg = new Chess();
    try { gg.load(game.fen()); } catch (e) { return; }
    const added = [];
    for (let i = 0; i < pv.length; i++) {
      const u = pv[i];
      let mv = null;
      try { mv = gg.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) { break; }
      if (!mv) break;
      added.push({ uci: mv.from + mv.to + (mv.promotion || ""), san: mv.san });
    }
    if (!added.length) return;
    const nl = {
      id: "L" + (lineSeq),
      name: "واریانت " + fa(lineSeq),
      moves: L.moves.slice(0, base).concat(added),
    };
    lineSeq++;
    lines.push(nl);
    curLineId = nl.id;
    viewIdx = null;
    renderAll();
    toast("لاین " + fa(lineIdx + 1) + " انجین به واریانت جدید تبدیل شد");
  }

  document.addEventListener("click", function (e) {
    const t = e.target && e.target.closest ? e.target.closest(".pv-move") : null;
    if (!t) return;
    e.stopPropagation();
    applyEngineLine(parseInt(t.dataset.l, 10), parseInt(t.dataset.j, 10) + 1);
  });

  /* ---------- واریانت‌ها ---------- */
  function renderVarChips() {
    const box = $("varChips");
    if (!box) return;
    box.innerHTML = "";
    lines.forEach(function (L) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "v-chip" + (L.id === curLineId ? " active" : "");
      b.innerHTML =
        '<i class="fas ' + (L.id === lines[0].id ? "fa-list-ol" : "fa-code-branch") + '"></i> ' +
        L.name + " (" + fa(L.moves.length) + ")";
      b.addEventListener("click", function () {
        curLineId = L.id;
        viewIdx = null;
        renderAll();
      });
      box.appendChild(b);
    });
  }

  /* ---------- فهرست حرکات + منوی حذف ---------- */
  function renderMoves() {
    const box = $("anMoves");
    if (!box) return;
    const L = curLine();
    box.innerHTML = "";
    if (!L.moves.length) {
      box.innerHTML = '<div class="an-mv-empty">هنوز حرکتی نیست — مهره‌ها را بکش یا PGN بارگذاری کن.</div>';
      return;
    }
    for (let i = 0; i < L.moves.length; i += 2) {
      const pair = document.createElement("span");
      pair.className = "an-mvpair";
      let html = '<span class="n">' + fa(i / 2 + 1) + ".</span>";
      for (let j = i; j < i + 2 && j < L.moves.length; j++) {
        html += '<button type="button" class="an-move' + (viewIdx === j + 1 ? " cur" : "") +
          '" data-i="' + j + '">' + L.moves[j].san + "</button>";
      }
      pair.innerHTML = html;
      box.appendChild(pair);
    }
    const cur = box.querySelector(".an-move.cur");
    if (cur) {
      const boxRect = box.getBoundingClientRect();
      const elRect = cur.getBoundingClientRect();
      const target = box.scrollTop + (elRect.top - boxRect.top) - (box.clientHeight - elRect.height) / 2;
      box.scrollTop = clamp(target, 0, Math.max(0, box.scrollHeight - box.clientHeight));
    }
  }

  /* منوی کلیک راست / نگه‌داشتن */
  const menu = $("mvMenu");
  let menuCtx = null; // {lineId, idx}
  function openMenu(x, y, lineId, idx) {
    if (!menu) return;
    menuCtx = { lineId: lineId, idx: idx };
    const L = lines.find(function (l) { return l.id === lineId; });
    const delBtn = $("mvDeleteVar");
    if (delBtn) delBtn.disabled = !L || L.id === lines[0].id;
    menu.classList.add("show");
    const mw = menu.offsetWidth || 210;
    const mh = menu.offsetHeight || 96;
    menu.style.left = clamp(x, 8, window.innerWidth - mw - 8) + "px";
    menu.style.top = clamp(y, 8, window.innerHeight - mh - 8) + "px";
  }
  function closeMenu() {
    if (menu) menu.classList.remove("show");
    menuCtx = null;
  }
  document.addEventListener("click", function (e) {
    if (menu && menu.classList.contains("show") && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });
  if (menu) {
    $("mvTruncate").addEventListener("click", function () {
      if (!menuCtx) return;
      const L = lines.find(function (l) { return l.id === menuCtx.lineId; });
      if (L) {
        L.moves = L.moves.slice(0, menuCtx.idx);
        if (!L.moves.length && L.id !== lines[0].id) {
          lines = lines.filter(function (x) { return x !== L; });
          curLineId = lines[0].id;
        }
        if (L.id === curLineId) viewIdx = null;
        renderAll();
        toast("حرکات از این‌جا به بعد حذف شد");
      }
      closeMenu();
    });
    $("mvDeleteVar").addEventListener("click", function () {
      if (!menuCtx) return;
      const L = lines.find(function (l) { return l.id === menuCtx.lineId; });
      if (L && L.id !== lines[0].id) {
        lines = lines.filter(function (x) { return x !== L; });
        curLineId = lines[0].id;
        viewIdx = null;
        renderAll();
        toast("واریانت کامل حذف شد");
      } else {
        toast("لاین اصلی قابل حذف نیست");
      }
      closeMenu();
    });
  }

  // کلیک راست روی حرکت (دسکتاپ) + نگه‌داشتن (موبایل)
  document.addEventListener("contextmenu", function (e) {
    const t = e.target && e.target.closest ? e.target.closest(".an-move") : null;
    if (!t) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, curLineId, parseInt(t.dataset.i, 10));
  });
  let lpTimer = null;
  document.addEventListener("touchstart", function (e) {
    const t = e.target && e.target.closest ? e.target.closest(".an-move") : null;
    if (!t) return;
    const touch = e.touches[0];
    lpTimer = setTimeout(function () {
      openMenu(touch.clientX, touch.clientY, curLineId, parseInt(t.dataset.i, 10));
    }, 550);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      clearTimeout(lpTimer);
    }, { passive: true });
  });

  // کلیک روی حرکت → رفتن به آن پوزیشن
  document.addEventListener("click", function (e) {
    const t = e.target && e.target.closest ? e.target.closest(".an-move") : null;
    if (!t) return;
    viewIdx = parseInt(t.dataset.i, 10) + 1;
    showView();
  });

  /* ---------- PGN استاندارد ---------- */
  function pgnText(L) {
    let no = 1;
    let blackFirst = false;
    try {
      no = parseInt((startFen || START).split(" ")[5], 10) || 1;
      blackFirst = (startFen || START).split(" ")[1] === "b";
    } catch (e) {}
    let out = "";
    L.moves.forEach(function (m, i) {
      if (blackFirst) {
        if (i % 2 === 0) out += no + "... ";
        else { out += (no + 1) + ". "; no++; }
      } else {
        if (i % 2 === 0) out += no + ". ";
        if (i % 2 === 1) no++;
      }
      out += m.san + " ";
    });
    return out.replace(/\s+/g, " ").trim() + " *";
  }

  function renderPgn() {
    const box = $("anPgn");
    if (!box) return;
    const L = curLine();
    if (!L.moves.length) {
      box.innerHTML = '<span style="color:var(--text-light)">—</span>';
      return;
    }
    let no = 1;
    let blackFirst = false;
    try {
      no = parseInt((startFen || START).split(" ")[5], 10) || 1;
      blackFirst = (startFen || START).split(" ")[1] === "b";
    } catch (e) {}
    let html = "";
    L.moves.forEach(function (m, i) {
      if (blackFirst) {
        if (i % 2 === 0) html += '<span class="pgn-no">' + no + "…</span> ";
        else { html += '<span class="pgn-no">' + (no + 1) + ".</span> "; no++; }
      } else {
        if (i % 2 === 0) html += '<span class="pgn-no">' + no + ".</span> ";
        if (i % 2 === 1) no++;
      }
      html += '<span class="pgn-mv' + (viewIdx === i + 1 ? " cur" : "") + '" data-i="' + i + '">' + m.san + "</span> ";
    });
    box.innerHTML = html;
    const cur = box.querySelector(".pgn-mv.cur");
    if (cur) {
      const boxRect = box.getBoundingClientRect();
      const elRect = cur.getBoundingClientRect();
      box.scrollTop = clamp(box.scrollTop + (elRect.top - boxRect.top) - (box.clientHeight - elRect.height) / 2, 0, Math.max(0, box.scrollHeight - box.clientHeight));
    }
  }

  /* ---------- حرکت کاربر ---------- */
  function playUserMove(from, to, promo) {
    const L = curLine();
    const at = viewIdx == null ? L.moves.length : viewIdx;
    const gg = new Chess();
    if (startFen && startFen !== START) {
      try { gg.load(startFen); } catch (e) {}
    }
    for (let i = 0; i < at; i++) {
      const u = L.moves[i].uci;
      try { gg.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) { break; }
    }
    let mv = null;
    try { mv = gg.move({ from: from, to: to, promotion: promo || "q" }); } catch (e) {}
    if (!mv) return false;
    const uci = mv.from + mv.to + (mv.promotion || "");

    if (viewIdx == null || viewIdx >= L.moves.length) {
      // ادامهٔ طبیعی لاین جاری
      L.moves.push({ uci: uci, san: mv.san });
      viewIdx = null;
    } else {
      // انشعاب — حرکات قبلی حفظ می‌شوند و لاین جدید باز می‌شود
      const nl = {
        id: "L" + lineSeq,
        name: "واریانت " + fa(lineSeq),
        moves: L.moves.slice(0, viewIdx).concat([{ uci: uci, san: mv.san }]),
      };
      lineSeq++;
      lines.push(nl);
      curLineId = nl.id;
      viewIdx = null;
      toast("لاین جدید ساخته شد — حرکات قبلی حفظ شدند");
    }
    window.ChessHub && ChessHub.Sound && ChessHub.Sound.play(mv.captured ? "capture" : "move");
    renderAll();
    return true;
  }

  /* ---------- نمایش ---------- */
  function showView() {
    replayTo(viewCount());
    const L = curLine();
    const idx = viewCount();
    const last = idx > 0 ? { from: L.moves[idx - 1].uci.slice(0, 2), to: L.moves[idx - 1].uci.slice(2, 4) } : null;
    if (board) {
      board.clearArrows();
      board.render({ lastMove: last });
    }
    renderMoves();
    renderPgn();
    renderVarChips();
    scheduleAnalysis();
  }

  function renderAll() {
    showView();
  }

  function buildBoard() {
    if (board) board.destroy();
    board = ChessBoardUI.create({
      boardEl: $("anBoard"),
      arrowsEl: $("anArrows"),
      getGame: function () { return game; },
      canMove: function () { return !game.game_over(); },
      userColor: function () { return game.turn(); },
      orientation: function () { return flipped ? "b" : "w"; },
      onAttempt: function (from, to, promo) {
        return playUserMove(from, to, promo);
      },
    });
    board.build();
  }

  /* ---------- بارگذاری FEN / PGN ---------- */
  function loadFen(fen) {
    const g = new Chess();
    if (!g.load(fen)) return toast("FEN نامعتبر است");
    startFen = g.fen();
    lines = [{ id: "L1", name: "اصلی", moves: [] }];
    curLineId = "L1";
    lineSeq = 2;
    viewIdx = null;
    flipped = startFen.split(" ")[1] === "b";
    buildBoard();
    renderAll();
    toast("موقعیت بارگذاری شد");
  }

  function loadPgnText(pgnTextStr) {
    const g = new Chess();
    try {
      if (!g.load_pgn(pgnTextStr)) return toast("PGN قابل خواندن نبود");
    } catch (e) {
      return toast("PGN قابل خواندن نبود");
    }
    const verbose = g.history({ verbose: true });
    if (!verbose.length) return toast("حرکتی در PGN نیست");
    const moves = verbose.map(function (m) {
      return { uci: m.from + m.to + (m.promotion || ""), san: m.san };
    });
    startFen = START;
    lines = [{ id: "L1", name: "اصلی", moves: moves }];
    curLineId = "L1";
    lineSeq = 2;
    viewIdx = null;
    flipped = false;
    buildBoard();
    renderAll();
    toast(fa(moves.length) + " حرکت از PGN بارگذاری شد");
  }

  /* ---------- راه‌اندازی ---------- */
  async function init() {
    if (typeof Chess === "undefined") return;
    if (window.ChessUtils && ChessUtils.loadPieces) {
      try { await ChessUtils.loadPieces(); } catch (e) {}
    }
    window.ChessEngine.init();
    ChessEngine.onReady(function () {
      engineStatus("انجین آماده است");
      if (live) scheduleAnalysis(50);
    });
    document.addEventListener("chessEngineRestarted", function () {
      engineStatus("انجین عوض شد — تحلیل با انجین فعال جدید");
      if (live) scheduleAnalysis(60);
    });

    buildBoard();
    showView();

    $("loadFenBtn").addEventListener("click", function () {
      const v = $("fenInput").value.trim();
      if (v) loadFen(v);
      else toast("اول FEN را بچسبان");
    });
    $("fenInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("loadFenBtn").click();
    });
    $("loadPgnBtn").addEventListener("click", function () { $("pgnFile").click(); });
    $("pgnFile").addEventListener("change", function () {
      const f = this.files && this.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = function () { loadPgnText(String(rd.result || "")); };
      rd.readAsText(f);
      this.value = "";
    });
    $("copyFenBtn").addEventListener("click", function () {
      navigator.clipboard.writeText(game.fen())
        .then(function () { toast("FEN کپی شد"); })
        .catch(function () { toast("کپی نشد"); });
    });
    $("flipBtn").addEventListener("click", function () {
      flipped = !flipped;
      buildBoard();
      board.render({});
    });
    $("resetBtn").addEventListener("click", function () {
      startFen = START;
      lines = [{ id: "L1", name: "اصلی", moves: [] }];
      curLineId = "L1";
      lineSeq = 2;
      viewIdx = null;
      flipped = false;
      engineLines = [];
      buildBoard();
      renderAll();
    });

    $("navFirst").addEventListener("click", function () { viewIdx = 0; showView(); });
    $("navPrev").addEventListener("click", function () {
      const cur = viewIdx == null ? curLine().moves.length : viewIdx;
      viewIdx = Math.max(0, cur - 1);
      showView();
    });
    $("navNext").addEventListener("click", function () {
      const cur = viewIdx == null ? curLine().moves.length : viewIdx;
      if (cur < curLine().moves.length) { viewIdx = cur + 1; showView(); }
      else viewIdx = null;
    });
    $("navLast").addEventListener("click", function () { viewIdx = null; showView(); });

    $("liveBtn").addEventListener("click", function () {
      live = !live;
      this.classList.toggle("on", live);
      this.innerHTML = live
        ? '<i class="fas fa-circle-play"></i> تحلیل زنده: روشن'
        : '<i class="fas fa-circle-pause"></i> تحلیل زنده: خاموش';
      if (live) scheduleAnalysis(30);
      else { analysisEpoch++; engineStatus("تحلیل زنده خاموش است"); }
    });

    $("reviewBtn").addEventListener("click", function () {
      const L = curLine();
      const moves = L.moves.map(function (m) { return m.uci; });
      if (!moves.length) return toast("اول چند حرکت بازی کن یا PGN بارگذاری کن");
      if (!window.GameReview) return;
      window.GameReview.open({
        moves: moves,
        white: "سفید",
        black: "سیاه",
        title: "آنالیز ChessHub",
        subtitle: "مرور انجینی " + (L.name || "لاین جاری"),
        result: "*",
      });
    });

    $("copyPgnBtn").addEventListener("click", function () {
      const txt = pgnText(curLine());
      navigator.clipboard.writeText(txt)
        .then(function () { toast("PGN کپی شد"); })
        .catch(function () { toast("کپی نشد"); });
    });
    $("dlPgnBtn").addEventListener("click", function () {
      const txt = pgnText(curLine());
      const blob = new Blob([txt], { type: "application/x-chess-pgn" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chesshub-analysis.pgn";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
    });

    // کلیدهای جهت‌دار — جلو/عقب
    document.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); $("navNext").click(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); $("navPrev").click(); }
      else if (e.key === "Home") { e.preventDefault(); $("navFirst").click(); }
      else if (e.key === "End") { e.preventDefault(); viewIdx = null; showView(); }
    });

    document.addEventListener("pieceSetChanged", function () {
      if (window.ChessUtils) ChessUtils.loadPieces().then(function () {
        buildBoard();
        board.render({});
        renderMoves();
        renderPgn();
      });
    });
    document.addEventListener("themeChanged", function () {
      buildBoard();
      board.render({});
    });

    scheduleAnalysis(400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
