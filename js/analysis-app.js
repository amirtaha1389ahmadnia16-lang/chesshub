/* ============================================================
   ♛ ChessHub — موتور صفحهٔ آنالیز حرفه‌ای (v10.2)
   ------------------------------------------------------------
   • درخت وارییشن: حرکت تکراری شاخهٔ جدید می‌سازد (بدون حذف، بدون پرسش فوری)
   • در نقطهٔ انشعاب، با زدن «بعدی» دیالوگ انتخاب مسیر باز می‌شود (هر بار)
   • «حذف از اینجا به بعد» حرکتِ خودِ آن نقطه را نگه می‌دارد
   • نوار ارزیابی عمودی هم‌اندازهٔ تخته
   • سه خط انجین با شمارهٔ حرکت + بستن/باز کردن + مینی‌بارد هاور
   • اکسپلورر «حرکات بازی‌شده» از پایگاه بازی‌ها (بدون لایچس)
   • کلیدها: ← جلو / → عقب / Space پخش خودکار
   ============================================================ */
(function () {
  "use strict";

  if (typeof Chess === "undefined") return;

  /* ---------- ابزار ---------- */
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    let el = document.querySelector(".settings-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "settings-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* ---------- وضعیت ---------- */
  let game = new Chess();          // پوزیشن جاریِ نمایش (برای تخته)
  let board = null;
  let flipped = false;
  let live = true;

  // درخت وارییشن — ریشه = موقعیت شروع
  let tree = { san: null, uci: null, children: [] };
  tree.startPly = 0;               // شمارهٔ نیم‌حرکتِ ریشه (برای FENهای میانی)
  let cursor = [];                 // مسیر اندیس‌ها از ریشه

  let analysisEpoch = 0;
  let analyzeTimer = null;
  let infoTimer = null;
  let pendingInfo = null;          // آخرین info زنده برای رندر نرم
  let engineLines = [];            // [{score, pv, depth, expanded, sanChain}]
  let lastArrow = null;

  let autoTimer = null;            // پخش خودکار
  let branchDialogOpen = false;

  // اکسپلورر
  let explorerData = null;
  let explorerState = "idle";      // idle | loading | ok | fail
  const pgnCache = new Map();      // file → parsed games [{white,black,result,date,eco,opening,pgn}]

  /* ---------- مهره‌ها (برای مینی‌بارد) ---------- */
  const PIECE_CODE = {
    wk: "wk.png", wq: "wq.png", wr: "wr.png", wb: "wb.png", wn: "wn.png", wp: "wp.png",
    bk: "bk.png", bq: "bq.png", br: "br.png", bb: "bb.png", bn: "bn.png", bp: "bp.png",
  };
  function currentPieceSet() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      return (s && s.pieceSet) || "neo";
    } catch (e) { return "neo"; }
  }
  function pieceSrc(color, type) {
    const c = window.ChessUtils && ChessUtils.getPieceImage
      ? ChessUtils.getPieceImage(color + type) : null;
    if (c && c.src) return c.src;
    return "pieces/" + currentPieceSet() + "/" + PIECE_CODE[color + type];
  }

  /* ============================================================
     درخت وارییشن
     ============================================================ */
  function nodeAt(path) {
    let n = tree;
    for (let i = 0; i < path.length; i++) n = n.children[path[i]];
    return n;
  }
  function lineSans(path) {
    const out = [];
    let n = tree;
    for (let i = 0; i < path.length; i++) {
      n = n.children[path[i]];
      out.push(n.san);
    }
    return out;
  }
  function sansToPosition(sans) {
    const g = new Chess();
    for (let i = 0; i < sans.length; i++) {
      try { if (!g.move(sans[i])) break; } catch (e) { break; }
    }
    return g;
  }
  function refreshGameObj() {
    game = sansToPosition(lineSans(cursor));
  }
  function moveNumberOfPly(ply) {
    return Math.floor((tree.startPly + ply) / 2) + 1;
  }
  function isWhitePly(ply) {
    return (tree.startPly + ply) % 2 === 0;
  }
  // UCI مسیر اصلی (برای مرور بازی)
  function mainLineUcis() {
    const out = [];
    let n = tree;
    while (n.children.length) {
      n = n.children[0];
      out.push(n.uci);
    }
    return out;
  }

  /* ---------- ناوبری ---------- */
  function clearArrows() {
    lastArrow = null;
    if (board && board.clearArrows) board.clearArrows();
  }
  function afterNav(moveOpts) {
    stopAuto();
    refreshGameObj();
    clearArrows();
    board.render(moveOpts || {});
    renderMoves();
    renderExplorer();
    engineLines = [];
    renderEngineLines();
    resetDepthUI();
    scheduleAnalysis();
  }
  function goNext() {
    const node = nodeAt(cursor);
    if (!node.children.length) { toast("این خط به پایان رسیده است"); return; }
    if (node.children.length === 1) {
      cursor.push(0);
      afterNav();
    } else {
      openBranchDialog(node);
    }
  }
  function goNextMainline() {
    // در پخش خودکار: همیشه مسیر اصلی بدون دیالوگ
    const node = nodeAt(cursor);
    if (!node.children.length) return false;
    cursor.push(0);
    refreshGameObj();
    board.render({});
    renderMoves();
    renderExplorer();
    scheduleAnalysis();
    return true;
  }
  function goPrev() {
    if (!cursor.length) { toast("اول خط هستیم"); return; }
    cursor.pop();
    afterNav();
  }
  function goFirst() {
    cursor = [];
    afterNav();
  }
  function goLast() {
    let n = nodeAt(cursor);
    while (n.children.length) { cursor.push(0); n = n.children[0]; }
    afterNav();
  }

  /* ---------- حذف ---------- */
  function deleteAfter(path) {
    const n = nodeAt(path);
    if (!n.children.length) { toast("چیزی بعد از این حرکت نیست"); return; }
    n.children = [];
    cursor = path.slice();
    afterNav();
    toast("حرکاتِ بعد از این نقطه پاک شد — خودِ حرکت باقی است");
  }
  function deleteMove(path) {
    if (!path.length) { toast("حرکتی برای حذف نیست"); return; }
    const parent = nodeAt(path.slice(0, -1));
    parent.children.splice(path[path.length - 1], 1);
    cursor = path.slice(0, -1);
    afterNav();
    toast("این حرکت حذف شد");
  }

  /* ---------- دیالوگ انتخاب شاخه ---------- */
  function previewLine(node, maxPlies) {
    const g = sansToPosition(lineSans(cursor));
    const out = [];
    let n = node;
    let k = 0;
    while (n && n.children.length && k < maxPlies) {
      n = n.children[0];
      out.push(n.san);
      k++;
    }
    return out.join(" ");
  }
  function openBranchDialog(node) {
    const ov = $("anBranchOv");
    const box = $("anBranchOpts");
    box.innerHTML = "";
    node.children.forEach(function (ch, idx) {
      const btn = document.createElement("button");
      const more = ch.children.length ? previewLine(ch, 5) : "پایان خط";
      btn.innerHTML =
        '<span class="opt-san">' + ch.san + "</span>" +
        '<span class="opt-more">' + fa(Math.floor((tree.startPly + cursor.length) / 2) + 1) + "… " + more + "</span>" +
        '<i class="fas fa-chevron-left" style="color:#cbd5e0"></i>';
      btn.addEventListener("click", function () {
        closeBranchDialog();
        cursor.push(idx);
        afterNav();
      });
      box.appendChild(btn);
    });
    ov.classList.add("show");
    branchDialogOpen = true;
  }
  function closeBranchDialog() {
    $("anBranchOv").classList.remove("show");
    branchDialogOpen = false;
  }

  /* ============================================================
     فهرست حرکات — درخت با شاخه‌ها
     ============================================================ */
  function makeMvSpan(san, path, ply) {
    const span = document.createElement("span");
    span.className = "an-mv";
    const num = moveNumberOfPly(ply);
    const white = isWhitePly(ply);
    span.innerHTML = white
      ? '<span class="n">' + fa(num) + ".</span> " + san
      : '<span class="n">' + fa(num) + "…</span> " + san;
    span.dataset.path = JSON.stringify(path);
    span.dataset.ply = String(ply);
    span.dataset.san = san;
    span.addEventListener("click", function () {
      cursor = JSON.parse(this.dataset.path);
      afterNav();
    });
    bindCtx(span);
    return span;
  }
  function makeNumSpan(ply) {
    const s = document.createElement("span");
    s.className = "an-mvnum";
    s.textContent = fa(moveNumberOfPly(ply)) + ".";
    return s;
  }
  // رندر یک زنجیرهٔ اصلی + شاخه‌های جانبی در نقطه‌های انشعاب
  function renderChain(node, basePath, depthLimit, frag) {
    let n = node;
    let path = basePath.slice();
    let guard = 0;
    while (n.children.length && guard < 300) {
      guard++;
      const idx = path.length; // ply مطلق = startPly + idx
      for (let c = 0; c < n.children.length; c++) {
        const child = n.children[c];
        const childPath = path.concat([c]);
        if (c > 0) {
          // شاخهٔ جایگزین — داخل پرانتز
          const wrap = document.createElement("span");
          wrap.className = "an-branch";
          const p1 = document.createElement("span");
          p1.className = "paren"; p1.textContent = "(";
          wrap.appendChild(p1);
          wrap.appendChild(makeMvSpan(child.san, childPath, idx));
          if (depthLimit > 0 && child.children.length) {
            renderChain(child, childPath, depthLimit - 1, wrap);
          }
          const p2 = document.createElement("span");
          p2.className = "paren"; p2.textContent = ")";
          wrap.appendChild(p2);
          frag.appendChild(wrap);
        } else {
          // makeMvSpan خودش شمارهٔ حرکت را می‌گذارد
          frag.appendChild(makeMvSpan(child.san, childPath, idx));
        }
      }
      n = n.children[0];
      path = path.concat([0]);
    }
  }
  function renderMoves() {
    const box = $("anMoves");
    if (!box) return;
    box.innerHTML = "";
    const frag = document.createDocumentFragment();
    renderChain(tree, [], 2, frag);
    box.appendChild(frag);
    // هایلایت حرکت جاری
    const cur = JSON.stringify(cursor);
    box.querySelectorAll(".an-mv").forEach(function (el) {
      if (el.dataset.path === cur) {
        el.classList.add("cur");
        try { el.scrollIntoView({ block: "nearest" }); } catch (e) {}
      }
    });
  }

  /* ============================================================
     منوی راست‌کلیک / لانگ‌پرس
     ============================================================ */
  let ctxPath = null;
  let lpTimer = null;
  function bindCtx(el) {
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      showCtx(e.clientX, e.clientY, JSON.parse(el.dataset.path));
    });
    el.addEventListener("touchstart", function (e) {
      const t = e.touches[0];
      const path = JSON.parse(el.dataset.path);
      lpTimer = setTimeout(function () {
        showCtx(t.clientX, t.clientY, path);
      }, 480);
    }, { passive: true });
    el.addEventListener("touchend", function () { clearTimeout(lpTimer); }, { passive: true });
    el.addEventListener("touchmove", function () { clearTimeout(lpTimer); }, { passive: true });
  }
  function showCtx(x, y, path) {
    ctxPath = path;
    const ctx = $("anCtx");
    ctx.classList.add("show");
    const w = ctx.offsetWidth || 200;
    const h = ctx.offsetHeight || 90;
    ctx.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    ctx.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
  }
  function hideCtx() {
    $("anCtx").classList.remove("show");
    ctxPath = null;
  }
  $("ctxDeleteAfter").addEventListener("click", function () {
    if (ctxPath) deleteAfter(ctxPath);
    hideCtx();
  });
  $("ctxDeleteMove").addEventListener("click", function () {
    if (ctxPath) deleteMove(ctxPath);
    hideCtx();
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#anCtx")) hideCtx();
  });
  window.addEventListener("scroll", hideCtx, true);
  window.addEventListener("resize", hideCtx);

  /* ============================================================
     مینی‌بارد هاور
     ============================================================ */
  const mini = { el: null, grid: null, head: null };
  function renderMiniFen(fen) {
    const g = new Chess();
    if (!g.load(fen)) return;
    const b = g.board();
    let html = "";
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const p = b[i][j];
        const light = (i + j) % 2 === 0;
        html += '<div class="sq ' + (light ? "l" : "d") + '">';
        if (p) {
          const imgSrc = pieceSrc(p.color, p.type);
          if (window.ChessUtils && ChessUtils.getPieceImage && ChessUtils.getPieceImage(p.color + p.type)) {
            html += '<img src="' + imgSrc + '" alt="" draggable="false">';
          } else {
            html += '<span class="' + p.color + '">' + glyphOf(p) + "</span>";
          }
        }
        html += "</div>";
      }
    }
    mini.grid.innerHTML = html;
  }
  const GLYPH_MAP = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  function glyphOf(p) { return GLYPH_MAP[p.type] || "?"; }
  function showMini(fen, label, x, y) {
    if (!mini.el) {
      mini.el = $("anMini");
      mini.grid = $("anMiniGrid");
      mini.head = $("anMiniHead");
    }
    mini.head.textContent = label || "";
    renderMiniFen(fen);
    mini.el.classList.add("show");
    const w = 168, h = 210;
    mini.el.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 10)) + "px";
    mini.el.style.top = Math.max(8, Math.min(y + 16, window.innerHeight - h - 10)) + "px";
  }
  function hideMini() { if (mini.el) mini.el.classList.remove("show"); }

  /* ============================================================
     خطوط انجین — شمارهٔ حرکت + بستن/باز + مینی‌بارد هاور
     ============================================================ */
  function fmtEvalCp(cpWhite) {
    if (cpWhite >= 9000) return "M" + fa(Math.max(1, Math.ceil((10000 - cpWhite) / 100)));
    if (cpWhite <= -9000) return "-" + fa(Math.max(1, Math.ceil((10000 + cpWhite) / 100)));
    const v = cpWhite / 100;
    const s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
    return s.replace(/\d/g, function (d) { return FA[+d]; }).replace(".", "٫");
  }
  function scoreToCpWhite(score, moverWhite) {
    if (!score) return 0;
    if (score.type === "mate") return score.value > 0 ? 10000 - score.value * 100 : -10000 + Math.abs(score.value) * 100;
    return moverWhite ? score.value : -score.value;
  }
  function buildSanChain(startFen, pv, maxPlies) {
    // خروجی: [{san, fenAfter, num, white}]
    const g = new Chess();
    if (!g.load(startFen)) return [];
    const basePly = tree.startPly + cursor.length;
    const out = [];
    for (let i = 0; i < pv.length && i < maxPlies; i++) {
      const u = pv[i];
      let mv = null;
      try { mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) { break; }
      if (!mv) break;
      out.push({
        san: mv.san,
        fenAfter: g.fen(),
        ply: basePly + i,
        white: (basePly + i) % 2 === 0,
      });
    }
    return out;
  }
  function renderEngineLines() {
    const box = $("anPvLines");
    if (!box) return;
    const fen = game.fen();
    const moverWhite = fen.split(" ")[1] === "w";
    if (!engineLines.length) {
      box.innerHTML = '<div class="an-status">در انتظار تحلیل…</div>';
      return;
    }
    let html = "";
    engineLines.forEach(function (ln, li) {
      const cpWhite = scoreToCpWhite(ln.score, moverWhite);
      const tag = fmtEvalCp(cpWhite);
      const chain = ln.chain || [];
      const COLLAPSED_PLIES = 6;
      const expanded = !!ln.expanded;
      const shown = expanded ? chain : chain.slice(0, COLLAPSED_PLIES);
      let movesHtml = "";
      shown.forEach(function (st) {
        const numTxt = st.white ? fa(moveNumberOfPly(st.ply)) + "." : fa(moveNumberOfPly(st.ply)) + "…";
        movesHtml +=
          '<span class="an-pvm" data-fen="' + st.fenAfter + '" data-label="حرکت ' + fa(moveNumberOfPly(st.ply)) + " — " + st.san + '">' +
          '<span class="num">' + numTxt + "</span> " + st.san + "</span> ";
      });
      if (!expanded && chain.length > shown.length) {
        movesHtml += '<span class="pv-more">… +' + fa(chain.length - shown.length) + " حرکت</span>";
      }
      html +=
        '<div class="an-pv' + (expanded ? " expanded" : "") + '">' +
        '<button class="pv-toggle" data-line="' + li + '" title="باز/بسته"><i class="fas fa-chevron-down"></i></button>' +
        "<b>" + tag + "</b>" +
        '<div class="pv-moves">' + (movesHtml || "…") + "</div>" +
        "</div>";
    });
    box.innerHTML = html;
    // رویدادها
    box.querySelectorAll(".pv-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const li = parseInt(this.dataset.line, 10);
        if (engineLines[li]) engineLines[li].expanded = !engineLines[li].expanded;
        renderEngineLines();
      });
    });
    box.querySelectorAll(".an-pvm").forEach(function (el) {
      el.addEventListener("mouseenter", function (e) {
        showMini(el.dataset.fen, el.dataset.label, e.clientX, e.clientY);
      });
      el.addEventListener("mousemove", function (e) {
        if (mini.el && mini.el.classList.contains("show")) {
          const w = 168, h = 210;
          mini.el.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - w - 10)) + "px";
          mini.el.style.top = Math.max(8, Math.min(e.clientY + 16, window.innerHeight - h - 10)) + "px";
        }
      });
      el.addEventListener("mouseleave", hideMini);
    });
  }
  // هرس خطوط: pv هر خط را به زنجیرهٔ SAN تبدیل می‌کند (فقط وقتی pv عوض شده)
  function hydrateLines(lines) {
    const fen = game.fen();
    engineLines = lines.filter(Boolean).slice(0, 3).map(function (ln, i) {
      const old = engineLines[i];
      const pvKey = (ln.pv || []).join(",");
      const chain = old && old.pvKey === pvKey ? old.chain : buildSanChain(fen, ln.pv || [], 12);
      return {
        score: ln.score || (old && old.score) || null,
        pv: ln.pv || [],
        pvKey: pvKey,
        chain: chain,
        depth: ln.depth,
        expanded: old ? old.expanded : false,
      };
    });
  }

  /* ---------- نوار ارزیابی ---------- */
  function resetDepthUI() {
    $("anDepthChip").textContent = "عمق ۰";
    $("anDepthFill").style.width = "5%";
    $("anDepthPct").textContent = "۵٪";
  }
  function setEvalRail(cpWhite) {
    const fill = $("anRailFill");
    const chip = $("anRailChip");
    let w = 50;
    if (typeof cpWhite === "number") {
      w = 50 + (Math.max(-3000, Math.min(3000, cpWhite)) / 3000) * 47;
    }
    if (fill) fill.style.height = w + "%";
    if (chip) {
      chip.textContent = typeof cpWhite === "number" ? fmtEvalCp(cpWhite) : "۰٫۰";
      chip.classList.toggle("white-side", typeof cpWhite !== "number" || cpWhite >= 0);
    }
  }

  /* ============================================================
     تحلیل زنده
     ============================================================ */
  function scheduleAnalysis(delay) {
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(runAnalysis, delay == null ? 140 : delay);
  }
  async function runAnalysis() {
    if (!window.ChessEngine) return;
    const myEpoch = ++analysisEpoch;
    const fen = game.fen();
    if (game.game_over()) {
      engineLines = [];
      renderEngineLines();
      resetDepthUI();
      setEvalRail(game.in_checkmate() ? (game.turn() === "w" ? -10000 : 10000) : 0);
      clearArrows();
      engineStatus("بازی تمام شده — " + (game.in_checkmate() ? "کیش‌ومات" : game.in_stalemate() ? "پات" : "پایان"));
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
    const TARGET_DEPTH = 24;
    const onInfo = function (info) {
      if (myEpoch !== analysisEpoch) return;
      pendingInfo = info;
      if (!infoTimer) {
        infoTimer = setTimeout(function () {
          infoTimer = null;
          if (!pendingInfo) return;
          hydrateLines(pendingInfo.lines || []);
          renderEngineLines();
          // نوار ارزیابی از خط اول
          if (engineLines[0] && engineLines[0].score) {
            setEvalRail(scoreToCpWhite(engineLines[0].score, fen.split(" ")[1] === "w"));
          }
          // پیشرفت عمق
          const d = pendingInfo.depth || 0;
          const pct = Math.max(5, Math.min(99, Math.round((d / TARGET_DEPTH) * 100)));
          $("anDepthChip").textContent = "عمق " + fa(d);
          $("anDepthFill").style.width = pct + "%";
          $("anDepthPct").textContent = fa(pct) + "٪";
        }, 130);
      }
    };
    const r = await ChessEngine.ask(fen, {
      movetime: 2600,
      depth: TARGET_DEPTH,
      skill: 20,
      multiPV: 3,
      onInfo: onInfo,
    });
    if (myEpoch !== analysisEpoch) return;
    const off = $("anOffline");
    if (!r.score) {
      engineStatus("انجین در دسترس نیست");
      if (off) off.classList.add("show");
      return;
    }
    if (off) off.classList.remove("show");
    // نتیجهٔ نهایی — همهٔ خطوط
    const finalLines = (r.lines && r.lines.length ? r.lines : [{ score: r.score, pv: r.pv, depth: r.depth }])
      .filter(function (l) { return l && (l.pv || l.score); });
    hydrateLines(finalLines);
    renderEngineLines();
    const moverWhite = fen.split(" ")[1] === "w";
    setEvalRail(scoreToCpWhite(r.score, moverWhite));
    const d = r.depth || 0;
    $("anDepthChip").textContent = "عمق " + fa(d);
    $("anDepthFill").style.width = "100%";
    $("anDepthPct").textContent = "۱۰۰٪";
    engineStatus("تحلیل تا عمق " + fa(d) + " انجام شد — زنده");
    // فلش بهترین حرکت (خط اول)
    if (r.lines && r.lines[0] && r.lines[0].pv && r.lines[0].pv[0] && board && board.drawArrows) {
      const u = r.lines[0].pv[0];
      lastArrow = { from: u.slice(0, 2), to: u.slice(2, 4), color: "#38a169" };
      board.drawArrows([lastArrow]);
    } else if (r.bestUci && board && board.drawArrows) {
      lastArrow = { from: r.bestUci.slice(0, 2), to: r.bestUci.slice(2, 4), color: "#38a169" };
      board.drawArrows([lastArrow]);
    }
  }
  function engineStatus(txt) {
    const el = $("anEngineStatus");
    if (el) el.textContent = txt;
  }

  /* ============================================================
     اکسپلورر «حرکات بازی‌شده» — از پایگاه بازی‌ها
     ============================================================ */
  function loadExplorer() {
    if (explorerState !== "idle") return;
    explorerState = "loading";
    renderExplorer();
    fetch("data/explorer/explorer.json")
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (data) {
        explorerData = data;
        explorerState = "ok";
        renderExplorer();
      })
      .catch(function () {
        explorerState = "fail";
        renderExplorer();
      });
  }
  function faCompact(n) {
    try { return Number(n).toLocaleString("fa-IR"); } catch (e) { return String(n); }
  }
  function explorerNodeFor() {
    if (!explorerData) return null;
    let n = explorerData.root;
    const sans = lineSans(cursor);
    for (let i = 0; i < sans.length; i++) {
      // کلید اکسپلورر بدون علامت +/# است
      const san = String(sans[i]).replace(/[+#!?]/g, "");
      if (!n.m || !n.m[san]) return null;
      n = n.m[san];
    }
    return n;
  }
  function renderExplorer() {
    const box = $("anExplorer");
    if (!box) return;
    if (explorerState === "loading") {
      box.innerHTML = '<div class="ex-status"><i class="fas fa-spinner fa-pulse"></i> در حال بارگذاری پایگاه بازی‌ها…</div>';
      return;
    }
    if (explorerState === "fail") {
      box.innerHTML = '<div class="ex-status">دادهٔ اکسپلورر در دسترس نیست — فایل data/explorer/explorer.json ساخته نشده است.</div>';
      return;
    }
    if (!explorerData) { loadExplorer(); return; }
    const node = explorerNodeFor();
    if (!node) {
      box.innerHTML = '<div class="ex-status">این پوزیشن در بازی‌های پایگاه دیده نشده — از موقعیت اولیه بازی کن تا «حرکات بازی‌شده» را ببینی.</div>';
      return;
    }
    // حرکت‌ها — مرتب بر اساس تعداد
    const moves = Object.keys(node.m || {})
      .map(function (san) { return { san: san, n: node.m[san] }; })
      .sort(function (a, b) { return b.n.n - a.n.n; });
    let html = '<div class="ex-moves">';
    if (!moves.length) {
      html += '<div class="ex-status">این آخرین پوزیشن ثبت‌شده است — حرکتی بعدش در پایگاه نیست.</div>';
    }
    moves.forEach(function (mv) {
      const c = mv.n;
      const total = Math.max(1, c.n);
      const pw = (c.w / total) * 100;
      const pd = (c.d / total) * 100;
      const pb = (c.b / total) * 100;
      html +=
        '<div class="ex-move" data-san="' + mv.san + '">' +
        '<span class="ex-san">' + mv.san + "</span>" +
        '<div class="ex-bar" title="برد سفید ' + Math.round(pw) + "٪ — مساوی " + Math.round(pd) + "٪ — برد سیاه " + Math.round(pb) + '٪">' +
        '<span class="seg-w" style="width:' + pw.toFixed(1) + '%"></span>' +
        '<span class="seg-d" style="width:' + pd.toFixed(1) + '%"></span>' +
        '<span class="seg-b" style="width:' + pb.toFixed(1) + '%"></span>' +
        "</div>" +
        '<span class="ex-wdl">' + Math.round(pw) + "٪ / " + Math.round(pd) + "٪ / " + Math.round(pb) + "٪</span>" +
        '<span class="ex-count">' + faCompact(c.n) + "</span>" +
        "</div>";
    });
    html += "</div>";
    // بازی‌های رسیده به همین پوزیشن
    const games = (node.g || []).filter(function (gr) {
      return explorerData.meta && explorerData.meta[gr[0]];
    });
    const RESULT_FA = { "1-0": "برد سفید", "0-1": "برد سیاه", "1/2-1/2": "مساوی" };
    const RESULT_CL = { "1-0": "w", "0-1": "b", "1/2-1/2": "d" };
    html += '<div class="ex-games">';
    html += '<div class="ex-games-title"><i class="fas fa-chess-queen"></i> بازی‌های رسیده به همین پوزیشن (' + faCompact(node.n) + " بازی)</div>";
    games.forEach(function (gr) {
      const m = explorerData.meta[gr[0]];
      const res = m[2] || "*";
      const resFa = RESULT_FA[res] || "نامشخص";
      const resCl = RESULT_CL[res] || "d";
      html +=
        '<div class="ex-game" data-mid="' + gr[0] + '">' +
        '<span class="g-res ' + resCl + '">' + resFa + "</span>" +
        "<span>" + m[0] + " — " + m[1] + "</span>" +
        (m[3] ? '<span class="g-date">' + m[3] + "</span>" : "") +
        '<span class="g-open">مرور و تحلیل <i class="fas fa-chevron-left"></i></span>' +
        "</div>";
    });
    if (node.n > games.length) {
      html += '<div class="ex-games-title" style="font-weight:600">و ' + faCompact(node.n - games.length) + " بازی دیگر…</div>";
    }
    html += "</div>";
    box.innerHTML = html;

    // کلیک روی حرکت → همان حرکت روی تخته
    box.querySelectorAll(".ex-move").forEach(function (el) {
      el.addEventListener("click", function () {
        playExplorerMove(el.dataset.san);
      });
    });
    // کلیک روی بازی → مرور
    box.querySelectorAll(".ex-game").forEach(function (el) {
      el.addEventListener("click", function () {
        const mid = parseInt(el.dataset.mid, 10);
        const src = (explorerData.srcs || [])[mid];
        if (!src) { toast("این بازی در دسترس نیست"); return; }
        openExplorerGame(src[0], src[1], el);
      });
    });
  }
  function playExplorerMove(san) {
    const pos = sansToPosition(lineSans(cursor));
    let mv = null;
    try { mv = pos.move(san); } catch (e) { mv = null; }
    if (!mv) { toast("این حرکت در این پوزیشن مجاز نیست"); return; }
    const uci = mv.from + mv.to + (mv.promotion || "");
    const node = nodeAt(cursor);
    let idx = node.children.findIndex(function (c) { return c.uci === uci; });
    if (idx < 0) {
      node.children.push({ san: mv.san, uci: uci, children: [] });
      idx = node.children.length - 1;
    }
    cursor.push(idx);
    afterNav({ lastMove: { from: mv.from, to: mv.to } });
  }
  function parsePgnFile(text) {
    const chunks = text.split(/\n\n(?=\[Event )/);
    const out = [];
    for (const raw of chunks) {
      if (!raw || raw.indexOf("[Event") < 0) continue;
      out.push({
        white: (raw.match(/\[White "([^"]+)"\]/) || [])[1] || "؟",
        black: (raw.match(/\[Black "([^"]+)"\]/) || [])[1] || "؟",
        result: (raw.match(/\[Result "([^"]+)"\]/) || [])[1] || "*",
        date: (raw.match(/\[Date "([^"]+)"\]/) || [])[1] || "",
        eco: (raw.match(/\[ECO "([^"]+)"\]/) || [])[1] || "",
        opening: (raw.match(/\[Opening "([^"]+)"\]/) || [])[1] || "",
        pgn: raw,
      });
    }
    return out;
  }
  function openExplorerGame(pi, gi, el) {
    const file = explorerData.players[pi];
    if (!file) return;
    const openWith = function (meta) {
      const g = meta[gi];
      if (!g) { toast("بازی پیدا نشد"); return; }
      const chess = new Chess();
      let ucis = [];
      try {
        chess.load_pgn(g.pgn, { sloppy: true });
        ucis = chess.history({ verbose: true }).map(function (m) {
          return m.from + m.to + (m.promotion || "");
        });
      } catch (e) { ucis = []; }
      if (!ucis.length) { toast("حرکتی برای مرور نیست"); return; }
      window.GameReview.open({
        moves: ucis,
        white: g.white,
        black: g.black,
        title: "حرکات بازی‌شده",
        subtitle: g.white + " در برابر " + g.black + (g.opening ? " — " + g.opening : "") + (g.date ? " (" + g.date + ")" : ""),
        result: g.result,
      });
    };
    if (pgnCache.has(file)) {
      openWith(pgnCache.get(file));
      return;
    }
    if (el) el.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> در حال باز کردن بازی…';
    fetch("pgn/" + file)
      .then(function (r) {
        if (!r.ok) throw new Error("http");
        return r.text();
      })
      .then(function (txt) {
        const metas = parsePgnFile(txt);
        pgnCache.set(file, metas);
        openWith(metas);
        renderExplorer(); // بازگرداندن ردیف به حالت عادی
      })
      .catch(function () {
        toast("فایل PGN «" + file + "» باز نشد");
        renderExplorer();
      });
  }

  /* ============================================================
     پخش خودکار (شروع / Space)
     ============================================================ */
  function toggleAuto() {
    if (autoTimer) stopAuto();
    else startAuto();
  }
  function startAuto() {
    const node = nodeAt(cursor);
    if (!node.children.length) { toast("حرکتی برای پخش نیست — اول چند حرکت ثبت کن"); return; }
    $("anPlayBtn").classList.add("playing");
    $("anPlayBtn").innerHTML = '<i class="fas fa-pause"></i> توقف';
    autoTimer = setInterval(function () {
      if (!goNextMainline()) stopAuto();
    }, 1200);
    goNextMainline();
  }
  function stopAuto() {
    if (!autoTimer) return;
    clearInterval(autoTimer);
    autoTimer = null;
    const btn = $("anPlayBtn");
    if (btn) {
      btn.classList.remove("playing");
      btn.innerHTML = '<i class="fas fa-play"></i> شروع';
    }
  }

  /* ============================================================
     تخته
     ============================================================ */
  function buildBoard() {
    if (board) board.destroy();
    board = ChessBoardUI.create({
      boardEl: $("anBoard"),
      arrowsEl: $("anArrows"),
      getGame: function () { return game; },
      canMove: function () { return !branchDialogOpen; },
      userColor: function () { return game.turn(); },
      orientation: function () { return flipped ? "b" : "w"; },
      onAttempt: function (from, to, promo) {
        const mv = game.move({ from: from, to: to, promotion: promo || "q" });
        if (!mv) return false;
        const uci = mv.from + mv.to + (mv.promotion || "");
        const node = nodeAt(cursor);
        let idx = node.children.findIndex(function (c) { return c.uci === uci; });
        if (idx < 0) {
          // شاخهٔ جدید — بدون حذف چیزی، بدون پرسش
          node.children.push({ san: mv.san, uci: uci, children: [] });
          idx = node.children.length - 1;
        }
        cursor.push(idx);
        window.ChessHub && ChessHub.Sound && ChessHub.Sound.play("move");
        stopAuto();
        refreshGameObj();
        clearArrows();
        board.render({ lastMove: { from: mv.from, to: mv.to } });
        renderMoves();
        renderExplorer();
        engineLines = [];
        renderEngineLines();
        resetDepthUI();
        scheduleAnalysis();
        return true;
      },
    });
    board.build();
  }

  /* ============================================================
     بارگذاری FEN / PGN
     ============================================================ */
  function buildTreeFromSans(sans) {
    tree = { san: null, uci: null, children: [], startPly: 0 };
    cursor = [];
    let n = tree;
    const g = new Chess();
    for (let i = 0; i < sans.length; i++) {
      let mv = null;
      try { mv = g.move(sans[i]); } catch (e) { break; }
      if (!mv) break;
      const ch = { san: mv.san, uci: mv.from + mv.to + (mv.promotion || ""), children: [] };
      n.children.push(ch);
      n = ch;
    }
  }
  function loadFen(fen) {
    const g = new Chess();
    if (!g.load(fen)) return toast("FEN نامعتبر است");
    tree = {
      san: null, uci: null, children: [],
      startPly: (parseInt(g.fen().split(" ")[5] || "1", 10) - 1) * 2 + (g.fen().split(" ")[1] === "b" ? 1 : 0),
    };
    cursor = [];
    flipped = g.turn() === "b";
    buildBoard();
    afterNav();
    toast("موقعیت بارگذاری شد");
  }
  function loadPgnText(pgnText) {
    const g = new Chess();
    try {
      if (!g.load_pgn(pgnText)) return toast("PGN قابل خواندن نبود");
    } catch (e) {
      return toast("PGN قابل خواندن نبود");
    }
    const sans = g.history();
    if (!sans.length) return toast("حرکتی در PGN نیست");
    buildTreeFromSans(sans);
    flipped = false;
    buildBoard();
    afterNav();
    toast(fa(sans.length) + " حرکت از PGN بارگذاری شد");
  }

  /* ============================================================
     راه‌اندازی
     ============================================================ */
  async function init() {
    // اعمال تم
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (s && s.theme) document.body.classList.add("theme-" + s.theme);
    } catch (e) {}

    if (window.ChessUtils && ChessUtils.loadPieces) {
      try { await ChessUtils.loadPieces(); } catch (e) {}
    }
    window.ChessEngine.init();
    ChessEngine.onReady(function () {
      const chip = $("anEngineChip");
      if (chip) {
        chip.textContent = ChessEngine.label() || "انجین آماده";
        chip.classList.add(ChessEngine.kind() === "stored" ? "stored" : "");
      }
      engineStatus("انجین آماده است");
      if (live) scheduleAnalysis(60);
    });

    buildBoard();
    renderMoves();
    loadExplorer();

    // دکمه‌های نوار ابزار
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
    // کشیدن فایل PGN روی فهرست حرکات
    const movesBox = $("anMoves");
    ["dragover", "drop"].forEach(function (ev) {
      movesBox.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === "drop") {
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = function () { loadPgnText(String(rd.result || "")); };
          rd.readAsText(f);
        }
      });
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
      renderMoves();
      if (lastArrow) board.drawArrows([lastArrow]);
    });
    $("resetBtn").addEventListener("click", function () {
      tree = { san: null, uci: null, children: [], startPly: 0 };
      cursor = [];
      flipped = false;
      buildBoard();
      afterNav();
    });
    $("undoBtn").addEventListener("click", goPrev);

    $("navFirst").addEventListener("click", goFirst);
    $("navPrev").addEventListener("click", goPrev);
    $("navNext").addEventListener("click", goNext);
    $("navLast").addEventListener("click", goLast);
    $("anPlayBtn").addEventListener("click", toggleAuto);

    $("liveBtn").addEventListener("click", function () {
      live = !live;
      this.classList.toggle("on", live);
      this.innerHTML = live
        ? '<i class="fas fa-circle-play"></i> تحلیل زنده: روشن'
        : '<i class="fas fa-circle-pause"></i> تحلیل زنده: خاموش';
      if (live) scheduleAnalysis(40);
      else { analysisEpoch++; engineStatus("تحلیل زنده خاموش است"); }
    });
    $("reviewBtn").addEventListener("click", function () {
      const ucis = mainLineUcis();
      if (!ucis.length) return toast("اول چند حرکت بازی کن یا PGN بارگذاری کن");
      window.GameReview.open({
        moves: ucis,
        white: "سفید",
        black: "سیاه",
        title: "آنالیز ChessHub",
        subtitle: "مرور انجینی بازی",
        result: "*",
      });
    });

    $("anBranchCancel").addEventListener("click", closeBranchDialog);
    $("anBranchOv").addEventListener("click", function (e) {
      if (e.target === this) closeBranchDialog();
    });

    document.addEventListener("pieceSetChanged", function () {
      if (window.ChessUtils) ChessUtils.loadPieces().then(function () {
        buildBoard();
        board.render({});
        renderMoves();
      });
    });
    document.addEventListener("themeChanged", function () {
      buildBoard();
      board.render({});
    });

    // 🔑 کلیدها — در هر جای صفحه: ← جلو، → عقب، Space پخش
    document.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
      if (branchDialogOpen) {
        if (e.key === "Escape") { closeBranchDialog(); e.preventDefault(); }
        return;
      }
      if (e.key === "ArrowLeft") { goNext(); e.preventDefault(); }
      else if (e.key === "ArrowRight") { goPrev(); e.preventDefault(); }
      else if (e.key === " " || e.code === "Space") { toggleAuto(); e.preventDefault(); }
      else if (e.key === "Escape") hideCtx();
    });

    scheduleAnalysis(500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
