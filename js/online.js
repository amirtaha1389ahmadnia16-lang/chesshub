/* ============================================================
   ♛ ChessHub — کلاینت بازی آنلاین
   ------------------------------------------------------------
   WebSocket بومی (سازگار با online-server.js):
     • پروفایل (نام هر ۱۵ روز + آواتار آزاد)
     • بازی سریع با کنترل زمان (استاندارد + سفارشی)
     • دعوت از فهرست آنلاین‌ها، پذیرش/رد
     • ساعت سرور-محور، لغو قبل از حرکت اول، تسلیم/مساوی
     • قطعی ۱۵ثانیه‌ای + reconnect خودکار پس از رفرش
     • تماشای بازی‌های زنده + چت (بازیکن‌ها فقط)
     • پایان: بازی جدید / مرور بازی / PGN / بازگشت
   ============================================================ */
(function () {
  "use strict";

  (function applySavedTheme() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (s && s.theme) document.body.classList.add("theme-" + s.theme);
    } catch (e) {}
  })();

  const FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) { return String(n).replace(/\d/g, function (d) { return FA[+d]; }); }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ===== وضعیت =====
  let ws = null;
  let authed = false;
  let myProfile = null;
  let myUserId = null;
  let selectedTc = "300+3";
  let game = null;            // chess.js جاری
  let myBoard = null;
  let curGameId = null;
  let myColor = "w";
  let oppInfo = null;
  let lastMove = null;
  let isSpectating = false;
  let clocks = { w: 300, b: 300 };
  let localTick = null;
  let lastServerClock = 0;
  let posStarted = false; // ⏱ ساعت سرور فقط پس از اولین حرکت می‌چرخد
  let searching = false;
  let pendingInvite = null;
  let lastGameEnd = null;
  let connectRetry = 0;

  const PROFILE_KEY = "chesshub_online_profile";

  // ===== ابزار =====
  function toast(msg) {
    const el = $("olToast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }
  function fmtClock(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return fa(m) + ":" + fa(String(sec).padStart(2, "0"));
  }
  function tcLabel(code) { return code === "custom" ? "سفارشی" : code.replace("+", "+").replace(/\d+/g, function (m) { return fa(m); }); }
  function parseTcCode(code) {
    if (code === "custom") {
      const m = Math.max(1, Math.min(120, parseInt($("olCustomMin").value, 10) || 7));
      const i = Math.max(0, Math.min(60, parseInt($("olCustomInc").value, 10) || 0));
      return { base: m * 60, inc: i };
    }
    const p = code.split("+");
    return { base: parseInt(p[0], 10), inc: parseInt(p[1], 10) || 0 };
  }

  function savedProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch (e) { return null; }
  }
  function storeProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  // ===== اتصال =====
  function connect() {
    // 👤 صبر برای پروفایل سراسری — نام کاربری سایت، همان نام بازیکن آنلاین است
    const gNow = window.ChessHubProfile ? ChessHubProfile.profile : null;
    const savedNow = savedProfile();
    if (!(gNow && gNow.name) && !(savedNow && savedNow.name)) {
      if (!connect._waitingProfile) {
        connect._waitingProfile = true;
        if (window.ChessHubProfile) {
          ChessHubProfile.onChange(function () {
            if (connect._waitingProfile) {
              connect._waitingProfile = false;
              connect();
            }
          });
        }
      }
      return;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    try {
      ws = new WebSocket(proto + "://" + location.host);
    } catch (e) {
      return showOffline();
    }
    ws.onopen = function () {
      connectRetry = 0;
      const saved = savedProfile() || {};
      const g = window.ChessHubProfile && ChessHubProfile.has() ? ChessHubProfile.profile : null;
      ws.send(
        JSON.stringify({
          t: "auth",
          userId: saved.userId || null,
          name: (g && g.name) || saved.name || null,
          avatar: (g && g.avatar) || saved.avatar || null,
        })
      );
    };
    ws.onmessage = function (e) {
      let msg = null;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      route(msg);
    };
    ws.onclose = function () {
      authed = false;
      stopLocalTick();
      if (connectRetry < 5) {
        connectRetry++;
        setTimeout(connect, 1500 * connectRetry);
      } else {
        showOffline();
      }
    };
    ws.onerror = function () {};
  }
  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
  function showOffline() {
    $("olStatus").classList.add("show");
    const menu = $("olMenu");
    if (menu && !document.getElementById("offlineBox")) {
      const box = document.createElement("div");
      box.id = "offlineBox";
      box.className = "ol-list-panel";
      box.style.marginBottom = "1rem";
      box.innerHTML =
        '<div class="ol-panel-title" style="color:var(--danger)"><i class="fas fa-plug-circle-xmark"></i> اتصال به سرور برقرار نشد</div>' +
        '<p style="font-size:0.8rem;color:var(--text-light);line-height:2">سرور بازی آنلاین در دسترس نیست. سایت را از طریق سرور اصلی اجرا کن (<b>node server.js</b>) یا روی Render دیپلوی شده باشد، بعد دوباره تلاش کن.</p>' +
        '<button class="ol-btn primary" id="retryConn"><i class="fas fa-rotate-right"></i> تلاش مجدد</button>';
      menu.insertBefore(box, menu.firstChild);
      box.querySelector("#retryConn").addEventListener("click", function () {
        box.remove();
        connectRetry = 0;
        connect();
      });
    }
  }

  // ===== مسیریابی پیام‌ها =====
  function route(msg) {
    switch (msg.t) {
      case "authed": return onAuthed(msg.profile);
      case "users": return renderUsers(msg.list);
      case "live": return renderLive(msg.list);
      case "searching": return setSearching(true, msg.tc);
      case "searchCancelled": return setSearching(false);
      case "gameStart": return onGameStart(msg);
      case "position": return onPosition(msg);
      case "gameEnd": return onGameEnd(msg);
      case "drawOffered": return openModal("drawModal");
      case "drawDeclined": return toast("حریف مساوی را رد کرد");
      case "opponentDisconnected": return onOppDisconnect(msg.seconds);
      case "opponentReconnected": return setStatus("حریف وصل شد — بازی ادامه دارد", false);
      case "chat": return addChat(msg.from, msg.text);
      case "challengeIncoming": return onChallengeIncoming(msg);
      case "challengeSent": return toast("دعوت ارسال شد — منتظر پاسخ…");
      case "challengeDeclined": return toast("دعوت رد شد");
      case "challengeFailed": return toast(msg.reason === "playing" ? "این بازیکن در حال بازی است" : "این بازیکن آنلاین نیست");
      case "games": return renderHistory(msg.list);
      case "spectateStart": return;
      case "spectateEnd": return;
      case "spectators": return;
      case "error": return onError(msg);
      default: return;
    }
  }
  function onError(msg) {
    if (msg.code === "nameCooldown") {
      const d = new Date(msg.nextChange);
      toast("تغییر نام فقط هر ۱۵ روز — بعدی: " + d.toLocaleDateString("fa-IR"));
    } else {
      toast(msg.msg || "خطا");
      if (msg.fen && game && curGameId === msg.gameId) {
        try { game.load(msg.fen); refreshBoard(); } catch (e) {}
      }
    }
  }

  function onAuthed(profile) {
    authed = true;
    myProfile = profile;
    myUserId = profile.userId;
    // ذخیره‌ی userId محلی
    const saved = savedProfile() || {};
    saved.userId = profile.userId;
    if (!saved.name) saved.name = profile.name;
    if (!saved.avatar) saved.avatar = profile.avatar;
    storeProfile(saved);
    renderMyProfile();
    // 👤 همگام‌سازی با پروفایل سراسری سایت — نام بازیکن = نام کاربری یکتای سایت
    const g = window.ChessHubProfile && ChessHubProfile.has() ? ChessHubProfile.profile : null;
    if (g && profile.name !== g.name) {
      send({ t: "updateProfile", name: g.name, avatar: g.avatar || profile.avatar });
    }
    const modal = $("profileModal");
    if (!saved.name && !g) {
      openModal("profileModal"); // فالبک — در حالت عادی پروفایل سراسری همیشه هست
    }
    send({ t: "listUsers" });
    send({ t: "listLive" });
  }

  function renderMyProfile() {
    if (!myProfile) return;
    $("myName").textContent = myProfile.name;
    $("myRating").textContent = fa(myProfile.rating);
    $("myStats").innerHTML =
      "<span><i class='fas fa-circle-check' style='color:#68d391'></i> " + fa(myProfile.wins || 0) + "</span>" +
      "<span><i class='fas fa-circle-xmark' style='color:#fc8181'></i> " + fa(myProfile.losses || 0) + "</span>" +
      "<span><i class='fas fa-equals' style='color:#a0aec0'></i> " + fa(myProfile.draws || 0) + "</span>";
    setAvatarImg($("myAvatar"), myProfile.avatar);
    setAvatarImg($("meAvatar2"), myProfile.avatar);
    $("meName2").textContent = myProfile.name;
  }
  function setAvatarImg(el, url) {
    if (url) {
      el.innerHTML = '<img src="' + esc(url) + '" alt="" onerror="this.remove()">';
    } else {
      el.innerHTML = '<i class="fas fa-user"></i>';
    }
  }

  // ===== مودال‌ها =====
  function openModal(id) { $(id).classList.add("open"); }
  function closeModal(id) { $(id).classList.remove("open"); }

  function buildAvatarPicker(containerId, cb) {
    const wrap = $(containerId);
    wrap.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
      const img = document.createElement("img");
      img.src = "images/avatars/" + i + ".png";
      img.alt = "آواتار " + fa(i);
      img.onerror = function () {
        this.src = "https://ui-avatars.com/api/?background=2c3e50&color=fff&name=" + i;
      };
      img.addEventListener("click", function () {
        wrap.querySelectorAll("img").forEach(function (x) { x.classList.remove("active"); });
        this.classList.add("active");
        cb(this.src);
      });
      wrap.appendChild(img);
    }
  }

  // ===== فهرست آنلاین‌ها =====
  function renderUsers(list) {
    if (!isTab("users")) return;
    const box = $("olList");
    if (!list.length) {
      box.innerHTML = '<div class="ol-empty">هنوز کسی آنلاین نیست — تو اولین باش!</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach(function (u) {
      if (u.userId === myUserId) return;
      const div = document.createElement("div");
      div.className = "ol-user-item";
      div.innerHTML =
        '<div class="mini-av">' + (u.avatar ? '<img src="' + esc(u.avatar) + '" onerror="this.remove()">' : '<i class="fas fa-user"></i>') + "</div>" +
        '<div style="flex:1;min-width:0"><div class="ol-u-name">' + esc(u.name) + "</div>" +
        '<div class="ol-u-sub">ریتینگ ' + fa(u.rating) + "</div></div>" +
        (u.playing ? '<span class="ol-badge-playing">در حال بازی</span>' : '<span class="ol-badge-free">آزاد</span>');
      div.addEventListener("click", function () {
        if (u.playing) return toast("این بازیکن در حال بازی است");
        openInvitePanel(u);
      });
      box.appendChild(div);
    });
  }
  function openInvitePanel(u) {
    // مودال دعوت — همه‌ی زمان‌های رسمی FIDE + سفارشی
    const wrap = document.createElement("div");
    wrap.className = "ol-modal open";
    wrap.id = "tempInviteModal";
    wrap.innerHTML =
      '<div class="ol-modal-card" style="max-width:480px">' +
        '<div class="result-icon" style="font-size:2.2rem">⚔️</div>' +
        "<h3>دعوت " + esc(u.name) + "</h3>" +
        '<p>ریتینگ: ' + fa(u.rating) + " — کنترل زمان را انتخاب کن و دعوت را بفرست.</p>" +
        '<div class="inv-tc-box" style="max-height:40vh;overflow-y:auto;text-align:right;margin-bottom:0.8rem" id="invTcChips"></div>' +
        '<div class="ol-custom-tc" id="invCustomTc">' +
          '<div><label>دقیقه (۱ تا ۱۲۰)</label><input type="number" id="invCustomMin" min="1" max="120" value="7" /></div>' +
          '<div><label>افزوده (ثانیه)</label><input type="number" id="invCustomInc" min="0" max="60" value="5" /></div>' +
        "</div>" +
        '<div class="ol-modal-actions">' +
          '<button class="btn btn-primary" id="invSend" style="border-radius:40px;padding:0.55rem 1.5rem"><i class="fas fa-paper-plane"></i> ارسال دعوت</button>' +
          '<button class="btn" id="invCancel" style="border-radius:40px;padding:0.55rem 1.5rem">انصراف</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);
    let chosenTc = buildTcChips(wrap.querySelector("#invTcChips"), null, "300+3", true, "invCustomTc");
    wrap.querySelector("#invCancel").addEventListener("click", function () { wrap.remove(); });
    wrap.querySelector("#invSend").addEventListener("click", function () {
      const code = chosenTc ? chosenTc.code : "300+3";
      // سفارشی از ورودی‌های همین مودال خوانده شود
      if (code === "custom") {
        const m = Math.max(1, Math.min(120, parseInt(($("invCustomMin") || {}).value, 10) || 7));
        const i = Math.max(0, Math.min(60, parseInt(($("invCustomInc") || {}).value, 10) || 0));
        send({ t: "challenge", target: u.userId, tc: { base: m * 60, inc: i } });
      } else {
        send({ t: "challenge", target: u.userId, tc: parseTcCode(code) });
      }
      wrap.remove();
    });
  }
  function onChallengeIncoming(msg) {
    pendingInvite = msg;
    $("inviteText").innerHTML =
      "<b>" + esc(msg.from.name) + "</b> (ریتینگ " + fa(msg.from.rating) + ") دعوتت کرده به یک بازی" +
      " <b dir='ltr'>" + tcLabel(msg.tc.base + "+" + msg.tc.inc) + "</b>. می‌پذیری؟";
    openModal("inviteModal");
  }

  // ===== فهرست بازی‌های زنده =====
  function renderLive(list) {
    if (!isTab("live")) return;
    const box = $("olList");
    if (!list.length) {
      box.innerHTML = '<div class="ol-empty">الان هیچ بازی در جریانی نیست</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach(function (g) {
      const div = document.createElement("div");
      div.className = "ol-live-item";
      div.innerHTML =
        '<div style="flex:1;min-width:0"><div class="ol-u-name" style="direction:ltr;text-align:right">⚪ ' + esc(g.white.name) + " ⚫ " + esc(g.black.name) + "</div>" +
        '<div class="ol-u-sub"><i class="fas fa-stopwatch"></i> ' + tcLabel(g.tc) + " · حرکت " + fa(g.moveCount) + " · 👁 " + fa(g.spectators) + "</div></div>" +
        '<i class="fas fa-chevron-left" style="color:var(--text-light)"></i>';
      div.addEventListener("click", function () {
        send({ t: "spectate", gameId: g.gameId });
      });
      box.appendChild(div);
    });
  }

  // ===== تاریخچه =====
  function renderHistory(list) {
    if (!isTab("hist")) return;
    const box = $("olList");
    if (!list.length) {
      box.innerHTML = '<div class="ol-empty">هنوز بازی آنلاینی ثبت نشده — اولین بازی رو بزن!</div>';
      return;
    }
    box.innerHTML = "";
    list.forEach(function (g) {
      const won = (g.myColor === "w" && g.result === "1-0") || (g.myColor === "b" && g.result === "0-1");
      const draw = g.result === "1/2-1/2" || g.result === "*";
      const colorCls = draw ? "ol-badge-free" : won ? "ol-badge-free" : "ol-badge-playing";
      const label = draw ? "مساوی" : won ? "برد" : "باخت";
      const div = document.createElement("div");
      div.className = "ol-hist-item";
      div.innerHTML =
        '<div style="flex:1;min-width:0"><div class="ol-u-name">' + esc(g.opponent.name) + "</div>" +
        '<div class="ol-u-sub"><span class="' + colorCls + '">' + label + "</span> · " + tcLabel(g.tc) +
        " · " + new Date(g.date).toLocaleDateString("fa-IR") +
        (typeof g.myDelta === "number" && g.myDelta !== 0 ? " · <b dir='ltr'>" + (g.myDelta > 0 ? "+" : "") + fa(g.myDelta) + "</b>" : "") + "</div></div>" +
        '<button class="ol-btn" style="padding:0.35rem 0.7rem;font-size:0.68rem" data-review="' + g.id + '"><i class="fas fa-magnifying-glass-chart"></i> مرور</button>';
      div.querySelector("[data-review]").addEventListener("click", function (e) {
        e.stopPropagation();
        window.GameReview.open({
          moves: g.moves || [],
          white: g.myColor === "w" ? (myProfile ? myProfile.name : "من") : g.opponent.name,
          black: g.myColor === "b" ? (myProfile ? myProfile.name : "من") : g.opponent.name,
          title: "بازی آنلاین ChessHub",
          subtitle: "برابر " + g.opponent.name + " — " + tcLabel(g.tc),
          result: g.result,
        });
      });
      box.appendChild(div);
    });
  }

  function isTab(tab) {
    const active = document.querySelector(".ol-tab.active");
    return active && active.dataset.tab === tab;
  }

  // ===== بازی =====
  function onGameStart(msg) {
    closeModal("inviteModal");
    setSearching(false);
    curGameId = msg.gameId;
    myColor = msg.color;
    oppInfo = msg.opp;
    isSpectating = false;
    game = new Chess();
    if (msg.fen && msg.fen !== "start") game.load(msg.fen);
    lastMove = null;
    clocks = { w: msg.tc.base, b: msg.tc.base };
    lastServerClock = Date.now();
    posStarted = false;

    $("olMenu").style.display = "none";
    $("olGame").classList.add("show");
    $("olExitSpectate").style.display = "none";
    $("olChatForm").style.display = "flex";
    $("olChatLog").innerHTML = "";

    // اطلاعات حریف
    $("oppName").textContent = oppInfo ? oppInfo.name : "حریف";
    $("oppRating").textContent = oppInfo ? "ریتینگ " + fa(oppInfo.rating) : "";
    setAvatarImg($("oppAvatar"), oppInfo ? oppInfo.avatar : null);
    $("meColorLabel").textContent = myColor === "w" ? "مهره‌های سفید" : "مهره‌های سیاه";
    $("oppClock").textContent = fmtClock(msg.tc.base);
    $("meClock").textContent = fmtClock(msg.tc.base);

    // دکمه‌ها — قاعده‌ی لغو:
    //   حرکتی زده نشده → هر دو طرف «لغو» دارند
    //   سفید حرکت اول را زده → سفید دیگر لغو ندارد (تسلیم/مساوی)؛ سیاه هنوز می‌تواند لغو کند
    //   سیاه هم حرکت داد → هیچ‌کس لغو ندارد؛ هر دو تسلیم/مساوی
    updateActionButtons(0);

    // تخته
    if (myBoard) myBoard.destroy();
    myBoard = ChessBoardUI.create({
      boardEl: $("olBoard"),
      getGame: function () { return game; },
      canMove: function () {
        return !isSpectating && authed && game && !game.game_over() && game.turn() === myColor;
      },
      userColor: function () { return myColor; },
      orientation: function () { return myColor === "b" ? "b" : "w"; },
      onAttempt: function (from, to, promo) {
        const mv = game.move({ from: from, to: to, promotion: promo || "q" });
        if (!mv) return false;
        send({ t: "move", gameId: curGameId, from: from, to: to, promotion: promo || "q" });
        lastMove = { from: mv.from, to: mv.to };
        refreshBoard();
        if (window.ChessHub) ChessHub.Sound.play("move");
        return true;
      },
    });
    myBoard.build();

    setStatus(msg.reconnect ? "ادامه‌ی بازی پس از قطعی — نوبت " + (game.turn() === myColor ? "تو" : "حریف") : "شروع بازی! مهره‌های " + (myColor === "w" ? "سفید" : "سیاه") + " با توست", false);
    startLocalTick();
    renderMyProfile();
  }

  // دکمه‌های لغو/تسلیم/مساوی بر اساس تعداد حرکت‌ها و رنگ من
  function updateActionButtons(moveCount) {
    const n = typeof moveCount === "number" ? moveCount : (game ? game.history().length : 0);
    const iAmBlack = myColor === "b";
    let showAbort = false, showResign = false, showDraw = false;
    if (n === 0) {
      showAbort = true;                        // هر دو طرف
    } else if (n === 1) {
      showAbort = iAmBlack;                    // فقط سیاه
      showResign = !iAmBlack; showDraw = !iAmBlack;
    } else {
      showResign = true; showDraw = true;      // هیچ‌کس لغو ندارد
    }
    $("olAbortBtn").style.display = showAbort ? "" : "none";
    $("olResignBtn").style.display = showResign ? "" : "none";
    $("olDrawBtn").style.display = showDraw ? "" : "none";
  }

  function onPosition(msg) {
    if (msg.gameId !== curGameId) return;
    try {
      if (msg.fen && game && game.fen() !== msg.fen) game.load(msg.fen);
    } catch (e) {}
    if (msg.lastMove) lastMove = msg.lastMove;
    clocks = { w: msg.clocks.w, b: msg.clocks.b };
    lastServerClock = Date.now();
    posStarted = (msg.moveCount || 0) > 0;
    refreshBoard();
    updateClockUI();
    updateActionButtons(msg.moveCount || 0);
    // ⏱ شمارش معکوس لغو خودکار (قبل از دو حرکت کامل)
    if (typeof msg.abortIn === "number" && msg.abortIn > 0 && (msg.moveCount || 0) < 2 && !isSpectating) {
      setStatus("⏱ اگر نوبت‌دار تا " + fa(Math.ceil(msg.abortIn)) + " ثانیه حرکت نکند، بازی خودکار لغو می‌شود", true);
    } else if (!isSpectating && !game.game_over()) {
      setStatus("نوبت " + (game.turn() === myColor ? "تو" : "حریف") + (game.in_check() ? " — کیش!" : ""), false);
    }
  }

  function refreshBoard() {
    if (myBoard) myBoard.render({ lastMove: lastMove });
  }

  function updateClockUI() {
    // ساعت محلی فقط هم‌گام با سرور می‌چرخد (بعد از حرکت اول)
    const elapsed = posStarted ? (Date.now() - lastServerClock) / 1000 : 0;
    const turn = game ? game.turn() : "w";
    const wLeft = Math.max(0, clocks.w - (turn === "w" ? elapsed : 0));
    const bLeft = Math.max(0, clocks.b - (turn === "b" ? elapsed : 0));
    const my = myColor === "w" ? wLeft : bLeft;
    const op = myColor === "w" ? bLeft : wLeft;
    $("meClock").textContent = fmtClock(my);
    $("oppClock").textContent = fmtClock(op);
    $("meClock").classList.toggle("active", game && game.turn() === myColor);
    $("oppClock").classList.toggle("active", game && game.turn() !== myColor);
    $("meClock").classList.toggle("low", my < 10 && game && game.turn() === myColor);
    $("oppClock").classList.toggle("low", op < 10 && game && game.turn() !== myColor);
  }
  function startLocalTick() {
    stopLocalTick();
    localTick = setInterval(updateClockUI, 300);
  }
  function stopLocalTick() {
    if (localTick) { clearInterval(localTick); localTick = null; }
  }

  function setStatus(txt, danger) {
    const st = $("olStatus");
    st.textContent = txt;
    st.classList.toggle("danger", !!danger);
  }
  function onOppDisconnect(seconds) {
    let left = seconds;
    setStatus("حریف قطع شد — اگر تا " + fa(seconds) + " ثانیه برنگردد برنده‌ای", true);
    const iv = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(iv); return; }
      const st = $("olStatus");
      if (st.textContent.indexOf("قطع") < 0) { clearInterval(iv); return; }
      setStatus("حریف قطع شد — " + fa(left) + " ثانیه تا برد تو…", true);
    }, 1000);
  }

  function onGameEnd(msg) {
    if (msg.gameId !== curGameId) return;
    stopLocalTick();
    lastGameEnd = msg;
    const won =
      (myColor === "w" && msg.result === "1-0") ||
      (myColor === "b" && msg.result === "0-1");
    const draw = msg.result === "1/2-1/2" || msg.result === "*" || msg.result === null;
    const REASONS = {
      checkmate: "کیش و مات",
      timeout: "اتمام وقت",
      resign: "تسلیم حریف",
      "draw-agreement": "مساوی با توافق",
      stalemate: "پات",
      insufficient: "متریال ناکافی",
      threefold: "تکرار سه‌باره",
      fifty: "قانون ۵۰ حرکت",
      disconnect: "قطع اتصال حریف",
      abort: "لغو بازی",
    };
    let icon, title, sub;
    if (isSpectating) {
      icon = "📺"; title = "بازی تمام شد";
      sub = "نتیجه: " + (msg.result === "1-0" ? "برد سفید" : msg.result === "0-1" ? "برد سیاه" : "مساوی") + " (" + (REASONS[msg.reason] || msg.reason) + ")";
    } else if (draw) {
      icon = "🤝"; title = "مساوی!"; sub = REASONS[msg.reason] || "بازی برابر شد.";
    } else if (won) {
      icon = "🏆"; title = "برد!"; sub = REASONS[msg.reason] || "آفرین!";
      if (window.ChessHub) ChessHub.Sound.play("win");
    } else {
      icon = "😔"; title = "باخت!"; sub = REASONS[msg.reason] || "دفعه‌ی بعد بهتر می‌شود.";
    }
    $("olResultIcon").textContent = icon;
    $("olResultTitle").textContent = title;
    $("olResultSub").textContent = sub;
    const deltaEl = $("olResultDelta");
    if (!isSpectating && typeof msg.ratingChange === "number" && msg.ratingChange !== 0) {
      deltaEl.textContent = (msg.ratingChange > 0 ? "+" : "") + fa(msg.ratingChange) + " ریتینگ";
      deltaEl.className = "ol-result-delta " + (msg.ratingChange > 0 ? "pos" : "neg");
      deltaEl.style.display = "";
    } else {
      deltaEl.style.display = "none";
    }
    $("olReviewBtn").style.display = msg.moves && msg.moves.length ? "" : "none";
    $("olCopyPgnBtn").style.display = msg.pgn ? "" : "none";
    $("olDlPgnBtn").style.display = msg.pgn ? "" : "none";
    $("olResultOverlay").classList.add("open");
  }

  function backToMenu() {
    $("olResultOverlay").classList.remove("open");
    $("olGame").classList.remove("show");
    $("olMenu").style.display = "";
    curGameId = null;
    isSpectating = false;
    send({ t: "listUsers" });
    send({ t: "listLive" });
  }

  // ===== چت =====
  function addChat(from, text) {
    const log = $("olChatLog");
    const div = document.createElement("div");
    div.className = "ol-chat-msg";
    div.innerHTML = "<b>" + esc(from) + ":</b> " + esc(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 60) log.removeChild(log.firstChild);
  }

  // ===== جستجوی سریع =====
  function setSearching(on, tcCode) {
    searching = on;
    const btn = $("quickBtn");
    if (on) {
      btn.classList.add("cancel");
      btn.innerHTML = '<i class="fas fa-xmark"></i> لغو جستجو…';
      setStatusOnMenu("در جستجوی حریف" + (tcCode ? " (" + tcLabel(tcCode) + ")" : "") + "…");
    } else {
      btn.classList.remove("cancel");
      btn.innerHTML = '<i class="fas fa-magnifying-glass"></i> جستجوی حریف';
      setStatusOnMenu(null);
    }
  }
  function setStatusOnMenu(txt) {
    const st = $("olStatus");
    if (!txt) { st.textContent = "آماده"; st.classList.remove("danger"); return; }
    st.textContent = txt;
    st.classList.remove("danger");
  }

  // ===== کنترل‌های زمان رسمی (FIDE + محبوب‌ها) =====
  // دسته‌ها: بولت / برق‌آسا (بلیتز) / سریع (رپید) / کلاسیک — همه‌ی زمان‌های رسمی
  const TC_GROUPS = [
    { label: "بولت", icon: "fa-bolt", list: ["60+0", "60+1", "120+0", "120+1"] },
    { label: "برق‌آسا", icon: "fa-fire", list: ["180+0", "180+2", "300+0", "300+3"] },
    { label: "سریع", icon: "fa-gauge-high", list: ["600+0", "600+5", "900+10", "1500+10", "1800+0", "1800+20"] },
    { label: "کلاسیک", icon: "fa-chess-king", list: ["3600+0", "5400+30", "7200+0"] },
  ];
  function tcFa(code) {
    return code.replace(/\d+/g, function (m) { return fa(m); });
  }
  function buildTcChips(container, onPick, activeCode, withCustom, customBoxId) {
    if (!container) return;
    container.innerHTML = "";
    const chosen = { code: activeCode || "300+3" };
    TC_GROUPS.forEach(function (grp) {
      const row = document.createElement("div");
      row.className = "tc-group";
      row.innerHTML = '<span class="tc-group-label"><i class="fas ' + grp.icon + '"></i> ' + grp.label + "</span>";
      const chips = document.createElement("div");
      chips.className = "tc-chips";
      grp.list.forEach(function (code) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tc-chip" + (code === chosen.code ? " active" : "");
        b.dataset.tc = code;
        b.textContent = tcFa(code);
        chips.appendChild(b);
      });
      row.appendChild(chips);
      container.appendChild(row);
    });
    if (withCustom) {
      const row = document.createElement("div");
      row.className = "tc-group";
      row.innerHTML = '<span class="tc-group-label"><i class="fas fa-sliders"></i> دلخواه</span>';
      const chips = document.createElement("div");
      chips.className = "tc-chips";
      chips.innerHTML = '<button type="button" class="tc-chip' + (chosen.code === "custom" ? " active" : "") + '" data-tc="custom">سفارشی</button>';
      row.appendChild(chips);
      container.appendChild(row);
    }
    container.querySelectorAll(".tc-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        container.querySelectorAll(".tc-chip").forEach(function (x) { x.classList.remove("active"); });
        this.classList.add("active");
        chosen.code = this.dataset.tc;
        if (customBoxId) {
          const box = $(customBoxId);
          if (box) box.classList.toggle("show", chosen.code === "custom");
        }
        if (onPick) onPick(chosen.code);
      });
    });
    chosen.get = function () { return chosen.code; };
    return chosen;
  }

  // ===== رویدادهای UI =====
  async function init() {
    if (typeof Chess === "undefined") return;
    window.ChessEngine.init();

    // ♟️ پیش‌بارگذاری مهره‌های کاربر قبل از هر رندری (رفع مشکل لود نشدن مهره‌ها)
    if (window.ChessUtils && ChessUtils.loadPieces) {
      try { await ChessUtils.loadPieces(); } catch (e) {}
    }
    document.addEventListener("pieceSetChanged", function () {
      if (window.ChessUtils) ChessUtils.loadPieces();
      refreshBoard();
    });
    document.addEventListener("themeChanged", function () { refreshBoard(); });

    // چیپ‌های زمان — همه‌ی زمان‌های رسمی FIDE + سفارشی
    buildTcChips($("tcChips"), null, selectedTc, true, "olCustomTc");

    $("quickBtn").addEventListener("click", function () {
      if (searching) {
        send({ t: "cancelQuick" });
      } else {
        const chip = ($("tcChips") || {}).querySelector ? $("tcChips").querySelector(".tc-chip.active") : null;
        if (chip) selectedTc = chip.dataset.tc;
        send({ t: "quick", tc: parseTcCode(selectedTc) });
      }
    });

    // تب‌ها
    document.querySelectorAll(".ol-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".ol-tab").forEach(function (x) { x.classList.remove("active"); });
        this.classList.add("active");
        const tab = this.dataset.tab;
        if (tab === "users") send({ t: "listUsers" });
        else if (tab === "live") send({ t: "listLive" });
        else send({ t: "myGames" });
        $("olList").innerHTML = '<div class="ol-empty"><i class="fas fa-spinner fa-pulse"></i></div>';
      });
    });

    // 👤 پروفایل سراسری عوض شد (ثبت اولیه در همین صفحه) → بفرست به سرور
    document.addEventListener("chesshub:profile-changed", function (e) {
      if (authed && e.detail && e.detail.name) {
        send({
          t: "updateProfile",
          name: e.detail.name,
          avatar: e.detail.avatar || (myProfile ? myProfile.avatar : ""),
        });
      }
    });

    // ساخت پروفایل (قدیمی — فقط فالبک؛ نام از پروفایل سراسری می‌آید)
    let pickedAvatar = "";
    buildAvatarPicker("avatarPick", function (src) { pickedAvatar = src; $("customAvatarUrl").value = ""; });
    $("customAvatarUrl").addEventListener("input", function () {
      if (this.value) {
        pickedAvatar = this.value;
        document.querySelectorAll("#avatarPick img").forEach(function (x) { x.classList.remove("active"); });
      }
    });
    $("saveProfileBtn").addEventListener("click", function () {
      const name = $("newName").value.trim();
      if (name.length < 2) return toast("نام باید حداقل ۲ حرف باشد");
      const url = $("customAvatarUrl").value.trim() || pickedAvatar;
      const saved = savedProfile() || {};
      saved.name = name;
      saved.avatar = url;
      if (!saved.userId) saved.userId = "u" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      storeProfile(saved);
      closeModal("profileModal");
      if (authed) {
        send({ t: "updateProfile", name: name, avatar: url });
      } else {
        connect();
      }
    });

    // 👤 ویرایش نام/آواتار حذف شد — پروفایل فقط یک بار در شروع انتخاب می‌شود
    //    و در کل سایت (بازی آنلاین + دروس + گشایش‌ها + مقالات) یکسان است
    if ($("editProfileBtn")) $("editProfileBtn").style.display = "none";
    $("editProfileBtn").addEventListener("click", function () {
      if (!myProfile) return;
      $("editName").value = myProfile.name;
      $("editNameHint").textContent = myProfile.nameChangeAvailable
        ? "می‌توانی نامت را الان عوض کنی (تغییر بعدی: ۱۵ روز دیگر)"
        : "تغییر نام فقط هر ۱۵ روز ممکن است. آواتار هر وقت بخواهی.";
      openModal("editModal");
    });
    $("closeEditBtn").addEventListener("click", function () { closeModal("editModal"); });

    // دعوت
    $("acceptInviteBtn").addEventListener("click", function () {
      if (pendingInvite) send({ t: "challengeResp", id: pendingInvite.id, accept: true });
      pendingInvite = null;
      closeModal("inviteModal");
    });
    $("declineInviteBtn").addEventListener("click", function () {
      if (pendingInvite) send({ t: "challengeResp", id: pendingInvite.id, accept: false });
      pendingInvite = null;
      closeModal("inviteModal");
    });

    // مساوی
    $("acceptDrawBtn").addEventListener("click", function () {
      send({ t: "drawResp", gameId: curGameId, accept: true });
      closeModal("drawModal");
    });
    $("declineDrawBtn").addEventListener("click", function () {
      send({ t: "drawResp", gameId: curGameId, accept: false });
      closeModal("drawModal");
    });

    // کنترل‌های بازی
    $("olAbortBtn").addEventListener("click", function () {
      send({ t: "abort", gameId: curGameId });
    });
    $("olResignBtn").addEventListener("click", function () {
      if (confirm("مطمئنی می‌خواهی تسلیم شوی؟")) send({ t: "resign", gameId: curGameId });
    });
    $("olDrawBtn").addEventListener("click", function () {
      send({ t: "drawOffer", gameId: curGameId });
      toast("پیشنهاد مساوی ارسال شد");
    });
    $("olExitSpectate").addEventListener("click", function () {
      send({ t: "unSpectate" });
      backToMenu();
    });

    // چت
    function sendChat() {
      const inp = $("olChatInput");
      const text = inp.value.trim();
      if (!text || !curGameId || isSpectating) return;
      send({ t: "chat", gameId: curGameId, text: text });
      inp.value = "";
    }
    $("olChatSend").addEventListener("click", sendChat);
    $("olChatInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendChat(); }
    });

    // نتیجه
    $("olNewGameBtn").addEventListener("click", function () {
      backToMenu();
      const tc = lastTcUsed || selectedTc;
      send({ t: "quick", tc: parseTcCode(tc) });
    });
    $("olReviewBtn").addEventListener("click", function () {
      if (!lastGameEnd) return;
      const g = lastGameEnd;
      const myName = myProfile ? myProfile.name : "من";
      const oppName = g.opponentName || "حریف";
      window.GameReview.open({
        moves: g.moves || [],
        white: myColor === "w" ? myName : oppName,
        black: myColor === "b" ? myName : oppName,
        title: "بازی آنلاین ChessHub",
        subtitle: "برابر " + oppName,
        result: g.result,
      });
    });
    $("olCopyPgnBtn").addEventListener("click", function () {
      if (!lastGameEnd || !lastGameEnd.pgn) return;
      navigator.clipboard.writeText(lastGameEnd.pgn)
        .then(function () { toast("PGN کپی شد"); })
        .catch(function () { toast("کپی نشد"); });
    });
    $("olDlPgnBtn").addEventListener("click", function () {
      if (!lastGameEnd || !lastGameEnd.pgn) return;
      const blob = new Blob([lastGameEnd.pgn], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chesshub-online.pgn";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("olBackMenuBtn").addEventListener("click", backToMenu);

    // اتصال
    connect();
  }

  let lastTcUsed = null;
  const origOnGameStart = onGameStart;
  onGameStart = function (msg) {
    lastTcUsed = msg.tc.base + "+" + msg.tc.inc;
    origOnGameStart(msg);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
