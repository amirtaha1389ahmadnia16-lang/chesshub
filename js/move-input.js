/* ============================================
   ♟ ChessHub | ورودی هوشمند حرکات (v8.3)
   --------------------------------------------
   دو نوع ورود برای همه‌ی فیلدهایی که به حرکت
   نیاز دارند (حرکات اصلی، حرکات واریانت، حرکات
   تله، حرکات PGN نمونه‌بازی‌ها):

     ۱) ورود با تخته — مهره‌ها را بزن یا بکش؛
        هر حرکت همان لحظه ثبت و PGN ساخته می‌شود
     ۲) ورود PGN — متن PGN را بچسبان؛ روی تخته
        نمایش داده می‌شود و ادامه‌اش می‌دهی

   دکمه‌های زیر تخته:
     • «شروع مجدد» — پاک‌کردن همه‌ی حرکات
     • «بازگشت به عقب» — حذف آخرین حرکت
       (e4 e6 → بازگشت → PGN فقط «e4» →
        حالا e5 بزنی → PGN می‌شود «e4 e5»)

   استفاده:
     ChessHubMoveInput.open({
       target: inputElement,   // فیلد مقصد
       mode:   "moves"|"pgn",  // خروجی: توکن‌های SAN یا متن PGN
       title:  "حرکات اصلی"
     });

   وابستگی: lib/chess.min.js (window.Chess)
             js/board-ui.js (window.ChessBoardUI)
             js/script.js (window.ChessUtils — اختیاری، برای ترفیع)
   ============================================ */
