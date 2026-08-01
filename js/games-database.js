(function () {
  "use strict";

  // ===== اعمال تم ذخیره شده =====
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

  // ===== لیست ۳۰ استاد بزرگ =====
  const players = [
    {
      name: "Magnus Carlsen",
      title: "قهرمان جهان",
      file: "Carlsen.pgn",
      avatar: "images/players/carlsen.jpg",
    },
    {
      name: "Garry Kasparov",
      title: "قهرمان جهان",
      file: "Kasparov.pgn",
      avatar: "images/players/kasparov.jpg",
    },
    {
      name: "Bobby Fischer",
      title: "قهرمان جهان",
      file: "Fischer.pgn",
      avatar: "images/players/fischer.jpg",
    },
    {
      name: "Anatoly Karpov",
      title: "قهرمان جهان",
      file: "Karpov.pgn",
      avatar: "images/players/karpov.jpg",
    },
    {
      name: "José Raúl Capablanca",
      title: "قهرمان جهان",
      file: "Capablanca.pgn",
      avatar: "images/players/capablanca.jpg",
    },
    {
      name: "Alexander Alekhine",
      title: "قهرمان جهان",
      file: "Alekhine.pgn",
      avatar: "images/players/alekhine.jpg",
    },
    {
      name: "Mikhail Tal",
      title: "قهرمان جهان",
      file: "Tal.pgn",
      avatar: "images/players/tal.jpg",
    },
    {
      name: "Emanuel Lasker",
      title: "قهرمان جهان",
      file: "Lasker.pgn",
      avatar: "images/players/lasker.jpg",
    },
    {
      name: "Wilhelm Steinitz",
      title: "قهرمان جهان",
      file: "Steinitz.pgn",
      avatar: "images/players/steinitz.jpg",
    },
    {
      name: "Viswanathan Anand",
      title: "قهرمان جهان",
      file: "Anand.pgn",
      avatar: "images/players/anand.jpg",
    },
    {
      name: "Vladimir Kramnik",
      title: "قهرمان جهان",
      file: "Kramnik.pgn",
      avatar: "images/players/kramnik.jpg",
    },
    {
      name: "Vasily Smyslov",
      title: "قهرمان جهان",
      file: "Smyslov.pgn",
      avatar: "images/players/smyslov.jpg",
    },
    {
      name: "Tigran Petrosian",
      title: "قهرمان جهان",
      file: "Petrosian.pgn",
      avatar: "images/players/petrosian.jpg",
    },
    {
      name: "Boris Spassky",
      title: "قهرمان جهان",
      file: "Spassky.pgn",
      avatar: "images/players/spassky.jpg",
    },
    {
      name: "Max Euwe",
      title: "قهرمان جهان",
      file: "Euwe.pgn",
      avatar: "images/players/euwe.jpg",
    },
    {
      name: "Mikhail Botvinnik",
      title: "قهرمان جهان",
      file: "Botvinnik.pgn",
      avatar: "images/players/botvinnik.jpg",
    },
    {
      name: "Paul Morphy",
      title: "افسانه",
      file: "Morphy.pgn",
      avatar: "images/players/morphy.jpg",
    },
    {
      name: "Hikaru Nakamura",
      title: "سوپر استاد",
      file: "Nakamura.pgn",
      avatar: "images/players/nakamura.jpg",
    },
    {
      name: "Fabiano Caruana",
      title: "سوپر استاد",
      file: "Caruana.pgn",
      avatar: "images/players/caruana.jpg",
    },
    {
      name: "Levon Aronian",
      title: "سوپر استاد",
      file: "Aronian.pgn",
      avatar: "images/players/aronian.jpg",
    },
    {
      name: "Wesley So",
      title: "سوپر استاد",
      file: "So.pgn",
      avatar: "images/players/so.jpg",
    },
    {
      name: "Ding Liren",
      title: "قهرمان جهان",
      file: "Ding.pgn",
      avatar: "images/players/ding.jpg",
    },
    {
      name: "Ian Nepomniachtchi",
      title: "سوپر استاد",
      file: "Nepomniachtchi.pgn",
      avatar: "images/players/nepomniachtchi.jpg",
    },
    {
      name: "Alireza Firouzja",
      title: "سوپر استاد",
      file: "Firouzja.pgn",
      avatar: "images/players/firouzja.jpg",
    },
    {
      name: "Richard Réti",
      title: "استاد بزرگ",
      file: "Reti.pgn",
      avatar: "images/players/reti.jpg",
    },
    {
      name: "Aaron Nimzowitsch",
      title: "استاد بزرگ",
      file: "Nimzowitsch.pgn",
      avatar: "images/players/nimzowitsch.jpg",
    },
    {
      name: "Frank Marshall",
      title: "استاد بزرگ",
      file: "Marshall.pgn",
      avatar: "images/players/marshall.jpg",
    },
    {
      name: "David Bronstein",
      title: "استاد بزرگ",
      file: "Bronstein.pgn",
      avatar: "images/players/bronstein.jpg",
    },
    {
      name: "Viktor Korchnoi",
      title: "استاد بزرگ",
      file: "Korchnoi.pgn",
      avatar: "images/players/korchnoi.jpg",
    },
    {
      name: "Gukesh D",
      title: "سوپر استاد",
      file: "Gukesh.pgn",
      avatar: "images/players/gukesh.jpg",
    },
  ];

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

  document.addEventListener("pieceSetChanged", function () {
    loadPieces();
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

  let currentPlayerGames = [];
  let filteredGames = [];
  let currentGameMoves = [];
  let currentMoveIndex = 0;
  let currentGame = null;
  let autoPlayInterval = null;
  let isAutoPlaying = false;
  let totalPlies = 0;

  const playersGrid = document.getElementById("playersGrid");
  const gamesOverlay = document.getElementById("gamesOverlay");
  const gameOverlay = document.getElementById("gameOverlay");
  const gamesListContainer = document.getElementById("gamesListContainer");
  const gameViewerContainer = document.getElementById("gameViewerContainer");
  const overlayPlayerName = document.getElementById("overlayPlayerName");
  const closeGamesOverlayBtn = document.getElementById("closeGamesOverlay");
  const closeGameOverlayBtn = document.getElementById("closeGameOverlay");
  const searchInput = document.getElementById("searchInput");
  const searchField = document.getElementById("searchField");
  const resetSearchBtn = document.getElementById("resetSearchBtn");
  const playerCount = document.getElementById("playerCount");

  function renderPlayers() {
    if (!playersGrid) return;
    playersGrid.innerHTML = "";
    players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "player-card";
      card.innerHTML = `
        <div class="avatar">
          <img src="${p.avatar}" alt="${p.name}" onerror="this.src='https://ui-avatars.com/api/?background=2c3e50&color=fff&name=${encodeURIComponent(p.name)}'" loading="lazy">
        </div>
        <div class="name">${p.name}</div>
        <div class="title">${p.title}</div>
      `;
      card.addEventListener("click", function () {
        openPlayerGames(p);
      });
      playersGrid.appendChild(card);
    });
    if (playerCount) playerCount.textContent = `${players.length} بازیکن`;
  }

  function openPlayerGames(player) {
    if (!player) return;
    if (overlayPlayerName) overlayPlayerName.textContent = player.name;
    if (gamesOverlay) gamesOverlay.classList.add("open");
    document.body.style.overflow = "hidden";

    if (searchInput) searchInput.value = "";
    if (gameOverlay) gameOverlay.classList.remove("open");
    if (gameViewerContainer) gameViewerContainer.innerHTML = "";

    if (gamesListContainer) {
      gamesListContainer.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-pulse"></i> بارگذاری بازی‌های ${player.name}...</div>`;
    }

    fetch(`pgn/${player.file}`)
      .then((res) => {
        if (!res.ok) throw new Error("فایل یافت نشد");
        return res.text();
      })
      .then((pgnText) => {
        currentPlayerGames = parsePGN(pgnText);
        filteredGames = [...currentPlayerGames];
        renderGamesList(filteredGames);
      })
      .catch((err) => {
        console.error(err);
        if (gamesListContainer) {
          gamesListContainer.innerHTML = `<div class="no-games">❌ خطا در بارگذاری بازی‌ها</div>`;
        }
      });
  }

  function parsePGN(pgnText) {
    const rawGames = pgnText.split(/(?=\[Event ")/);
    const games = [];
    for (let raw of rawGames) {
      if (!raw.trim()) continue;
      const whiteMatch = raw.match(/\[White "([^"]+)"\]/);
      const blackMatch = raw.match(/\[Black "([^"]+)"\]/);
      const resultMatch = raw.match(/\[Result "([^"]+)"\]/);
      const dateMatch = raw.match(/\[Date "([^"]+)"\]/);
      const ecoMatch = raw.match(/\[ECO "([^"]+)"\]/);
      const openingMatch = raw.match(/\[Opening "([^"]+)"\]/);
      games.push({
        white: whiteMatch ? whiteMatch[1] : "?",
        black: blackMatch ? blackMatch[1] : "?",
        result: resultMatch ? resultMatch[1] : "*",
        date: dateMatch ? dateMatch[1] : "????.??.??",
        eco: ecoMatch ? ecoMatch[1] : "",
        opening: openingMatch ? openingMatch[1] : "",
        pgn: raw,
      });
    }
    return games;
  }

  function renderGamesList(games) {
    if (!gamesListContainer) return;
    if (!games.length) {
      gamesListContainer.innerHTML = `<div class="no-games">هیچ بازی‌ای با این جستجو یافت نشد</div>`;
      return;
    }
    gamesListContainer.innerHTML = "";
    games.forEach((game, idx) => {
      const div = document.createElement("div");
      div.className = "game-item";
      const resultText =
        game.result === "1-0"
          ? "برد سفید"
          : game.result === "0-1"
            ? "برد سیاه"
            : "مساوی";
      const resultClass =
        game.result === "1-0"
          ? "white-win"
          : game.result === "0-1"
            ? "black-win"
            : "draw";
      div.innerHTML = `
        <div class="game-info">
          <span class="badge ${resultClass}">${resultText}</span>
          <span>⚪ ${game.white}</span>
          <span>⚫ ${game.black}</span>
          <span>📅 ${game.date}</span>
          ${game.opening ? `<span class="opening-tag">${game.opening}</span>` : ""}
        </div>
        <div class="game-arrow"><i class="fas fa-chevron-left"></i></div>
      `;
      div.addEventListener("click", function () {
        openGameViewer(idx, games);
      });
      gamesListContainer.appendChild(div);
    });
  }

  function performSearch() {
    if (!searchInput || !searchField) return;
    const query = searchInput.value.trim().toLowerCase();
    const field = searchField.value;
    if (!query) {
      filteredGames = [...currentPlayerGames];
      renderGamesList(filteredGames);
      return;
    }
    filteredGames = currentPlayerGames.filter((game) => {
      if (field === "all") {
        return (
          game.white.toLowerCase().includes(query) ||
          game.black.toLowerCase().includes(query) ||
          game.result.includes(query) ||
          game.date.includes(query) ||
          (game.opening && game.opening.toLowerCase().includes(query))
        );
      }
      if (field === "white") {
        return game.white.toLowerCase().includes(query);
      }
      if (field === "black") {
        return game.black.toLowerCase().includes(query);
      }
      if (field === "result") {
        const map = { "1-0": "برد سفید", "0-1": "برد سیاه", "*": "مساوی" };
        return map[game.result]?.includes(query) || game.result.includes(query);
      }
      if (field === "date") {
        return game.date.includes(query);
      }
      return false;
    });
    renderGamesList(filteredGames);
  }

  function openGameViewer(gameIdx, games) {
    if (!games || !games[gameIdx]) return;
    const game = games[gameIdx];
    currentGame = game;
    stopAutoPlay();
    if (!gameViewerContainer) return;

    const viewer = document.createElement("div");
    viewer.className = "game-viewer";
    viewer.id = "gameViewer";
    const resultIcon =
      game.result === "1-0"
        ? "🏆 برد سفید"
        : game.result === "0-1"
          ? "🏆 برد سیاه"
          : "🤝 مساوی";

    viewer.innerHTML = `
      <div class="viewer-header">
        <div class="game-title">♜ ${game.white} <span class="vs">vs</span> ${game.black} <span style="font-size:0.65rem;color:var(--text-light);font-weight:400;margin-right:0.4rem;">${resultIcon}</span></div>
      </div>
      <div class="viewer-body">
        <div class="board-wrapper">
          <div id="gameBoard" class="chessboard"></div>
          <div class="playback-controls">
            <button id="firstMoveBtn"><i class="fas fa-fast-backward"></i></button>
            <button id="prevMoveBtn"><i class="fas fa-step-backward"></i></button>
            <button id="playPauseBtn" class="primary"><i class="fas fa-play"></i> شروع</button>
            <button id="nextMoveBtn"><i class="fas fa-step-forward"></i></button>
            <button id="lastMoveBtn"><i class="fas fa-fast-forward"></i></button>
            <span class="move-counter" id="moveCounter">0/0</span>
          </div>
        </div>
        <div class="info-wrapper">
          <div class="game-meta">
            <div class="meta-item"><span class="label">گشایش:</span><span class="value">${game.opening || "نامشخص"}</span></div>
            <div class="meta-item"><span class="label">ECO:</span><span class="value">${game.eco || "-"}</span></div>
            <div class="meta-item"><span class="label">تاریخ:</span><span class="value">${game.date}</span></div>
            <div class="meta-item"><span class="label">تعداد حرکت:</span><span class="value" id="totalMoves">0</span></div>
          </div>
          <div class="pgn-actions">
            <button id="copyPgnBtn"><i class="fas fa-copy"></i> کپی PGN</button>
            <button id="downloadPgnBtn"><i class="fas fa-download"></i> دانلود PGN</button>
          </div>
        </div>
      </div>
    `;

    gameViewerContainer.innerHTML = "";
    gameViewerContainer.appendChild(viewer);
    loadGameMoves(game.pgn);

    document
      .getElementById("firstMoveBtn")
      .addEventListener("click", goToFirstMove);
    document
      .getElementById("prevMoveBtn")
      .addEventListener("click", goToPrevMove);
    document
      .getElementById("playPauseBtn")
      .addEventListener("click", toggleAutoPlay);
    document
      .getElementById("nextMoveBtn")
      .addEventListener("click", goToNextMove);
    document
      .getElementById("lastMoveBtn")
      .addEventListener("click", goToLastMove);
    document.getElementById("copyPgnBtn").addEventListener("click", copyPGN);
    document
      .getElementById("downloadPgnBtn")
      .addEventListener("click", downloadPGN);

    if (gameOverlay) gameOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
    if (gameOverlay) gameOverlay.scrollTop = 0;
  }

  function loadGameMoves(pgn) {
    const temp = new Chess();
    try {
      temp.load_pgn(pgn);
      currentGameMoves = temp.history({ verbose: true });
    } catch (e) {
      currentGameMoves = [];
    }
    totalPlies = currentGameMoves.length;
    currentMoveIndex = 0;
    const moveCount = Math.ceil(totalPlies / 2);
    const totalMovesEl = document.getElementById("totalMoves");
    if (totalMovesEl) totalMovesEl.textContent = moveCount;
    updateBoard();
  }

  function renderBoardDOM(boardId, moves, moveIndex) {
    const container = document.getElementById(boardId);
    if (!container) return;
    const game = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      game.move(moves[i]);
    }
    const board = game.board();
    const pieceSet = getCurrentPieceSet();
    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(8, 1fr)";
    container.style.aspectRatio = "1 / 1";
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        const isLight = (i + j) % 2 === 0;
        const squareDiv = document.createElement("div");
        squareDiv.className = `square ${isLight ? "light" : "dark"}`;
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
        container.appendChild(squareDiv);
      }
    }
  }

  function updateBoard() {
    renderBoardDOM("gameBoard", currentGameMoves, currentMoveIndex);
    const moveNumber = Math.ceil(currentMoveIndex / 2);
    const totalMoves = Math.ceil(totalPlies / 2);
    const counter = document.getElementById("moveCounter");
    if (counter) counter.textContent = `${moveNumber}/${totalMoves}`;
  }

  function goToFirstMove() {
    stopAutoPlay();
    currentMoveIndex = 0;
    updateBoard();
  }
  function goToPrevMove() {
    stopAutoPlay();
    if (currentMoveIndex > 0) currentMoveIndex--;
    updateBoard();
  }
  function goToNextMove() {
    stopAutoPlay();
    if (currentMoveIndex < totalPlies) currentMoveIndex++;
    updateBoard();
  }
  function goToLastMove() {
    stopAutoPlay();
    currentMoveIndex = totalPlies;
    updateBoard();
  }

  function toggleAutoPlay() {
    if (isAutoPlaying) stopAutoPlay();
    else startAutoPlay();
  }
  function startAutoPlay() {
    if (isAutoPlaying) return;
    if (currentMoveIndex >= totalPlies) {
      currentMoveIndex = 0;
      updateBoard();
    }
    isAutoPlaying = true;
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-pause"></i> توقف';
    autoPlayInterval = setInterval(() => {
      if (currentMoveIndex < totalPlies) {
        currentMoveIndex++;
        updateBoard();
      } else {
        stopAutoPlay();
      }
    }, 1200);
  }
  function stopAutoPlay() {
    isAutoPlaying = false;
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
  }

  function copyPGN() {
    if (!currentGame) return;
    navigator.clipboard
      .writeText(currentGame.pgn)
      .then(() => alert("✅ PGN کپی شد"))
      .catch(() => alert("❌ خطا در کپی PGN"));
  }
  function downloadPGN() {
    if (!currentGame) return;
    const blob = new Blob([currentGame.pgn], { type: "text/plain" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${currentGame.white}_vs_${currentGame.black}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function closeGameOverlay() {
    if (gameOverlay) gameOverlay.classList.remove("open");
    if (!gamesOverlay || !gamesOverlay.classList.contains("open")) {
      document.body.style.overflow = "";
    }
    stopAutoPlay();
    if (gameViewerContainer) gameViewerContainer.innerHTML = "";
  }
  function closeGamesOverlay() {
    if (gamesOverlay) gamesOverlay.classList.remove("open");
    if (gameOverlay) gameOverlay.classList.remove("open");
    document.body.style.overflow = "";
    stopAutoPlay();
    if (gameViewerContainer) gameViewerContainer.innerHTML = "";
  }

  function init() {
    loadPieces().then(() => {
      renderPlayers();
      if (closeGamesOverlayBtn)
        closeGamesOverlayBtn.addEventListener("click", closeGamesOverlay);
      if (closeGameOverlayBtn)
        closeGameOverlayBtn.addEventListener("click", closeGameOverlay);
      if (searchInput) searchInput.addEventListener("input", performSearch);
      if (searchField) searchField.addEventListener("change", performSearch);
      if (resetSearchBtn)
        resetSearchBtn.addEventListener("click", function () {
          if (searchInput) searchInput.value = "";
          performSearch();
        });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          if (gameOverlay && gameOverlay.classList.contains("open"))
            closeGameOverlay();
          else if (gamesOverlay && gamesOverlay.classList.contains("open"))
            closeGamesOverlay();
        }
      });

      document.addEventListener("pieceSetChanged", function () {
        loadPieces().then(() => {
          if (currentGame) updateBoard();
        });
      });
      document.addEventListener("themeChanged", function () {
        if (currentGame) updateBoard();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
