// endgames.js – تمرین آخربازی‌ها

(function () {
  "use strict";

  // ============================================
  // 📦 استفاده از ChessUtils
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
  let endgames = [];
  let currentIndex = 0;
  let game = null;
  let gameActive = true;
  let selectedSquare = null;
  let isComputerThinking = false;
  let waitingForStockfish = false;
  let autoNextTimer = null;
  let countdownInterval = null;
  let countdownValue = 10;
  let currentUserColor = "w";
  let currentDesiredResult = "1-0";
  let currentPositionName = "";
  let isWaitingForRetry = false;
  let dragStartSquare = null;
  let isDragging = false;
  let dragClone = null;
  let computerMoveHighlight = null;

  // Stockfish
  let stockfish = null;
  let stockfishReady = false;

  // DOM
  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const endgameSelect = document.getElementById("endgameSelect");
  const turnSpan = document.getElementById("turnDisplay");
  const moveCountSpan = document.getElementById("moveCount");
  const positionCounterSpan = document.getElementById("positionCounter");
  const userColorDisplay = document.getElementById("userColorDisplay");
  const resultDisplay = document.getElementById("resultDisplay");
  const timerBadge = document.getElementById("timerBadge");
  const timerCount = document.getElementById("timerCount");
  const undoBtn = document.getElementById("undoBtn");
  const resetBtn = document.getElementById("resetBtn");
  const nextBtn = document.getElementById("nextBtn");

  // ============================================
  // 💬 پیام‌ها (با آیکون)
  // ============================================
  function showMessage(text, type = "info", showTimer = false, timerVal = 0) {
    const iconMap = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      info: '<i class="fas fa-info-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      retry: '<i class="fas fa-redo"></i>',
    };
    const icon = iconMap[type] || "";

    if (showTimer && timerVal > 0) {
      msgDiv.innerHTML = `${icon} ${text} <span class="timer-text">${timerVal}</span> ثانیه تا بعدی`;
    } else {
      msgDiv.innerHTML = `${icon} ${text}`;
    }
    msgDiv.className = `message ${type}`;

    if (!showTimer && !isWaitingForRetry) {
      setTimeout(() => {
        if (msgDiv.innerHTML.includes(text)) {
          msgDiv.innerHTML =
            '<i class="fas fa-hand-pointer"></i> مهره را بگیرید و رها کنید';
          msgDiv.className = "message info";
        }
      }, 3500);
    }
  }

  // ============================================
  // 📊 آپدیت آمار
  // ============================================
  function updateStats() {
    const hist = game.history({ verbose: true });
    const totalMoves = Math.ceil(hist.length / 2);
    moveCountSpan.innerHTML = `<i class="fas fa-exchange-alt"></i> ${totalMoves}`;
    positionCounterSpan.textContent = currentIndex + 1;

    const colorName = currentUserColor === "w" ? "سفید" : "سیاه";
    const colorIcon = currentUserColor === "w" ? "⚪" : "⚫";
    userColorDisplay.innerHTML = `<i class="fas fa-user"></i> ${colorName}`;

    const resultMap = {
      "1-0": "🏆 سفید",
      "0-1": "🏆 سیاه",
      "1/2-1/2": "🤝 مساوی",
    };
    resultDisplay.innerHTML = `<i class="fas fa-flag"></i> ${resultMap[currentDesiredResult] || currentDesiredResult}`;
    resultDisplay.className = "stat-item result-badge";
    if (currentDesiredResult === "1-0" || currentDesiredResult === "0-1") {
      resultDisplay.classList.add("success");
    } else if (currentDesiredResult === "1/2-1/2") {
      resultDisplay.classList.add("draw");
    }

    if (!gameActive || game.game_over()) {
      turnSpan.innerHTML = '<i class="fas fa-flag-checkered"></i> پایان';
      turnSpan.className = "stat-item turn-indicator";
      return;
    }

    const isUserTurn = game.turn() === currentUserColor;
    if (isUserTurn) {
      turnSpan.innerHTML = '<i class="fas fa-user"></i> شما';
      turnSpan.className = "stat-item turn-indicator";
    } else {
      const computerColor = currentUserColor === "w" ? "سیاه" : "سفید";
      turnSpan.innerHTML = `<i class="fas fa-robot"></i> ${computerColor}`;
      turnSpan.className = "stat-item turn-indicator";
    }
  }

  // ============================================
  // 🎨 رسم تخته
  // ============================================
  function renderBoard(highlightFrom = null, highlightTo = null) {
    if (!game) return;
    const board = game.board();
    const colors = getBoardColors();
    const pieceSet = getCurrentPieceSet();
    const flipped = currentUserColor === "b";

    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";
    boardDiv.style.touchAction = "none";
    boardDiv.style.userSelect = "none";
    boardDiv.style.webkitUserSelect = "none";

    computerMoveHighlight = { from: highlightFrom, to: highlightTo };

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = flipped ? 7 - i : i;
        const col = flipped ? 7 - j : j;
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;
        const squareDiv = document.createElement("div");
        squareDiv.className = `square ${isLight ? "light" : "dark"}`;
        const file = String.fromCharCode(97 + col);
        const rank = 8 - row;
        const squareName = file + rank;
        squareDiv.dataset.square = squareName;
        squareDiv.style.touchAction = "none";

        if (highlightFrom && squareName === highlightFrom) {
          squareDiv.classList.add("computer-from");
        }
        if (highlightTo && squareName === highlightTo) {
          squareDiv.classList.add("computer-to");
        }

        if (selectedSquare && squareName === selectedSquare) {
          squareDiv.classList.add("selected");
        }

        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toLowerCase();
          const img = document.createElement("img");
          img.src = `pieces/${pieceSet}/${pieceCodes[key]}`;
          img.classList.add("piece-img");
          img.draggable = false;
          img.style.pointerEvents = "none";
          img.alt = key;
          squareDiv.appendChild(img);
        }
        boardDiv.appendChild(squareDiv);
      }
    }
  }

  // ============================================
  // 🔄 بررسی نتیجه
  // ============================================
  function checkGameOver() {
    if (game.game_over()) {
      gameActive = false;

      let actualResult = "";
      if (game.in_checkmate()) {
        actualResult = game.turn() === "w" ? "0-1" : "1-0";
      } else {
        actualResult = "1/2-1/2";
      }

      const isCorrect = actualResult === currentDesiredResult;

      if (isCorrect) {
        const resultMap = {
          "1-0": "برد سفید",
          "0-1": "برد سیاه",
          "1/2-1/2": "مساوی",
        };
        showMessage(`✅ نتیجه صحیح! (${resultMap[actualResult]})`, "success");
        updateStats();
        startAutoNext();
        return true;
      } else {
        const resultMap = {
          "1-0": "برد سفید",
          "0-1": "برد سیاه",
          "1/2-1/2": "مساوی",
        };
        const desiredMap = {
          "1-0": "برد سفید",
          "0-1": "برد سیاه",
          "1/2-1/2": "مساوی",
        };
        isWaitingForRetry = true;
        showMessage(
          `❌ نتیجه اشتباه! (${resultMap[actualResult]}) هدف: ${desiredMap[currentDesiredResult]}`,
          "retry",
        );

        setTimeout(() => {
          isWaitingForRetry = false;
          loadPosition(currentIndex);
        }, 2000);

        return true;
      }
    }
    return false;
  }

  // ============================================
  // ⏱️ تایمر شمارش معکوس
  // ============================================
  function startCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    countdownValue = 10;
    timerBadge.style.display = "inline-flex";
    timerCount.textContent = countdownValue;
    timerBadge.classList.remove("urgent");

    showMessage(`⏳ بعدی در`, "warning", true, countdownValue);

    countdownInterval = setInterval(() => {
      countdownValue--;
      timerCount.textContent = countdownValue;

      if (countdownValue > 0) {
        showMessage(`⏳ بعدی در`, "warning", true, countdownValue);
      }

      if (countdownValue <= 3) {
        timerBadge.classList.add("urgent");
      }

      if (countdownValue <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        timerBadge.style.display = "none";
        timerBadge.classList.remove("urgent");

        const nextIndex = (currentIndex + 1) % endgames.length;
        loadPosition(nextIndex);
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    timerBadge.style.display = "none";
    timerBadge.classList.remove("urgent");
  }

  function startAutoNext() {
    if (autoNextTimer) {
      clearTimeout(autoNextTimer);
      autoNextTimer = null;
    }
    startCountdown();
  }

  // ============================================
  // 🤖 Stockfish
  // ============================================
  function initStockfish() {
    try {
      stockfish = new Worker("js/stockfish.js");
      stockfish.onmessage = function (e) {
        const data = e.data;
        if (data.includes("uciok")) {
          stockfishReady = true;
          stockfish.postMessage("setoption name Threads value 2");
          stockfish.postMessage("setoption name Hash value 256");
          stockfish.postMessage("setoption name Skill Level value 20");
        } else if (data.includes("bestmove") && waitingForStockfish) {
          waitingForStockfish = false;
          isComputerThinking = false;
          const movePart = data.split("bestmove ")[1]?.split(" ")[0];
          if (movePart && movePart !== "(none)") {
            const from = movePart.slice(0, 2),
              to = movePart.slice(2, 4);
            let promo = movePart[4] || "q";
            try {
              const move = game.move({ from, to, promotion: promo });
              if (move) {
                renderBoard(from, to);
                updateStats();
                if (
                  !checkGameOver() &&
                  game.turn() !== currentUserColor &&
                  gameActive
                ) {
                  setTimeout(() => requestComputerMove(), 300);
                }
              } else {
                fallbackComputerMove();
              }
            } catch (e) {
              fallbackComputerMove();
            }
          } else {
            fallbackComputerMove();
          }
        }
      };
      stockfish.postMessage("uci");
      setTimeout(() => {
        if (!stockfishReady) stockfishReady = false;
      }, 2000);
    } catch (e) {
      stockfishReady = false;
    }
  }

  function requestComputerMove() {
    if (
      !gameActive ||
      isComputerThinking ||
      waitingForStockfish ||
      game.game_over()
    )
      return;

    const isUserTurn = game.turn() === currentUserColor;
    if (isUserTurn) return;

    isComputerThinking = true;
    waitingForStockfish = true;

    if (stockfish && stockfishReady) {
      stockfish.postMessage("stop");
      stockfish.postMessage(`position fen ${game.fen()}`);
      stockfish.postMessage("go depth 16");
    } else {
      fallbackComputerMove();
    }
  }

  // ============================================
  // 🎯 منطق ساده برای کامپیوتر (Fallback)
  // ============================================
  const pieceVal = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

  function evalBoardSimple(board, turn) {
    let score = 0;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const p = board[i][j];
        if (p) {
          let v = pieceVal[p.type];
          score += p.color === "w" ? v : -v;
        }
      }
    }
    return turn === "w" ? score : -score;
  }

  function getBestSimple() {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;
    let best = moves[0],
      bestScore = -Infinity;
    for (const mv of moves) {
      const test = new Chess(game.fen());
      test.move(mv);
      const s = evalBoardSimple(test.board(), test.turn());
      if (s > bestScore) {
        bestScore = s;
        best = mv;
      }
    }
    return best;
  }

  function fallbackComputerMove() {
    if (!gameActive) return;
    const isUserTurn = game.turn() === currentUserColor;
    if (isUserTurn) {
      isComputerThinking = false;
      waitingForStockfish = false;
      return;
    }

    const mv = getBestSimple();
    if (mv) {
      game.move(mv);
      renderBoard(mv.from, mv.to);
      updateStats();
      if (checkGameOver()) return;
      const nextIsUserTurn = game.turn() === currentUserColor;
      if (!nextIsUserTurn && gameActive) {
        setTimeout(() => requestComputerMove(), 200);
      }
    }
    isComputerThinking = false;
    waitingForStockfish = false;
  }

  // ============================================
  // 🔄 بارگذاری موقعیت
  // ============================================
  function loadPosition(index) {
    if (!endgames.length) return;

    const eg = endgames[index];
    if (!eg) return;

    if (autoNextTimer) {
      clearTimeout(autoNextTimer);
      autoNextTimer = null;
    }
    stopCountdown();
    isWaitingForRetry = false;

    currentUserColor = eg.userColor || "w";
    currentDesiredResult = eg.result || "1-0";
    currentPositionName = eg.name || "آخربازی";

    game = new Chess(eg.fen);
    selectedSquare = null;
    gameActive = true;
    computerMoveHighlight = null;

    renderBoard();
    updateStats();

    const colorName = currentUserColor === "w" ? "سفید" : "سیاه";
    const computerColor = currentUserColor === "w" ? "سیاه" : "سفید";
    const resultMap = {
      "1-0": "برد سفید",
      "0-1": "برد سیاه",
      "1/2-1/2": "مساوی",
    };
    showMessage(
      `📍 ${eg.name} | شما ${colorName} | کامپیوتر ${computerColor} | هدف: ${resultMap[currentDesiredResult]}`,
      "info",
    );

    currentIndex = index;
    localStorage.setItem("chesshub_endgame_index", currentIndex);
    endgameSelect.value = index;

    if (stockfish && stockfishReady) {
      stockfish.postMessage("stop");
    }

    const isUserTurn = game.turn() === currentUserColor;
    if (!isUserTurn) {
      setTimeout(() => requestComputerMove(), 500);
    }
  }

  // ============================================
  // 📂 بارگذاری آخربازی‌ها از فایل
  // ============================================
  async function loadEndgamesFromFile() {
    try {
      const resp = await fetch("data/endgames.txt");
      if (!resp.ok) throw new Error("فایل یافت نشد");
      const text = await resp.text();
      const lines = text.split(/\r?\n/);
      endgames = [];

      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("|");
        if (parts.length >= 4) {
          const fen = parts[0].trim();
          const name = parts[1].trim();
          const userColor = parts[2].trim();
          const result = parts[3].trim();
          endgames.push({ fen, name, userColor, result });
        } else if (parts.length >= 2) {
          const fen = parts[0].trim();
          const name = parts[1].trim();
          endgames.push({ fen, name, userColor: "w", result: "1-0" });
        }
      }

      if (!endgames.length) {
        endgames.push({
          fen: "start",
          name: "موقعیت پیش‌فرض",
          userColor: "w",
          result: "1-0",
        });
      }

      populateSelect();

      const saved = localStorage.getItem("chesshub_endgame_index");
      let idx = saved && !isNaN(parseInt(saved)) ? parseInt(saved) : 0;
      if (idx >= endgames.length) idx = 0;

      loadPosition(idx);
    } catch (e) {
      console.error(e);
      endgames = [
        {
          fen: "start",
          name: "خطا در بارگذاری",
          userColor: "w",
          result: "1-0",
        },
      ];
      populateSelect();
      loadPosition(0);
    }
  }

  function populateSelect() {
    endgameSelect.innerHTML = "";
    endgames.forEach((eg, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      const colorName = eg.userColor === "w" ? "⚪ سفید" : "⚫ سیاه";
      const resultMap = {
        "1-0": "🏆 برد سفید",
        "0-1": "🏆 برد سیاه",
        "1/2-1/2": "🤝 مساوی",
      };
      opt.textContent = `${eg.name} | ${colorName} | ${resultMap[eg.result] || eg.result}`;
      endgameSelect.appendChild(opt);
    });
    endgameSelect.onchange = (e) => {
      if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
      }
      stopCountdown();
      loadPosition(parseInt(e.target.value));
    };
  }

  // ============================================
  // 🎯 حرکت کاربر
  // ============================================
  async function tryMove(from, to) {
    if (!gameActive) {
      showMessage("بازی تمام شده!", "error");
      return false;
    }

    const isUserTurn = game.turn() === currentUserColor;
    if (!isUserTurn) {
      showMessage("نوبت شما نیست!", "error");
      return false;
    }

    if (isComputerThinking || waitingForStockfish) {
      showMessage("کامپیوتر در حال فکر...", "info");
      return false;
    }

    const piece = game.get(from);
    const isPawnPromotion =
      piece &&
      piece.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"));

    let promotion = "q";
    if (isPawnPromotion) {
      // برای سادگی وزیر انتخاب می‌شود
      promotion = "q";
    }

    try {
      const result = game.move({ from, to, promotion });
      if (result) {
        selectedSquare = null;
        renderBoard();
        updateStats();

        if (checkGameOver()) return true;

        const nextIsUserTurn = game.turn() === currentUserColor;
        if (!nextIsUserTurn && gameActive) {
          setTimeout(() => requestComputerMove(), 300);
        }
        return true;
      } else {
        showMessage("حرکت غیرمجاز", "error");
        return false;
      }
    } catch (e) {
      showMessage("خطا در حرکت", "error");
      return false;
    }
  }

  // ============================================
  // 🖱️ رویدادهای کشیدن و کلیک
  // ============================================
  function createDragClone(square) {
    const squareEl = document.querySelector(`.square[data-square="${square}"]`);
    if (!squareEl) return null;
    const img = squareEl.querySelector(".piece-img");
    if (!img) return null;
    const rect = squareEl.getBoundingClientRect();
    const clone = img.cloneNode(true);
    const size = Math.min(rect.width, rect.height);
    clone.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      width: ${size}px;
      height: ${size}px;
      transform: translate(-50%, -50%) scale(1.08);
      filter: drop-shadow(0 8px 25px rgba(0,0,0,0.3));
      transition: none;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-user-drag: none;
    `;
    document.body.appendChild(clone);
    return clone;
  }

  function updateDragClone(clientX, clientY) {
    if (!dragClone) return;
    dragClone.style.left = clientX + "px";
    dragClone.style.top = clientY + "px";
  }

  function removeDragClone() {
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
  }

  function handleDragStart(clientX, clientY) {
    if (
      !gameActive ||
      game.game_over() ||
      isComputerThinking ||
      waitingForStockfish
    )
      return;
    if (game.turn() !== currentUserColor) return;

    const elem = document.elementFromPoint(clientX, clientY);
    const squareDiv = elem?.closest?.(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;
    const piece = game.get(square);
    if (piece && piece.color === currentUserColor) {
      dragStartSquare = square;
      isDragging = true;
      dragClone = createDragClone(square);
      if (dragClone) updateDragClone(clientX, clientY);
      boardDiv.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      boardDiv.style.touchAction = "none";
    }
  }

  function handleDragMove(clientX, clientY) {
    if (!isDragging) return;
    if (dragClone) updateDragClone(clientX, clientY);
  }

  function handleDragEnd(clientX, clientY) {
    if (!isDragging || !dragStartSquare) {
      cleanupDrag();
      return;
    }
    removeDragClone();
    const elem = document.elementFromPoint(clientX, clientY);
    const targetSquareDiv = elem?.closest?.(".square");
    let targetSquare = targetSquareDiv ? targetSquareDiv.dataset.square : null;
    if (targetSquare && targetSquare !== dragStartSquare) {
      tryMove(dragStartSquare, targetSquare);
    }
    cleanupDrag();
  }

  function cleanupDrag() {
    dragStartSquare = null;
    isDragging = false;
    boardDiv.style.cursor = "grab";
    document.body.style.userSelect = "";
    boardDiv.style.touchAction = "";
    removeDragClone();
  }

  function onMouseDown(e) {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    handleDragMove(e.clientX, e.clientY);
  }
  function onMouseUp(e) {
    if (!isDragging) return;
    handleDragEnd(e.clientX, e.clientY);
  }
  function onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  }
  function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  }
  function onTouchEnd(e) {
    if (!isDragging) return;
    e.preventDefault();
    const changed = e.changedTouches[0];
    handleDragEnd(changed.clientX, changed.clientY);
  }

  function onClickFallback(e) {
    if (isDragging) return;
    if (
      !gameActive ||
      game.game_over() ||
      isComputerThinking ||
      waitingForStockfish
    )
      return;
    if (game.turn() !== currentUserColor) return;

    const squareDiv = e.target.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;

    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === currentUserColor) {
        selectedSquare = square;
        renderBoard();
      } else {
        showMessage(
          `مهره ${currentUserColor === "w" ? "سفید" : "سیاه"} خود را انتخاب کنید`,
          "error",
        );
      }
    } else {
      tryMove(selectedSquare, square);
      selectedSquare = null;
    }
  }

  // ============================================
  // 🎮 عملیات دکمه‌ها
  // ============================================
  function resetGame() {
    if (autoNextTimer) {
      clearTimeout(autoNextTimer);
      autoNextTimer = null;
    }
    stopCountdown();
    loadPosition(currentIndex);
  }

  function nextPuzzle() {
    if (autoNextTimer) {
      clearTimeout(autoNextTimer);
      autoNextTimer = null;
    }
    stopCountdown();
    const nextIndex = (currentIndex + 1) % endgames.length;
    loadPosition(nextIndex);
  }

  function undoMove() {
    if (!gameActive) return;

    const hist = game.history({ verbose: true });
    if (hist.length === 0) {
      showMessage("هیچ حرکتی برای برگشت وجود ندارد", "info");
      return;
    }

    if (hist.length >= 2) {
      game.undo();
      game.undo();
    } else {
      game.undo();
    }
    selectedSquare = null;
    renderBoard();
    updateStats();
    showMessage("↩️ حرکت برگشت داده شد", "info");

    const isUserTurn = game.turn() === currentUserColor;
    if (!isUserTurn && gameActive) {
      setTimeout(() => requestComputerMove(), 300);
    }
  }

  // ============================================
  // 🚀 راه‌اندازی
  // ============================================
  loadPieces().then(() => {
    initStockfish();

    boardDiv.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    boardDiv.addEventListener("touchstart", onTouchStart, { passive: false });
    boardDiv.addEventListener("touchmove", onTouchMove, { passive: false });
    boardDiv.addEventListener("touchend", onTouchEnd);
    boardDiv.addEventListener("click", onClickFallback);

    undoBtn.addEventListener("click", undoMove);
    resetBtn.addEventListener("click", resetGame);
    nextBtn.addEventListener("click", nextPuzzle);

    document.addEventListener("themeChanged", function () {
      if (game) renderBoard();
    });

    loadEndgamesFromFile();
    console.log("✅ ChessHub Endgames loaded successfully");
  });
})();
