// engine-game.js - مدیریت اصلی بازی با Stockfish

(function () {
  "use strict";

  // ===== اعمال تم =====
  (function applySavedTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (settings && settings.theme) {
        document.body.className = document.body.className
          .split(" ")
          .filter((c) => !c.startsWith("theme-"))
          .join(" ");
        document.body.classList.add(`theme-${settings.theme}`);
      }
    } catch (e) {}
  })();

  // ===== بارگذاری مهره‌ها =====
  const pieceCodes = {
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
  const pieceImages = {};
  let pieceSet = "neo";

  function getCurrentPieceSet() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      return s?.pieceSet || "neo";
    } catch {
      return "neo";
    }
  }

  function loadPieces() {
    return new Promise((resolve) => {
      pieceSet = getCurrentPieceSet();
      let loaded = 0,
        total = Object.keys(pieceCodes).length;
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

  document.addEventListener("pieceSetChanged", () => {
    loadPieces().then(() => {
      if (game) renderBoard();
    });
  });

  function getBoardColors() {
    const root = document.documentElement;
    const light =
      getComputedStyle(root).getPropertyValue("--board-light").trim() ||
      "#f0d9b5";
    const dark =
      getComputedStyle(root).getPropertyValue("--board-dark").trim() ||
      "#b58863";
    return { light, dark };
  }

  // ============================================
  // 🧠 مدیریت Stockfish
  // ============================================
  let stockfish = null;
  let stockfishReady = false;
  let stockfishQueue = [];
  let isProcessingQueue = false;
  let currentSkillLevel = 10;
  let currentDepth = 12;

  function initStockfish() {
    try {
      stockfish = new Worker("js/stockfish.js");
      stockfish.onmessage = function (e) {
        const data = e.data;
        if (data.includes("uciok")) {
          stockfishReady = true;
          stockfish.postMessage("setoption name UCI_Chess960 value false");
          stockfish.postMessage("setoption name Threads value 2");
          stockfish.postMessage("setoption name Hash value 256");
          processQueue();
        } else if (data.includes("bestmove")) {
          const parts = data.split(" ");
          const bestMove = parts[1];
          if (
            bestMove &&
            bestMove !== "(none)" &&
            stockfishQueue.length > 0 &&
            stockfishQueue[0].callback
          ) {
            const from = bestMove.slice(0, 2);
            const to = bestMove.slice(2, 4);
            const promotion = bestMove.length === 5 ? bestMove[4] : null;
            stockfishQueue[0].callback({ from, to, promotion });
          }
          if (stockfishQueue.length > 0) stockfishQueue.shift();
          isProcessingQueue = false;
          processQueue();
        }
      };
      stockfish.postMessage("uci");
    } catch (e) {
      stockfishReady = false;
    }
  }

  function getStockfishMove(fen, skillLevel, depth, timeMs, callback) {
    stockfishQueue.push({ fen, skillLevel, depth, timeMs, callback });
    if (!isProcessingQueue && stockfishReady) processQueue();
  }

  function processQueue() {
    if (isProcessingQueue || stockfishQueue.length === 0 || !stockfishReady)
      return;
    isProcessingQueue = true;
    const item = stockfishQueue[0];

    if (item.skillLevel !== currentSkillLevel) {
      currentSkillLevel = item.skillLevel;
      stockfish.postMessage(
        "setoption name Skill Level value " + currentSkillLevel,
      );
    }
    if (item.depth !== currentDepth) {
      currentDepth = item.depth;
    }

    stockfish.postMessage("stop");
    stockfish.postMessage("position fen " + item.fen);

    let depthToUse = item.depth || 12;
    if (item.timeMs > 3000) {
      depthToUse = Math.min(depthToUse + 2, 18);
    }
    stockfish.postMessage("go depth " + depthToUse);
  }

  // ============================================
  // 🤖 لیست بات‌ها
  // ============================================
  const BOTS = [
    window.BotLouis || {
      name: "لوئیس",
      rating: "۲۵۰",
      avatar: "images/bots/1.png",
      skillLevel: 0,
      depth: 2,
    },
    window.BotMaria || {
      name: "ماریا",
      rating: "۱۵۰۰",
      avatar: "images/bots/2.png",
      skillLevel: 8,
      depth: 8,
    },
    window.BotMonkey || {
      name: "مانکی",
      rating: "۲۰۰۰",
      avatar: "images/bots/3.png",
      skillLevel: 15,
      depth: 12,
    },
  ];

  // ============================================
  // 🎮 تنظیمات بازی
  // ============================================
  let selectedColor = "white";
  let timeControl = "3+2";
  let userTime = 0;
  let botTime = 0;
  let userIncrement = 0;
  let botIncrement = 0;
  let timerInterval = null;
  let isTimerRunning = false;

  function parseTimeControl(control) {
    if (control === "0") return { base: 0, increment: 0 };
    const parts = control.split("+");
    return {
      base: parseInt(parts[0]) * 60,
      increment: parseInt(parts[1]) || 0,
    };
  }

  // ============================================
  // 🎯 متغیرهای اصلی
  // ============================================
  let game = new Chess();
  let moveHistory = [];
  let currentIndex = 0;
  let selectedSquare = null;
  let isComputerThinking = false;
  let selectedBot = BOTS[0];
  let gameActive = false;
  let isWaitingForStockfish = false;
  let userColor = "w";
  let gameStarted = false;
  let computerHighlight = null;
  let gameEnded = false;

  // ===== المنت‌ها =====
  const boardDiv = document.getElementById("chessboard");
  const historyList = document.getElementById("historyList");
  const statusMessage = document.getElementById("statusMessage");
  const botsGrid = document.getElementById("botsGrid");
  const userTimerEl = document.getElementById("userTimer");
  const botTimerEl = document.getElementById("botTimer");
  const userTimerBox = document.getElementById("userTimerBox");
  const botTimerBox = document.getElementById("botTimerBox");
  const playBtn = document.getElementById("playBtn");

  const resultOverlay = document.getElementById("resultOverlay");
  const resultIcon = document.getElementById("resultIcon");
  const resultTitle = document.getElementById("resultTitle");
  const resultSub = document.getElementById("resultSub");
  const resultMoves = document.getElementById("resultMoves");
  const resultUserTime = document.getElementById("resultUserTime");
  const resultBotTime = document.getElementById("resultBotTime");

  const previewAvatar = document.getElementById("previewAvatar");
  const previewEmpty = document.getElementById("previewEmpty");
  const previewName = document.getElementById("previewName");
  const previewRating = document.getElementById("previewRating");
  const botPreview = document.getElementById("botPreview");

  // ============================================
  // ⏱️ مدیریت تایمر
  // ============================================
  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function updateTimers() {
    userTimerEl.textContent = formatTime(userTime);
    botTimerEl.textContent = formatTime(botTime);
    userTimerEl.classList.toggle("low", userTime < 10 && userTime > 0);
    botTimerEl.classList.toggle("low", botTime < 10 && botTime > 0);

    if (gameActive && gameStarted && !gameEnded) {
      userTimerBox.classList.toggle("active-timer", game.turn() === userColor);
      botTimerBox.classList.toggle("active-timer", game.turn() !== userColor);
    }

    if (userTime <= 0 && gameActive && gameStarted && !gameEnded) {
      endGame("timeout", "user");
    }
    if (botTime <= 0 && gameActive && gameStarted && !gameEnded) {
      endGame("timeout", "bot");
    }
  }

  function startTimer() {
    if (timerInterval) return;
    isTimerRunning = true;
    timerInterval = setInterval(() => {
      if (!gameActive || !gameStarted || gameEnded) return;
      if (game.turn() === userColor) {
        if (userTime > 0) {
          userTime -= 0.1;
        } else {
          userTime = 0;
        }
      } else {
        if (botTime > 0) {
          botTime -= 0.1;
        } else {
          botTime = 0;
        }
      }
      updateTimers();
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning = false;
  }

  function resetTimers() {
    stopTimer();
    const tc = parseTimeControl(timeControl);
    userTime = tc.base;
    botTime = tc.base;
    userIncrement = tc.increment;
    botIncrement = tc.increment;
    userTimerBox.classList.remove("active-timer");
    botTimerBox.classList.remove("active-timer");
    updateTimers();
  }

  function addIncrement(color) {
    if (!gameStarted || gameEnded) return;

    const wasRunning = isTimerRunning;
    if (wasRunning) {
      clearInterval(timerInterval);
      timerInterval = null;
      isTimerRunning = false;
    }

    if (color === userColor) {
      userTime += userIncrement;
    } else {
      botTime += botIncrement;
    }

    if (wasRunning && gameActive && gameStarted && !gameEnded) {
      isTimerRunning = true;
      timerInterval = setInterval(() => {
        if (!gameActive || !gameStarted || gameEnded) return;
        if (game.turn() === userColor) {
          if (userTime > 0) {
            userTime -= 0.1;
          } else {
            userTime = 0;
          }
        } else {
          if (botTime > 0) {
            botTime -= 0.1;
          } else {
            botTime = 0;
          }
        }
        updateTimers();
      }, 100);
    }

    updateTimers();
  }

  // ============================================
  // 🏁 پایان بازی
  // ============================================
  function endGame(reason, loser) {
    if (gameEnded) return;
    gameEnded = true;
    gameActive = false;
    gameStarted = false;
    stopTimer();
    if (stockfish) stockfish.postMessage("stop");

    const totalMoves = moveHistory.length;
    const userTimeDisplay = formatTime(userTime);
    const botTimeDisplay = formatTime(botTime);
    let icon = "🏆",
      title = "",
      sub = "";

    if (reason === "checkmate") {
      const winner = game.turn() === "w" ? "سیاه" : "سفید";
      const isUserWin =
        (userColor === "w" && winner === "سفید") ||
        (userColor === "b" && winner === "سیاه");
      if (isUserWin) {
        icon = "🎉";
        title = "تبریک! شما برنده شدید!";
        sub = `با مات در ${Math.ceil(totalMoves / 2)} حرکت`;
      } else {
        icon = "😔";
        title = `${selectedBot.name} برنده شد!`;
        sub = `با مات در ${Math.ceil(totalMoves / 2)} حرکت`;
      }
    } else if (reason === "stalemate" || reason === "draw") {
      icon = "🤝";
      title = "بازی مساوی شد!";
      sub = `در ${Math.ceil(totalMoves / 2)} حرکت`;
    } else if (reason === "timeout") {
      if (loser === "user") {
        icon = "⏰";
        title = "زمان شما تمام شد!";
        sub = `${selectedBot.name} برنده شد!`;
      } else {
        icon = "🎉";
        title = "زمان بات تمام شد!";
        sub = "شما برنده شدید!";
      }
    }

    resultIcon.textContent = icon;
    resultTitle.textContent = title;
    resultSub.textContent = sub;
    resultMoves.textContent = Math.ceil(totalMoves / 2);
    resultUserTime.textContent = userTimeDisplay;
    resultBotTime.textContent = botTimeDisplay;
    resultOverlay.classList.add("open");
    playBtn.innerHTML = '<i class="fas fa-play"></i> بازی';
    playBtn.classList.add("primary");
  }

  // ============================================
  // 🖼️ آپدیت پیش‌نمایش بات
  // ============================================
  function updateBotPreview(bot) {
    if (!bot) {
      previewAvatar.innerHTML = '<span class="fallback">🤖</span>';
      previewEmpty.style.display = "flex";
      previewName.style.display = "none";
      previewRating.style.display = "none";
      botPreview.classList.remove("has-bot");
      return;
    }
    previewAvatar.innerHTML = `
      <img src="${bot.avatar}" alt="${bot.name}" 
           onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'fallback\\'>🤖</span>'">
    `;
    previewEmpty.style.display = "none";
    previewName.style.display = "block";
    previewRating.style.display = "block";
    previewName.textContent = bot.name;
    previewRating.textContent = `🏆 ${bot.rating}`;
    botPreview.classList.add("has-bot");
  }

  // ============================================
  // 🎨 رندر بات‌ها
  // ============================================
  function buildBotsGrid() {
    if (!botsGrid) return;
    botsGrid.innerHTML = "";
    BOTS.forEach((bot) => {
      const div = document.createElement("div");
      div.className = `bot-item${bot === selectedBot ? " active" : ""}`;
      div.dataset.botIndex = BOTS.indexOf(bot);
      div.innerHTML = `
        <div class="mini-avatar">
          <img src="${bot.avatar}" alt="${bot.name}" 
               onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'fallback\\'>🤖</span>'">
        </div>
        <span class="bname">${bot.name}</span>
        <span class="brating">${bot.rating}</span>
      `;
      div.addEventListener("click", function () {
        document
          .querySelectorAll(".bot-item")
          .forEach((e) => e.classList.remove("active"));
        this.classList.add("active");
        selectedBot = BOTS[parseInt(this.dataset.botIndex)];
        updateBotPreview(selectedBot);
        if (gameEnded) {
          resultOverlay.classList.remove("open");
          gameEnded = false;
        }
        resetGame();
        statusMessage.textContent = `🤖 ${selectedBot.name} انتخاب شد! دکمه‌ی «بازی» رو بزن.`;
      });
      botsGrid.appendChild(div);
    });
  }

  // ============================================
  // 🎨 رندر تخته
  // ============================================
  function renderBoard(highlightFrom = null, highlightTo = null) {
    if (!game) return;
    const board = game.board();
    const colors = getBoardColors();
    const flipped = userColor === "b";
    boardDiv.innerHTML = "";
    boardDiv.style.display = "grid";
    boardDiv.style.gridTemplateColumns = "repeat(8, 1fr)";

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = flipped ? 7 - i : i;
        const col = flipped ? 7 - j : j;
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;
        const sq = document.createElement("div");
        sq.className = `square ${isLight ? "light" : "dark"}`;
        const file = String.fromCharCode(97 + col);
        const rank = 8 - row;
        const squareName = file + rank;
        sq.dataset.square = squareName;
        sq.style.touchAction = "none";

        if (highlightFrom && squareName === highlightFrom)
          sq.classList.add("computer-from");
        if (highlightTo && squareName === highlightTo)
          sq.classList.add("computer-to");
        if (selectedSquare === squareName) sq.classList.add("selected");

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
        boardDiv.appendChild(sq);
      }
    }
    updateHistory();
  }

  function updateHistory() {
    const hist = game.history({ verbose: true });
    if (hist.length === 0) {
      historyList.innerHTML =
        '<span style="color:var(--text-secondary);font-size:0.6rem;">هیچ حرکتی ثبت نشده</span>';
      return;
    }
    let html = "";
    for (let i = 0; i < hist.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      html += `<span class="move-item"><span class="move-num">${num}.</span>${hist[i].san}`;
      if (hist[i + 1]) html += ` ${hist[i + 1].san}`;
      html += "</span>";
    }
    historyList.innerHTML = html;
    historyList.scrollTop = historyList.scrollHeight;
  }

  // ============================================
  // 🎮 شروع بازی
  // ============================================
  function startGame() {
    if (gameStarted) {
      resetGame();
      return;
    }

    if (selectedColor === "random") {
      userColor = Math.random() < 0.5 ? "w" : "b";
    } else if (selectedColor === "white") {
      userColor = "w";
    } else {
      userColor = "b";
    }

    gameEnded = false;
    resetTimers();
    game = new Chess();
    moveHistory = [];
    currentIndex = 0;
    selectedSquare = null;
    gameActive = true;
    gameStarted = true;
    isComputerThinking = false;
    isWaitingForStockfish = false;
    computerHighlight = null;

    renderBoard();
    const colorName = userColor === "w" ? "سفید" : "سیاه";
    statusMessage.textContent = `♟️ بازی شروع شد! تو ${colorName} هستی.`;

    startTimer();

    if (game.turn() !== userColor) {
      setTimeout(() => computerMove(), 500);
    }

    playBtn.innerHTML = '<i class="fas fa-redo"></i> بازی';
    playBtn.classList.add("primary");
  }

  // ============================================
  // 🤖 حرکت کامپیوتر (با پشتیبانی از منطق دستی بات‌ها)
  // ============================================
  function computerMove() {
    if (
      isComputerThinking ||
      isWaitingForStockfish ||
      !gameActive ||
      game.game_over() ||
      !gameStarted ||
      gameEnded
    )
      return;
    if (game.turn() === userColor) return;

    isComputerThinking = true;
    const thinkingMsg = selectedBot.getMessage
      ? selectedBot.getMessage("thinking")
      : `🔍 ${selectedBot.name} در حال تحلیل...`;
    statusMessage.textContent = thinkingMsg + " ⏳";

    // ===== اگر بات متد getMove سفارشی داره =====
    if (selectedBot.getMove && typeof selectedBot.getMove === "function") {
      const manualMove = selectedBot.getMove(game);

      if (manualMove) {
        const delay = selectedBot.name === "لوئیس" ? 1000 : 700;
        setTimeout(() => {
          executeMove(manualMove);
        }, delay);
        return;
      }
    }

    // ===== استفاده از Stockfish =====
    useStockfishMove();

    function executeMove(move) {
      try {
        const result = game.move(move);
        if (result) {
          moveHistory.push(result);
          currentIndex = moveHistory.length;
          const botColor = userColor === "w" ? "b" : "w";
          addIncrement(botColor);
          computerHighlight = { from: result.from, to: result.to };
          renderBoard(result.from, result.to);
          setTimeout(() => {
            if (gameActive && !game.game_over() && !gameEnded) {
              computerHighlight = null;
              renderBoard();
            }
          }, 2000);

          if (result.captured) {
            statusMessage.textContent = selectedBot.getMessage
              ? selectedBot.getMessage("capture")
              : `🎯 ${selectedBot.name} مهره‌ات رو گرفت!`;
          } else if (game.in_check()) {
            statusMessage.textContent = selectedBot.getMessage
              ? selectedBot.getMessage("check")
              : `🔥 کیش! ${selectedBot.name} بهت حمله کرد!`;
          } else {
            statusMessage.textContent = selectedBot.getMessage
              ? selectedBot.getMessage("move")
              : `💡 ${selectedBot.name} حرکت کرد.`;
          }

          if (game.game_over()) {
            if (game.in_checkmate()) endGame("checkmate");
            else if (game.in_stalemate()) endGame("stalemate");
            else endGame("draw");
            isComputerThinking = false;
            return;
          }
          isComputerThinking = false;
          if (gameActive && game.turn() === userColor) {
            statusMessage.textContent = "♟️ نوبت توست!";
          }
        } else {
          statusMessage.textContent = "⚠️ حرکت نامعتبر!";
          isComputerThinking = false;
        }
      } catch (e) {
        console.error("Move error:", e);
        statusMessage.textContent = "⚠️ خطا در اجرای حرکت!";
        isComputerThinking = false;
      }
    }

    function useStockfishMove() {
      const fen = game.fen();
      let skillLevel = selectedBot.skillLevel || 10;
      let depth = selectedBot.depth || 12;

      let moveTime = Math.min(depth * 200 + 500, 8000);

      if (selectedBot.name === "ماریا" && botTime < 60) {
        depth = Math.min(depth, 4);
        moveTime = Math.min(moveTime, 2000);
      }

      if (selectedBot.name === "مانکی" && botTime < 10) {
        const moves = game.moves({ verbose: true });
        const urgentMoves = moves.filter(
          (m) =>
            m.san.includes("+") ||
            m.piece === "q" ||
            m.piece === "r" ||
            m.captured,
        );
        if (urgentMoves.length > 0) {
          executeMove(
            urgentMoves[Math.floor(Math.random() * urgentMoves.length)],
          );
          return;
        }
        if (moves.length > 0) {
          executeMove(moves[Math.floor(Math.random() * moves.length)]);
          return;
        }
      }

      if (botTime > 0) {
        const maxTime = Math.min(botTime * 1000 * 0.6, moveTime);
        moveTime = Math.max(Math.min(moveTime, maxTime), 500);
      }
      if (timeControl === "0") {
        moveTime = Math.min(depth * 250 + 800, 10000);
      }

      isWaitingForStockfish = true;

      getStockfishMove(fen, skillLevel, depth, moveTime, function (moveData) {
        isWaitingForStockfish = false;
        if (
          !gameActive ||
          game.game_over() ||
          game.turn() === userColor ||
          !gameStarted ||
          gameEnded
        ) {
          isComputerThinking = false;
          return;
        }

        const { from, to, promotion } = moveData;
        try {
          const move = game.move({ from, to, promotion: promotion || "q" });
          if (move) {
            moveHistory.push(move);
            currentIndex = moveHistory.length;
            const botColor = userColor === "w" ? "b" : "w";
            addIncrement(botColor);
            computerHighlight = { from: move.from, to: move.to };
            renderBoard(move.from, move.to);
            setTimeout(() => {
              if (gameActive && !game.game_over() && !gameEnded) {
                computerHighlight = null;
                renderBoard();
              }
            }, 2000);

            if (move.captured) {
              statusMessage.textContent = selectedBot.getMessage
                ? selectedBot.getMessage("capture")
                : `🎯 ${selectedBot.name} مهره‌ات رو گرفت!`;
            } else if (game.in_check()) {
              statusMessage.textContent = selectedBot.getMessage
                ? selectedBot.getMessage("check")
                : `🔥 کیش! ${selectedBot.name} بهت حمله کرد!`;
            } else {
              statusMessage.textContent = selectedBot.getMessage
                ? selectedBot.getMessage("move")
                : `💡 ${selectedBot.name} حرکت کرد.`;
            }

            if (game.game_over()) {
              if (game.in_checkmate()) endGame("checkmate");
              else if (game.in_stalemate()) endGame("stalemate");
              else endGame("draw");
              isComputerThinking = false;
              return;
            }
            isComputerThinking = false;
            if (gameActive && game.turn() === userColor) {
              statusMessage.textContent = "♟️ نوبت توست!";
            }
          } else {
            statusMessage.textContent = "⚠️ حرکت Stockfish نامعتبر!";
            isComputerThinking = false;
          }
        } catch (e) {
          console.error("Move error:", e);
          statusMessage.textContent = "⚠️ خطا در اجرای حرکت!";
          isComputerThinking = false;
        }
      });

      setTimeout(() => {
        if (isWaitingForStockfish) {
          isWaitingForStockfish = false;
          isComputerThinking = false;
          statusMessage.textContent =
            "⏱️ زمان Stockfish تمام شد! دوباره امتحان کن.";
        }
      }, moveTime + 3000);
    }
  }

  // ============================================
  // 🎯 حرکت کاربر
  // ============================================
  function makeMove(from, to, promotion = "q") {
    if (isComputerThinking || isWaitingForStockfish) {
      statusMessage.textContent = "⏳ صبر کن تا Stockfish فکر کنه!";
      return false;
    }
    if (!gameActive || game.game_over() || !gameStarted || gameEnded) {
      statusMessage.textContent = "⚠️ بازی شروع نشده. دکمه‌ی «بازی» رو بزن.";
      return false;
    }
    if (game.turn() !== userColor) {
      statusMessage.textContent = "⏳ نوبت تو نیست!";
      return false;
    }

    const move = game.move({ from, to, promotion });
    if (move) {
      moveHistory.push(move);
      currentIndex = moveHistory.length;
      selectedSquare = null;
      addIncrement(userColor);
      computerHighlight = null;
      renderBoard();

      if (game.game_over()) {
        if (game.in_checkmate()) endGame("checkmate");
        else if (game.in_stalemate()) endGame("stalemate");
        else endGame("draw");
        return true;
      }

      setTimeout(() => computerMove(), 200);
      return true;
    } else {
      statusMessage.textContent = "❌ حرکت غیرمجاز";
      return false;
    }
  }

  // ============================================
  // 🔄 ریست بازی
  // ============================================
  function resetGame() {
    stopTimer();
    isWaitingForStockfish = false;
    isComputerThinking = false;
    gameStarted = false;
    gameActive = false;
    gameEnded = false;
    computerHighlight = null;
    if (stockfish) stockfish.postMessage("stop");

    resultOverlay.classList.remove("open");

    game = new Chess();
    moveHistory = [];
    currentIndex = 0;
    selectedSquare = null;
    renderBoard();
    resetTimers();
    statusMessage.textContent = `🧠 ${selectedBot.name} انتخاب شده. دکمه‌ی «بازی» رو بزن.`;
    playBtn.innerHTML = '<i class="fas fa-play"></i> بازی';
    playBtn.classList.add("primary");
  }

  // ============================================
  // 📋 عملیات PGN
  // ============================================
  function getPGN() {
    return game.pgn();
  }

  function copyPGN() {
    const pgn = getPGN();
    if (!pgn) {
      alert("هیچ حرکتی ثبت نشده!");
      return;
    }
    navigator.clipboard
      .writeText(pgn)
      .then(() => {
        statusMessage.textContent = "✅ PGN کپی شد!";
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = pgn;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        statusMessage.textContent = "✅ PGN کپی شد!";
      });
  }

  function downloadPGN() {
    const pgn = getPGN();
    if (!pgn) {
      alert("هیچ حرکتی ثبت نشده!");
      return;
    }
    const blob = new Blob([pgn], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game_vs_${selectedBot.name || "بات"}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusMessage.textContent = "✅ PGN دانلود شد!";
  }

  // ============================================
  // 🖱️ رویدادهای تخته
  // ============================================
  let dragStart = null,
    isDragging = false,
    dragClone = null;

  function createDragClone(square) {
    const el = document.querySelector(`.square[data-square="${square}"]`);
    if (!el) return null;
    const img = el.querySelector(".piece-img");
    if (!img) return null;
    const rect = el.getBoundingClientRect();
    const clone = img.cloneNode(true);
    const size = Math.min(rect.width, rect.height);
    clone.style.cssText = `
      position: fixed; pointer-events: none; z-index: 9999;
      width: ${size}px; height: ${size}px;
      transform: translate(-50%, -50%) scale(1.08);
      filter: drop-shadow(0 8px 25px rgba(0,0,0,0.3));
      transition: none; touch-action: none; user-select: none;
    `;
    document.body.appendChild(clone);
    return clone;
  }

  function updateDragClone(cx, cy) {
    if (dragClone) {
      dragClone.style.left = cx + "px";
      dragClone.style.top = cy + "px";
    }
  }

  function removeDragClone() {
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (
      !gameActive ||
      game.game_over() ||
      isComputerThinking ||
      isWaitingForStockfish ||
      !gameStarted ||
      gameEnded
    )
      return;
    if (game.turn() !== userColor) return;

    let cx, cy;
    if (e.touches) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }

    const el = document.elementFromPoint(cx, cy);
    const sq = el?.closest?.(".square");
    if (!sq) return;
    const square = sq.dataset.square;
    const piece = game.get(square);
    if (piece && piece.color === userColor) {
      dragStart = square;
      isDragging = true;
      dragClone = createDragClone(square);
      if (dragClone) updateDragClone(cx, cy);
      document.body.style.userSelect = "none";
      boardDiv.style.touchAction = "none";
    }
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    let cx, cy;
    if (e.touches) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    if (dragClone) updateDragClone(cx, cy);
  }

  function onPointerUp(e) {
    if (!isDragging || !dragStart) {
      cleanupDrag();
      return;
    }
    e.preventDefault();
    let cx, cy;
    if (e.changedTouches) {
      cx = e.changedTouches[0].clientX;
      cy = e.changedTouches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    removeDragClone();
    const el = document.elementFromPoint(cx, cy);
    const target = el?.closest?.(".square");
    let to = target ? target.dataset.square : null;
    if (to && to !== dragStart) {
      makeMove(dragStart, to);
    }
    cleanupDrag();
  }

  function cleanupDrag() {
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
    dragStart = null;
    isDragging = false;
    document.body.style.userSelect = "";
    boardDiv.style.touchAction = "";
  }

  function onClickFallback(e) {
    if (isDragging) return;
    if (
      !gameActive ||
      game.game_over() ||
      isComputerThinking ||
      isWaitingForStockfish ||
      !gameStarted ||
      gameEnded
    )
      return;
    if (game.turn() !== userColor) return;

    const sq = e.target.closest?.(".square");
    if (!sq) return;
    const square = sq.dataset.square;

    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === userColor) {
        selectedSquare = square;
        renderBoard();
      }
    } else {
      makeMove(selectedSquare, square);
      selectedSquare = null;
    }
  }

  // ============================================
  // 🎛️ تنظیمات
  // ============================================
  function initSettings() {
    document.querySelectorAll(".color-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        document
          .querySelectorAll(".color-btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        selectedColor = this.dataset.color;
        if (gameEnded) {
          resultOverlay.classList.remove("open");
          gameEnded = false;
        }
        resetGame();
      });
    });

    document.querySelectorAll(".time-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        document
          .querySelectorAll(".time-btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        timeControl = this.dataset.time;
        if (gameEnded) {
          resultOverlay.classList.remove("open");
          gameEnded = false;
        }
        resetGame();
      });
    });
  }

  // ============================================
  // 🚀 راه‌اندازی
  // ============================================
  async function init() {
    await loadPieces();
    initStockfish();
    initSettings();

    boardDiv.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    boardDiv.addEventListener("touchstart", onPointerDown, { passive: false });
    boardDiv.addEventListener("touchmove", onPointerMove, { passive: false });
    boardDiv.addEventListener("touchend", onPointerUp, { passive: false });
    boardDiv.addEventListener("click", onClickFallback);

    playBtn.addEventListener("click", startGame);

    document
      .getElementById("resultRematch")
      .addEventListener("click", function () {
        resultOverlay.classList.remove("open");
        gameEnded = false;
        startGame();
      });
    document
      .getElementById("resultChangeBot")
      .addEventListener("click", function () {
        resultOverlay.classList.remove("open");
        gameEnded = false;
        document
          .querySelector(".bots-wrapper")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      });
    document
      .getElementById("resultDownloadPgn")
      .addEventListener("click", downloadPGN);
    document.getElementById("resultCopyPgn").addEventListener("click", copyPGN);
    document
      .getElementById("resultCancel")
      .addEventListener("click", function () {
        resultOverlay.classList.remove("open");
        gameEnded = false;
        resetGame();
      });

    buildBotsGrid();
    updateBotPreview(selectedBot);
    resetGame();

    console.log("✅ ChessHub Engine Game loaded successfully");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
