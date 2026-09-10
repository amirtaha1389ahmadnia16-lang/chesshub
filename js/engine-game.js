// ============================================
// 🤖 ChessHub - Engine Game (Bulletproof Drag & Drop)
// ============================================

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

  // ===== لیست بات‌ها =====
  const BOTS = [
    {
      name: "لوئیس",
      rating: "۲۵۰",
      avatar: "images/bots/1.png",
      elo: 250,
      blunderRate: 0.4,
      moveTime: 1000,
    },
    {
      name: "ماریا",
      rating: "۱۵۰۰",
      avatar: "images/bots/2.png",
      elo: 1500,
      blunderRate: 0.1,
      moveTime: 700,
    },
    {
      name: "مانکی",
      rating: "۲۰۰۰",
      avatar: "images/bots/3.png",
      elo: 2000,
      blunderRate: 0.02,
      moveTime: 500,
    },
    {
      name: "مگنوس",
      rating: "۲۸۸۲",
      avatar: "images/bots/Magnus_Carlsen.png",
      elo: 2882,
      blunderRate: 0,
      moveTime: 300,
    },
  ];

  let game = new Chess();
  let boardSquares = {};
  let selectedSquare = null;
  let userColor = "w";
  let selectedBot = BOTS[0];
  let selectedColorChoice = "white";
  let selectedTimeControl = "10+0";
  let userTime = 0,
    botTime = 0,
    userInc = 0,
    botInc = 0;
  let timerInterval = null;
  let isGameActive = false;
  let gameStarted = false;
  let gameEnded = false;
  let stockfish = null;
  let stockfishReady = false;
  let isBotThinking = false;
  let computerHighlight = null;
  let moveHistory = [];

  const boardDiv = document.getElementById("chessboard");
  const botsGrid = document.getElementById("botsGrid");
  const botAvatarImg = document.getElementById("botAvatarImg");
  const botName = document.getElementById("botName");
  const botRating = document.getElementById("botRating");
  const botTimerBox = document.getElementById("botTimerBox");
  const userTimerBox = document.getElementById("userTimerBox");
  const historyList = document.getElementById("historyList");
  const playBtn = document.getElementById("playBtn");
  const resignBtn = document.getElementById("resignBtn");
  const resultOverlay = document.getElementById("resultOverlay");

  // ============================================
  // 🧠 مدیریت استوک‌فیش
  // ============================================
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
        } else if (data.includes("bestmove") && isBotThinking) {
          isBotThinking = false; // رفع گیر کردن موتور
          const parts = data.split(" ");
          const bestMove = parts[1];
          if (bestMove && bestMove !== "(none)") {
            executeMove({
              from: bestMove.slice(0, 2),
              to: bestMove.slice(2, 4),
              promotion: bestMove.length === 5 ? bestMove[4] : "q",
            });
          } else {
            // اگر موتور حرکتی پیدا نکرد، حرکت تصادفی
            const moves = game.moves({ verbose: true });
            if (moves.length > 0)
              executeMove(moves[Math.floor(Math.random() * moves.length)]);
          }
        }
      };
      stockfish.postMessage("uci");
    } catch (e) {
      console.error("Stockfish init error", e);
    }
  }

  function requestComputerMove() {
    if (!isGameActive || gameEnded || game.turn() === userColor) return;
    if (isBotThinking) return; // جلوگیری از درخواست همزمان

    isBotThinking = true;

    setTimeout(() => {
      if (!isGameActive || gameEnded) {
        isBotThinking = false;
        return;
      }

      // 1. احتمال اشتباه انسانی (Blunder)
      if (Math.random() < selectedBot.blunderRate) {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          isBotThinking = false;
          executeMove({
            from: randomMove.from,
            to: randomMove.to,
            promotion: randomMove.promotion || "q",
          });
          return;
        }
      }

      // 2. استفاده از استوک‌فیش با محدودیت ELO
      if (stockfish && stockfishReady) {
        stockfish.postMessage("setoption name UCI_LimitStrength value true");
        stockfish.postMessage(
          `setoption name UCI_Elo value ${selectedBot.elo}`,
        );
        stockfish.postMessage("stop");
        stockfish.postMessage("position fen " + game.fen());

        let depth = 3;
        if (selectedBot.elo >= 1500) depth = 6;
        if (selectedBot.elo >= 2000) depth = 10;
        if (selectedBot.elo >= 2800) depth = 18;

        stockfish.postMessage(`go depth ${depth}`);
      } else {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          isBotThinking = false;
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          executeMove({
            from: randomMove.from,
            to: randomMove.to,
            promotion: randomMove.promotion || "q",
          });
        }
      }
    }, selectedBot.moveTime);
  }

  // ============================================
  // 🎨 رندر تخته
  // ============================================
  function buildBoardDOM() {
    boardDiv.innerHTML = "";
    boardSquares = {};
    const flipped = userColor === "b";
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = flipped ? 7 - i : i;
        const col = flipped ? 7 - j : j;
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        const sq = document.createElement("div");
        sq.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
        sq.dataset.square = squareName;
        const img = document.createElement("img");
        img.classList.add("piece-img");
        img.draggable = false;
        img.style.display = "none";
        sq.appendChild(img);
        boardDiv.appendChild(sq);
        boardSquares[squareName] = { div: sq, img: img };
      }
    }
    updateBoardContent();
  }

  function updateBoardContent() {
    if (!game) return;
    const board = game.board();
    const pieceSet = getCurrentPieceSet();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const row = userColor === "b" ? 7 - i : i;
        const col = userColor === "b" ? 7 - j : j;
        const piece = board[row][col];
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        const sqData = boardSquares[squareName];
        if (!sqData) continue;

        sqData.div.classList.remove("selected", "computer-from", "computer-to");

        // ریست کردن opacity برای جلوگیری از مهره‌های نامرئی
        sqData.img.style.opacity = "1";

        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toLowerCase();
          const newSrc = `pieces/${pieceSet}/${pieceCodes[key]}`;
          if (sqData.img.src.indexOf(newSrc) === -1) sqData.img.src = newSrc;
          sqData.img.style.display = "block";
        } else {
          sqData.img.style.display = "none";
        }
      }
    }
    if (computerHighlight) {
      if (boardSquares[computerHighlight.from])
        boardSquares[computerHighlight.from].div.classList.add("computer-from");
      if (boardSquares[computerHighlight.to])
        boardSquares[computerHighlight.to].div.classList.add("computer-to");
    }
    if (selectedSquare && boardSquares[selectedSquare])
      boardSquares[selectedSquare].div.classList.add("selected");
  }

  function updateHistory() {
    const hist = game.history({ verbose: true });
    if (hist.length === 0) {
      historyList.innerHTML =
        '<div class="empty-history">هنوز حرکتی ثبت نشده</div>';
      return;
    }
    let html = "";
    for (let i = 0; i < hist.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      html += `<div class="move-item"><span class="move-num">${num}.</span> ${hist[i].san} ${hist[i + 1] ? hist[i + 1].san : ""}</div>`;
    }
    historyList.innerHTML = html;
    historyList.scrollTop = historyList.scrollHeight;
  }

  function executeMove(moveData) {
    try {
      const move = game.move({
        from: moveData.from,
        to: moveData.to,
        promotion: moveData.promotion || "q",
      });
      if (move) {
        moveHistory.push(move);
        if (game.turn() === userColor) {
          addIncrement("bot");
          computerHighlight = { from: move.from, to: move.to };
        } else {
          addIncrement("user");
          computerHighlight = null;
        }

        updateBoardContent();
        updateHistory();

        if (game.game_over()) {
          endGame(game.in_checkmate() ? "checkmate" : "draw");
          return;
        }

        if (game.turn() !== userColor && isGameActive) {
          requestComputerMove();
        } else {
          isBotThinking = false; // اگر نوبت کاربر است، موتور نباید در حالت تفکر بماند
        }
      }
    } catch (e) {
      console.error("Move error:", e);
      isBotThinking = false;
    }
  }

  // ============================================
  // ⏱️ تایمر و پایان بازی
  // ============================================
  function formatTime(s) {
    if (s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  function updateTimers() {
    userTimerBox.textContent =
      userTime === Infinity ? "∞" : formatTime(userTime);
    botTimerBox.textContent = botTime === Infinity ? "∞" : formatTime(botTime);
    userTimerBox.classList.toggle(
      "low",
      userTime < 10 && userTime > 0 && isGameActive,
    );
    botTimerBox.classList.toggle(
      "low",
      botTime < 10 && botTime > 0 && isGameActive,
    );
    if (isGameActive && gameStarted && !gameEnded) {
      userTimerBox.classList.toggle("active-timer", game.turn() === userColor);
      botTimerBox.classList.toggle("active-timer", game.turn() !== userColor);
    } else {
      userTimerBox.classList.remove("active-timer");
      botTimerBox.classList.remove("active-timer");
    }
    if (userTime <= 0 && isGameActive && gameStarted)
      endGame("timeout", "user");
    if (botTime <= 0 && isGameActive && gameStarted) endGame("timeout", "bot");
  }
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!isGameActive || !gameStarted || gameEnded) return;
      if (game.turn() === userColor) userTime -= 0.1;
      else botTime -= 0.1;
      updateTimers();
    }, 100);
  }
  function addIncrement(who) {
    if (!gameStarted || gameEnded) return;
    if (who === "user") userTime += userInc;
    else botTime += botInc;
    updateTimers();
  }
  function resetTimers() {
    if (timerInterval) clearInterval(timerInterval);
    if (selectedTimeControl === "0") {
      userTime = Infinity;
      botTime = Infinity;
      userInc = 0;
      botInc = 0;
      userTimerBox.textContent = "∞";
      botTimerBox.textContent = "∞";
    } else {
      const parts = selectedTimeControl.split("+");
      userTime = parseInt(parts[0]) * 60;
      botTime = userTime;
      userInc = parseInt(parts[1]) || 0;
      botInc = userInc;
      updateTimers();
    }
  }

  function endGame(reason, loser) {
    if (gameEnded) return;
    gameEnded = true;
    isGameActive = false;
    gameStarted = false;
    isBotThinking = false;
    if (timerInterval) clearInterval(timerInterval);
    if (stockfish) stockfish.postMessage("stop");
    computerHighlight = null;
    updateBoardContent();
    let icon = "🤝",
      title = "مساوی!",
      sub = "بازی با نتیجه برابر تمام شد.";
    if (reason === "checkmate") {
      const userWon = game.turn() !== userColor;
      icon = userWon ? "🏆" : "😔";
      title = userWon ? "برد!" : "باخت!";
      sub = userWon
        ? `آفرین! شما ${selectedBot.name} را مات کردید.`
        : `${selectedBot.name} شما را مات کرد.`;
    } else if (reason === "timeout") {
      if (loser === "user") {
        icon = "⏰";
        title = "باخت!";
        sub = "زمان شما تمام شد.";
      } else {
        icon = "🏆";
        title = "برد!";
        sub = `زمان ${selectedBot.name} تمام شد.`;
      }
    } else if (reason === "resign") {
      icon = "🏳️";
      title = "باخت!";
      sub = "شما تسلیم شدید.";
    }
    document.getElementById("resultIcon").textContent = icon;
    document.getElementById("resultTitle").textContent = title;
    document.getElementById("resultSub").textContent = sub;
    document.getElementById("resultMoves").textContent = Math.ceil(
      moveHistory.length / 2,
    );
    document.getElementById("resultUserTime").textContent =
      userTime === Infinity ? "∞" : formatTime(userTime);
    document.getElementById("resultBotTime").textContent =
      botTime === Infinity ? "∞" : formatTime(botTime);
    resultOverlay.classList.add("open");
    playBtn.innerHTML = '<i class="fas fa-play"></i> شروع بازی جدید';
  }

  function startGame() {
    if (gameStarted) {
      resetGame();
      return;
    }
    if (selectedColorChoice === "random")
      userColor = Math.random() < 0.5 ? "w" : "b";
    else userColor = selectedColorChoice === "white" ? "w" : "b";
    gameEnded = false;
    gameStarted = true;
    isGameActive = true;
    isBotThinking = false;
    game = new Chess();
    moveHistory = [];
    selectedSquare = null;
    computerHighlight = null;
    resetTimers();
    buildBoardDOM();
    startTimer();
    playBtn.innerHTML = '<i class="fas fa-stop"></i> توقف بازی';
    if (game.turn() !== userColor) requestComputerMove();
  }

  function resetGame() {
    if (timerInterval) clearInterval(timerInterval);
    gameEnded = false;
    gameStarted = false;
    isGameActive = false;
    isBotThinking = false;
    game = new Chess();
    moveHistory = [];
    selectedSquare = null;
    computerHighlight = null;
    if (stockfish) stockfish.postMessage("stop");
    resultOverlay.classList.remove("open");
    buildBoardDOM();
    resetTimers();
    playBtn.innerHTML = '<i class="fas fa-play"></i> شروع بازی';
  }

  function buildBotsGrid() {
    botsGrid.innerHTML = "";
    BOTS.forEach((bot, idx) => {
      const div = document.createElement("div");
      div.className = `bot-item${idx === 0 ? " active" : ""}`;
      div.innerHTML = `<div class="mini-avatar"><img src="${bot.avatar}" alt="${bot.name}" onerror="this.src='https://ui-avatars.com/api/?background=2c3e50&color=fff&name=${bot.name}'"></div><div class="b-info"><span class="bname">${bot.name}</span><span class="brating">${bot.rating}</span></div>`;
      div.addEventListener("click", () => {
        document
          .querySelectorAll(".bot-item")
          .forEach((e) => e.classList.remove("active"));
        div.classList.add("active");
        selectedBot = BOTS[idx];
        botAvatarImg.src = selectedBot.avatar;
        botName.textContent = selectedBot.name;
        botRating.textContent = selectedBot.rating;
        if (gameStarted) resetGame();
      });
      botsGrid.appendChild(div);
    });
    selectedBot = BOTS[0];
    botAvatarImg.src = selectedBot.avatar;
    botName.textContent = selectedBot.name;
    botRating.textContent = selectedBot.rating;
  }

  // ============================================
  // 🖱️ سیستم درگ اند دراپ ضدگلوله (Bulletproof)
  // ============================================
  let dragStart = null,
    isDragging = false,
    dragClone = null,
    rafId = null,
    lastX = 0,
    lastY = 0,
    cloneSize = 0;

  function startDrag(x, y, target) {
    if (
      !isGameActive ||
      gameEnded ||
      isBotThinking ||
      game.turn() !== userColor
    )
      return;

    const sq = target?.closest?.(".square");
    if (!sq) return;

    const square = sq.dataset.square;
    const piece = game.get(square);

    if (piece && piece.color === userColor) {
      dragStart = square;
      isDragging = true;

      const sqData = boardSquares[square];
      if (!sqData) return;

      const img = sqData.img;
      if (!img || img.style.display === "none") return;

      const rect = sqData.div.getBoundingClientRect();
      cloneSize = rect.width;

      const clone = img.cloneNode(true);
      clone.style.cssText = `position: fixed; pointer-events: none; z-index: 9999; width: ${cloneSize}px; height: ${cloneSize}px; left: 0; top: 0; transform: translate3d(${x - cloneSize / 2}px, ${y - cloneSize / 2}px, 0) scale(1.05); filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3)); will-change: transform;`;
      document.body.appendChild(clone);
      dragClone = clone;

      img.style.opacity = "0";
      document.body.style.userSelect = "none";
    } else if (selectedSquare) {
      if (square !== selectedSquare)
        executeMove({ from: selectedSquare, to: square });
      selectedSquare = null;
      updateBoardContent();
    }
  }

  function moveDrag(x, y) {
    if (!isDragging) return;
    lastX = x;
    lastY = y;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        if (dragClone) {
          dragClone.style.transform = `translate3d(${lastX - cloneSize / 2}px, ${lastY - cloneSize / 2}px, 0) scale(1.05)`;
        }
        rafId = null;
      });
    }
  }

  function endDrag(x, y, target) {
    if (!isDragging) return;
    isDragging = false;

    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
    if (dragStart && boardSquares[dragStart]) {
      boardSquares[dragStart].img.style.opacity = "1";
    }

    const sq = target?.closest?.(".square");
    const to = sq ? sq.dataset.square : null;

    if (to && to !== dragStart) {
      executeMove({ from: dragStart, to: to });
    } else {
      selectedSquare = to === dragStart ? dragStart : null;
      updateBoardContent();
    }

    dragStart = null;
    document.body.style.userSelect = "";
  }

  // رویدادهای موس (روی window слушаем чтобы не выскочил за пределы)
  boardDiv.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startDrag(
      e.clientX,
      e.clientY,
      document.elementFromPoint(e.clientX, e.clientY),
    );
  });
  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (isDragging) {
      e.preventDefault();
      endDrag(
        e.clientX,
        e.clientY,
        document.elementFromPoint(e.clientX, e.clientY),
      );
    }
  });

  // رویدادهای لمسی
  boardDiv.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      startDrag(
        t.clientX,
        t.clientY,
        document.elementFromPoint(t.clientX, t.clientY),
      );
    },
    { passive: false },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (isDragging) {
        e.preventDefault();
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
      }
    },
    { passive: false },
  );
  window.addEventListener(
    "touchend",
    (e) => {
      if (isDragging) {
        e.preventDefault();
        const t = e.changedTouches[0];
        endDrag(
          t.clientX,
          t.clientY,
          document.elementFromPoint(t.clientX, t.clientY),
        );
      }
    },
    { passive: false },
  );

  // کلیک ساده (Fallback)
  boardDiv.addEventListener("click", (e) => {
    if (isDragging) return;
    if (
      !isGameActive ||
      gameEnded ||
      isBotThinking ||
      game.turn() !== userColor
    )
      return;
    const sq = e.target.closest?.(".square");
    if (!sq) return;
    const square = sq.dataset.square;
    if (selectedSquare === null) {
      const piece = game.get(square);
      if (piece && piece.color === userColor) {
        selectedSquare = square;
        updateBoardContent();
      }
    } else {
      if (square !== selectedSquare)
        executeMove({ from: selectedSquare, to: square });
      selectedSquare = null;
      updateBoardContent();
    }
  });

  function initSettings() {
    document.querySelectorAll("#colorGroup .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#colorGroup .chip-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedColorChoice = btn.dataset.color;
        if (gameStarted) resetGame();
      });
    });
    document.querySelectorAll("#timeGroup .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#timeGroup .chip-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedTimeControl = btn.dataset.time;
        if (gameStarted) resetGame();
        else resetTimers();
      });
    });
  }

  function copyPGN() {
    if (moveHistory.length === 0) return alert("هیچ حرکتی ثبت نشده!");
    navigator.clipboard
      .writeText(game.pgn())
      .then(() => alert("✅ PGN کپی شد"));
  }
  function downloadPGN() {
    if (moveHistory.length === 0) return alert("هیچ حرکتی ثبت نشده!");
    const blob = new Blob([game.pgn()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `game_vs_${selectedBot.name}.pgn`;
    a.click();
  }

  async function init() {
    document.addEventListener("pieceSetChanged", () => {
      if (game) updateBoardContent();
    });
    initStockfish();
    buildBotsGrid();
    initSettings();
    resetTimers();
    buildBoardDOM();

    playBtn.addEventListener("click", startGame);
    resignBtn.addEventListener("click", () => {
      if (isGameActive) endGame("resign");
    });
    document.getElementById("resultRematch").addEventListener("click", () => {
      resultOverlay.classList.remove("open");
      resetGame();
      setTimeout(startGame, 100);
    });
    document.getElementById("resultClose").addEventListener("click", () => {
      resultOverlay.classList.remove("open");
      resetGame();
    });
    document.getElementById("copyPgnBtn").addEventListener("click", copyPGN);
    document
      .getElementById("downloadPgnBtn")
      .addEventListener("click", downloadPGN);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
