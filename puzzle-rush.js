// puzzle-rush.js - پازل عجله‌ای با درگ یکسان puzzle.js
(function () {
  // ---------- متغیرها ----------
  let game = null;
  let selectedSquare = null;
  let currentMoveIndex = 0;
  let puzzleFinished = false;
  let wrongAttempts = 0;
  let isLocked = false;
  let lockTimer = null;
  let dragStartSquare = null;
  let isDragging = false;

  let puzzlesList = [];
  let currentPuzzle = null;
  let currentMode = null;
  let timeLeft = 0;
  let mistakes = 0;
  let gameActive = false;
  let timerInterval = null;
  let solvedCount = 0;
  let bestRecord = { 3: 0, 5: 0, unlimited: 0 };
  let expectedMoves = [];
  let firstTurn = null;

  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const puzzleCounterSpan = document.getElementById("puzzleCounter");
  const timerDisplaySpan = document.getElementById("timerDisplay");
  const mistakeDisplaySpan = document.getElementById("mistakeDisplay");
  const turnDisplaySpan = document.getElementById("turnDisplay");
  const recordDisplayDiv = document.getElementById("recordDisplay");
  const resetBtn = document.getElementById("resetGameBtn");
  const hintBtn = document.getElementById("hintBtn");

  // ---------- بارگذاری تصاویر مهره‌ها ----------
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

  // ---------- پنجره ترفیع ----------
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

  // ---------- رسم تخته ----------
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
    showMessage("⏳ سه خطا! ۵ ثانیه صبر کن...", "lock");
    lockTimer = setTimeout(() => {
      isLocked = false;
      boardDiv.classList.remove("board-locked");
      hintBtn.disabled = false;
      mistakes = 0;
      updateMistakeDisplay();
      showMessage(
        "✅ زمان قفل تمام شد، دوباره حرکت کن (۳ فرصت جدید).",
        "success",
      );
      lockTimer = null;
    }, 5000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }
  function startTimer(seconds) {
    stopTimer();
    timeLeft = seconds;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (!gameActive) return;
      if (timeLeft <= 0) {
        stopTimer();
        gameActive = false;
        showMessage("⏰ زمان تمام شد! بازی تمام شد.", "warning");
        boardDiv.style.pointerEvents = "none";
        hintBtn.disabled = true;
      } else {
        timeLeft--;
        updateTimerDisplay();
      }
    }, 1000);
  }
  function updateTimerDisplay() {
    if (currentMode === "unlimited") timerDisplaySpan.textContent = "⏱️ ∞";
    else {
      const m = Math.floor(timeLeft / 60),
        s = timeLeft % 60;
      timerDisplaySpan.textContent = `⏱️ ${m}:${s.toString().padStart(2, "0")}`;
    }
  }
  function updateMistakeDisplay() {
    if (currentMode === "unlimited")
      mistakeDisplaySpan.textContent = `❌ خطا: ${mistakes}/3`;
    else mistakeDisplaySpan.textContent = `❌ خطا: ${mistakes}`;
  }
  function updateTurnDisplay() {
    if (game && gameActive) {
      const turn = game.turn() === "w" ? "سفید" : "سیاه";
      const icon = game.turn() === "w" ? "⚪" : "⚫";
      turnDisplaySpan.textContent = `${icon} نوبت: ${turn}`;
    }
  }
  function getRandomPuzzle() {
    return puzzlesList.length
      ? puzzlesList[Math.floor(Math.random() * puzzlesList.length)]
      : null;
  }

  function isUserTurn() {
    return currentMoveIndex % 2 === 1;
  }

  async function autoComputerMove() {
    if (!gameActive) return false;
    if (currentMoveIndex >= expectedMoves.length) return false;
    if (isUserTurn()) return false;
    const expected = expectedMoves[currentMoveIndex];
    let promotionPiece = "q";
    if (expected.length === 5) {
      const promoChar = expected[4];
      if (promoChar === "n") promotionPiece = "n";
      else if (promoChar === "b") promotionPiece = "b";
      else if (promoChar === "r") promotionPiece = "r";
      else promotionPiece = "q";
    }
    try {
      const from = expected.slice(0, 2);
      const to = expected.slice(2, 4);
      const result = game.move({ from, to, promotion: promotionPiece });
      if (result) {
        renderBoard();
        updateTurnDisplay();
        currentMoveIndex++;
        if (game.game_over() && game.in_checkmate()) {
          showMessage("🎉 مات! پازل با موفقیت حل شد.", "success");
          await handlePuzzleSolved();
          return true;
        }
        if (currentMoveIndex >= expectedMoves.length) {
          await handlePuzzleSolved();
          return true;
        }
        if (isUserTurn()) showMessage("✨ نوبت شماست. حرکت کنید.", "info");
        else setTimeout(() => autoComputerMove(), 200);
        return true;
      } else {
        console.error("Auto move failed:", expected);
        showMessage("خطا در اجرای خودکار حرکت", "error");
        return false;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function handlePuzzleSolved() {
    solvedCount++;
    puzzleCounterSpan.textContent = solvedCount;
    showMessage(`✅ پازل حل شد! (${solvedCount})`, "success");
    const isNewRecord = saveRecord(currentMode, solvedCount);
    if (isNewRecord) showRecordIfNew(solvedCount, currentMode);
    const nextPuzzle = getRandomPuzzle();
    if (nextPuzzle) {
      await loadPuzzleAndStart(nextPuzzle);
    } else {
      gameActive = false;
      showMessage("تمام پازل‌ها تمام شد! تبریک!", "success");
      boardDiv.style.pointerEvents = "none";
      hintBtn.disabled = true;
      stopTimer();
    }
  }

  async function loadPuzzleAndStart(puzzle) {
    if (!puzzle) return false;
    game = new Chess(puzzle.fen);
    selectedSquare = null;
    currentPuzzle = puzzle;
    expectedMoves = [...puzzle.movesUCI];
    firstTurn = puzzle.fen.split(" ")[1];
    currentMoveIndex = 0;
    puzzleFinished = false;
    wrongAttempts = 0;
    renderBoard();
    updateTurnDisplay();
    if (expectedMoves.length > 0 && !isUserTurn()) {
      await autoComputerMove();
    } else if (expectedMoves.length > 0 && isUserTurn()) {
      showMessage("✨ نوبت شماست. حرکت کنید.", "info");
    }
    return true;
  }

  function getExpectedUserColor() {
    if (!firstTurn) return "w";
    if (currentMoveIndex % 2 === 1) return firstTurn === "w" ? "b" : "w";
    return firstTurn;
  }

  async function makeUserMove(from, to) {
    if (!gameActive) {
      showMessage("بازی فعال نیست", "info");
      return false;
    }
    if (isLocked) {
      showMessage("تخته قفل است", "info");
      return false;
    }
    if (game.turn() !== getExpectedUserColor()) {
      showMessage("نوبت شما نیست", "info");
      return false;
    }
    if (currentMoveIndex >= expectedMoves.length) {
      showMessage("پازل کامل شد", "success");
      return false;
    }
    if (!isUserTurn()) {
      showMessage("نوبت کامپیوتر است", "info");
      return false;
    }

    const expectedUCI = expectedMoves[currentMoveIndex];
    const piece = game.get(from);
    const isPawnPromotion =
      piece &&
      piece.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"));
    let promotion = "q";
    if (isPawnPromotion) {
      if (expectedUCI.length === 5) {
        const promoChar = expectedUCI[4];
        if (promoChar === "n") promotion = "n";
        else if (promoChar === "b") promotion = "b";
        else if (promoChar === "r") promotion = "r";
        else promotion = "q";
      } else {
        promotion = await new Promise((resolve) => {
          showPromotion(from, to, getExpectedUserColor(), resolve);
        });
      }
    }

    try {
      const result = game.move({ from, to, promotion });
      if (result) {
        const playedUCI = result.from + result.to + (result.promotion || "");
        if (playedUCI === expectedUCI) {
          showMessage(`✅ حرکت صحیح!`, "success");
          if (currentMode !== "unlimited") {
            mistakes = 0;
            updateMistakeDisplay();
          }
          currentMoveIndex++;
          renderBoard();
          updateTurnDisplay();
          if (currentMoveIndex >= expectedMoves.length) {
            await handlePuzzleSolved();
            return true;
          }
          if (!isUserTurn()) setTimeout(() => autoComputerMove(), 200);
          return true;
        } else {
          // حرکت اشتباه (مجاز اما نادرست)
          mistakes++;
          updateMistakeDisplay();
          if (currentMode === "unlimited") {
            if (mistakes >= 3) {
              gameActive = false;
              showMessage("❌ سه اشتباه! بازی تمام شد.", "warning");
              boardDiv.style.pointerEvents = "none";
              hintBtn.disabled = true;
              stopTimer();
            } else {
              showMessage(`❌ حرکت اشتباه! (${mistakes}/3)`, "error");
              game.undo();
              renderBoard();
            }
          } else {
            if (mistakes >= 3) {
              lockBoardTemp();
              game.undo();
              renderBoard();
            } else {
              showMessage(`❌ حرکت اشتباه! (${mistakes}/3)`, "error");
              game.undo();
              renderBoard();
            }
          }
          return false;
        }
      } else {
        // حرکت غیرمجاز – خطا محسوب می‌شود
        mistakes++;
        updateMistakeDisplay();
        if (currentMode === "unlimited") {
          if (mistakes >= 3) {
            gameActive = false;
            showMessage("❌ سه اشتباه! بازی تمام شد.", "warning");
            boardDiv.style.pointerEvents = "none";
            hintBtn.disabled = true;
            stopTimer();
          } else {
            showMessage(`❌ حرکت غیرمجاز! (${mistakes}/3)`, "error");
          }
        } else {
          if (mistakes >= 3) {
            lockBoardTemp();
          } else {
            showMessage(`❌ حرکت غیرمجاز! (${mistakes}/3)`, "error");
          }
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

  // ---------- رویدادهای کشیدن مهره (دقیقاً مثل puzzle.js) ----------
  function handleDragStart(clientX, clientY) {
    if (!gameActive || isLocked) return;
    if (game.turn() !== getExpectedUserColor()) return;
    const elem = document.elementFromPoint(clientX, clientY);
    const squareDiv = elem?.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
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
      makeUserMove(dragStartSquare, targetSquare);
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
    if (!gameActive || isLocked) return;
    if (game.turn() !== getExpectedUserColor()) return;
    const squareDiv = e.target.closest(".square");
    if (!squareDiv) return;
    const square = squareDiv.dataset.square;
    if (!square) return;
    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        selectedSquare = square;
        renderBoard();
      } else {
        showMessage(
          `مهره ${game.turn() === "w" ? "سفید" : "سیاه"} خود را انتخاب کنید`,
          "error",
        );
      }
    } else {
      makeUserMove(selectedSquare, square);
      selectedSquare = null;
    }
  }

  function showHint() {
    if (!gameActive) {
      showMessage("بازی فعال نیست", "info");
      return;
    }
    if (isLocked) {
      showMessage("الان نمی‌توانی راهنمایی بگیری", "info");
      return;
    }
    if (currentMoveIndex < expectedMoves.length) {
      const uci = expectedMoves[currentMoveIndex];
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      let hint = `حرکت بعدی: ${from} → ${to}`;
      if (uci.length === 5) {
        const pieceName = { n: "اسب", b: "فیل", r: "رخ", q: "وزیر" }[uci[4]];
        hint += ` و ترفیع به ${pieceName}`;
      }
      showMessage(`💡 ${hint}`, "hint");
    } else {
      showMessage("پازل تمام شد!", "success");
    }
  }

  async function startNewGame(mode) {
    stopTimer();
    if (lockTimer) clearTimeout(lockTimer);
    isLocked = false;
    boardDiv.classList.remove("board-locked");
    gameActive = true;
    solvedCount = 0;
    mistakes = 0;
    puzzleCounterSpan.textContent = "0";
    updateMistakeDisplay();
    boardDiv.style.pointerEvents = "auto";
    hintBtn.disabled = false;
    recordDisplayDiv.style.display = "none";
    const firstPuzzle = getRandomPuzzle();
    if (!firstPuzzle) {
      showMessage("خطا در بارگذاری پازل", "error");
      return;
    }
    await loadPuzzleAndStart(firstPuzzle);
    if (mode === "3") startTimer(180);
    else if (mode === "5") startTimer(300);
    else timerDisplaySpan.textContent = "⏱️ ∞";
    currentMode = mode;
  }

  function setMode(mode) {
    startNewGame(mode);
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      if (btn.dataset.mode === mode) btn.classList.add("active");
      else btn.classList.remove("active");
    });
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
  function saveRecord(mode, score) {
    if (score > bestRecord[mode]) {
      bestRecord[mode] = score;
      localStorage.setItem(
        "chesshub_puzzle_records",
        JSON.stringify(bestRecord),
      );
      return true;
    }
    return false;
  }
  function showRecordIfNew(score, mode) {
    if (score === bestRecord[mode] && score > 0) {
      recordDisplayDiv.textContent = `🏆 رکورد جدید ${mode === "unlimited" ? "بی‌زمان" : mode + " دقیقه"}: ${score} پازل! 🏆`;
      recordDisplayDiv.style.display = "block";
      setTimeout(() => (recordDisplayDiv.style.display = "none"), 4000);
    } else recordDisplayDiv.style.display = "none";
  }

  async function loadPuzzles() {
    try {
      const response = await fetch("puzzles.txt");
      const text = await response.text();
      const lines = text.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const parts = line.split(",");
        if (parts.length >= 3) {
          const fen = parts[1].trim();
          const movesStr = parts[2].trim();
          const movesUCI = movesStr.split(/\s+/);
          if (fen && movesUCI.length) puzzlesList.push({ fen, movesUCI });
        }
      }
      if (puzzlesList.length === 0) useSamplePuzzles();
    } catch (err) {
      console.error(err);
      useSamplePuzzles();
    }
  }

  function useSamplePuzzles() {
    puzzlesList = [
      {
        fen: "5R2/6p1/4p2p/R3N3/5P1k/1rn1K3/6rP/8 w - - 0 1",
        movesUCI: ["e5f3", "g4h4", "a5g5", "h6g5", "e5f3", "h4h5", "f8h8"],
      },
      {
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        movesUCI: ["f3e5", "c6e5", "c4e5"],
      },
    ];
  }

  loadPieces().then(() => {
    loadRecords();
    loadPuzzles().then(() => {
      showMessage(
        "لطفاً یکی از حالت‌های زمان یا بی‌زمان را انتخاب کنید.",
        "info",
      );
    });
    resetBtn.addEventListener("click", () => {
      if (currentMode) setMode(currentMode);
      else showMessage("لطفاً ابتدا یک حالت را انتخاب کنید.", "info");
    });
    hintBtn.addEventListener("click", showHint);
    document
      .querySelectorAll(".mode-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () => setMode(btn.dataset.mode)),
      );

    boardDiv.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    boardDiv.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    boardDiv.addEventListener("click", onClickFallback);
  });
})();
