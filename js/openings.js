// openings.js – دانشنامه گشایش‌ها (همراه با تخته و نمایش تعاملی)

(function () {
  "use strict";

  // ============================================
  // 📦 استفاده از ChessUtils (در صورت وجود)
  // ============================================
  const { pieceCodes, getCurrentPieceSet, loadPieces, getBoardColors } =
    window.ChessUtilsBound || {
      pieceCodes: {
        wk: "wk.png",
        wq: "wq.png",
        wr: "wr.png",
        wb: "wb.png",
        wn: "wn.png",
        wp: "wp.png",
        bk: "bk.png",
        bq: "bq.png",
        br: "br.png",
        bb: "bb.png",
        bn: "bn.png",
        bp: "bp.png",
      },
      getCurrentPieceSet: function () {
        try {
          const s = JSON.parse(localStorage.getItem("chesshub_settings"));
          return s?.pieceSet || "neo";
        } catch {
          return "neo";
        }
      },
      loadPieces: function () {
        return Promise.resolve();
      },
      getBoardColors: function () {
        const root = document.documentElement;
        const light =
          getComputedStyle(root).getPropertyValue("--board-light").trim() ||
          "#f0d9b5";
        const dark =
          getComputedStyle(root).getPropertyValue("--board-dark").trim() ||
          "#b58863";
        return { light, dark };
      },
    };

  // ============================================
  // 📦 متغیرها
  // ============================================
  let openingsData = { categories: [] };
  let currentFilter = "all";
  let viewStack = [];
  let currentMoves = [];
  let currentMoveIndex = 0;
  let autoInterval = null;
  let piecesLoaded = false;
  let pieceImages = {};

  // ============================================
  // 🖼️ بارگذاری مهره‌ها
  // ============================================
  function loadPiecesLocal() {
    if (piecesLoaded) return Promise.resolve();
    return new Promise((resolve) => {
      const set = getCurrentPieceSet();
      let loaded = 0,
        total = Object.keys(pieceCodes).length;
      for (const [key, filename] of Object.entries(pieceCodes)) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) {
            piecesLoaded = true;
            resolve();
          }
        };
        img.src = `pieces/${set}/${filename}`;
        pieceImages[key] = img;
      }
    });
  }

  // ============================================
  // 📥 بارگذاری داده‌ها
  // ============================================
  async function loadOpeningsJSON() {
    try {
      const res = await fetch("data/openings.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      openingsData = await res.json();
      renderList();
    } catch (err) {
      console.error(err);
      const container = document.getElementById("openingsList");
      if (container) {
        container.innerHTML = `
          <div class="no-result"><i class="fas fa-exclamation-circle"></i> خطا در بارگذاری دیتابیس گشایش‌ها.</div>
        `;
      }
    }
  }

  // ============================================
  // 🎨 رندر لیست گشایش‌ها
  // ============================================
  function renderList() {
    const container = document.getElementById("openingsList");
    let categories = openingsData.categories || [];
    const query =
      document.getElementById("searchInput")?.value.trim().toLowerCase() || "";

    if (currentFilter !== "all") {
      categories = categories.filter((c) => c.code === currentFilter);
    }
    if (query) {
      categories = categories
        .map((cat) => ({
          ...cat,
          openings: cat.openings.filter(
            (op) =>
              op.name.toLowerCase().includes(query) ||
              (op.variants &&
                op.variants.some((v) => v.name.toLowerCase().includes(query))),
          ),
        }))
        .filter((cat) => cat.openings.length > 0);
    }

    if (!categories.length) {
      container.innerHTML =
        '<div class="no-result"><i class="fas fa-search"></i> گشایشی با این مشخصات یافت نشد.</div>';
      return;
    }

    container.innerHTML = "";
    categories.forEach((cat) => {
      cat.openings.forEach((opening) => {
        const card = document.createElement("div");
        card.className = "opening-card";
        const movesDisplay = opening.moves ? opening.moves.join(" ") : "...";

        card.innerHTML = `
          <div class="card-header">
            <div class="card-title">
              <i class="fas fa-chess-queen"></i>
              <span>${opening.name}</span>
            </div>
            <span class="card-moves" dir="ltr">${movesDisplay}</span>
            <i class="fas fa-chevron-down chevron"></i>
          </div>
          <div class="card-body">
            ${
              opening.variants && opening.variants.length
                ? `
              <div class="variants-grid">
                ${opening.variants
                  .map(
                    (v) => `
                  <div class="variant-item" data-name="${v.name}">
                    <span><i class="fas fa-code-branch"></i> ${v.name}</span>
                    <span class="variant-moves-preview">${v.moves.slice(0, 2).join(" ")}..</span>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            `
                : '<div style="padding:1rem;color:#5f7f9e;"><i class="fas fa-info-circle"></i> بدون واریانت</div>'
            }
          </div>
        `;

        container.appendChild(card);

        const header = card.querySelector(".card-header");
        const body = card.querySelector(".card-body");
        const chevron = header.querySelector(".chevron");

        header.addEventListener("click", function (e) {
          if (e.target.closest(".variant-item")) return;
          const isOpen = body.classList.toggle("open");
          chevron.classList.toggle("open");
          header.classList.toggle("expanded", isOpen);
        });

        card.querySelectorAll(".variant-item").forEach((item) => {
          item.addEventListener("click", (e) => {
            e.stopPropagation();
            const variant = opening.variants.find(
              (v) => v.name === item.dataset.name,
            );
            if (variant) openVariantView(variant, opening.name);
          });
        });
      });
    });
  }

  // ============================================
  // 🎮 Overlay و نمایش جزئیات
  // ============================================
  const overlay = document.getElementById("mainOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayContent = document.getElementById("overlayContent");
  const backBtn = document.getElementById("backBtn");

  function pushView(view) {
    viewStack.push(view);
    renderCurrentView();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function popView() {
    if (viewStack.length > 1) {
      viewStack.pop();
      renderCurrentView();
    } else {
      viewStack = [];
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      stopAutoPlay();
    }
  }

  function renderCurrentView() {
    if (viewStack.length === 0) return;
    const current = viewStack[viewStack.length - 1];
    overlayTitle.innerHTML =
      '<i class="fas fa-chess-queen"></i> ' + current.title;
    overlayContent.innerHTML = current.html;
    overlayContent.scrollTop = 0;

    if (current.type === "variant") {
      setupBoard("variantBoard", current.variant.moves);
      setTimeout(() => drawPieChart(current.variant.stats), 100);
    } else if (current.type === "game") {
      const g = new Chess();
      try {
        g.load_pgn(current.game.pgn);
        const moves = g.history();
        setupBoard("gameBoard", moves);
      } catch (e) {
        console.error(e);
      }
    } else if (current.type === "trap") {
      setupBoard("trapBoard", current.trap.moves);
    }
  }

  backBtn.addEventListener("click", popView);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") popView();
  });

  // ============================================
  // 🖼️ تخته و کنترل‌های پخش
  // ============================================
  function renderBoardDOM(containerId, moves, moveIndex) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const game = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      game.move(moves[i], { sloppy: true });
    }
    const board = game.board();
    const colors = getBoardColors();
    const pieceSet = getCurrentPieceSet();

    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(8, 1fr)";
    container.style.aspectRatio = "1 / 1";

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        const isLight = (i + j) % 2 === 0;
        const sq = document.createElement("div");
        sq.className = `square ${isLight ? "light" : "dark"}`;
        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toLowerCase();
          const img = document.createElement("img");
          img.src = `pieces/${pieceSet}/${pieceCodes[key]}`;
          img.classList.add("piece-img");
          img.draggable = false;
          img.style.pointerEvents = "none";
          sq.appendChild(img);
        }
        container.appendChild(sq);
      }
    }
  }

  function setupBoard(boardId, moves) {
    currentMoves = moves;
    currentMoveIndex = 0;
    const total = moves.length;
    const counter = document.getElementById("moveCounter");
    if (counter) counter.textContent = `0/${Math.ceil(total / 2)}`;

    const update = () => {
      renderBoardDOM(boardId, moves, currentMoveIndex);
      if (counter)
        counter.textContent = `${Math.ceil(currentMoveIndex / 2)}/${Math.ceil(
          total / 2,
        )}`;
    };

    window._first = () => {
      stopAutoPlay();
      currentMoveIndex = 0;
      update();
    };
    window._prev = () => {
      stopAutoPlay();
      if (currentMoveIndex > 0) currentMoveIndex--;
      update();
    };
    window._next = () => {
      stopAutoPlay();
      if (currentMoveIndex < total) currentMoveIndex++;
      update();
    };
    window._last = () => {
      stopAutoPlay();
      currentMoveIndex = total;
      update();
    };
    window._toggle = () => {
      const btn = document.getElementById("playPauseBtn");
      if (autoInterval) {
        stopAutoPlay();
        if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
      } else {
        if (btn) btn.innerHTML = '<i class="fas fa-pause"></i> توقف';
        autoInterval = setInterval(() => {
          if (currentMoveIndex < total) {
            currentMoveIndex++;
            update();
          } else {
            stopAutoPlay();
            if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
          }
        }, 1200);
      }
    };
    update();
  }

  function stopAutoPlay() {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
  }

  // ============================================
  // 🥧 نمودار دایره‌ای
  // ============================================
  function drawPieChart(stats) {
    const canvas = document.getElementById("pieChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const total = stats.whiteWins + stats.blackWins + stats.draws;
    if (total === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px Vazir";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("داده‌ای موجود نیست", w / 2, h / 2);
      return;
    }
    const data = [
      { value: stats.whiteWins, color: "#e2e8f0" },
      { value: stats.blackWins, color: "#1e293b" },
      { value: stats.draws, color: "#64748b" },
    ];
    let startAngle = -Math.PI / 2;
    const cx = w / 2,
      cy = h / 2,
      r = Math.min(w, h) / 2 - 4;
    data.forEach((slice) => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += sliceAngle;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 14px Vazir";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${total}`, cx, cy);
  }

  // ============================================
  // 📂 باز کردن View‌ها
  // ============================================
  function openVariantView(variant, openingName) {
    const stats = variant.stats || { whiteWins: 0, blackWins: 0, draws: 0 };
    const view = {
      type: "variant",
      title: `${openingName} – ${variant.name}`,
      variant: variant,
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="variantBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="pie-section">
              <canvas id="pieChart" width="100" height="100"></canvas>
              <div class="legend">
                <span><span class="dot" style="background:#e2e8f0;"></span> برد سفید: ${stats.whiteWins}%</span>
                <span><span class="dot" style="background:#1e293b;"></span> برد سیاه: ${stats.blackWins}%</span>
                <span><span class="dot" style="background:#64748b;"></span> مساوی: ${stats.draws}%</span>
              </div>
            </div>
            <div class="info-card"><h4><i class="fas fa-check-circle" style="color:#166534;"></i> نقاط قوت</h4><ul class="info-list">${(variant.strengths || []).map((s) => `<li><i class="fas fa-check-circle" style="color:#166534;"></i> ${s}</li>`).join("")}</ul></div>
            <div class="info-card"><h4><i class="fas fa-exclamation-triangle" style="color:#991b1b;"></i> نقاط ضعف</h4><ul class="info-list">${(variant.weaknesses || []).map((w) => `<li><i class="fas fa-times-circle" style="color:#991b1b;"></i> ${w}</li>`).join("")}</ul></div>
            <div class="info-card"><h4><i class="fas fa-exchange-alt"></i> حرکات پرتکرار</h4>${(variant.popularMoves || []).map((pm) => `<div class="popular-move"><span>${pm.san} – ${pm.description}</span><span class="move-san">${(pm.moves || []).join(" ")}</span></div>`).join("") || '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> حرکتی ثبت نشده است.</p>'}</div>
            <div class="info-card"><h4><i class="fas fa-balance-scale"></i> ارزیابی پوزیسیون</h4><p>${variant.evaluation?.summary || "ارزیابی موجود نیست"} <strong>(${variant.evaluation?.score || "0.0"})</strong></p></div>
            <div class="info-card"><h4><i class="fas fa-lightbulb"></i> ایده‌ها و طرح‌ها</h4><ul class="info-list">${(variant.ideas || []).map((i) => `<li><i class="fas fa-lightbulb"></i> ${i}</li>`).join("") || "<li>طرحی ثبت نشده است.</li>"}</ul></div>
            <div class="info-card"><h4><i class="fas fa-flag-checkered"></i> آخر بازی‌های احتمالی</h4><ul class="info-list">${(variant.endgames || []).map((e) => `<li><i class="fas fa-flag-checkered"></i> ${e}</li>`).join("") || "<li>آخر بازی ثبت نشده است.</li>"}</ul></div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button class="btn-sm primary" onclick="window._openGamesList()"><i class="fas fa-list"></i> نمونه بازی‌ها (${(variant.sampleGames || []).length})</button>
              <button class="btn-sm primary" onclick="window._openTrapsList()"><i class="fas fa-fish"></i> تله‌ها (${(variant.traps || []).length})</button>
              <button class="btn-sm" onclick="alert('📥 دانلود تحلیل به زودی اضافه می‌شود.')"><i class="fas fa-download"></i> دانلود تحلیل</button>
            </div>
          </div>
        </div>
      `,
    };
    pushView(view);
    window._openGamesList = () =>
      openGamesListView(
        variant.sampleGames || [],
        `${openingName} – ${variant.name}`,
      );
    window._openTrapsList = () =>
      openTrapsListView(
        variant.traps || [],
        `${openingName} – ${variant.name}`,
      );
  }

  function openGamesListView(games, parentTitle) {
    const view = {
      type: "gamesList",
      title: `نمونه بازی‌های ${parentTitle}`,
      html: `
        <div class="info-card" style="max-width:600px; margin:0 auto;">
          ${games.length === 0 ? '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> نمونه بازی‌ای ثبت نشده است.</p>' : ""}
          ${games
            .map(
              (g, i) => `
            <div class="game-item" onclick="window._openGameView(${i})">
              <span><i class="fas fa-chess-king"></i> ${g.white} vs ${g.black} (${g.year}) – ${g.result}</span>
              <i class="fas fa-chevron-left"></i>
            </div>
          `,
            )
            .join("")}
        </div>
      `,
    };
    pushView(view);
    window._openGameView = (idx) => openGameView(games[idx], parentTitle);
  }

  function openGameView(game, parentTitle) {
    const view = {
      type: "game",
      title: `${game.white} vs ${game.black}`,
      game: game,
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="gameBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="info-card">
              <p><i class="fas fa-user"></i> سفید: ${game.white} | <i class="fas fa-user"></i> سیاه: ${game.black}</p>
              <p><i class="fas fa-calendar"></i> سال: ${game.year} | <i class="fas fa-flag"></i> نتیجه: ${game.result}</p>
            </div>
          </div>
        </div>
      `,
    };
    pushView(view);
  }

  function openTrapsListView(traps, parentTitle) {
    const view = {
      type: "trapsList",
      title: `تله‌های ${parentTitle}`,
      html: `
        <div class="info-card" style="max-width:600px; margin:0 auto;">
          ${traps.length === 0 ? '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> تله‌ای ثبت نشده است.</p>' : ""}
          ${traps
            .map(
              (t, i) => `
            <div class="trap-item" onclick="window._openTrapView(${i})">
              <span><i class="fas fa-skull"></i> ${t.name || "تله " + (i + 1)}</span>
              <i class="fas fa-chevron-left"></i>
            </div>
          `,
            )
            .join("")}
        </div>
      `,
    };
    pushView(view);
    window._openTrapView = (idx) => openTrapView(traps[idx], parentTitle);
  }

  function openTrapView(trap, parentTitle) {
    const view = {
      type: "trap",
      title: trap.name || "تله",
      trap: trap,
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="trapBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="info-card">
              <p><i class="fas fa-info-circle"></i> توضیح: ${trap.description || "توضیحی ثبت نشده است."}</p>
            </div>
          </div>
        </div>
      `,
    };
    pushView(view);
  }

  // ============================================
  // 🎛️ رویدادهای جستجو و فیلتر
  // ============================================
  document.getElementById("searchInput").addEventListener("input", renderList);
  document.querySelectorAll("#filterChips .chip").forEach((chip) => {
    chip.addEventListener("click", function () {
      document
        .querySelectorAll("#filterChips .chip")
        .forEach((c) => c.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      renderList();
    });
  });

  // ============================================
  // 🚀 راه‌اندازی
  // ============================================
  loadPiecesLocal().then(() => {
    loadOpeningsJSON();
    console.log("✅ ChessHub Openings loaded successfully");
  });

  // گوش‌دادن به تغییرات تم و مهره‌ها
  document.addEventListener("themeChanged", () => {
    if (overlay.classList.contains("open") && viewStack.length > 0) {
      const current = viewStack[viewStack.length - 1];
      if (["variant", "game", "trap"].includes(current.type)) {
        const boardId = current.type + "Board";
        const boardEl = document.getElementById(boardId);
        if (boardEl) {
          const moves =
            current.type === "variant"
              ? current.variant.moves
              : current.type === "game"
                ? current._gameMoves || []
                : current.trap.moves;
          const idx = currentMoveIndex || 0;
          renderBoardDOM(boardId, moves, idx);
        }
      }
    }
  });
  document.addEventListener("pieceSetChanged", () => {
    if (overlay.classList.contains("open") && viewStack.length > 0) {
      const current = viewStack[viewStack.length - 1];
      if (["variant", "game", "trap"].includes(current.type)) {
        const boardId = current.type + "Board";
        const boardEl = document.getElementById(boardId);
        if (boardEl) {
          const moves =
            current.type === "variant"
              ? current.variant.moves
              : current.type === "game"
                ? current._gameMoves || []
                : current.trap.moves;
          const idx = currentMoveIndex || 0;
          renderBoardDOM(boardId, moves, idx);
        }
      }
    }
  });
})();
