/* ============================================================
   ♛ ChessHub — بازی با بات (۳۵ حریف با شخصیت)
   ------------------------------------------------------------
   • تخته/درگ/پروموشن: ماژول مشترک ChessBoardUI
   • انجین: ماژول مشترک ChessEngine
   • بات‌ها: BotBrain (سطح دقیق هم‌اندازه‌ی ریتینگ + شخصیت)
   • پایان بازی: اورلی نتیجه + «مرور بازی» حرفه‌ای (GameReview)
   • ساعت: استاندارد + سفارشی (دقیقه + افزوده دلخواه)
   ============================================================ */
(function () {
  "use strict";

  // ===== اعمال تم ذخیره‌شده =====
  (function applySavedTheme() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (s && s.theme) document.body.classList.add("theme-" + s.theme);
    } catch (e) {}
  })();

  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA[+d]; }); }
  function $(id) { return document.getElementById(id); }

  // ===== وضعیت =====
  let game = new Chess();
  let board = null;
  let userColor = "w";
  let selectedBot = null;
  let selectedColorChoice = "white";
  let selectedTime = "10+0"; // "mm+inc" | "0" | "custom"
  let userTime = 0, botTime = 0, userInc = 0, botInc = 0;
  let timerInterval = null;
  let isActive = false;
  let gameStarted = false;
  let gameEnded = false;
  let botThinking = false;
  let uciMoves = [];
  let lastMove = null;
  let ratingFilter = "all";
  let lastResult = "*";

  const boardEl = $("chessboard");

  // ===== ابزار ساعت =====
  function parseTime(t) {
    if (t === "custom") {
      const m = Math.max(1, Math.min(120, parseInt($("customMin").value, 10) || 7));
      const i = Math.max(0, Math.min(60, parseInt($("customInc").value, 10) || 0));
      return { base: m * 60, inc: i, label: fa(m) + "+" + fa(i) };
    }
    if (t === "0") return { base: Infinity, inc: 0, label: "∞" };
    const parts = t.split("+");
    return { base: parseInt(parts[0], 10) * 60, inc: parseInt(parts[1], 10) || 0, label: fa(parts[0]) + "+" + fa(parts[1]) };
  }
  function fmtTime(s) {
    if (s === Infinity) return "∞";
    s = Math.max(0, s);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return fa(m) + ":" + fa(String(sec).padStart(2, "0"));
  }
  function updateTimers() {
    $("userTimerBox").textContent = fmtTime(userTime);
    $("botTimerBox").textContent = fmtTime(botTime);
    const myTurn = isActive && !gameEnded && game.turn() === userColor;
    $("userTimerBox").classList.toggle("active-timer", myTurn);
    $("botTimerBox").classList.toggle("active-timer", isActive && !gameEnded && !myTurn);
    $("userTimerBox").classList.toggle("low", myTurn && userTime < 10 && userTime !== Infinity);
    $("botTimerBox").classList.toggle("low", !myTurn && botTime < 10 && botTime !== Infinity);
  }
  function startClock() {
    stopClock();
    timerInterval = setInterval(function () {
      if (!isActive || gameEnded) return;
      if (game.turn() === userColor) {
        if (userTime !== Infinity) userTime = Math.max(0, userTime - 0.1);
        if (userTime <= 0) return endGame("timeout", "user");
      } else {
        if (botTime !== Infinity) botTime = Math.max(0, botTime - 0.1);
        if (botTime <= 0) return endGame("timeout", "bot");
      }
      updateTimers();
    }, 100);
  }
  function stopClock() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ===== رندر تخته =====
  function buildBoard() {
    board = ChessBoardUI.create({
      boardEl: boardEl,
      getGame: function () { return game; },
      canMove: function () { return isActive && !gameEnded && !botThinking && game.turn() === userColor; },
      userColor: function () { return userColor; },
      orientation: function () { return userColor === "b" ? "b" : "w"; },
      onAttempt: handleUserMove,
    });
    board.build();
  }
  function refresh() {
    if (board) board.render({ lastMove: lastMove });
  }

  // ===== حرکت کاربر =====
  function handleUserMove(from, to, promo) {
    if (!isActive || gameEnded || botThinking || game.turn() !== userColor) return false;
    const mv = game.move({ from: from, to: to, promotion: promo || "q" });
    if (!mv) return false;
    uciMoves.push(from + to + (mv.promotion || ""));
    lastMove = { from: mv.from, to: mv.to };
    const tc = parseTime(selectedTime);
    if (tc.inc) userTime += tc.inc;
    window.ChessHub && ChessHub.Sound.play("move");
    refresh();
    updateHistory();
    updateTimers();
    speak("move");

    if (checkGameEnd()) return true;
    // نوبت بات
    setTimeout(botTurn, 250);
    return true;
  }

  // ===== نوبت بات =====
  async function botTurn() {
    if (!isActive || gameEnded || game.game_over()) return;
    botThinking = true;
    setEngineStatus(true);
    speak("think");
    const fen = game.fen();
    const mv = await BotBrain.getMove(fen, selectedBot, game);
    botThinking = false;
    setEngineStatus(false);
    if (!isActive || gameEnded) return;
    if (!mv) return endIfOver();
    const applied = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" });
    if (!applied) {
      const legal = game.moves({ verbose: true });
      if (!legal.length) return endIfOver();
      const fb = legal[Math.floor(Math.random() * legal.length)];
      game.move({ from: fb.from, to: fb.to, promotion: fb.promotion || "q" });
      uciMoves.push(fb.from + fb.to + (fb.promotion || ""));
      lastMove = { from: fb.from, to: fb.to };
    } else {
      uciMoves.push(mv.from + mv.to + (mv.promotion || ""));
      lastMove = { from: applied.from, to: applied.to };
      if (applied.captured) speak("capture");
      else if (applied.san.indexOf("+") >= 0) speak("check");
    }
    const tc = parseTime(selectedTime);
    if (tc.inc) botTime += tc.inc;
    refresh();
    updateHistory();
    updateTimers();
    if (!checkGameEnd()) updateTimers();
  }

  function setEngineStatus(busy) {
    const el = $("engineStatus");
    el.classList.toggle("busy", busy);
    el.innerHTML = busy
      ? '<i class="fas fa-spinner fa-pulse"></i> ' + selectedBot.name + " دارد فکر می‌کند…"
      : '<i class="fas fa-circle-check"></i> انجین آماده است';
  }
  function speak(type) {
    $("botSpeech").textContent = BotBrain.speak(selectedBot, type);
  }

  // ===== پایان بازی =====
  function endIfOver() {
    if (game.game_over()) { checkGameEnd(); return true; }
    return false;
  }
  function checkGameEnd() {
    if (!game.game_over()) return false;
    let reason = "draw";
    if (game.in_checkmate()) reason = "checkmate";
    else if (game.in_stalemate()) reason = "stalemate";
    else if (game.insufficient_material()) reason = "insufficient";
    else if (game.in_threefold_repetition()) reason = "threefold";
    else if (game.in_draw()) reason = "fifty";
    endGame(reason, null);
    return true;
  }
  function endGame(reason, loser) {
    if (gameEnded) return;
    gameEnded = true;
    isActive = false;
    gameStarted = false;
    botThinking = false;
    stopClock();
    updateTimers();
    if (window.ChessEngine) ChessEngine.flush();

    let userWon = null;
    if (reason === "checkmate") userWon = game.turn() !== userColor;
    if (reason === "timeout") userWon = loser === "bot";
    if (reason === "resign") userWon = false;
    lastResult = userWon === true ? "1-0" : userWon === false ? "0-1" : "1/2-1/2";
    if (userColor === "b" && lastResult !== "1/2-1/2") {
      lastResult = lastResult === "1-0" ? "0-1" : "1-0";
    }

    let icon = "🤝", title = "مساوی!", sub = "بازی با نتیجه‌ی برابر تمام شد.";
    const oppName = selectedBot.name;
    if (reason === "checkmate") {
      if (userWon) { icon = "🏆"; title = "برد!"; sub = "آفرین! " + oppName + " را مات کردی. " + BotBrain.speak(selectedBot, "lose"); }
      else { icon = "😔"; title = "باخت!"; sub = oppName + " مات کرد. " + BotBrain.speak(selectedBot, "win"); }
    } else if (reason === "timeout") {
      if (userWon) { icon = "⏰"; title = "برد!"; sub = "زمان " + oppName + " تمام شد."; }
      else { icon = "⏰"; title = "باخت!"; sub = "زمانت تمام شد — دفعه‌ی بعد سریع‌تر حرکت کن."; }
    } else if (reason === "resign") {
      icon = "🏳️"; title = "باخت!"; sub = "تسلیم شدی. " + BotBrain.speak(selectedBot, "win");
    } else if (reason === "stalemate") {
      sub = "پات! شاه حریف حرکتی ندارد ولی کیش هم نیست.";
    } else if (reason === "insufficient") {
      sub = "مهره‌ی کافی برای مات روی تخته نیست.";
    } else if (reason === "threefold") {
      sub = "سه‌بار موقعیت تکرار شد — تساوی رسمی.";
    } else if (reason === "fifty") {
      sub = "۵۰ حرکت بدون گرفتن و بدون حرکت پیاده — تساوی قانونی.";
    }
    if (reason !== "checkmate" && reason !== "timeout" && reason !== "resign" && userWon === null) {
      speak(userWon === true ? "win" : "draw");
    }

    $("resultIcon").textContent = icon;
    $("resultTitle").textContent = title;
    $("resultSub").textContent = sub;
    $("resultMoves").textContent = fa(Math.ceil(uciMoves.length / 2));
    $("resultUserTime").textContent = fmtTime(userTime);
    $("resultBotTime").textContent = fmtTime(botTime);
    $("resultOverlay").classList.add("open");
    $("playBtn").innerHTML = '<i class="fas fa-play"></i> شروع بازی جدید';
  }

  // ===== شروع/ریست =====
  function startGame() {
    if (gameStarted) { resetGame(); return; }
    if (selectedColorChoice === "random") userColor = Math.random() < 0.5 ? "w" : "b";
    else userColor = selectedColorChoice === "white" ? "w" : "b";

    gameEnded = false; gameStarted = true; isActive = true;
    game = new Chess();
    uciMoves = []; lastMove = null; lastResult = "*";
    const tc = parseTime(selectedTime);
    userTime = tc.base; botTime = tc.base;
    userInc = tc.inc; botInc = tc.inc;
    $("userColorLabel").textContent = userColor === "w" ? "مهره‌های سفید" : "مهره‌های سیاه";
    if (board) board.destroy();
    buildBoard();
    updateTimers();
    startClock();
    $("playBtn").innerHTML = '<i class="fas fa-stop"></i> توقف بازی';
    $("resultOverlay").classList.remove("open");
    speak("start");
    $("userTimerBox").textContent = fmtTime(userTime);
    $("botTimerBox").textContent = fmtTime(botTime);
    if (game.turn() !== userColor) setTimeout(botTurn, 500);
  }
  function resetGame() {
    stopClock();
    gameEnded = false; gameStarted = false; isActive = false; botThinking = false;
    game = new Chess();
    uciMoves = []; lastMove = null;
    if (window.ChessEngine) ChessEngine.flush();
    $("resultOverlay").classList.remove("open");
    if (board) board.destroy();
    buildBoard();
    const tc = parseTime(selectedTime);
    userTime = tc.base; botTime = tc.base;
    updateTimers();
    $("playBtn").innerHTML = '<i class="fas fa-play"></i> شروع بازی';
    updateHistory();
    $("botSpeech").textContent = "سلام! من آماده‌ام — هر وقت خواستی شروع کن.";
  }

  // ===== تاریخچه و PGN =====
  function updateHistory() {
    const hist = game.history({ verbose: true });
    const list = $("historyList");
    if (!hist.length) {
      list.innerHTML = '<div class="empty-history">هنوز حرکتی ثبت نشده</div>';
      return;
    }
    let html = "";
    for (let i = 0; i < hist.length; i += 2) {
      html += '<div class="move-item"><span class="move-num">' + fa(Math.floor(i / 2) + 1) + ".</span> " +
        hist[i].san + " " + (hist[i + 1] ? hist[i + 1].san : "") + "</div>";
    }
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
  }
  function buildPgn() {
    const tc = parseTime(selectedTime);
    const whiteName = userColor === "w" ? "شما" : selectedBot.name;
    const blackName = userColor === "b" ? "شما" : selectedBot.name;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
    const headers =
      '[Event "ChessHub — بازی با بات"]\n[Site "ChessHub"]\n[Date "' + date + '"]\n' +
      '[White "' + whiteName + '"]\n[Black "' + blackName + '"]\n' +
      '[Result "' + lastResult + '"]\n[TimeControl "' + (tc.base === Infinity ? "-" : Math.round(tc.base) + "+" + tc.inc) + '"]\n\n';
    const body = game.pgn({ maxWidth: 80, newline: "\n" }) || "";
    return headers + body + " " + lastResult;
  }
  function copyPgn() {
    if (!uciMoves.length) return toast("هنوز حرکتی ثبت نشده!");
    navigator.clipboard.writeText(buildPgn())
      .then(function () { toast("✅ PGN کپی شد"); })
      .catch(function () { toast("کپی نشد"); });
  }
  function downloadPgn() {
    if (!uciMoves.length) return toast("هنوز حرکتی ثبت نشده!");
    const blob = new Blob([buildPgn()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chesshub_vs_" + selectedBot.name + ".pgn";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function toast(msg) {
    let el = document.querySelector(".settings-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "settings-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  // ===== گرید بات‌ها =====
  function renderBots() {
    const grid = $("botsGrid");
    const q = $("botSearch").value.trim();
    grid.innerHTML = "";
    window.CHESSHUB_BOTS.forEach(function (bot) {
      const passQ = !q || bot.name.indexOf(q) >= 0;
      const passR =
        ratingFilter === "all" ||
        (ratingFilter === "low" && bot.rating <= 1200) ||
        (ratingFilter === "mid" && bot.rating > 1200 && bot.rating <= 2000) ||
        (ratingFilter === "high" && bot.rating > 2000);
      if (!passQ || !passR) return;
      const div = document.createElement("div");
      div.className = "bot-item" + (selectedBot && selectedBot.id === bot.id ? " active" : "");
      div.innerHTML =
        '<div class="mini-avatar"><img src="' + bot.avatar + '" alt="' + bot.name +
        '" onerror="this.src=\'https://ui-avatars.com/api/?background=2c3e50&color=fff&name=' + encodeURIComponent(bot.name) + '\'"></div>' +
        '<div class="b-info"><span class="bname">' + bot.name + "</span>" +
        '<span class="bmeta"><b>' + bot.faRating + "</b><span class='bstyle'>" + bot.styleFa + "</span></span></div>";
      div.addEventListener("click", function () {
        selectedBot = bot;
        $("botName").textContent = bot.name;
        $("botRating").textContent = "ریتینگ " + bot.faRating + " · " + bot.styleFa;
        const img = $("botAvatarImg");
        img.style.display = "";
        img.src = bot.avatar;
        grid.querySelectorAll(".bot-item").forEach(function (e) { e.classList.remove("active"); });
        div.classList.add("active");
        saveLast();
        if (gameStarted) resetGame();
        speak("start");
      });
      grid.appendChild(div);
    });
    if (!grid.children.length) {
      grid.innerHTML = '<div class="empty-history">باتی با این مشخصات پیدا نشد</div>';
    }
  }

  function saveLast() {
    try {
      localStorage.setItem("chesshub_enginegame_last", JSON.stringify({
        botId: selectedBot ? selectedBot.id : null,
        color: selectedColorChoice,
        time: selectedTime,
      }));
    } catch (e) {}
  }
  function loadLast() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_enginegame_last"));
      if (s && s.botId) selectedBot = BotBrain.pickBotById(s.botId);
      if (s && ["white", "black", "random"].indexOf(s.color) >= 0) selectedColorChoice = s.color;
      if (s && s.time) selectedTime = s.time;
    } catch (e) {}
  }
  function syncControlUI() {
    document.querySelectorAll("#colorGroup .chip-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.color === selectedColorChoice);
    });
    document.querySelectorAll("#timeGroup .chip-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.time === selectedTime);
    });
    $("customTimeBox").classList.toggle("show", selectedTime === "custom");
  }

  // ===== راه‌اندازی =====
  async function init() {
    if (typeof Chess === "undefined") return;
    window.ChessEngine.init();
    loadLast();
    if (!selectedBot) selectedBot = window.CHESSHUB_BOTS[0];
    $("botName").textContent = selectedBot.name;
    $("botRating").textContent = "ریتینگ " + selectedBot.faRating + " · " + selectedBot.styleFa;
    $("botAvatarImg").src = selectedBot.avatar;
    syncControlUI();
    renderBots();

    // ♟️ مهم: اول مهره‌های کاربر (پوشه pieces) پیش‌بارگذاری شود، بعد تخته ساخته شود
    // تا مهره‌ها با اسکین انتخابی نمایش داده شوند — نه گلیف یونیکد
    if (window.ChessUtils && ChessUtils.loadPieces) {
      try { await ChessUtils.loadPieces(); } catch (e) {}
    }
    buildBoard();
    const tc = parseTime(selectedTime);
    userTime = tc.base; botTime = tc.base;
    updateTimers();

    $("playBtn").addEventListener("click", startGame);
    $("resignBtn").addEventListener("click", function () {
      if (isActive && !gameEnded) endGame("resign");
    });
    $("resultRematch").addEventListener("click", function () {
      $("resultOverlay").classList.remove("open");
      resetGame();
      setTimeout(startGame, 120);
    });
    $("resultReview").addEventListener("click", function () {
      if (!uciMoves.length) return toast("حرکتی برای مرور نیست");
      window.GameReview.open({
        moves: uciMoves,
        white: userColor === "w" ? "شما" : selectedBot.name,
        black: userColor === "b" ? "شما" : selectedBot.name,
        title: "بازی با بات",
        subtitle: selectedBot.name + " — ریتینگ " + selectedBot.faRating,
        result: lastResult,
      });
    });
    $("resultCopyPgn").addEventListener("click", copyPgn);
    $("resultClose").addEventListener("click", function () {
      $("resultOverlay").classList.remove("open");
      resetGame();
    });
    $("copyPgnBtn").addEventListener("click", copyPgn);
    $("downloadPgnBtn").addEventListener("click", downloadPgn);

    $("botSearch").addEventListener("input", renderBots);
    document.querySelectorAll("#ratingChips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        document.querySelectorAll("#ratingChips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        ratingFilter = c.dataset.r;
        renderBots();
      });
    });
    document.querySelectorAll("#colorGroup .chip-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        selectedColorChoice = b.dataset.color;
        syncControlUI();
        saveLast();
        if (gameStarted) resetGame();
      });
    });
    document.querySelectorAll("#timeGroup .chip-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        selectedTime = b.dataset.time;
        syncControlUI();
        saveLast();
        if (gameStarted) resetGame();
        else {
          const tc2 = parseTime(selectedTime);
          userTime = tc2.base; botTime = tc2.base;
          updateTimers();
        }
      });
    });

    document.addEventListener("pieceSetChanged", function () { refresh(); });
    document.addEventListener("themeChanged", function () { refresh(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
