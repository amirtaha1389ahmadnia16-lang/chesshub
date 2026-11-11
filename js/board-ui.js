/* ============================================================
   ♛ ChessHub — مؤلفه‌ی مشترک تخته شطرنج (ChessBoardUI)
   ------------------------------------------------------------
   همان سیستم تعاملی بی‌باگ «مسئله روز / آخربازی» که با Pointer
   Events روی همه‌ی دستگاه‌ها کار می‌کند:
     • یک ژست در هر لحظه (چندلمسی گیرکردن مهره می‌ساخت)
     • pointercancel و blur → پاک‌سازی کامل (مهره‌ی معلق نمی‌ماند)
     • آستانه‌ی ۶ پیکسل → تپ ساده هرگز گوست نمی‌سازد
     • pointerId چک می‌شود تا انگشت دوم رویدادهای اول را خراب نکند
     • مودال ترفیع مشترک سایت (ChessUtils.showPromotion)

   استفاده:
     const B = ChessBoardUI.create({
       boardEl:    $("#board"),          // اجباری
       arrowsEl:   svgEl,                // اختیاری — فلش SVG
       getGame:    () => game,           // chess.js فعلی
       canMove:    () => bool,           // آیا کاربر مجاز به حرکت است
       userColor:  () => "w"|"b",
       orientation:() => "w"|"b",        // پیش‌فرض userColor
       onAttempt:  (from,to,promo) => bool,  // حرکت را اعمال کن؛ true=موفق
       autoQueen:  false                 // true = بدون پرسش وزیر
     });
     B.build(); B.render({lastMove:{from,to}});
     B.drawArrows([{from,to,color}]); B.clearArrows();
     B.clearSelection(); B.destroy();
   ============================================================ */
