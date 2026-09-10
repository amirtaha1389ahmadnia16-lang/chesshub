// endgames.js – تمرین آخربازی هوشمند با راهنمایی

(function () {
  "use strict";

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

  let endgames = [];
  let currentIndex = 0;
  let game = null;
  let selectedSquare = null;
  let currentUserColor = "w";
  let currentDesiredResult = "1-0";
  let isComputerThinking = false;
  let isHintActive = false;
  let hintMove = null; // ذخیره حرکت راهنمایی

  let stockfish = null;
  let stockfishReady = false;
  let stockfishMode = "engine"; // "engine" یا "hint"

  const boardDiv = document.getElementById("chessboard");
  const msgDiv = document.getElementById("message");
  const endgameSelect = document.getElementById("endgameSelect"); // در صورت نیاز
  const turnSpan = document.getElementById("turnDisplay");
  const moveCountSpan = document.getElementById("moveCount");
  const positionCounterSpan = document.getElementById("positionCounter");
  const egName = document.getElementById("egName");
  const egGoal = document.getElementById("egGoal");
  const egTurn = document.getElementById("egTurn");

  function showMessage(text, type = "info") {
    msgDiv.style.display = "flex";
    msgDiv.className = `rush-message show ${type}`;
    const iconMap = {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      info: "fa-info-circle",
      warning: "fa-exclamation-triangle",
    };
    msgDiv.innerHTML = `<i class="fas ${iconMap[type] || ""}"></i> ${text}`;
  }

  function updateStats() {
    const hist = game.history({ verbose: true });
    moveCountSpan.innerHTML = `<i class="fas fa-exchange-alt"></i> ${Math.ceil(hist.length / 2)}`;
    positionCounterSpan.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${currentIndex + 1}`;

    const turn = game.turn() === currentUserColor ? "شما" : "موتور";
    turnSpan.innerHTML = `<i class="fas fa-${game.turn() === currentUserColor ? "user" : "robot"}"></i> ${turn}`;
    egTurn.textContent = turn;
  }

  function renderBoard() {
    if (!game) return;
    const board = game.board();
    const pieceSet = getCurrentPieceSet();
    const flipped = currentUserColor === "b";

    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = flipped ? 7 - i : i;
        const col = flipped ? 7 - j : j;
        const piece = board[row][col];
        const squareDiv = document.createElement("div");
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        squareDiv.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
        squareDiv.dataset.square = squareName;

        // اعمال هایلایت راهنمایی
        if (isHintActive && hintMove) {
          if (squareName === hintMove.from)
            squareDiv.classList.add("hint-from");
          if (squareName === hintMove.to) squareDiv.classList.add("hint-to");
        }

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

  function initStockfish() {
    try {
      stockfish = new Worker("js/stockfish.js");
      stockfish.onmessage = function (e) {
        const data = e.data;
        if (data.includes("uciok")) {
          stockfishReady = true;
          stockfish.postMessage("setoption name Skill Level value 20");
        } else if (data.includes("bestmove")) {
          const movePart = data.split("bestmove ")[1]?.split(" ")[0];
          if (movePart && movePart !== "(none)") {
            const from = movePart.slice(0, 2);
            const to = movePart.slice(2, 4);
            const promo = movePart[4] || "q";

            if (stockfishMode === "hint") {
              // نمایش راهنمایی
              isHintActive = true;
              hintMove = { from, to };
              renderBoard();
              showMessage("💡 موتور این حرکت را پیشنهاد می‌دهد.", "warning");
            } else {
              // حرکت موتور
              try {
                const move = game.move({ from, to, promotion: promo });
                if (move) {
                  renderBoard();
                  updateStats();
                  checkGameOver();
                }
              } catch (e) {
                console.error("Engine move error", e);
              }
            }
          }
          isComputerThinking = false;
        }
      };
      stockfish.postMessage("uci");
    } catch (e) {
      console.error("Stockfish init error", e);
    }
  }

  function requestHint() {
    if (!stockfishReady || isComputerThinking) return;
    if (game.turn() !== currentUserColor) {
      showMessage("الان نوبت شما نیست!", "error");
      return;
    }

    stockfishMode = "hint";
    stockfish.postMessage("stop");
    stockfish.postMessage(`position fen ${game.fen()}`);
    stockfish.postMessage("go depth 15");
    showMessage("⚙️ در حال محاسبه بهترین حرکت...", "info");
  }

  function requestEngineMove() {
    if (!stockfishReady || game.game_over() || game.turn() === currentUserColor)
      return;
    isComputerThinking = true;
    stockfishMode = "engine";
    stockfish.postMessage("stop");
    stockfish.postMessage(`position fen ${game.fen()}`);
    stockfish.postMessage("go depth 18");
  }

  function checkGameOver() {
    if (game.game_over()) {
      let actualResult = game.in_checkmate()
        ? game.turn() === "w"
          ? "0-1"
          : "1-0"
        : "1/2-1/2";
      if (actualResult === currentDesiredResult) {
        showMessage("🎉 آفرین! آخربازی با موفقیت حل شد.", "success");
      } else {
        showMessage("🤝 بازی مساوی شد یا نتیجه تغییر کرد.", "info");
      }
      return true;
    }
    return false;
  }

  function loadPosition(index) {
    if (!endgames.length) return;
    const eg = endgames[index];
    if (!eg) return;

    currentUserColor = eg.userColor || "w";
    currentDesiredResult = eg.result || "1-0";
    game = new Chess(eg.fen);
    selectedSquare = null;
    isHintActive = false;
    hintMove = null;

    egName.textContent = eg.name;
    const resultMap = {
      "1-0": "برد سفید",
      "0-1": "برد سیاه",
      "1/2-1/2": "مساوی",
    };
    egGoal.textContent =
      resultMap[currentDesiredResult] || currentDesiredResult;

    renderBoard();
    updateStats();
    showMessage(
      `📍 ${eg.name} | شما ${currentUserColor === "w" ? "سفید" : "سیاه"} هستید`,
      "info",
    );

    currentIndex = index;
    localStorage.setItem("chesshub_endgame_index", currentIndex);

    if (game.turn() !== currentUserColor) setTimeout(requestEngineMove, 500);
  }

  async function loadEndgamesFromFile() {
    try {
      const resp = await fetch("data/endgames.txt");
      const text = await resp.text();
      const lines = text.split(/\r?\n/);
      endgames = [];
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("|");
        if (parts.length >= 4)
          endgames.push({
            fen: parts[0].trim(),
            name: parts[1].trim(),
            userColor: parts[2].trim(),
            result: parts[3].trim(),
          });
        else if (parts.length >= 2)
          endgames.push({
            fen: parts[0].trim(),
            name: parts[1].trim(),
            userColor: "w",
            result: "1-0",
          });
      }
      if (!endgames.length)
        endgames.push({
          fen: "start",
          name: "پیش‌فرض",
          userColor: "w",
          result: "1-0",
        });
      loadPosition(localStorage.getItem("chesshub_endgame_index") || 0);
    } catch (e) {
      endgames = [
        {
          fen: "start",
          name: "خطا در بارگذاری",
          userColor: "w",
          result: "1-0",
        },
      ];
      loadPosition(0);
    }
  }

  function tryMove(from, to) {
    if (game.turn() !== currentUserColor || isComputerThinking) return false;

    try {
      const result = game.move({ from, to, promotion: "q" });
      if (result) {
        selectedSquare = null;
        isHintActive = false; // پاک کردن راهنمایی بعد از حرکت
        hintMove = null;
        renderBoard();
        updateStats();

        if (checkGameOver()) return true;
        if (game.turn() !== currentUserColor)
          setTimeout(requestEngineMove, 300);
        return true;
      }
    } catch (e) {
      /* ignore invalid move */
    }
    return false;
  }

  // سیستم درگ اند دراپ
  function handleDragStart(x, y) {
    if (isComputerThinking || game.turn() !== currentUserColor) return;
    const el = document.elementFromPoint(x, y);
    const sqDiv = el?.closest?.(".square");
    if (!sqDiv) return;
    const sq = sqDiv.dataset.square;
    if (game.get(sq)?.color === currentUserColor) {
      selectedSquare = sq;
      renderBoard();
    }
  }
  function handleDragEnd(x, y) {
    if (!selectedSquare) return;
    const el = document.elementFromPoint(x, y);
    const targetSq = el?.closest?.(".square")?.dataset.square;
    if (targetSq && targetSq !== selectedSquare)
      tryMove(selectedSquare, targetSq);
    selectedSquare = null;
    renderBoard();
  }

  document.getElementById("hintBtn").addEventListener("click", requestHint);
  document.getElementById("undoBtn").addEventListener("click", () => {
    if (game.history().length >= 2) {
      game.undo();
      game.undo();
    } else if (game.history().length === 1) {
      game.undo();
    }
    isHintActive = false;
    renderBoard();
    updateStats();
  });
  document
    .getElementById("resetBtn")
    .addEventListener("click", () => loadPosition(currentIndex));
  document
    .getElementById("nextBtn")
    .addEventListener("click", () =>
      loadPosition((currentIndex + 1) % endgames.length),
    );

  loadPieces().then(() => {
    initStockfish();

    // رویدادهای موس
    boardDiv.addEventListener("mousedown", (e) => {
      e.preventDefault();
      handleDragStart(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", (e) => {
      if (selectedSquare) handleDragEnd(e.clientX, e.clientY);
    });

    // رویدادهای لمسی
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
      "touchend",
      (e) => {
        if (selectedSquare) {
          e.preventDefault();
          const t = e.changedTouches[0];
          handleDragEnd(t.clientX, t.clientY);
        }
      },
      { passive: false },
    );

    // رویداد کلیک ساده
    boardDiv.addEventListener("click", (e) => {
      if (isComputerThinking) return;
      const sq = e.target.closest(".square")?.dataset.square;
      if (!sq) return;
      if (selectedSquare) {
        tryMove(selectedSquare, sq);
        selectedSquare = null;
        renderBoard();
      } else if (game.get(sq)?.color === currentUserColor) {
        selectedSquare = sq;
        renderBoard();
      }
    });

    loadEndgamesFromFile();
    console.log("✅ ChessHub Smart Endgames loaded");
  });
})();
