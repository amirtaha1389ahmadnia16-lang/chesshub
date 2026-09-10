// ============================================
// 🧠 ChessHub - Puzzle Rush Smart Engine
// ============================================

(function () {
  "use strict";

  // استفاده از ChessUtils اگر موجود بود، در غیر این صورت مقادیر پیش‌فرض
  const ChessUtilsBound = window.ChessUtilsBound || {};
  const pieceCodes = ChessUtilsBound.pieceCodes || {
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
  };
  const getCurrentPieceSet =
    ChessUtilsBound.getCurrentPieceSet || (() => "neo");
  const loadPieces = ChessUtilsBound.loadPieces || (() => Promise.resolve());

  let game = null;
  let selectedSquare = null;
  let currentMoveIndex = 0;
  let puzzleFinished = false;
  let autoMoveTimeout = null;
  let dragStartSquare = null;
  let isDragging = false;
  let dragClone = null;
  let puzzleMoves = [];
  let allPuzzles = [];
  let currentPuzzleId = null;
  let usedPuzzleIndices = new Set();
  let userColor = null;
  let computerMoveHighlight = null;

  let currentMode = "unlimited";
  let timeLeft = 0;
  let mistakes = 0;
  let solvedCount = 0;
  let streak = 0;
  let gameActive = false;
  let timerInterval = null;
  let bestRecord = { 3: 0, 5: 0, unlimited: 0 };

  // سیستم هوشمند (حافظه محلی - بدون دیتابیس)
  let userStats = JSON.parse(localStorage.getItem("chesshub_rush_stats")) || {
    themes: {},
    totalSolved: 0,
  };

  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const resetBtn = document.getElementById("resetGameBtn");
  const puzzleCounterSpan = document.getElementById("puzzleCounter");
  const timerDisplaySpan = document.getElementById("timerDisplay");
  const mistakeDisplaySpan = document.getElementById("mistakeDisplay");
  const turnDisplaySpan = document.getElementById("turnDisplay");
  const recordDisplayDiv = document.getElementById("recordDisplay");

  // ============================================
  // 📦 بارگذاری دیتابیس پازل‌ها
  // ============================================
  async function loadAllPuzzles() {
    try {
      const response = await fetch("data/puzzles.txt");
      if (!response.ok) throw new Error("فایل یافت نشد");
      const text = await response.text();
      const lines = text.split("\n").filter((line) => line.trim() !== "");

      allPuzzles = [];
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length < 8) continue;

        const fen = parts[1].trim();
        const movesStr = parts[2].trim();
        const themesStr = parts[7].trim();

        if (!fen || !movesStr) continue;

        const moveArray = movesStr.split(/\s+/);
        const turn = fen.split(" ")[1];
        const movesWithColor = [];
        let currentColor = turn;

        for (let i = 0; i < moveArray.length; i++) {
          movesWithColor.push({ color: currentColor, uci: moveArray[i] });
          currentColor = currentColor === "w" ? "b" : "w";
        }

        allPuzzles.push({
          fen: fen,
          movesWithColor: movesWithColor,
          themes: themesStr,
          id: allPuzzles.length,
        });
      }
      return allPuzzles.length > 0;
    } catch (err) {
      console.error(err);
      showMessage("خطا در بارگذاری پازل‌ها", "error");
      return false;
    }
  }

  // ============================================
  // 🧠 سیستم هوشمند انتخاب پازل
  // ============================================
  function getWeakestTheme() {
    let weakest = null;
    let worstRatio = 0;

    for (const theme in userStats.themes) {
      const stat = userStats.themes[theme];
      const total = stat.correct + stat.wrong;
      if (total >= 3) {
        const wrongRatio = stat.wrong / total;
        if (wrongRatio > 0.4 && wrongRatio > worstRatio) {
          worstRatio = wrongRatio;
          weakest = theme;
        }
      }
    }
    return weakest;
  }

  function getRandomPuzzleIndex() {
    if (allPuzzles.length === 0) return -1;

    const weakTheme = getWeakestTheme();
    let pool = [];

    if (weakTheme) {
      pool = allPuzzles.filter((p) => p.themes.includes(weakTheme));
    }
    if (pool.length === 0) pool = allPuzzles;

    let available = [];
    for (let i = 0; i < pool.length; i++) {
      if (!usedPuzzleIndices.has(pool[i].id)) available.push(pool[i]);
    }
    if (available.length === 0) {
      usedPuzzleIndices.clear();
      available = pool;
    }

    const randomPuzzle =
      available[Math.floor(Math.random() * available.length)];
    usedPuzzleIndices.add(randomPuzzle.id);
    return randomPuzzle.id;
  }

  function recordResult(isCorrect) {
    if (!currentPuzzleId) return;
    const puzzle = allPuzzles.find((p) => p.id === currentPuzzleId);
    if (!puzzle || !puzzle.themes) return;

    const firstTheme = puzzle.themes.split(" ")[0];
    if (!userStats.themes[firstTheme])
      userStats.themes[firstTheme] = { correct: 0, wrong: 0 };

    if (isCorrect) userStats.themes[firstTheme].correct++;
    else userStats.themes[firstTheme].wrong++;

    localStorage.setItem("chesshub_rush_stats", JSON.stringify(userStats));
    updateWeaknessUI();
  }

  function updateWeaknessUI() {
    const tracker = document.getElementById("weaknessTracker");
    if (!tracker) return;

    let sortedThemes = Object.keys(userStats.themes)
      .sort((a, b) => {
        return (
          userStats.themes[b].wrong / (userStats.themes[b].correct + 1) -
          userStats.themes[a].wrong / (userStats.themes[a].correct + 1)
        );
      })
      .slice(0, 6);

    if (sortedThemes.length === 0) return;

    let html = "";
    sortedThemes.forEach((theme) => {
      const stat = userStats.themes[theme];
      const total = stat.correct + stat.wrong;
      const successRate =
        total > 0 ? Math.round((stat.correct / total) * 100) : 0;
      const isGood = successRate >= 60;

      html += `
        <div class="weakness-item">
          <div class="w-name">
            <span>${theme.replace(/([A-Z])/g, " $1").trim()}</span>
            <span>${successRate}%</span>
          </div>
          <div class="w-bar-bg">
            <div class="w-bar-fill ${isGood ? "good" : ""}" style="width: ${successRate}%"></div>
          </div>
        </div>
      `;
    });

    tracker.innerHTML = html;
  }

  // ============================================
  // 🎯 بارگذاری پازل
  // ============================================
  function loadRandomPuzzle() {
    if (!allPuzzles.length) return;
    const index = getRandomPuzzleIndex();
    const puzzle = allPuzzles.find((p) => p.id === index);
    if (!puzzle) return;

    currentPuzzleId = puzzle.id;
    game = new Chess(puzzle.fen);
    puzzleMoves = puzzle.movesWithColor;

    // محاسبه رنگ کاربر به صورت مستقیم
    userColor =
      puzzleMoves.length > 0 ? (puzzleMoves[0].color === "w" ? "b" : "w") : "w";

    selectedSquare = null;
    currentMoveIndex = 0;
    puzzleFinished = false;
    computerMoveHighlight = null;

    renderBoard();
    msgDiv.innerHTML = "";
    msgDiv.className = "message";

    const colorName = userColor === "w" ? "سفید" : "سیاه";
    turnDisplaySpan.innerHTML = `<i class="fas fa-hourglass-start"></i> شروع (شما: ${colorName})`;

    if (currentMoveIndex < puzzleMoves.length) {
      const firstMove = puzzleMoves[0];
      if (firstMove.color !== userColor) {
        setTimeout(autoComputerMove, 500);
      } else {
        showMessage("✨ نوبت شماست. حرکت کنید.", "info");
        turnDisplaySpan.innerHTML = `<i class="fas fa-user"></i> نوبت شما`;
      }
    }
  }

  // ============================================
  // 🤖 حرکت کامپیوتر
  // ============================================
  async function autoComputerMove() {
    if (puzzleFinished || currentMoveIndex >= puzzleMoves.length) return;

    const expected = puzzleMoves[currentMoveIndex];
    if (expected.color === userColor) return;

    turnDisplaySpan.innerHTML = `<i class="fas fa-robot"></i> کامپیوتر در حال حرکت...`;

    let promotionPiece = "q";
    if (expected.uci.length === 5) {
      const promoChar = expected.uci[4];
      promotionPiece =
        promoChar === "n"
          ? "n"
          : promoChar === "b"
            ? "b"
            : promoChar === "r"
              ? "r"
              : "q";
    }

    try {
      const from = expected.uci.slice(0, 2);
      const to = expected.uci.slice(2, 4);
      const result = game.move({ from, to, promotion: promotionPiece });

      if (result) {
        renderBoard(from, to);
        computerMoveHighlight = { from, to };
        turnDisplaySpan.innerHTML = `<i class="fas fa-robot"></i> کامپیوتر: ${result.san}`;
        currentMoveIndex++;

        if (game.game_over() && game.in_checkmate()) {
          showMessage("🎉 مات! پازل حل شد.", "success");
          puzzleFinished = true;
          handlePuzzleSolved();
          return;
        }

        if (currentMoveIndex < puzzleMoves.length) {
          const nextMove = puzzleMoves[currentMoveIndex];
          if (nextMove.color !== userColor) {
            if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
            autoMoveTimeout = setTimeout(autoComputerMove, 600);
          } else {
            showMessage("✨ نوبت شماست. حرکت کنید.", "info");
            turnDisplaySpan.innerHTML = `<i class="fas fa-user"></i> نوبت شما`;
          }
        } else {
          showMessage("✅ پازل کامل شد!", "success");
          puzzleFinished = true;
          handlePuzzleSolved();
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ============================================
  // 🏆 حل پازل
  // ============================================
  async function handlePuzzleSolved() {
    solvedCount++;
    streak++;
    recordResult(true);
    showMessage(
      `✅ پازل ${solvedCount} حل شد! ${streak >= 2 ? `🔥 کامبو x${streak}` : ""}`,
      "success",
    );
    puzzleCounterSpan.textContent = solvedCount;

    const currentBest = bestRecord[currentMode] || 0;
    if (solvedCount > currentBest) {
      bestRecord[currentMode] = solvedCount;
      localStorage.setItem(
        "chesshub_puzzle_records",
        JSON.stringify(bestRecord),
      );
      recordDisplayDiv.innerHTML = `<i class="fas fa-trophy"></i> رکورد جدید! ${solvedCount} پازل! 🎉`;
      recordDisplayDiv.style.display = "block";
      setTimeout(() => {
        recordDisplayDiv.style.display = "none";
      }, 3000);
    }

    if (gameActive) {
      setTimeout(loadRandomPuzzle, 500);
    }
  }

  // ============================================
  // 🎯 حرکت کاربر
  // ============================================
  async function tryMove(from, to) {
    if (puzzleFinished) return false;
    if (game.turn() !== userColor) return false;

    const expected = puzzleMoves[currentMoveIndex];
    if (expected.color !== userColor) return false;

    const piece = game.get(from);
    const isPawnPromotion =
      piece &&
      piece.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"));

    let promotion = "q";
    if (isPawnPromotion && expected.uci.length === 5) {
      promotion =
        expected.uci[4] === "n"
          ? "n"
          : expected.uci[4] === "b"
            ? "b"
            : expected.uci[4] === "r"
              ? "r"
              : "q";
    }

    try {
      const result = game.move({ from, to, promotion });
      if (result) {
        if (computerMoveHighlight) {
          computerMoveHighlight = null;
          renderBoard();
        }
        const playedUCI = result.from + result.to + (result.promotion || "");

        if (playedUCI === expected.uci) {
          showMessage(`✅ حرکت صحیح: ${result.san}`, "success");
          currentMoveIndex++;
          renderBoard();
          turnDisplaySpan.innerHTML = `<i class="fas fa-hourglass-half"></i> در انتظار کامپیوتر...`;

          if (game.game_over() && game.in_checkmate()) {
            showMessage("🎉 مات! پازل حل شد.", "success");
            puzzleFinished = true;
            handlePuzzleSolved();
            return true;
          }

          if (currentMoveIndex < puzzleMoves.length) {
            const nextMove = puzzleMoves[currentMoveIndex];
            if (nextMove.color !== userColor) {
              if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
              autoMoveTimeout = setTimeout(autoComputerMove, 600);
            }
          } else {
            handlePuzzleSolved();
          }
          return true;
        } else {
          game.undo();
          renderBoard();
          handleMistake();
          return false;
        }
      } else {
        handleMistake();
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  function handleMistake() {
    mistakes++;
    streak = 0;
    recordResult(false);
    if (currentMode === "unlimited" && mistakes >= 3) {
      puzzleFinished = true;
      gameActive = false;
      stopTimer();
      boardDiv.style.pointerEvents = "none";
      showMessage("⛔ سه خطا انجام شد! بازی تمام شد.", "error");
    } else {
      showMessage(
        currentMode === "unlimited"
          ? `❌ حرکت اشتباه. ${3 - mistakes} فرصت باقی مانده.`
          : "❌ حرکت اشتباه.",
        "error",
      );
    }
    selectedSquare = null;
    renderBoard();
    updateStats();
  }

  // ============================================
  // 🎨 رسم تخته
  // ============================================
  function renderBoard(highlightFrom = null, highlightTo = null) {
    if (!game) return;
    const board = game.board();
    boardDiv.innerHTML = "";
    const pieceSet = getCurrentPieceSet();
    const flipped = userColor === "b";
    computerMoveHighlight = { from: highlightFrom, to: highlightTo };

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = flipped ? 7 - i : i;
        const col = flipped ? 7 - j : j;
        const piece = board[row][col];
        const squareDiv = document.createElement("div");
        squareDiv.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        squareDiv.dataset.square = squareName;

        if (highlightFrom && squareName === highlightFrom)
          squareDiv.classList.add("computer-from");
        if (highlightTo && squareName === highlightTo)
          squareDiv.classList.add("computer-to");
        if (selectedSquare && squareName === selectedSquare)
          squareDiv.classList.add("selected");

        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toLowerCase();
          const img = document.createElement("img");
          img.src = `pieces/${pieceSet}/${pieceCodes[key]}`;
          img.classList.add("piece-img");
          img.draggable = false;
          squareDiv.appendChild(img);
        }
        boardDiv.appendChild(squareDiv);
      }
    }
  }

  // ============================================
  // 🖱️ سیستم درگ و کلیک
  // ============================================
  function createDragClone(square) {
    const squareEl = document.querySelector(`.square[data-square="${square}"]`);
    if (!squareEl) return null;
    const img = squareEl.querySelector(".piece-img");
    if (!img) return null;
    const rect = squareEl.getBoundingClientRect();
    const clone = img.cloneNode(true);
    const size = Math.min(rect.width, rect.height);
    clone.style.cssText = `position: fixed; pointer-events: none; z-index: 9999; width: ${size}px; height: ${size}px; transform: translate(-50%, -50%) scale(1.08); filter: drop-shadow(0 8px 25px rgba(0,0,0,0.3));`;
    document.body.appendChild(clone);
    return clone;
  }

  function handleDragStart(clientX, clientY) {
    if (puzzleFinished || game.turn() !== userColor) return;
    const elem = document.elementFromPoint(clientX, clientY);
    const squareDiv = elem?.closest?.(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    const piece = game.get(square);
    if (piece && piece.color === userColor) {
      dragStartSquare = square;
      isDragging = true;
      dragClone = createDragClone(square);
      if (dragClone) {
        dragClone.style.left = clientX + "px";
        dragClone.style.top = clientY + "px";
      }
      boardDiv.style.cursor = "grabbing";
    }
  }

  function handleDragMove(clientX, clientY) {
    if (!isDragging || !dragClone) return;
    dragClone.style.left = clientX + "px";
    dragClone.style.top = clientY + "px";
  }

  function handleDragEnd(clientX, clientY) {
    if (!isDragging || !dragStartSquare) {
      cleanupDrag();
      return;
    }
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
    const elem = document.elementFromPoint(clientX, clientY);
    const targetSquareDiv = elem?.closest?.(".square");
    const targetSquare = targetSquareDiv
      ? targetSquareDiv.dataset.square
      : null;
    if (targetSquare && targetSquare !== dragStartSquare)
      tryMove(dragStartSquare, targetSquare);
    cleanupDrag();
  }

  function cleanupDrag() {
    dragStartSquare = null;
    isDragging = false;
    boardDiv.style.cursor = "grab";
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
  }

  function onClickFallback(e) {
    if (isDragging || puzzleFinished || game.turn() !== userColor) return;
    if (computerMoveHighlight) {
      computerMoveHighlight = null;
      renderBoard();
    }
    const squareDiv = e.target.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === userColor) {
        selectedSquare = square;
        renderBoard();
      }
    } else {
      tryMove(selectedSquare, square);
      selectedSquare = null;
    }
  }

  // ============================================
  // 💬 پیام‌ها و تایمر
  // ============================================
  function showMessage(text, type = "info") {
    const iconMap = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      info: '<i class="fas fa-info-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
    };
    msgDiv.innerHTML = `${iconMap[type] || ""} ${text}`;
    msgDiv.className = `message ${type}`;
  }

  function updateStats() {
    if (currentMode === "unlimited") {
      mistakeDisplaySpan.innerHTML = `<i class="fas fa-times-circle"></i> خطا: ${mistakes}/3`;
      timerDisplaySpan.innerHTML = `<i class="far fa-clock"></i> ∞`;
    } else {
      mistakeDisplaySpan.innerHTML = `<i class="fas fa-times-circle"></i> خطا: ${mistakes}`;
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      timerDisplaySpan.innerHTML = `<i class="far fa-clock"></i> ${m}:${s.toString().padStart(2, "0")}`;
    }
    puzzleCounterSpan.textContent = solvedCount;
  }

  function startTimer(seconds) {
    stopTimer();
    timeLeft = seconds;
    updateStats();
    timerInterval = setInterval(() => {
      if (!gameActive) return;
      if (timeLeft <= 0) {
        stopTimer();
        gameActive = false;
        puzzleFinished = true;
        showMessage("⏰ زمان تمام شد!", "error");
        boardDiv.style.pointerEvents = "none";
        updateStats();
      } else {
        timeLeft--;
        updateStats();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function resetGame() {
    stopTimer();
    if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
    boardDiv.style.pointerEvents = "auto";
    gameActive = true;
    puzzleFinished = false;
    solvedCount = 0;
    mistakes = 0;
    streak = 0;
    recordDisplayDiv.style.display = "none";
    usedPuzzleIndices.clear();
    computerMoveHighlight = null;
    selectedSquare = null;
    updateStats();
    if (allPuzzles.length) {
      loadRandomPuzzle();
      if (currentMode === "3") startTimer(180);
      else if (currentMode === "5") startTimer(300);
      else {
        timerDisplaySpan.innerHTML = `<i class="far fa-clock"></i> ∞`;
        timeLeft = Infinity;
      }
    }
    showMessage("🔄 بازی جدید شروع شد!", "info");
  }

  function setMode(mode) {
    if (gameActive && solvedCount > 0) {
      if (!confirm("آیا میخوای حالت رو عوض کنی؟ بازی فعلی ریست میشه.")) return;
    }
    currentMode = mode;
    document
      .querySelectorAll(".mode-btn")
      .forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.mode === mode),
      );
    resetGame();
  }

  function loadRecords() {
    const stored = localStorage.getItem("chesshub_puzzle_records");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed["3"]) bestRecord["3"] = parsed["3"];
        if (parsed["5"]) bestRecord["5"] = parsed["5"];
        if (parsed["unlimited"]) bestRecord["unlimited"] = parsed["unlimited"];
      } catch (e) {}
    }
  }

  // ============================================
  // 🚀 راه‌اندازی
  // ============================================
  loadPieces().then(async () => {
    loadRecords();
    updateWeaknessUI();
    const loaded = await loadAllPuzzles();
    if (loaded) {
      document
        .querySelectorAll(".mode-btn")
        .forEach((btn) =>
          btn.addEventListener("click", () => setMode(btn.dataset.mode)),
        );

      boardDiv.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleDragStart(e.clientX, e.clientY);
      });
      window.addEventListener("mousemove", (e) => {
        if (isDragging) {
          e.preventDefault();
          handleDragMove(e.clientX, e.clientY);
        }
      });
      window.addEventListener("mouseup", (e) => {
        if (isDragging) handleDragEnd(e.clientX, e.clientY);
      });
      boardDiv.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const t = e.touches[0];
          handleDragStart(t.clientX, t.clientY);
        },
        { passive: false },
      );
      boardDiv.addEventListener(
        "touchmove",
        (e) => {
          if (isDragging) {
            e.preventDefault();
            const t = e.touches[0];
            handleDragMove(t.clientX, t.clientY);
          }
        },
        { passive: false },
      );
      boardDiv.addEventListener(
        "touchend",
        (e) => {
          if (isDragging) {
            e.preventDefault();
            const t = e.changedTouches[0];
            handleDragEnd(t.clientX, t.clientY);
          }
        },
        { passive: false },
      );

      boardDiv.addEventListener("click", onClickFallback);
      resetBtn.addEventListener("click", resetGame);
      boardDiv.style.cursor = "grab";

      resetGame();
    }
  });
})();
