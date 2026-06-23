// puzzle-rush.js - پازل عجله‌ای با پشتیبانی کامل از تم‌ها و ریسپانسیو
(function () {
  "use strict";

  // ----- متغیرها -----
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
  let isFlipped = false;
  let computerMoveHighlight = null;

  // متغیرهای پازل عجله‌ای
  let currentMode = "unlimited";
  let timeLeft = 0;
  let mistakes = 0;
  let solvedCount = 0;
  let streak = 0;
  let gameActive = false;
  let timerInterval = null;
  let bestRecord = { 3: 0, 5: 0, unlimited: 0 };

  // ----- المنت‌ها -----
  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const resetBtn = document.getElementById("resetGameBtn");
  const puzzleCounterSpan = document.getElementById("puzzleCounter");
  const timerDisplaySpan = document.getElementById("timerDisplay");
  const mistakeDisplaySpan = document.getElementById("mistakeDisplay");
  const turnDisplaySpan = document.getElementById("turnDisplay");
  const recordDisplayDiv = document.getElementById("recordDisplay");

  // ============================================
  // 🎨 دریافت مهره از تنظیمات
  // ============================================
  function getCurrentPieceSet() {
    try {
      const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
      return settings?.pieceSet || "classic";
    } catch {
      return "classic";
    }
  }

  // ============================================
  // 🖼️ بارگذاری تصاویر مهره‌ها
  // ============================================
  const pieceImages = {};
  const pieceCodes = {
    wK: "pieces/classic/wK.png",
    wQ: "pieces/classic/wQ.png",
    wR: "pieces/classic/wR.png",
    wB: "pieces/classic/wB.png",
    wN: "pieces/classic/wN.png",
    wP: "pieces/classic/wP.png",
    bK: "pieces/classic/bK.png",
    bQ: "pieces/classic/bQ.png",
    bR: "pieces/classic/bR.png",
    bB: "pieces/classic/bB.png",
    bN: "pieces/classic/bN.png",
    bP: "pieces/classic/bP.png",
  };

  function loadPieces() {
    return new Promise((resolve) => {
      const pieceSet = getCurrentPieceSet();
      let loaded = 0;
      const total = Object.keys(pieceCodes).length;
      for (const [key, filename] of Object.entries(pieceCodes)) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) resolve();
        };
        img.src = `pieces/${pieceSet}/${filename}`;
        pieceImages[key] = img;
      }
    });
  }

  // گوش‌دادن به تغییرات مهره‌ها
  document.addEventListener("pieceSetChanged", function (e) {
    loadPieces().then(() => {
      if (game) renderBoard();
    });
  });

  // گوش‌دادن به تغییرات تم
  document.addEventListener("themeChanged", function (e) {
    if (game) renderBoard();
  });

  // ============================================
  // 🎨 پنجره ترفیع
  // ============================================
  const promotionModal = document.createElement("div");
  promotionModal.id = "promotionModal";
  promotionModal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); display: none; justify-content: center;
    align-items: center; z-index: 2000; backdrop-filter: blur(4px);
  `;
  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
    background: white; border-radius: 32px; padding: 20px; text-align: center;
    box-shadow: 0 20px 35px rgba(0,0,0,0.3); direction: rtl;
    max-width: 90vw;
  `;
  modalContent.innerHTML =
    "<h3 style='margin-bottom:15px;'>ترفیع پیاده</h3><div id='promotionOptions' style='display:flex; gap:15px; justify-content:center; flex-wrap:wrap;'></div>";
  promotionModal.appendChild(modalContent);
  document.body.appendChild(promotionModal);

  function showPromotion(from, to, color, callback) {
    const optionsDiv = document.getElementById("promotionOptions");
    optionsDiv.innerHTML = "";
    const pieces = [
      { type: "n", name: "اسب", file: "pieces/classic/wN.png" },
      { type: "b", name: "فیل", file: "pieces/classic/wB.png" },
      { type: "r", name: "رخ", file: "pieces/classic/wR.png" },
      { type: "q", name: "وزیر", file: "pieces/classic/wQ.png" },
    ];
    const pieceSet = getCurrentPieceSet();
    pieces.forEach((piece) => {
      const btn = document.createElement("div");
      btn.style.cssText = `
        cursor: pointer; padding: 10px; background: #f0f0f0;
        border-radius: 20px; transition: 0.2s; margin: 5px;
        text-align: center; min-width: 60px;
      `;
      btn.onmouseover = () => (btn.style.transform = "scale(1.05)");
      btn.onmouseout = () => (btn.style.transform = "scale(1)");
      btn.ontouchstart = () => (btn.style.transform = "scale(0.95)");
      btn.ontouchend = () => (btn.style.transform = "scale(1)");

      const img = document.createElement("img");
      img.src = `pieces/${pieceSet}/${piece.file}`;
      img.style.width = "60px";
      img.style.height = "60px";
      img.style.maxWidth = "50px";
      img.style.maxHeight = "50px";

      const label = document.createElement("div");
      label.textContent = piece.name;
      label.style.fontSize = "0.8rem";
      label.style.marginTop = "4px";

      btn.appendChild(img);
      btn.appendChild(label);
      btn.onclick = () => {
        promotionModal.style.display = "none";
        callback(piece.type);
      };
      optionsDiv.appendChild(btn);
    });
    promotionModal.style.display = "flex";
  }

  // ============================================
  // 🎨 تشخیص رنگ کاربر
  // ============================================
  function computeUserColor(moves) {
    if (!moves || moves.length === 0) return "w";
    const firstMoveColor = moves[0].color;
    return firstMoveColor === "w" ? "b" : "w";
  }

  // ============================================
  // 🎨 رسم تخته (با چرخش و هایلایت)
  // ============================================
  function renderBoard(highlightFrom = null, highlightTo = null) {
    if (!game) return;
    const board = game.board();
    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";
    boardDiv.style.touchAction = "none";
    boardDiv.style.userSelect = "none";
    boardDiv.style.webkitUserSelect = "none";

    const pieceSet = getCurrentPieceSet();
    const flipped = userColor === "b";
    isFlipped = flipped;
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

        // هایلایت حرکت کامپیوتر
        if (highlightFrom && squareName === highlightFrom) {
          squareDiv.classList.add("computer-from");
        }
        if (highlightTo && squareName === highlightTo) {
          squareDiv.classList.add("computer-to");
        }

        // هایلایت مهره انتخاب‌شده
        if (selectedSquare && squareName === selectedSquare) {
          squareDiv.classList.add("selected");
        }

        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toUpperCase();
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
  // 💬 پیام‌ها
  // ============================================
  function showMessage(text, type) {
    msgDiv.textContent = text;
    msgDiv.className = `message ${type}`;
    setTimeout(() => {
      if (msgDiv.textContent === text) msgDiv.className = "message";
    }, 3500);
  }

  // ============================================
  // 📦 بارگذاری پازل‌ها
  // ============================================
  async function loadAllPuzzles() {
    try {
      const response = await fetch("data/puzzles.txt");
      if (!response.ok) throw new Error("فایل یافت نشد");
      const text = await response.text();
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      if (lines.length === 0) throw new Error("فایل خالی است");

      allPuzzles = [];
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length < 3) continue;

        const fen = parts[1].trim();
        const movesStr = parts[2].trim();
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
  // 🎲 انتخاب پازل تصادفی
  // ============================================
  function getRandomPuzzleIndex() {
    if (allPuzzles.length === 0) return -1;
    if (usedPuzzleIndices.size >= allPuzzles.length) {
      usedPuzzleIndices.clear();
    }
    let available = [];
    for (let i = 0; i < allPuzzles.length; i++) {
      if (!usedPuzzleIndices.has(i)) available.push(i);
    }
    if (available.length === 0) {
      usedPuzzleIndices.clear();
      available = allPuzzles.map((_, i) => i);
    }
    const randomIndex = available[Math.floor(Math.random() * available.length)];
    usedPuzzleIndices.add(randomIndex);
    return randomIndex;
  }

  // ============================================
  // 🎯 بارگذاری پازل تصادفی
  // ============================================
  function loadRandomPuzzle() {
    if (!allPuzzles.length) {
      showMessage("هیچ پازلی وجود ندارد!", "error");
      return;
    }

    const index = getRandomPuzzleIndex();
    if (index === -1) {
      showMessage("خطا در انتخاب پازل", "error");
      return;
    }

    const puzzle = allPuzzles[index];
    currentPuzzleId = puzzle.id;
    game = new Chess(puzzle.fen);
    puzzleMoves = puzzle.movesWithColor;
    userColor = computeUserColor(puzzleMoves);
    selectedSquare = null;
    currentMoveIndex = 0;
    puzzleFinished = false;
    computerMoveHighlight = null;

    renderBoard();
    msgDiv.textContent = "";

    const colorName = userColor === "w" ? "سفید" : "سیاه";
    turnDisplaySpan.textContent = `⏳ شروع پازل (شما: ${colorName})`;
    updateStats();

    // اگر حرکت اول مال حریف باشد، کامپیوتر شروع کند
    if (currentMoveIndex < puzzleMoves.length) {
      const firstMove = puzzleMoves[0];
      if (firstMove.color !== userColor) {
        setTimeout(() => {
          autoComputerMove();
        }, 500);
      } else {
        showMessage("✨ نوبت شماست. حرکت کنید.", "info");
        turnDisplaySpan.textContent = "👤 نوبت شما";
      }
    }
  }

  // ============================================
  // 🤖 حرکت کامپیوتر
  // ============================================
  async function autoComputerMove() {
    if (puzzleFinished) return;
    if (currentMoveIndex >= puzzleMoves.length) return;

    const expected = puzzleMoves[currentMoveIndex];
    if (expected.color === userColor) {
      showMessage("✨ نوبت شماست. حرکت کنید.", "info");
      turnDisplaySpan.textContent = "👤 نوبت شما";
      return;
    }

    turnDisplaySpan.textContent = `🤖 کامپیوتر در حال حرکت...`;

    let promotionPiece = "q";
    if (expected.uci.length === 5) {
      const promoChar = expected.uci[4];
      if (promoChar === "n") promotionPiece = "n";
      else if (promoChar === "b") promotionPiece = "b";
      else if (promoChar === "r") promotionPiece = "r";
      else promotionPiece = "q";
    }

    try {
      const from = expected.uci.slice(0, 2);
      const to = expected.uci.slice(2, 4);
      const result = game.move({ from, to, promotion: promotionPiece });

      if (result) {
        renderBoard(from, to);
        computerMoveHighlight = { from, to };
        turnDisplaySpan.textContent = `🤖 کامپیوتر: ${result.san}`;
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
            turnDisplaySpan.textContent = "👤 نوبت شما";
          }
        } else {
          showMessage("✅ پازل کامل شد!", "success");
          puzzleFinished = true;
          handlePuzzleSolved();
        }
      } else {
        console.error("Auto move failed:", expected.uci);
        showMessage("خطا در دنباله پازل. ریست کنید.", "error");
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
    showMessage(
      `✅ پازل ${solvedCount} حل شد! ${streak >= 2 ? `🔥 کامبو x${streak}` : ""}`,
      "success",
    );
    puzzleCounterSpan.textContent = solvedCount;
    updateStats();

    const currentBest = bestRecord[currentMode] || 0;
    if (solvedCount > currentBest) {
      bestRecord[currentMode] = solvedCount;
      localStorage.setItem(
        "chesshub_puzzle_records",
        JSON.stringify(bestRecord),
      );
      recordDisplayDiv.textContent = `🏆 رکورد جدید! ${solvedCount} پازل! 🎉`;
      recordDisplayDiv.style.display = "block";
      setTimeout(() => {
        recordDisplayDiv.style.display = "none";
      }, 3000);
    }

    if (gameActive) {
      setTimeout(() => {
        loadRandomPuzzle();
      }, 500);
    }
  }

  // ============================================
  // 🎯 حرکت کاربر
  // ============================================
  async function tryMove(from, to) {
    if (puzzleFinished) {
      showMessage("پازل تمام شده", "info");
      return false;
    }
    if (game.turn() !== userColor) {
      showMessage("نوبت کامپیوتر است", "info");
      return false;
    }
    if (currentMoveIndex >= puzzleMoves.length) {
      showMessage("پازل کامل شد", "success");
      return false;
    }

    const expected = puzzleMoves[currentMoveIndex];
    if (expected.color !== userColor) {
      showMessage("نوبت کامپیوتر است", "info");
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
      if (expected.uci.length === 5) {
        const promoChar = expected.uci[4];
        if (promoChar === "n") promotion = "n";
        else if (promoChar === "b") promotion = "b";
        else if (promoChar === "r") promotion = "r";
        else promotion = "q";
      } else {
        promotion = await new Promise((resolve) => {
          showPromotion(from, to, game.turn(), resolve);
        });
      }
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
          // حرکت صحیح
          showMessage(`✅ حرکت صحیح: ${result.san}`, "success");
          currentMoveIndex++;
          renderBoard();
          turnDisplaySpan.textContent = "⏳ در انتظار کامپیوتر...";

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
            } else {
              showMessage("✨ نوبت شماست. حرکت کنید.", "info");
              turnDisplaySpan.textContent = "👤 نوبت شما";
            }
          } else {
            showMessage("✅ پازل کامل شد!", "success");
            puzzleFinished = true;
            handlePuzzleSolved();
          }
          return true;
        } else {
          // حرکت اشتباه
          game.undo();
          renderBoard();
          mistakes++;

          if (currentMode === "unlimited" && mistakes >= 3) {
            puzzleFinished = true;
            gameActive = false;
            stopTimer();
            boardDiv.style.pointerEvents = "none";
            showMessage("⛔ سه خطا انجام شد! بازی تمام شد.", "error");
          } else {
            if (currentMode === "unlimited") {
              showMessage(
                `❌ حرکت اشتباه. ${3 - mistakes} فرصت باقی مانده.`,
                "error",
              );
            } else {
              showMessage(`❌ حرکت اشتباه.`, "error");
            }
          }
          updateStats();
          selectedSquare = null;
          return false;
        }
      } else {
        // حرکت غیرمجاز
        mistakes++;

        if (currentMode === "unlimited" && mistakes >= 3) {
          puzzleFinished = true;
          gameActive = false;
          stopTimer();
          boardDiv.style.pointerEvents = "none";
          showMessage("⛔ سه خطا انجام شد! بازی تمام شد.", "error");
        } else {
          if (currentMode === "unlimited") {
            showMessage(
              `❌ حرکت غیرمجاز. ${3 - mistakes} فرصت باقی مانده.`,
              "error",
            );
          } else {
            showMessage(`❌ حرکت غیرمجاز.`, "error");
          }
        }
        selectedSquare = null;
        renderBoard();
        updateStats();
        return false;
      }
    } catch (e) {
      showMessage("خطا در حرکت", "error");
      return false;
    }
  }

  // ============================================
  // 🖱️ رویدادهای کشیدن (بهینه‌شده برای موبایل)
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
    if (puzzleFinished) return;
    if (game.turn() !== userColor) return;

    // دریافت المان دقیق‌تر با useCapture
    const elem = document.elementFromPoint(clientX, clientY);
    const squareDiv = elem?.closest?.(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;
    const piece = game.get(square);
    if (piece && piece.color === userColor) {
      dragStartSquare = square;
      isDragging = true;

      dragClone = createDragClone(square);
      if (dragClone) {
        updateDragClone(clientX, clientY);
      }

      boardDiv.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      boardDiv.style.touchAction = "none";
    }
  }

  function handleDragMove(clientX, clientY) {
    if (!isDragging) return;
    if (dragClone) {
      updateDragClone(clientX, clientY);
    }
  }

  function handleDragEnd(clientX, clientY) {
    if (!isDragging || !dragStartSquare) {
      cleanupDrag();
      return;
    }
    removeDragClone();

    // دریافت المان دقیق‌تر
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

  // رویدادهای ماوس
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

  // رویدادهای لمسی (بهینه‌شده برای موبایل)
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

  // کلیک جایگزین برای موبایل‌های قدیمی
  function onClickFallback(e) {
    if (isDragging) return;
    if (puzzleFinished) return;
    if (game.turn() !== userColor) return;
    if (computerMoveHighlight) {
      computerMoveHighlight = null;
      renderBoard();
    }

    const squareDiv = e.target.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;

    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === userColor) {
        selectedSquare = square;
        renderBoard();
      } else {
        showMessage(
          `مهره ${userColor === "w" ? "سفید" : "سیاه"} خود را انتخاب کنید`,
          "error",
        );
      }
    } else {
      tryMove(selectedSquare, square);
      selectedSquare = null;
    }
  }

  // ============================================
  // 📊 آمار و تایمر
  // ============================================
  function updateStats() {
    if (currentMode === "unlimited") {
      mistakeDisplaySpan.textContent = `❌ خطا: ${mistakes}/3`;
      timerDisplaySpan.textContent = "⏱️ ∞";
    } else {
      mistakeDisplaySpan.textContent = `❌ خطا: ${mistakes}`;
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      timerDisplaySpan.textContent = `⏱️ ${m}:${s.toString().padStart(2, "0")}`;
    }
    puzzleCounterSpan.textContent = solvedCount;
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
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

  // ============================================
  // 🎮 مدیریت بازی
  // ============================================
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

    puzzleCounterSpan.textContent = "0";
    updateStats();
    removeDragClone();

    if (allPuzzles.length) {
      loadRandomPuzzle();
      if (currentMode === "3") startTimer(180);
      else if (currentMode === "5") startTimer(300);
      else {
        timerDisplaySpan.textContent = "⏱️ ∞";
        timeLeft = Infinity;
      }
    }
    showMessage("🔄 بازی جدید شروع شد!", "info");
  }

  function setMode(mode) {
    if (gameActive) {
      if (!confirm("آیا میخوای حالت رو عوض کنی؟ بازی فعلی ریست میشه.")) return;
    }
    currentMode = mode;
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    resetGame();
  }

  // ============================================
  // 💾 بارگذاری رکورد
  // ============================================
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
    const loaded = await loadAllPuzzles();
    if (loaded) {
      document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => setMode(btn.dataset.mode));
      });
      document
        .querySelector('.mode-btn[data-mode="unlimited"]')
        .classList.add("active");

      // رویدادهای ماوس
      boardDiv.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      // رویدادهای لمسی (با passive: false برای preventDefault)
      boardDiv.addEventListener("touchstart", onTouchStart, { passive: false });
      boardDiv.addEventListener("touchmove", onTouchMove, { passive: false });
      boardDiv.addEventListener("touchend", onTouchEnd, { passive: false });

      // کلیک جایگزین
      boardDiv.addEventListener("click", onClickFallback);

      resetBtn.addEventListener("click", resetGame);
      boardDiv.style.cursor = "grab";

      // اعمال تم اولیه
      resetGame();
    }
  });
})();