window.ChessHubMoveInput = (function () {
  "use strict";

  /* ---------------- استایل ---------------- */
  const CSS =
    ".chmi-overlay{position:fixed;inset:0;z-index:99000;display:none;align-items:center;justify-content:center;" +
    "background:rgba(15,20,40,.62);backdrop-filter:blur(3px);padding:1rem;font-family:inherit}" +
    ".chmi-overlay.open{display:flex}" +
    ".chmi-card{background:#fff;border-radius:20px;max-width:640px;width:100%;max-height:94vh;overflow-y:auto;" +
    "box-shadow:0 30px 80px rgba(0,0,0,.4);padding:1.1rem 1.2rem 1rem;box-sizing:border-box}" +
    ".chmi-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.7rem}" +
    ".chmi-title{font-weight:800;color:#17203a;font-size:1.02rem}" +
    ".chmi-close{border:none;background:#f1f0fa;color:#4c3f9e;width:34px;height:34px;border-radius:11px;" +
    "cursor:pointer;font-size:1rem}" +
    ".chmi-tabs{display:flex;background:#f1f0fa;border-radius:12px;padding:4px;margin-bottom:.8rem;gap:4px}" +
    ".chmi-tab{flex:1;padding:.55rem;border:none;background:transparent;border-radius:9px;cursor:pointer;" +
    "font-family:inherit;font-size:.84rem;font-weight:700;color:#6b7590}" +
    ".chmi-tab.active{background:#fff;color:#4c3f9e;box-shadow:0 2px 8px rgba(76,63,158,.15)}" +
    ".chmi-body{display:flex;gap:1rem;flex-wrap:wrap}" +
    ".chmi-boardcol{flex:0 0 300px;max-width:100%}" +
    ".chmi-board{display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:1;width:100%;direction:ltr;" +
    "border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.18);touch-action:none;" +
    "webkit-user-select:none;user-select:none}" +
    ".chmi-board .square{position:relative;display:flex;align-items:center;justify-content:center}" +
    ".chmi-board .square.light{background:#f0d9b5}" +
    ".chmi-board .square.dark{background:#b58863}" +
    ".chmi-board .square.last-move::after{content:'';position:absolute;inset:0;background:rgba(255,213,79,.5)}" +
    ".chmi-board .square.selected::after{content:'';position:absolute;inset:0;background:rgba(109,91,208,.45)}" +
    ".chmi-board .square.check::after{content:'';position:absolute;inset:0;background:radial-gradient(circle,rgba(229,57,53,.85) 15%,rgba(229,57,53,.25) 60%,transparent 72%)}" +
    ".chmi-board .square.dot::before{content:'';position:absolute;width:30%;height:30%;border-radius:50%;" +
    "background:rgba(20,20,20,.28);z-index:2}" +
    ".chmi-board .square.dot-capture::before{content:'';position:absolute;inset:6%;border-radius:50%;" +
    "border:4px solid rgba(20,20,20,.3);z-index:2;box-sizing:border-box}" +
    ".chmi-board .square.drag-over::after{content:'';position:absolute;inset:0;background:rgba(255,255,255,.35)}" +
    ".chmi-board .piece-img{width:92%;height:92%;object-fit:contain;pointer-events:none;z-index:1;" +
    "filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}" +
    ".chmi-board .piece-glyph{font-size:min(4.6vw,2rem);line-height:1;pointer-events:none;z-index:1}" +
    ".chmi-board .piece-glyph.w{color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7)}" +
    ".chmi-board .piece-glyph.b{color:#1a1a1a;text-shadow:0 1px 2px rgba(255,255,255,.35)}" +
    ".chmi-drag-ghost{position:fixed;z-index:100000;pointer-events:none;transform:translate(-50%,-50%);" +
    "display:flex;align-items:center;justify-content:center;opacity:.9}" +
    ".chmi-drag-ghost img{width:100%;height:100%;object-fit:contain}" +
    ".chmi-drag-ghost .piece-glyph{font-size:2rem}" +
    ".chmi-sidecol{flex:1;min-width:220px;display:flex;flex-direction:column;gap:.55rem}" +
    ".chmi-label{font-size:.76rem;font-weight:700;color:#17203a;margin-bottom:.15rem}" +
    ".chmi-history{background:#f7f7fc;border:1.5px solid #e3e7f0;border-radius:12px;padding:.5rem .7rem;" +
    "min-height:120px;max-height:170px;overflow-y:auto;font-size:.84rem;line-height:2;direction:ltr;" +
    "text-align:left;font-family:monospace;color:#333}" +
    ".chmi-history .chmi-turn{color:#4c3f9e;font-weight:800;margin-right:.35rem}" +
    ".chmi-pgnbox{background:#f7f7fc;border:1.5px solid #e3e7f0;border-radius:12px;padding:.5rem .7rem;" +
    "min-height:64px;max-height:110px;overflow-y:auto;font-size:.8rem;line-height:1.9;direction:ltr;" +
    "text-align:left;font-family:monospace;color:#333;word-break:break-word}" +
    ".chmi-btnrow{display:flex;gap:.5rem;margin-top:.15rem;flex-wrap:wrap}" +
    ".chmi-btn{flex:1;min-width:110px;padding:.6rem .5rem;border:none;border-radius:12px;cursor:pointer;" +
    "font-family:inherit;font-size:.83rem;font-weight:800;transition:transform .12s,opacity .15s}" +
    ".chmi-btn:hover:not(:disabled){transform:translateY(-1px)}" +
    ".chmi-btn:disabled{opacity:.4;cursor:not-allowed}" +
    ".chmi-btn.undo{background:#fff;color:#4c3f9e;border:1.5px solid #dcd4f7}" +
    ".chmi-btn.restart{background:#fff;color:#b3282d;border:1.5px solid #f6c9c9}" +
    ".chmi-btn.flip{background:#fff;color:#6b7590;border:1.5px solid #e3e7f0;min-width:80px;flex:0}" +
    ".chmi-btn.apply{background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;padding:.75rem}" +
    ".chmi-btn.cancel{background:#f1f0fa;color:#4c3f9e}" +
    ".chmi-pgntab{display:none;flex-direction:column;gap:.6rem}" +
    ".chmi-pgntab.show{display:flex}" +
    ".chmi-boardtab{display:none;flex-direction:column;gap:.6rem}" +
    ".chmi-boardtab.show{display:flex}" +
    ".chmi-pgntextarea{width:100%;box-sizing:border-box;min-height:130px;padding:.7rem .8rem;border:1.5px solid #e3e7f0;" +
    "border-radius:12px;font-family:monospace;font-size:.85rem;direction:ltr;text-align:left;resize:vertical;" +
    "outline:none;background:#fafbfe;color:#17203a;line-height:1.8}" +
    ".chmi-pgntextarea:focus{border-color:#6d5bd0;background:#fff}" +
    ".chmi-hint{font-size:.72rem;color:#9aa3b8;line-height:1.9}" +
    ".chmi-status{font-size:.78rem;line-height:1.9;min-height:1.3em}" +
    ".chmi-status.err{color:#e05252}.chmi-status.ok{color:#2f9e6e}" +
    "@media(max-width:560px){.chmi-boardcol{flex:1 1 100%}.chmi-card{padding:.9rem .8rem}}" +
    "@media(max-width:380px){.chmi-boardcol{flex:1 1 100%}}";

  function injectCSS() {
    if (document.getElementById("chmi-style")) return;
    const st = document.createElement("style");
    st.id = "chmi-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- ابزار ---------------- */
  function fmtHistory(sanList) {
    // «1. e4 e5  2. Nf3 Nf6 …» برای جعبه‌ی تاریخچه
    let out = "";
    for (let i = 0; i < sanList.length; i += 2) {
      const n = i / 2 + 1;
      out += '<span class="chmi-turn">' + n + ".</span> " + sanList[i] +
        (sanList[i + 1] ? " " + sanList[i + 1] : "") + "&nbsp;&nbsp;";
    }
    return out || "— هنوز حرکتی ثبت نشده —";
  }

  function numberedPGN(sanList, result) {
    let out = "";
    for (let i = 0; i < sanList.length; i += 2) {
      out += (i / 2 + 1) + ". " + sanList[i] + (sanList[i + 1] ? " " + sanList[i + 1] : "") + " ";
    }
    if (result && result !== "*") out += result;
    return out.trim();
  }

  /* ---------------- مودال ---------------- */
  let active = null; // {overlay, game, board, mode, target, orientation}

  function close() {
    if (!active) return;
    try { if (active.board && active.board.destroy) active.board.destroy(); } catch (e) {}
    if (active._pieceSetHandler) {
      document.removeEventListener("pieceSetChanged", active._pieceSetHandler);
      active._pieceSetHandler = null;
    }
    if (active.overlay) active.overlay.remove();
    document.body.style.overflow = "";
    active = null;
  }

  // ♟ مهره‌های دلخواه کاربر — تصاویر همان مجموعه‌ای که در تنظیمات انتخاب کرده
  // (قبلاً روی صفحه‌ی همکاری گلیف یونیکد نشان داده می‌شد چون تصاویر
  //  هیچ‌وقت پیش‌بارگذاری نمی‌شدند — اکنون با مجموعه‌ی انتخابی کاربر می‌آید)
  function ensureUserPieces(cb) {
    const U = window.ChessUtils;
    if (U && U.loadPieces) {
      try { U.loadPieces().then(function () { if (cb) cb(); }); return; } catch (e) {}
    }
    if (cb) cb();
  }

  function refreshUI() {
    if (!active) return;
    const san = active.game.history();
    active.el.history.innerHTML = fmtHistory(san);
    active.el.pgnPreview.textContent = numberedPGN(san, active.game.game_over() ? resultOf(active.game) : "");
    active.el.undoBtn.disabled = san.length === 0;
    active.el.restartBtn.disabled = san.length === 0 && active.game.fen() === "start";
    active.el.moveCount.textContent = san.length
      ? "تعداد حرکات: " + san.length
      : "از موقعیت شروع";
  }

  function resultOf(g) {
    if (g.in_checkmate()) return g.turn() === "w" ? "0-1" : "1-0";
    if (g.in_stalemate() || g.insufficient_material() || g.in_threefold_repetition() || g.in_draw())
      return "1/2-1/2";
    return "*";
  }

  function renderBoard() {
    if (active && active.board) active.board.render({ lastMove: lastMoveOf(active.game) });
  }
  function lastMoveOf(g) {
    const h = g.history({ verbose: true });
    return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  }

  function setTab(tab) {
    active.el.tabBoard.classList.toggle("active", tab === "board");
    active.el.tabPgn.classList.toggle("active", tab === "pgn");
    active.el.boardPane.classList.toggle("show", tab === "board");
    active.el.pgnPane.classList.toggle("show", tab === "pgn");
  }

  function open(opts) {
    opts = opts || {};
    if (!window.Chess) {
      alert("کتابخانه‌ی شطرنج بارگذاری نشده است — صفحه را دوباره باز کن");
      return;
    }
    if (active) close();
    injectCSS();

    const mode = opts.mode === "pgn" ? "pgn" : "moves";
    const title = opts.title || (mode === "pgn" ? "ورود حرکات PGN" : "ورود حرکات");
    const target = opts.target || null;

    const overlay = document.createElement("div");
    overlay.className = "chmi-overlay";
    overlay.innerHTML =
      '<div class="chmi-card" role="dialog" aria-modal="true">' +
      '<div class="chmi-head"><div class="chmi-title">♟ ' + escapeHTML(title) + "</div>" +
      '<button class="chmi-close" type="button" title="بستن">✕</button></div>' +
      '<div class="chmi-tabs">' +
      '<button class="chmi-tab active" id="chmiTabBoard" type="button">♟ ورود با تخته</button>' +
      '<button class="chmi-tab" id="chmiTabPgn" type="button">📋 ورود PGN</button>' +
      "</div>" +
      '<div class="chmi-status" id="chmiStatus"></div>' +
      // ===== تب تخته =====
      '<div class="chmi-boardtab show" id="chmiBoardPane">' +
      '<div class="chmi-body">' +
      '<div class="chmi-boardcol"><div class="chmi-board" id="chmiBoard"></div></div>' +
      '<div class="chmi-sidecol">' +
      '<div><div class="chmi-label">حرکات ثبت‌شده</div><div class="chmi-history" id="chmiHistory"></div></div>' +
      '<div><div class="chmi-label">PGN ساخته‌شده</div><div class="chmi-pgnbox" id="chmiPgnPreview"></div></div>' +
      '<div class="chmi-hint" id="chmiMoveCount"></div>' +
      "</div></div>" +
      '<div class="chmi-btnrow">' +
      '<button class="chmi-btn undo" id="chmiUndo" type="button">↩️ بازگشت به عقب</button>' +
      '<button class="chmi-btn restart" id="chmiRestart" type="button">🔄 شروع مجدد</button>' +
      '<button class="chmi-btn flip" id="chmiFlip" type="button" title="چرخش تخته">⟳</button>' +
      "</div>" +
      '<div class="chmi-hint">مهره را بزن یا بکش — هر حرکت خودکار ثبت و PGN ساخته می‌شود. با «بازگشت به عقب» آخرین حرکت حذف و از همان‌جا ادامه می‌دهی.</div>' +
      "</div>" +
      // ===== تب PGN =====
      '<div class="chmi-pgntab" id="chmiPgnPane">' +
      '<div class="chmi-label">متن PGN را اینجا بچسبان (با یا بدون شماره‌ی حرکات):</div>' +
      '<textarea class="chmi-pgntextarea" id="chmiPgnText" placeholder="مثلاً:&#10;1. e4 e5 2. Nf3 Nc6 3. Bb5 a6&#10;یا: e4 c5 Nf3 d6"></textarea>' +
      '<div class="chmi-btnrow"><button class="chmi-btn undo" id="chmiPgnLoad" type="button" style="background:#eef8f2;color:#23684a;border-color:#cde8d8">📥 نمایش روی تخته و ادامه</button></div>' +
      '<div class="chmi-hint">اگر بخشی از متن مشکل داشته باشد، تا همان‌جا که معتبر است روی تخته می‌آید و ادامه را با تخته می‌زنی. خروجی نهایی به‌صورت PGN مرتب در می‌آید.</div>' +
      "</div>" +
      // ===== دکمه‌های پایانی =====
      '<div class="chmi-btnrow" style="margin-top:.9rem">' +
      '<button class="chmi-btn apply" id="chmiApply" type="button">✅ اعمال و بستن</button>' +
      '<button class="chmi-btn cancel" id="chmiCancel" type="button">انصراف</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    const el = {
      tabBoard: overlay.querySelector("#chmiTabBoard"),
      tabPgn: overlay.querySelector("#chmiTabPgn"),
      boardPane: overlay.querySelector("#chmiBoardPane"),
      pgnPane: overlay.querySelector("#chmiPgnPane"),
      boardEl: overlay.querySelector("#chmiBoard"),
      history: overlay.querySelector("#chmiHistory"),
      pgnPreview: overlay.querySelector("#chmiPgnPreview"),
      moveCount: overlay.querySelector("#chmiMoveCount"),
      undoBtn: overlay.querySelector("#chmiUndo"),
      restartBtn: overlay.querySelector("#chmiRestart"),
      status: overlay.querySelector("#chmiStatus"),
      pgnText: overlay.querySelector("#chmiPgnText"),
      closeBtn: overlay.querySelector(".chmi-close"),
    };

    active = { overlay: overlay, el: el, mode: mode, target: target, orientation: "w" };
    active.game = new window.Chess();

    // ---------- تخته ----------
    if (window.ChessBoardUI) {
      active.board = window.ChessBoardUI.create({
        boardEl: el.boardEl,
        getGame: function () { return active.game; },
        canMove: function () { return !!active; },
        userColor: function () { return active.game.turn(); }, // هر دو طرف قابل ورود
        orientation: function () { return active.orientation; },
        onAttempt: function (from, to, promo) {
          const mv = active.game.move({ from: from, to: to, promotion: promo || "q" });
          if (!mv) return false;
          refreshUI();
          renderBoard();
          return true;
        },
        autoQueen: false, // ترفیع پرسیده می‌شود (برای تله‌ها مهم است)
      });
      active.board.build();
      // ♟ مهره‌های دلخواه کاربر — بعد از آماده‌شدن تصاویر، تخته با همان مجموعه بازسازی می‌شود
      ensureUserPieces(function () {
        if (active && active.board) { active.board.build(); renderBoard(); }
      });
      // تغییر مجموعه مهره در حین باز بودن مودال → بازسازی زنده
      active._pieceSetHandler = function () {
        ensureUserPieces(function () {
          if (active && active.board) { active.board.build(); renderBoard(); }
        });
      };
      document.addEventListener("pieceSetChanged", active._pieceSetHandler);
    } else {
      el.boardEl.innerHTML =
        '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;padding:1rem;color:#b3282d;font-size:.8rem">js/board-ui.js بارگذاری نشده است</div>';
    }

    // ---------- پیش‌فرض از خود فیلد ----------
    const initial = target ? String(target.value || "").trim() : "";
    if (initial) {
      let loaded = 0;
      if (mode === "pgn") {
        loaded = loadPgnSloppy(active.game, initial);
      } else {
        const tokens = initial.split(/[\s,]+/).filter(Boolean);
        loaded = loadSanTokens(active.game, tokens);
      }
      if (loaded > 0) setStatus("✅ " + loaded + " حرکت از فیلد بارگذاری شد — می‌توانی ادامه بدهی", "ok");
      else setStatus("⚠️ حرکات قبلی خوانده نشد — از صفر شروع کن یا در تب PGN اصلاح کن", "err");
    }

    // ---------- رویدادها ----------
    el.tabBoard.addEventListener("click", function () { setTab("board"); });
    el.tabPgn.addEventListener("click", function () { setTab("pgn"); });
    el.closeBtn.addEventListener("click", close);
    el.undoBtn.addEventListener("click", function () {
      const mv = active.game.undo();
      if (!mv) return;
      setStatus("↩️ حرکت «" + mv.san + "» حذف شد — از همان‌جا ادامه بده", "ok");
      refreshUI();
      renderBoard();
    });
    el.restartBtn.addEventListener("click", function () {
      if (active.game.history().length && !confirm("همه‌ی حرکات پاک شود؟")) return;
      active.game.reset();
      setStatus("🔄 تخته از اول شروع شد", "ok");
      refreshUI();
      renderBoard();
    });
    overlay.querySelector("#chmiFlip").addEventListener("click", function () {
      active.orientation = active.orientation === "w" ? "b" : "w";
      if (active.board) active.board.build();
    });
    overlay.querySelector("#chmiPgnLoad").addEventListener("click", function () {
      const txt = el.pgnText.value || "";
      if (!txt.trim()) { setStatus("اول متن PGN را بنویس یا بچسبان", "err"); return; }
      const g = new window.Chess();
      const n = loadPgnSloppy(g, txt);
      if (!n) {
        setStatus("❌ هیچ حرکت معتبری در متن پیدا نشد", "err");
        return;
      }
      active.game = g;
      if (active.board) active.board.build();
      refreshUI();
      renderBoard();
      setTab("board");
      setStatus("✅ " + n + " حرکت روی تخته آمد — ادامه را با تخته بزن", "ok");
    });
    el.pgnText.addEventListener("input", function () { setStatus("", ""); });
    overlay.querySelector("#chmiApply").addEventListener("click", function () {
      const san = active.game.history();
      if (!san.length) { setStatus("حداقل یک حرکت بزن یا متن PGN را بارگذاری کن", "err"); return; }
      let out;
      if (active.mode === "pgn") {
        out = numberedPGN(san, active.game.game_over() ? resultOf(active.game) : "");
      } else {
        out = san.join(" ");
      }
      if (active.target) {
        active.target.value = out;
        try { active.target.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        try { active.target.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      close();
    });
    overlay.querySelector("#chmiCancel").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", escListener);

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setTab("board");
    refreshUI();
  }

  function escListener(e) {
    if (e.key === "Escape" && active) close();
  }

  function setStatus(msg, type) {
    if (!active) return;
    active.el.status.textContent = msg;
    active.el.status.className = "chmi-status " + (type || "");
  }

  function escapeHTML(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- بارگذاری بخش‌بخش (خطا-پذیر) ---------------- */

  // توکن‌های SAN را تا جایی که قانونی‌اند اعمال می‌کند؛ تعداد موفق برمی‌گرداند
  function loadSanTokens(g, tokens) {
    let n = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = cleanToken(tokens[i]);
      if (!t) continue;
      let mv = null;
      try { mv = g.move(t, { sloppy: true }); } catch (e) { mv = null; }
      if (!mv) break;
      n++;
    }
    return n;
  }

  // PGN (با هدر یا بدون هدر) را تا جایی که معتبر است می‌خواند
  function loadPgnSloppy(g, text) {
    const before = g.history().length;
    let ok = false;
    try { ok = g.load_pgn(String(text), { sloppy: true }); } catch (e) { ok = false; }
    if (ok) return g.history().length - before;
    // ⚠️ chess.js ممکن است تا نیمه راه اعمال کرده باشد — وضعیت را پاک کن
    if (g.history().length > before) g.reset();
    // فالبک: فقط توکن‌های حرکت‌نما را جدا کن و تا جای ممکن اعمال کن
    const tokens = String(text)
      .replace(/\[[^\]]*\]/g, " ") // هدرها
      .replace(/\{[^}]*\}/g, " ") // کامنت‌ها
      .replace(/\([^)]*\)/g, " ") // واریانت‌های داخل پرانتز
      .replace(/\d+\.(\.\.)?/g, " ") // شماره حرکات
      .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, " ")
      .split(/[\s,;]+/)
      .filter(Boolean);
    return loadSanTokens(g, tokens);
  }

  function cleanToken(t) {
    t = String(t || "").trim();
    if (!t) return "";
    t = t.replace(/^\d+\.(\.\.)?/, "").replace(/[!?]+$/, "").replace(/^\(|\)$/g, "");
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) return "";
    return t;
  }

  /* ---------------- API ---------------- */
  return {
    open: open,
    close: close,
    isOpen: function () { return !!active; },
    _test: {
      numberedPGN: numberedPGN,
      fmtHistory: fmtHistory,
      cleanToken: cleanToken,
      loadSanTokens: loadSanTokens,
      loadPgnSloppy: loadPgnSloppy,
    },
  };
})();