(function () {
  "use strict";

  function create(opts) {
    const boardEl = opts.boardEl;
    if (!boardEl) throw new Error("ChessBoardUI: boardEl الزامی است");
    const arrowsEl = opts.arrowsEl || null;

    // 🔑 گارانتی درگ روی همه دستگاه‌ها (موبایل/ویندوز/تبلت):
    // لمسِ شروع‌شده روی تخته هرگز نباید به اسکرول یا زوم صفحه تبدیل شود —
    // وگرنه مرورگر pointercancel می‌فرستد و کشیدن مهره نصفه قطع می‌شود.
    // این استایل‌ها مستقل از CSS صفحه، مستقیم روی خود تخته اعمال می‌شوند.
    try {
      boardEl.style.touchAction = "none";
      boardEl.style.webkitUserSelect = "none";
      boardEl.style.userSelect = "none";
      boardEl.style.webkitTouchCallout = "none";
      boardEl.style.webkitTapHighlightColor = "transparent";
    } catch (e) {}

    const S = {
      squares: {},        // squareName → div
      press: null,        // ژست فعال
      selected: null,
      lastMove: null,
      flipped: false,
      destroyed: false,
      prevPieces: null,   // نقشهٔ مهره‌ها در رندر قبلی (برای انیمیشن)
    };

    function game() { return opts.getGame ? opts.getGame() : null; }
    function userColor() {
      const g = game();
      const c = opts.userColor ? opts.userColor() : null;
      if (c === "w" || c === "b") return c;
      return g ? g.turn() : "w";
    }
    function orientation() {
      const o = opts.orientation ? opts.orientation() : null;
      if (o === "w" || o === "b") return o;
      return userColor();
    }
    function canMove() { return !!(opts.canMove && opts.canMove()); }

    /* ---------- مهره‌ها ---------- */
    function makePieceEl(color, type) {
      const key = color + type;
      const cached = window.ChessUtils && ChessUtils.getPieceImage
        ? ChessUtils.getPieceImage(key) : null;
      if (cached) {
        const img = document.createElement("img");
        img.src = cached.src;
        img.className = "piece-img";
        img.alt = "";
        img.draggable = false;
        return img;
      }
      const span = document.createElement("span");
      span.className = "piece-glyph " + color;
      span.textContent = (window.ChessUtils && ChessUtils.GLYPHS && ChessUtils.GLYPHS[type]) ||
        (window.ChessHub && ChessHub.ChessUtils && ChessHub.ChessUtils.GLYPHS
          ? ChessHub.ChessUtils.GLYPHS[type] : "?");
      return span;
    }

    /* ---------- ساخت / رندر ---------- */
    function build() {
      S.flipped = orientation() === "b";
      boardEl.innerHTML = "";
      S.squares = {};
      S.prevPieces = null; // ساخت تازه — بدون انیمیشن
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
      const fOrder = S.flipped ? [...files].reverse() : files;
      const rOrder = S.flipped ? [...ranks].reverse() : ranks;
      rOrder.forEach(function (r) {
        fOrder.forEach(function (f) {
          const sq = f + r;
          const isLight = (files.indexOf(f) + r) % 2 === 0;
          const d = document.createElement("div");
          d.className = "square " + (isLight ? "light" : "dark");
          d.dataset.square = sq;
          boardEl.appendChild(d);
          S.squares[sq] = d;
        });
      });
      render({});
    }

    /* ---------- انیمیشن نرم حرکت مهره‌ها (FLIP) ----------
       مهره در خانهٔ مقصد ساخته می‌شود، از مختصات خانهٔ مبدأ با
       transition ۲۴۰ms (cubic-bezier ease-out) به جایش می‌لغزد.
       برای همهٔ حرکات: معمولی، کیش، قلعه (شاه+رخ)، آن‌پاسان، ارتقا. */
    function animatePieces(prev, now, els) {
      const br = boardEl.getBoundingClientRect();
      const sources = Object.keys(prev).filter(function (sq) {
        return now[sq] !== prev[sq];
      });
      if (sources.length > 4) return; // جابجایی عظیم = انیمیشن لازم نیست
      Object.keys(now).forEach(function (sq) {
        if (prev[sq] === now[sq]) return;
        const key = now[sq];
        let best = null, bestD = Infinity;
        sources.forEach(function (from) {
          if (prev[from] !== key) return;
          const fe = S.squares[from];
          const te = S.squares[sq];
          if (!fe || !te) return;
          const fr = fe.getBoundingClientRect();
          const tr = te.getBoundingClientRect();
          const d = Math.abs(fr.left - tr.left) + Math.abs(fr.top - tr.top);
          if (d < bestD) { bestD = d; best = fe; }
        });
        // ارتقا: پیادهٔ هم‌رنگ از همان مبدأ بلغزد و وزیر/رخ/... بنشیند
        if (!best) {
          const color = key[0];
          const promoFrom = sources.filter(function (from) {
            return prev[from] === color + "p";
          });
          if (promoFrom.length === 1) best = S.squares[promoFrom[0]];
        }
        if (!best) return;
        const el = els[sq];
        if (!el || !el.style) return;
        const sqEl = el.parentNode;
        if (!sqEl || !sqEl.getBoundingClientRect) return;
        const fromR = best.getBoundingClientRect();
        const toR = sqEl.getBoundingClientRect();
        const dx = fromR.left - toR.left;
        const dy = fromR.top - toR.top;
        if (!dx && !dy) return;
        el.classList.add("piece-anim");
        el.style.transition = "none";
        el.style.transform = "translate(" + dx + "px," + dy + "px)";
        void el.offsetWidth; // reflow — نقطهٔ شروع
        el.style.transition = "";
        requestAnimationFrame(function () {
          el.style.transform = "";
          setTimeout(function () {
            el.classList.remove("piece-anim");
            el.style.transform = "";
          }, 320);
        });
      });
    }

    function render(x) {
      x = x || {};
      if (x.lastMove !== undefined) S.lastMove = x.lastMove;
      const g = game();
      if (!g) return;
      if (orientation() === "b" !== S.flipped) {
        // جهت عوض شده — بازسازی
        S.flipped = orientation() === "b";
        build();
        return;
      }
      const board = g.board();
      const prev = S.prevPieces;
      const canAnimate =
        x.animate !== false && !!prev && !S.press && !S.destroyed;
      const legal = {};
      if (S.selected && canMove()) {
        g.moves({ square: S.selected, verbose: true }).forEach(function (m) {
          if (!legal[m.to]) legal[m.to] = m.captured ? "capture" : "move";
        });
      }
      const nowMap = {};
      const newEls = {};
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = "abcdefgh"[f] + (8 - r);
          const el = S.squares[sq];
          if (!el) continue;
          const p = board[r][f];
          el.innerHTML = "";
          el.classList.remove(
            "selected", "dot", "dot-capture", "last-move",
            "check", "drag-over", "dragging"
          );
          if (p) {
            const key = p.color + p.type;
            nowMap[sq] = key;
            const pieceEl = makePieceEl(p.color, p.type);
            el.appendChild(pieceEl);
            newEls[sq] = pieceEl;
          }
        }
      }
      // انیمیشن نرم — فقط برای رندرهای عادی (نه درگ/ساخت اولیه)
      if (canAnimate) animatePieces(prev, nowMap, newEls);
      S.prevPieces = nowMap;
      if (S.lastMove) {
        if (S.squares[S.lastMove.from]) S.squares[S.lastMove.from].classList.add("last-move");
        if (S.squares[S.lastMove.to]) S.squares[S.lastMove.to].classList.add("last-move");
      }
      if (S.selected && S.squares[S.selected]) S.squares[S.selected].classList.add("selected");
      Object.keys(legal).forEach(function (sq) {
        if (S.squares[sq]) S.squares[sq].classList.add(legal[sq] === "capture" ? "dot-capture" : "dot");
      });
      if (g.in_check && g.in_check()) {
        const turn = g.turn();
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const p = board[r][f];
            if (p && p.type === "k" && p.color === turn) {
              const el = S.squares["abcdefgh"[f] + (8 - r)];
              if (el) el.classList.add("check");
            }
          }
        }
      }
      if (x.selected !== undefined) { /* رندر با انتخاب بیرونی */ }
    }

    /* ---------- فلش‌ها (SVG) ---------- */
    function squareToXY(name) {
      let file = name.charCodeAt(0) - 97;
      let rank = parseInt(name[1], 10) - 1;
      if (S.flipped) { file = 7 - file; rank = 7 - rank; }
      return { x: (file + 0.5) * 12.5, y: (7 - rank + 0.5) * 12.5 };
    }
    function clearArrows() {
      if (!arrowsEl) return;
      arrowsEl.innerHTML =
        '<defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto">' +
        '<path d="M0,0 L4,2 L0,4 z" fill="context-stroke"></path></marker></defs>';
    }
    function drawArrows(arrows) {
      if (!arrowsEl) return;
      clearArrows();
      (arrows || []).forEach(function (a) {
        const p1 = squareToXY(a.from);
        const p2 = squareToXY(a.to);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const x1 = p1.x + (dx / len) * 2.6, y1 = p1.y + (dy / len) * 2.6;
        const x2 = p2.x - (dx / len) * 2.2, y2 = p2.y - (dy / len) * 2.2;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1); line.setAttribute("y1", y1);
        line.setAttribute("x2", x2); line.setAttribute("y2", y2);
        line.setAttribute("stroke", a.color || "#38a169");
        line.setAttribute("stroke-width", "1.9");
        line.setAttribute("class", "arrow-line");
        line.setAttribute("marker-end", "url(#ah)");
        line.setAttribute("opacity", "0.88");
        arrowsEl.appendChild(line);
      });
    }

    /* ---------- ترفیع ---------- */
    function needsPromotion(from, to) {
      const g = game();
      if (!g) return false;
      const piece = g.get(from);
      if (!piece || piece.type !== "p") return false;
      if (to[1] !== "8" && to[1] !== "1") return false;
      return g.moves({ square: from, verbose: true }).some(function (m) {
        return m.to === to && m.promotion;
      });
    }

    function attempt(from, to) {
      if (!canMove() || S.destroyed) return;
      const g = game();
      if (!g) return;
      if (from === to) return;
      if (!g.moves({ square: from, verbose: true }).some(function (m) { return m.to === to; })) {
        // غیرمجاز — فقط برگشت بصری
        S.selected = null;
        render({});
        return;
      }
      const promoOpts = g.moves({ square: from, verbose: true }).filter(function (m) {
        return m.to === to && m.promotion;
      });
      const fire = function (letter) {
        const ok = opts.onAttempt(from, to, letter || "q");
        if (ok) {
          S.selected = null;
        } else {
          S.selected = null;
        }
        render({});
      };
      if (promoOpts.length && !opts.autoQueen) {
        const col = g.get(from).color;
        if (window.ChessUtils && ChessUtils.showPromotion) {
          ChessUtils.showPromotion(col, fire);
        } else fire("q");
      } else {
        fire(opts.autoQueen ? "q" : (promoOpts[0] ? promoOpts[0].promotion : "q"));
      }
    }

    /* ---------- تعامل Pointer ---------- */
    function squareAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const sq = el && el.closest ? el.closest(".square") : null;
      return sq && boardEl.contains(sq) && sq.dataset ? sq.dataset.square : null;
    }
    function createGhost(fromSq) {
      const el = S.squares[fromSq];
      if (!el) return null;
      const piece = el.querySelector(".piece-img") || el.querySelector(".piece-glyph");
      if (!piece) return null;
      const rect = el.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.style.left = rect.left + rect.width / 2 + "px";
      ghost.style.top = rect.top + rect.height / 2 + "px";
      const clone = piece.cloneNode(true);
      if (clone.classList && clone.classList.contains("piece-glyph")) {
        clone.style.fontSize = getComputedStyle(piece).fontSize;
      }
      ghost.appendChild(clone);
      document.body.appendChild(ghost);
      return ghost;
    }
    function cleanupDrag(p) {
      if (p && p.ghost) { p.ghost.remove(); p.ghost = null; }
      boardEl.querySelectorAll(".dragging, .drag-over").forEach(function (el) {
        el.classList.remove("dragging", "drag-over");
      });
      boardEl.classList.remove("dragging-active");
    }
    function cancelPress() {
      if (S.press) { cleanupDrag(S.press); S.press = null; }
      document.body.style.userSelect = "";
    }

    function onSquareTap(sq) {
      if (!canMove()) return;
      const g = game();
      if (!g) return;
      if (S.selected === sq) {
        S.selected = null;
      } else if (S.selected && g.moves({ square: S.selected, verbose: true }).some(function (m) { return m.to === sq; })) {
        const from = S.selected;
        S.selected = null;
        attempt(from, sq);
        return;
      } else {
        const piece = g.get(sq);
        S.selected = piece && piece.color === userColor() ? sq : null;
      }
      render({});
    }

    function onPointerDown(e) {
      if (S.press || S.destroyed) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const sqEl = e.target && e.target.closest ? e.target.closest(".square") : null;
      if (!sqEl || !boardEl.contains(sqEl)) return;
      const sq = sqEl.dataset ? sqEl.dataset.square : null;
      if (!sq) return;

      S.press = {
        pointerId: e.pointerId,
        from: sq,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        consumed: false,
        ghost: null,
        overSq: null,
      };

      // سبک لایچس: تپ روی مقصد مجاز با انتخاب فعال = حرکت فوری
      const g = game();
      if (canMove() && g && S.selected && S.selected !== sq &&
          g.moves({ square: S.selected, verbose: true }).some(function (m) { return m.to === sq; })) {
        S.press.consumed = true;
        const from = S.selected;
        S.selected = null;
        attempt(from, sq);
        return;
      }
      e.preventDefault();
      document.body.style.userSelect = "none";
    }

    function onPointerMove(e) {
      const p = S.press;
      if (!p || e.pointerId !== p.pointerId || p.consumed || S.destroyed) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (!p.dragging) {
        if (dx * dx + dy * dy < 36) return; // آستانه ۶ پیکسل
        const g = game();
        const piece = g && g.get(p.from);
        if (!piece || !canMove() || piece.color !== userColor()) return;
        p.dragging = true;
        S.selected = p.from;
        render({});
        const srcEl = S.squares[p.from];
        if (srcEl) srcEl.classList.add("dragging");
        boardEl.classList.add("dragging-active");
        p.ghost = createGhost(p.from);
      }
      e.preventDefault();
      if (p.ghost) {
        p.ghost.style.left = e.clientX + "px";
        p.ghost.style.top = e.clientY + "px";
        const over = squareAt(e.clientX, e.clientY);
        if (over !== p.overSq) {
          if (p.overSq && S.squares[p.overSq]) S.squares[p.overSq].classList.remove("drag-over");
          p.overSq = over;
          const g = game();
          if (over && S.squares[over] && g &&
              g.moves({ square: p.from, verbose: true }).some(function (m) { return m.to === over; })) {
            S.squares[over].classList.add("drag-over");
          }
        }
      }
    }

    function onPointerUp(e) {
      const p = S.press;
      if (!p || e.pointerId !== p.pointerId || S.destroyed) return;
      S.press = null;
      document.body.style.userSelect = "";
      if (p.consumed) { cleanupDrag(p); return; }
      if (p.dragging) {
        const from = p.from;
        const to = squareAt(e.clientX, e.clientY);
        cleanupDrag(p);
        if (to && to !== from) {
          attempt(from, to);
        } else {
          render({});
        }
        return;
      }
      onSquareTap(p.from);
    }

    function onPointerCancel(e) {
      const p = S.press;
      if (!p) return;
      if (e && e.pointerId !== undefined && e.pointerId !== p.pointerId) return;
      S.press = null;
      document.body.style.userSelect = "";
      cleanupDrag(p);
      render({});
    }

    if (window.PointerEvent) {
      boardEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("blur", function () { onPointerCancel(); });
    } else {
      boardEl.addEventListener("click", function (e) {
        const sqEl = e.target && e.target.closest ? e.target.closest(".square") : null;
        if (sqEl && sqEl.dataset.square) onSquareTap(sqEl.dataset.square);
      });
    }
    boardEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    clearArrows();

    return {
      build: build,
      render: render,
      redraw: function () { build(); },
      setOrientation: function () { build(); },
      clearSelection: function () { S.selected = null; render({}); },
      select: function (sq) { S.selected = sq; render({}); },
      drawArrows: drawArrows,
      clearArrows: clearArrows,
      setSelectedExternal: function (sq) { S.selected = sq; },
      destroy: function () {
        S.destroyed = true;
        cancelPress();
      },
    };
  }

  window.ChessBoardUI = { create: create };
})();
