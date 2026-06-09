// puzzle.js - پازل روزانه با تشخیص خودکار رنگ کاربر و نمایش آن
(function () {
  // ----- متغیرها -----
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
  let currentPuzzle = null;
  let puzzleMoves = [];
  let userColor = null;

  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const resetBtn = document.getElementById("resetBtn");
  const hintBtn = document.getElementById("hintBtn");
  const descriptionP = document.querySelector(".puzzle-card p");

  // ----- بارگذاری تصاویر مهره‌ها -----
  const pieceImages = {};
  const pieceCodes = {
    wK: "wK.svg",
    wQ: "wQ.svg",
    wR: "wR.svg",
    wB: "wB.svg",
    wN: "wN.svg",
    wP: "wP.svg",
    bK: "bK.svg",
    bQ: "bQ.svg",
    bR: "bR.svg",
    bB: "bB.svg",
    bN: "bN.svg",
    bP: "bP.svg",
  };
  function loadPieces() {
    return new Promise((resolve) => {
      let loaded = 0;
      const total = Object.keys(pieceCodes).length;
      for (const [key, filename] of Object.entries(pieceCodes)) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) resolve();
        };
        img.src = `pieces/merida/${filename}`;
        pieceImages[key] = img;
      }
    });
  }

  // ----- پنجره ترفیع -----
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
  `;
  modalContent.innerHTML =
    "<h3 style='margin-bottom:15px;'>ترفیع پیاده</h3><div id='promotionOptions' style='display:flex; gap:15px; justify-content:center; flex-wrap:wrap;'></div>";
  promotionModal.appendChild(modalContent);
  document.body.appendChild(promotionModal);

  function showPromotion(from, to, color, callback) {
    const optionsDiv = document.getElementById("promotionOptions");
    optionsDiv.innerHTML = "";
    const pieces = [
      { type: "n", name: "اسب", file: "wN.svg" },
      { type: "b", name: "فیل", file: "wB.svg" },
      { type: "r", name: "رخ", file: "wR.svg" },
      { type: "q", name: "وزیر", file: "wQ.svg" },
    ];
    pieces.forEach((piece) => {
      const btn = document.createElement("div");
      btn.style.cssText =
        "cursor:pointer; padding:10px; background:#f0f0f0; border-radius:20px; transition:0.2s; margin:5px;";
      btn.onmouseover = () => (btn.style.transform = "scale(1.05)");
      btn.onmouseout = () => (btn.style.transform = "scale(1)");
      const img = document.createElement("img");
      img.src = `pieces/merida/${piece.file}`;
      img.style.width = "60px";
      img.style.height = "60px";
      const label = document.createElement("div");
      label.textContent = piece.name;
      label.style.fontSize = "0.8rem";
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

  // ----- رسم تخته (سفید پایین) -----
  function renderBoard() {
    if (!game) return;
    const board = game.board();
    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";
    for (let i = 7; i >= 0; i--) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        const isLight = (i + j) % 2 === 0;
        const squareDiv = document.createElement("div");
        squareDiv.className = `square ${isLight ? "light" : "dark"}`;
        const file = String.fromCharCode(97 + j);
        const rank = 8 - i;
        const squareName = file + rank;
        squareDiv.dataset.square = squareName;
        if (piece) {
          const pieceType = piece.type.toUpperCase();
          const colorCode = piece.color === "w" ? "w" : "b";
          let pieceCode = "";
          switch (pieceType) {
            case "K":
              pieceCode = "K";
              break;
            case "Q":
              pieceCode = "Q";
              break;
            case "R":
              pieceCode = "R";
              break;
            case "B":
              pieceCode = "B";
              break;
            case "N":
              pieceCode = "N";
              break;
            case "P":
              pieceCode = "P";
              break;
          }
          const img = document.createElement("img");
          img.src = `pieces/merida/${colorCode}${pieceCode}.svg`;
          img.classList.add("piece-img");
          squareDiv.appendChild(img);
        }
        boardDiv.appendChild(squareDiv);
      }
    }
    if (selectedSquare) {
      const selectedEl = document.querySelector(
        `.square[data-square="${selectedSquare}"]`,
      );
      if (selectedEl) selectedEl.classList.add("selected");
    }
  }

  function showMessage(text, type) {
    msgDiv.textContent = text;
    msgDiv.className = `message ${type}`;
    setTimeout(() => {
      if (msgDiv.textContent === text) msgDiv.className = "message";
    }, 3000);
  }

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

  // ----- محاسبه رنگ کاربر -----
  function computeUserColor(moves) {
    if (!moves.length) return "w";
    for (let i = 0; i < moves.length; i++) {
      if (i % 2 === 1) return moves[i].color;
    }
    return moves[0].color === "w" ? "b" : "w";
  }

  function updateUserColorText() {
    if (!descriptionP) return;
    const colorName = userColor === "w" ? "سفید" : "سیاه";
    descriptionP.innerHTML = `با مهره‌های <strong>${colorName}</strong> بازی می‌کنی. بهترین حرکت رو پیدا کن.`;
  }

  // ----- بارگذاری پازل روزانه -----
  async function loadDailyPuzzle() {
    try {
      const response = await fetch("daily-puzzle.txt");
      if (!response.ok) throw new Error("فایل یافت نشد");
      const text = await response.text();
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      if (lines.length === 0) throw new Error("فایل خالی است");

      const lastDateKey = "chesshub_daily_puzzle_date";
      const lastIndexKey = "chesshub_daily_puzzle_index";
      const today = new Date().toDateString();
      let selectedIndex = 0;
      const savedDate = localStorage.getItem(lastDateKey);
      if (savedDate === today) {
        const savedIndex = localStorage.getItem(lastIndexKey);
        if (savedIndex !== null && parseInt(savedIndex) < lines.length) {
          selectedIndex = parseInt(savedIndex);
        }
      } else {
        let nextIndex = 0;
        const previousIndex = localStorage.getItem(lastIndexKey);
        if (previousIndex !== null) {
          nextIndex = (parseInt(previousIndex) + 1) % lines.length;
        }
        selectedIndex = nextIndex;
        localStorage.setItem(lastDateKey, today);
        localStorage.setItem(lastIndexKey, selectedIndex);
      }

      const line = lines[selectedIndex];
      const parts = line.split(",");
      if (parts.length < 3) throw new Error("فرمت خط نامعتبر");
      const fen = parts[1];
      const movesStr = parts[2];
      const moveArray = movesStr.trim().split(/\s+/);
      const turn = fen.split(" ")[1];
      const movesWithColor = [];
      let currentColor = turn;
      for (let i = 0; i < moveArray.length; i++) {
        movesWithColor.push({ color: currentColor, uci: moveArray[i] });
        currentColor = currentColor === "w" ? "b" : "w";
      }
      return { fen, movesWithColor };
    } catch (err) {
      console.error(err);
      showMessage(
        "خطا در بارگذاری پازل. از پازل پیش‌فرض استفاده می‌شود.",
        "error",
      );
      return null;
    }
  }

  async function initPuzzle() {
    const puzzle = await loadDailyPuzzle();
    if (!puzzle) {
      game = new Chess(
        "r2q1rk1/4bppp/p1n1pn2/1p1pN3/2pP2b1/1PP1P3/PBQN1PPP/RB3RK1 b - - 1 12",
      );
      puzzleMoves = [
        { color: "b", uci: "g4f5" },
        { color: "w", uci: "e5c6" },
        { color: "b", uci: "f5c2" },
        { color: "w", uci: "c6d8" },
        { color: "b", uci: "c2b1" },
        { color: "w", uci: "d8c6" },
      ];
    } else {
      game = new Chess(puzzle.fen);
      puzzleMoves = puzzle.movesWithColor;
    }
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
    if (
      !puzzleFinished &&
      currentMoveIndex < puzzleMoves.length &&
      puzzleMoves[currentMoveIndex].color !== userColor
    ) {
      autoComputerMove();
    } else if (game.turn() === userColor) {
      showMessage("✨ نوبت شماست. حرکت کنید.", "info");
    }
  }

  async function autoComputerMove() {
    if (puzzleFinished) return;
    if (currentMoveIndex >= puzzleMoves.length) return;
    const expected = puzzleMoves[currentMoveIndex];
    if (expected.color === userColor) return;

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
          showMessage(
            "🎉 مات! پازل حل شد. ۲۴ ساعت بعد پازل جدید می‌آید.",
            "success",
          );
          puzzleFinished = true;
        } else if (
          currentMoveIndex < puzzleMoves.length &&
          puzzleMoves[currentMoveIndex].color === userColor
        ) {
          showMessage("✨ نوبت شماست. حرکت کنید.", "info");
        } else {
          if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
          autoMoveTimeout = setTimeout(autoComputerMove, 300);
        }
      } else {
        console.error("Auto move failed:", expected.uci);
        showMessage("خطا در دنباله پازل. ریست کنید.", "error");
      }
    } catch (e) {
      console.error(e);
    }
  }

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
          showPromotion(from, to, userColor, resolve);
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
            showMessage(
              "🎉 مات! پازل حل شد. ۲۴ ساعت بعد پازل جدید می‌آید.",
              "success",
            );
            puzzleFinished = true;
            return true;
          }
          if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
          autoMoveTimeout = setTimeout(() => {
            if (
              currentMoveIndex < puzzleMoves.length &&
              puzzleMoves[currentMoveIndex].color !== userColor
            ) {
              autoComputerMove();
            }
            autoMoveTimeout = null;
          }, 300);
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
        // حرکت غیرمجاز – خطا محسوب می‌شود
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

  // ----- رویدادهای کشیدن مهره (ماوس و لمس) -----
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
      boardDiv.style.cursor = "grabbing";
      document.body.style.overflow = "hidden";
      boardDiv.style.touchAction = "none";
    }
  }
  function handleDragMove(clientX, clientY) {
    if (!isDragging) return;
  }
  function handleDragEnd(clientX, clientY) {
    if (!isDragging || !dragStartSquare) {
      cleanupDrag();
      return;
    }
    const elem = document.elementFromPoint(clientX, clientY);
    const targetSquareDiv = elem?.closest(".square");
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
    document.body.style.overflow = "";
    boardDiv.style.touchAction = "";
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

  function resetPuzzle() {
    if (autoMoveTimeout) clearTimeout(autoMoveTimeout);
    if (lockTimer) clearTimeout(lockTimer);
    isLocked = false;
    boardDiv.classList.remove("board-locked");
    hintBtn.disabled = false;
    initPuzzle();
  }

  loadPieces().then(() => {
    initPuzzle();
    boardDiv.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    boardDiv.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    boardDiv.addEventListener("click", onClickFallback);
    resetBtn.addEventListener("click", resetPuzzle);
    hintBtn.addEventListener("click", showHint);
    boardDiv.style.cursor = "grab";
  });
})();
