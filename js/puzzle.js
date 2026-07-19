// puzzle.js - پازل روزانه با استفاده از ChessUtils

(function () {
  "use strict";

  // ============================================
  // 📦 استفاده از ChessUtils (نسخه bound شده)
  // ============================================

  const {
    pieceCodes,
    getCurrentPieceSet,
    loadPieces,
    getBoardColors,
    showPromotion,
    computeUserColor,
  } = window.ChessUtilsBound;

  // ============================================
  // 📦 متغیرها
  // ============================================

  let game = null;
  let selectedSquare = null;
  let currentMoveIndex = 0;
  let puzzleFinished = false;
  let autoMoveTimeout = null;
  let wrongAttempts = 0;
  let isLocked = false;
  let lockTimer = null;
  let dragStartSquare = null;
  let isDragging = false;
  let dragClone = null;
  let puzzleMoves = [];
  let userColor = null;
  let allPuzzles = [];
  let currentPuzzleIndex = 0;
  let nextPuzzleTimer = null;

  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const resetBtn = document.getElementById("resetBtn");
  const hintBtn = document.getElementById("hintBtn");
  const descriptionP = document.querySelector(".puzzle-card p");

  // ============================================
  // 🎨 رسم تخته (با چرخش صحیح)
  // ============================================

  function renderBoard() {
    if (!game) return;
    const board = game.board();
    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";
    boardDiv.style.touchAction = "none";
    boardDiv.style.userSelect = "none";
    boardDiv.style.webkitUserSelect = "none";

    const pieceSet = getCurrentPieceSet();
    const colors = getBoardColors();
    const flipped = userColor === "b";

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

        if (selectedSquare === squareName) {
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
    }, 3000);
  }

  // ============================================
  // 🔒 قفل موقت تخته
  // ============================================

  function lockBoardTemp() {
    if (isLocked) return;
    isLocked = true;
    boardDiv.classList.add("board-locked");
    hintBtn.disabled = true;
    showMessage("⏳ سه خطا! ۳۰ ثانیه صبر کن...", "lock");
    lockTimer = setTimeout(() => {
      isLocked = false;
      boardDiv.classList.remove("board-locked");
      hintBtn.disabled = false;
      wrongAttempts = 0;
      showMessage(
        "✅ زمان قفل تمام شد، دوباره حرکت کن (سه فرصت جدید)",
        "success",
      );
      lockTimer = null;
    }, 30000);
  }

  // ============================================
  // 🎨 تشخیص و به‌روزرسانی رنگ کاربر
  // ============================================

  function updateUserColorText() {
    if (!descriptionP) return;
    const colorName = userColor === "w" ? "سفید" : "سیاه";
    descriptionP.innerHTML = `با مهره‌های <strong>${colorName}</strong> بازی می‌کنی. بهترین حرکت رو پیدا کن.`;
  }

  // ============================================
  // 📦 بارگذاری پازل‌ها (با fallback)
  // ============================================

  async function loadAllPuzzles() {
    try {
      const response = await fetch("data/daily-puzzle.txt");
      if (!response.ok) throw new Error("فایل یافت نشد");
      const text = await response.text();
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      if (lines.length === 0) throw new Error("فایل خالی است");

      const puzzles = [];
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
        puzzles.push({
          fen: fen,
          movesWithColor: movesWithColor,
        });
      }
      if (puzzles.length === 0) throw new Error("هیچ پازل معتبری یافت نشد");
      allPuzzles = puzzles;
      return true;
    } catch (err) {
      console.warn(
        "⚠️ خطا در بارگذاری daily-puzzle.txt، استفاده از پازل پیش‌فرض:",
        err.message,
      );
      allPuzzles = [
        {
          fen: "7k/5Q2/8/8/8/8/8/7K w - - 0 1",
          movesWithColor: [{ color: "w", uci: "f7f8" }],
        },
      ];
      return true;
    }
  }

  // ============================================
  // 📥 بارگذاری پازل بر اساس ایندکس
  // ============================================

  function loadPuzzleByIndex(index) {
    if (!allPuzzles.length || index >= allPuzzles.length) {
      if (allPuzzles.length) {
        showMessage("🎉 همه پازل‌ها حل شد! تبریک!", "success");
      }
      return;
    }

    const puzzle = allPuzzles[index];
    game = new Chess(puzzle.fen);
    puzzleMoves = puzzle.movesWithColor;
    userColor = computeUserColor(puzzleMoves);

    updateUserColorText();
    selectedSquare = null;
    currentMoveIndex = 0;
    puzzleFinished = false;
    wrongAttempts = 0;
    if (lockTimer) clearTimeout(lockTimer);
    isLocked = false;
    boardDiv.classList.remove("board-locked");
    hintBtn.disabled = false;
    renderBoard();
    msgDiv.textContent = "";

    if (nextPuzzleTimer) {
      clearTimeout(nextPuzzleTimer);
      nextPuzzleTimer = null;
    }

    if (currentMoveIndex < puzzleMoves.length) {
      const firstMove = puzzleMoves[0];
      if (firstMove.color !== userColor) {
        autoComputerMove();
      } else {
        showMessage("✨ نوبت شماست. حرکت کنید.", "info");
      }
    }
  }

  // ============================================
  // ⏭️ رفتن به پازل بعدی (با تأخیر ۲۴ ساعت)
  // ============================================

  function goToNextPuzzle() {
    if (nextPuzzleTimer) {
      clearTimeout(nextPuzzleTimer);
      nextPuzzleTimer = null;
    }

    const nextIndex = currentPuzzleIndex + 1;

    if (nextIndex < allPuzzles.length) {
      showMessage(`⏳ پازل بعدی در ۲۴ ساعت...`, "info");
      nextPuzzleTimer = setTimeout(() => {
        nextPuzzleTimer = null;
        currentPuzzleIndex = nextIndex;
        loadPuzzleByIndex(currentPuzzleIndex);
      }, 86400000);
    } else {
      showMessage("🎉 همه پازل‌ها حل شد! تبریک!", "success");
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
      return;
    }

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
        renderBoard();
        currentMoveIndex++;

        if (game.game_over() && game.in_checkmate()) {
          showMessage("🎉 مات! پازل حل شد.", "success");
          puzzleFinished = true;
          goToNextPuzzle();
          return;
        }

        if (currentMoveIndex < puzzleMoves.length) {
          const nextMove = puzzleMoves[currentMoveIndex];
          if (nextMove.color === userColor) {
            showMessage("✨ نوبت شماست. حرکت کنید.", "info");
          } else {
            if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
            autoMoveTimeout = setTimeout(autoComputerMove, 300);
          }
        } else {
          showMessage("✅ پازل کامل شد!", "success");
          puzzleFinished = true;
          goToNextPuzzle();
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
  // 🎯 حرکت کاربر
  // ============================================

  async function tryMove(from, to) {
    if (puzzleFinished) {
      showMessage("پازل تمام شده", "info");
      return false;
    }
    if (isLocked) {
      showMessage("تخته قفل است", "info");
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
          showPromotion(userColor, resolve);
        });
      }
    }

    try {
      const result = game.move({ from, to, promotion });
      if (result) {
        const playedUCI = result.from + result.to + (result.promotion || "");
        if (playedUCI === expected.uci) {
          showMessage(`✅ حرکت صحیح: ${result.san}`, "success");
          wrongAttempts = 0;
          currentMoveIndex++;
          renderBoard();

          if (game.game_over() && game.in_checkmate()) {
            showMessage("🎉 مات! پازل حل شد.", "success");
            puzzleFinished = true;
            goToNextPuzzle();
            return true;
          }

          if (currentMoveIndex < puzzleMoves.length) {
            const nextMove = puzzleMoves[currentMoveIndex];
            if (nextMove.color !== userColor) {
              if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
              autoMoveTimeout = setTimeout(autoComputerMove, 300);
            } else {
              showMessage("✨ نوبت شماست. حرکت کنید.", "info");
            }
          } else {
            showMessage("✅ پازل کامل شد!", "success");
            puzzleFinished = true;
            goToNextPuzzle();
          }
          return true;
        } else {
          wrongAttempts++;
          if (wrongAttempts >= 3) {
            lockBoardTemp();
            game.undo();
            renderBoard();
          } else {
            showMessage(`❌ حرکت اشتباه (${wrongAttempts}/3)`, "error");
            game.undo();
            renderBoard();
          }
          return false;
        }
      } else {
        wrongAttempts++;
        if (wrongAttempts >= 3) {
          lockBoardTemp();
        } else {
          showMessage(`❌ حرکت غیرمجاز (${wrongAttempts}/3)`, "error");
        }
        selectedSquare = null;
        renderBoard();
        return false;
      }
    } catch (e) {
      showMessage("خطا در حرکت", "error");
      return false;
    }
  }

  // ============================================
  // 🖱️ رویدادهای کشیدن (Drag & Drop)
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

  function cleanupDrag() {
    dragStartSquare = null;
    isDragging = false;
    boardDiv.style.cursor = "grab";
    document.body.style.userSelect = "";
    boardDiv.style.touchAction = "";
    removeDragClone();
  }

  function handleDragStart(clientX, clientY) {
    if (puzzleFinished || isLocked) return;
    if (game.turn() !== userColor) return;
    const elem = document.elementFromPoint(clientX, clientY);
    const squareDiv = elem?.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;
    const piece = game.get(square);
    if (piece && piece.color === userColor) {
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
    const targetSquareDiv = elem?.closest(".square");
    let targetSquare = targetSquareDiv ? targetSquareDiv.dataset.square : null;
    if (targetSquare && targetSquare !== dragStartSquare) {
      tryMove(dragStartSquare, targetSquare);
    }
    cleanupDrag();
  }

  // ============================================
  // 🖱️ رویدادهای ماوس و لمسی
  // ============================================

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

  // ============================================
  // 🖱️ کلیک جایگزین (برای موبایل‌های قدیمی)
  // ============================================

  function onClickFallback(e) {
    if (isDragging) return;
    if (puzzleFinished || isLocked) return;
    if (game.turn() !== userColor) return;
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
  // 💡 راهنمایی
  // ============================================

  function showHint() {
    if (puzzleFinished) {
      showMessage("پازل حل شده", "info");
      return;
    }
    if (isLocked) {
      showMessage("الان نمی‌توانی راهنمایی بگیری", "info");
      return;
    }
    if (game.turn() !== userColor) {
      showMessage("نوبت شما نیست", "info");
      return;
    }
    if (
      currentMoveIndex < puzzleMoves.length &&
      puzzleMoves[currentMoveIndex].color === userColor
    ) {
      const expected = puzzleMoves[currentMoveIndex];
      let hintText = `حرکت بعدی: ${expected.uci.slice(0, 2)} → ${expected.uci.slice(2, 4)}`;
      if (expected.uci.length === 5) {
        const pieceName = { n: "اسب", b: "فیل", r: "رخ", q: "وزیر" }[
          expected.uci[4]
        ];
        hintText += ` و ترفیع به ${pieceName}`;
      }
      showMessage(`💡 ${hintText}`, "hint");
    } else {
      showMessage("در حال حرکت کامپیوتر!", "info");
    }
  }

  // ============================================
  // 🔄 ریست پازل
  // ============================================

  function resetPuzzle() {
    if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
    if (lockTimer) clearTimeout(lockTimer);
    if (nextPuzzleTimer) {
      clearTimeout(nextPuzzleTimer);
      nextPuzzleTimer = null;
    }
    isLocked = false;
    boardDiv.classList.remove("board-locked");
    hintBtn.disabled = false;
    loadPuzzleByIndex(currentPuzzleIndex);
  }

  // ============================================
  // 🚀 راه‌اندازی پازل
  // ============================================

  async function initPuzzle() {
    const loaded = await loadAllPuzzles();
    if (loaded) {
      currentPuzzleIndex = 0;
      loadPuzzleByIndex(currentPuzzleIndex);
    } else {
      showMessage("خطا در بارگذاری پازل‌ها", "error");
    }
  }

  // ============================================
  // 🎯 ثبت رویدادها و شروع
  // ============================================

  loadPieces().then(() => {
    initPuzzle();

    boardDiv.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    boardDiv.addEventListener("touchstart", onTouchStart, { passive: false });
    boardDiv.addEventListener("touchmove", onTouchMove, { passive: false });
    boardDiv.addEventListener("touchend", onTouchEnd);
    boardDiv.addEventListener("click", onClickFallback);

    resetBtn.addEventListener("click", resetPuzzle);
    hintBtn.addEventListener("click", showHint);
    boardDiv.style.cursor = "grab";
  });
})();
