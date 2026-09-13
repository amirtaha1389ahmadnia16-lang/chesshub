/* ============================================================
   ♛ ChessHub — ماژول بازی آنلاین (سرور WebSocket خالص)
   ------------------------------------------------------------
   بدون هیچ وابستگی npm — RFC 6455 با crypto خود Node.
   اتصال: در server.js فقط  require("./online-server").attach(server)

   قواعد کامل:
     • قبل از اولین حرکت: لغو آزاد هر دو طرف + لغو خودکار پس از ۱۵ثانیه
     • بعد از اولین حرکت: تسلیم / پیشنهاد مساوی (با پذیرش)
     • قطعی: ۱۵ثانیه مهلت reconnect → باخت قطع‌شده (قبل از حرکت اول = لغو)
     • ساعت سمت سرور معتبر؛ ریتینگ Elo با K=32
     • همه‌ی بازی‌های تمام‌شده در data/online_games.json (فایل مدیر)
     • هر کاربر فقط بازی‌های خودش را می‌بیند (myGames فیلترشده)
   ============================================================ */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------- chess.js سمت سرور ----------
let ChessCtor = null;
try {
  const mod = require("./lib/chess.min.js");
  ChessCtor = mod.Chess || mod;
} catch (e) {
  try {
    const mod2 = require("./lib/chess.js");
    ChessCtor = mod2.Chess || mod2;
  } catch (e2) {
    console.error("[Online] lib/chess.min.js یافت نشد — اعتبارسنجی حرکات غیرفعال");
  }
}

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const GAMES_FILE = path.join(DATA_DIR, "online_games.json");
const ELO_K = 32;
const START_RATING = 1200;
const NAME_COOLDOWN_MS = 15 * 24 * 3600 * 1000; // ۱۵ روز
const ABORT_TIMEOUT_MS = 15000;
const DISCONNECT_TIMEOUT_MS = 15000;

// ---------- داده‌ها ----------
let users = {};       // userId → {name, avatar, rating, wins, losses, draws, nameChangedAt, createdAt, lastSeen}
let games = [];       // آرشیو همه‌ی بازی‌های تمام‌شده (فایل مدیر)
let dirtyUsers = false;
let dirtyGames = false;

function loadFiles() {
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || {}; } catch (e) { users = {}; }
  try { games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8")) || []; } catch (e) { games = []; }
}
function saveFiles(force) {
  if (dirtyUsers || force) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(USERS_FILE + ".tmp", JSON.stringify(users));
      fs.renameSync(USERS_FILE + ".tmp", USERS_FILE);
      dirtyUsers = false;
    } catch (e) { console.error("[Online] ذخیره users:", e.message); }
  }
  if (dirtyGames || force) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(GAMES_FILE + ".tmp", JSON.stringify(games));
      fs.renameSync(GAMES_FILE + ".tmp", GAMES_FILE);
      dirtyGames = false;
    } catch (e) { console.error("[Online] ذخیره games:", e.message); }
  }
}

// ---------- WebSocket (RFC 6455) ----------
const clients = new Set(); // {ws, userId, profile, alive, isAlive}
const gamesMap = new Map(); // gameId → Game
const quickQueue = new Map(); // tcKey → [userId]
const challenges = new Map(); // challengeId → {from, to, tc, createdAt}
const userSockets = new Map(); // userId → client

function wsSend(client, obj) {
  if (!client || !client.ws) return;
  // ⚠️ net.Socket.readyState رشته است: "open" | "opening" | "closed" …
  const rs = client.ws.readyState;
  if (rs !== "open" && rs !== "writeOnly") return;
  try {
    client.ws.write(encodeFrame(JSON.stringify(obj)));
  } catch (e) {}
}
function wsSendTo(userId, obj) {
  const c = userSockets.get(userId);
  if (c) wsSend(c, obj);
}

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

function encodeFrame(str, opcode) {
  const op = opcode || 0x81;
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([op, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = op; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = op; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// پارسر فریم — پیام‌های کامل را برمی‌گرداند (بافر تکه‌تکه مدیریت می‌شود)
function createFrameParser(client, onMessage) {
  let buffer = Buffer.alloc(0);
  return function (chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (len > 128 * 1024) { // 128KB سقف
        try { client.ws.destroy(); } catch (e) {}
        return;
      }
      let maskKey = null;
      if (masked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + len) return;
      let payload = buffer.slice(offset, offset + len);
      if (maskKey) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      }
      buffer = buffer.slice(offset + len);

      if (opcode === 0x8) { // close
        try { client.ws.end(encodeFrame("", 0x88)); } catch (e) {}
        try { client.ws.destroy(); } catch (e) {}
        return;
      }
      if (opcode === 0x9) { // ping → pong
        try { client.ws.write(encodeFrame(payload.toString("utf8"), 0x8a)); } catch (e) {}
        continue;
      }
      if (opcode === 0xa) continue; // pong
      if (opcode === 0x1 || opcode === 0x0 || opcode === 0x2) {
        if (!fin) continue; // فریم‌های چندتکه نادر — ساده رد می‌شویم (پیام‌های ما کوچک‌اند)
        onMessage(payload.toString("utf8"));
      }
    }
  };
}

// ---------- بازی ----------
let gameSeq = 1;
function newGameId() {
  return "g" + Date.now().toString(36) + (gameSeq++).toString(36);
}

function tcKey(tc) { return tc.base + "+" + tc.inc; }

function createGame(whiteId, blackId, tc) {
  const w = users[whiteId], b = users[blackId];
  const g = {
    id: newGameId(),
    white: whiteId,
    black: blackId,
    tc: { base: tc.base, inc: tc.inc },
    fen: ChessCtor ? new ChessCtor().fen() : "start",
    chess: ChessCtor ? new ChessCtor() : null,
    moves: [],
    lastMove: null,
    clocks: { w: tc.base, b: tc.base },
    lastTick: Date.now(),
    started: false,       // اولین حرکت زده شده؟
    startedAt: null,
    over: false,
    result: null,
    reason: null,
    drawOffer: null,      // userId کسی که پیشنهاد داده
    disconnectTimer: null,
    disconnectSide: null,
    abortTimer: null,
    abortDeadline: 0,     // ⏱ مهلت ۱۵ثانیه‌ای نوبت‌دار قبل از دو حرکت کامل
    spectators: new Set(),
    chat: [],
  };
  gamesMap.set(g.id, g);
  armAbortTimer(g);
  return g;
}

// ⏱ لغو خودکار دومرحله‌ای:
//   • تا وقتی کمتر از ۲ حرکت کامل است، «نوبت‌دار» ۱۵ ثانیه فرصت دارد
//   • سفید زد (۱ حرکت) → سیاه ۱۵ ثانیه فرصت دارد؛ نزد → لغو
//   • سیاه هم زد (۲ حرکت) → تایمر برای همیشه خاموش
//   • اگر نوبت‌دار آنلاین نیست (قطع شده) تایمر لغو مسلح نمی‌شود — تایمر قطعی می‌جوزد
function armAbortTimer(g) {
  clearTimeout(g.abortTimer);
  g.abortTimer = null;
  g.abortDeadline = 0;
  if (g.over || g.moves.length >= 2 || !g.chess) return;
  const turn = g.chess.turn();
  const turnId = turn === "w" ? g.white : g.black;
  if (!userSockets.get(turnId)) return; // قطع شده → تایمر قطعی
  g.abortDeadline = Date.now() + ABORT_TIMEOUT_MS;
  g.abortTimer = setTimeout(function () {
    if (!g.over && g.moves.length < 2) {
      finishGame(g, null, "abort", false);
    }
  }, ABORT_TIMEOUT_MS);
}

function gameClients(g) {
  const list = [];
  const wc = userSockets.get(g.white);
  const bc = userSockets.get(g.black);
  if (wc) list.push(wc);
  if (bc) list.push(bc);
  g.spectators.forEach(function (uid) {
    const sc = userSockets.get(uid);
    if (sc) list.push(sc);
  });
  return list;
}

function broadcastGame(g, msg) {
  gameClients(g).forEach(function (c) { wsSend(c, msg); });
}

function colorOf(g, userId) {
  return g.white === userId ? "w" : g.black === userId ? "b" : null;
}
function opponentOf(g, userId) {
  return g.white === userId ? g.black : g.black === userId ? g.white : null;
}
function oppProfile(g, userId) {
  const oid = opponentOf(g, userId);
  const o = oid ? users[oid] : null;
  if (!o || !oid) return null;
  return { userId: oid, name: o.name, avatar: o.avatar, rating: o.rating };
}

function publicPosition(g) {
  const p = {
    t: "position",
    gameId: g.id,
    fen: g.fen,
    lastMove: g.lastMove,
    clocks: { w: Math.max(0, Math.ceil(g.clocks.w)), b: Math.max(0, Math.ceil(g.clocks.b)) },
    turn: g.chess ? g.chess.turn() : "w",
    moveCount: g.moves.length,
    started: g.started,
  };
  // ⏱ شمارش معکوس لغو خودکار — فقط وقتی مسلح است
  if (g.abortDeadline) p.abortIn = Math.max(0, (g.abortDeadline - Date.now()) / 1000);
  return p;
}

// ساعت: کم‌کردن از نوبت‌دار — هر ۱۰۰ms
function tickGames() {
  const now = Date.now();
  gamesMap.forEach(function (g) {
    if (g.over || !g.started) return;
    const turn = g.chess ? g.chess.turn() : "w";
    const dt = (now - g.lastTick) / 1000;
    g.lastTick = now;
    g.clocks[turn] = Math.max(0, g.clocks[turn] - dt);
    if (g.clocks[turn] <= 0) {
      // باخت با اتمام وقت (متریال ناکافی = مساوی)
      const loser = turn === "w" ? g.white : g.black;
      const insuff = g.chess && g.chess.insufficient_material();
      if (insuff) finishGame(g, "1/2-1/2", "insufficient", true);
      else finishGame(g, turn === "w" ? "0-1" : "1-0", "timeout", true, loser);
      return;
    }
  });
}

let clockSecond = 0;
setInterval(function () {
  tickGames();
  // ارسال ساعت ۱ بار در ثانیه
  clockSecond++;
  if (clockSecond % 10 === 0) {
    gamesMap.forEach(function (g) {
      // ⏱ برای بازی‌های هنوز شروع‌نشده هم فرستاده می‌شود تا شمارش معکوسِ
      // لغو ۱۵ثانیه‌ای (abortIn) روی صفحه‌ی هر دو بازیکن دیده شود
      if (!g.over) broadcastGame(g, publicPosition(g));
    });
  }
  // users/live هر ۲ ثانیه اگر تغییر
  if (clockSecond % 20 === 0) {
    broadcastUsers();
    broadcastLive();
    saveFiles(false);
  }
}, 100);

// ---------- پایان بازی ----------
function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}
function eloDelta(ra, rb, score) {
  return Math.round(ELO_K * (score - expectedScore(ra, rb)));
}

function buildPgn(g) {
  if (!ChessCtor) return "";
  const cg = new ChessCtor();
  (g.moves || []).forEach(function (u) {
    try { cg.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch (e) {}
  });
  const w = users[g.white] || { name: "؟" };
  const b = users[g.black] || { name: "؟" };
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const headers =
    '[Event "ChessHub آنلاین"]\n[Site "ChessHub"]\n[Date "' + date + '"]\n' +
    '[White "' + w.name + '"]\n[Black "' + b.name + '"]\n[Result "' + g.result + '"]\n' +
    '[TimeControl "' + g.tc.base + "+" + g.tc.inc + '"]\n\n';
  return headers + (cg.pgn ? (cg.pgn({ maxWidth: 80, newline: "\n" }) || "") : "") + " " + g.result;
}

function finishGame(g, result, reason, rated, loserId) {
  if (g.over) return;
  g.over = true;
  g.result = result || "*";
  g.reason = reason;
  clearTimeout(g.abortTimer);
  g.abortTimer = null;
  g.abortDeadline = 0;
  clearTimeout(g.disconnectTimer);
  g.disconnectTimer = null;

  const w = users[g.white];
  const b = users[g.black];
  let dw = 0, db = 0;
  if (rated && result !== "*") {
    const sw = result === "1-0" ? 1 : result === "0-1" ? 0 : 0.5;
    dw = eloDelta(w.rating, b.rating, sw);
    db = eloDelta(b.rating, w.rating, 1 - sw);
    w.rating = Math.max(100, w.rating + dw);
    b.rating = Math.max(100, b.rating + db);
    if (sw === 1) { w.wins++; b.losses++; }
    else if (sw === 0) { w.losses++; b.wins++; }
    else { w.draws++; b.draws++; }
    dirtyUsers = true;
  }
  g.ratingDelta = { [g.white]: dw, [g.black]: db };

  // PGN + آرشیو (فایل مدیر — همه‌ی بازی‌ها)
  // ⚠️ بازی‌های «لغوشده» (قبل از دو حرکت) آرشیو نمی‌شوند تا فایل مدیر تمیز بماند
  if (reason !== "abort") {
    g.pgn = buildPgn(g);
    games.push({
      id: g.id,
      date: new Date().toISOString(),
      tc: g.tc.base + "+" + g.tc.inc,
      white: { id: g.white, name: w ? w.name : "؟", rating: w ? w.rating - dw : 0, delta: dw },
      black: { id: g.black, name: b ? b.name : "؟", rating: b ? b.rating - db : 0, delta: db },
      result: g.result,
      reason: reason,
      moves: g.moves,
      pgn: g.pgn,
    });
    if (games.length > 5000) games = games.slice(-4000); // نگه‌داری حافظه
    dirtyGames = true;
    saveFiles(false);
  }

  // پیام به بازیکن‌ها و تماشاگرها
  [g.white, g.black].forEach(function (uid) {
    const selfDelta = (g.ratingDelta || {})[uid] || 0;
    const opponent = oppProfile(g, uid);
    wsSendTo(uid, {
      t: "gameEnd",
      gameId: g.id,
      result: g.result,
      reason: reason,
      pgn: g.pgn,
      moves: g.moves,
      ratingChange: selfDelta,
      opponentName: opponent ? opponent.name : "حریف",
    });
  });
  g.spectators.forEach(function (uid) {
    wsSendTo(uid, { t: "gameEnd", gameId: g.id, result: g.result, reason: reason });
  });

  setTimeout(function () {
    gamesMap.delete(g.id);
    broadcastLive();
  }, 10000);
  broadcastUsers();
}

// ---------- پروفایل ----------
function ensureUser(userId, name, avatar) {
  if (!users[userId]) {
    users[userId] = {
      name: (name || "بازیکن").slice(0, 16),
      avatar: avatar || "",
      rating: START_RATING,
      wins: 0, losses: 0, draws: 0,
      // ⚠️ ۰ یعنی کاربر تازه‌وارد بلافاصله می‌تواند «نام اصلی» را انتخاب کند؛
      // پس از اولین تغییر نام، مهلت ۱۵ روزه فعال می‌شود
      nameChangedAt: 0,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };
    dirtyUsers = true;
  }
  return users[userId];
}
function publicProfile(userId) {
  const u = users[userId];
  if (!u) return null;
  return {
    userId: userId,
    name: u.name,
    avatar: u.avatar,
    rating: u.rating,
    wins: u.wins, losses: u.losses, draws: u.draws,
    playing: isPlaying(userId),
    nameChangeAvailable: Date.now() - u.nameChangedAt >= NAME_COOLDOWN_MS,
    nextNameChange: u.nameChangedAt + NAME_COOLDOWN_MS,
  };
}
function isPlaying(userId) {
  let found = false;
  gamesMap.forEach(function (g) {
    if (!g.over && (g.white === userId || g.black === userId)) found = true;
  });
  return found;
}

// ---------- broadcast لیست‌ها ----------
function broadcastUsers() {
  const list = [];
  userSockets.forEach(function (c, uid) {
    const p = publicProfile(uid);
    if (p) list.push(p);
  });
  const msg = { t: "users", list: list };
  userSockets.forEach(function (c) { wsSend(c, msg); });
}
function broadcastLive() {
  const list = [];
  gamesMap.forEach(function (g) {
    if (g.over) return;
    const w = users[g.white], b = users[g.black];
    list.push({
      gameId: g.id,
      white: { name: w ? w.name : "؟", rating: w ? w.rating : 0 },
      black: { name: b ? b.name : "؟", rating: b ? b.rating : 0 },
      tc: g.tc.base + "+" + g.tc.inc,
      moveCount: g.moves.length,
      spectators: g.spectators.size,
    });
  });
  const msg = { t: "live", list: list };
  userSockets.forEach(function (c) { wsSend(c, msg); });
}

// ---------- مدیریت پیام ----------
function handleAuth(client, msg) {
  const userId = (msg.userId || "u" + crypto.randomBytes(6).toString("hex")).slice(0, 40);
  client.userId = userId;
  client.profile = ensureUser(userId, msg.name, msg.avatar);
  client.profile.lastSeen = Date.now();
  dirtyUsers = true;
  userSockets.set(userId, client);
  const p = publicProfile(userId);
  wsSend(client, { t: "authed", profile: p });
  broadcastUsers();
  broadcastLive();

  // بازی در جریان؟ → ادامه بعد از رفرش
  gamesMap.forEach(function (g) {
    if (g.over) return;
    const color = colorOf(g, userId);
    if (!color) return;
    // پاک‌سازی تایمر قطعی
    if (g.disconnectTimer && g.disconnectSide === userId) {
      clearTimeout(g.disconnectTimer);
      g.disconnectTimer = null;
      g.disconnectSide = null;
      broadcastGame(g, { t: "opponentReconnected", gameId: g.id });
    }
    wsSend(client, {
      t: "gameStart",
      gameId: g.id,
      color: color,
      fen: g.fen,
      tc: g.tc,
      opp: oppProfile(g, userId),
      reconnect: g.moves.length > 0,
      reconnectSecondsLeft: g.disconnectTimer ? DISCONNECT_TIMEOUT_MS / 1000 : 0,
    });
    wsSend(client, publicPosition(g));
    g.chat.forEach(function (ch) { wsSend(client, { t: "chat", gameId: g.id, from: ch.from, text: ch.text }); });
  });
}

function handleQuick(client, msg) {
  const tc = validTC(msg.tc);
  if (!tc) return wsSend(client, { t: "error", msg: "کنترل زمان نامعتبر است" });
  const key = tcKey(tc);
  if (!quickQueue.has(key)) quickQueue.set(key, []);
  const q = quickQueue.get(key);
  if (process.env.QDBG) console.log("[QDBG] quick from", client.userId, "queue:", q.slice(), "own sockets:", userSockets.size);
  // حریف در صف؟
  const idx = q.findIndex(function (uid) { return uid !== client.userId; });
  if (idx >= 0) {
    const otherId = q.splice(idx, 1)[0];
    const other = userSockets.get(otherId);
    if (!other) {
      if (process.env.QDBG) console.log("[QDBG] matched with dead socket", otherId, "— requeue self");
      if (!q.includes(client.userId)) q.push(client.userId);
      return wsSend(client, { t: "searching", tc: tc.base + "+" + tc.inc });
    }
    // شروع بازی: سفید تصادفی
    const whiteFirst = Math.random() < 0.5;
    const g = createGame(whiteFirst ? otherId : client.userId, whiteFirst ? client.userId : otherId, tc);
    if (process.env.QDBG) console.log("[QDBG] matched", otherId, "vs", client.userId, "→", g.id);
    startForBoth(g);
  } else {
    // اگر خودش قبلاً در صف همین tc است، کاری نکن
    if (!q.includes(client.userId)) q.push(client.userId);
    wsSend(client, { t: "searching", tc: tc.base + "+" + tc.inc });
  }
}
function handleCancelQuick(client) {
  quickQueue.forEach(function (q, key) {
    const i = q.indexOf(client.userId);
    if (i >= 0) q.splice(i, 1);
  });
  wsSend(client, { t: "searchCancelled" });
}

function startForBoth(g) {
  [g.white, g.black].forEach(function (uid) {
    wsSendTo(uid, {
      t: "gameStart",
      gameId: g.id,
      color: colorOf(g, uid),
      fen: g.fen,
      tc: g.tc,
      opp: oppProfile(g, uid),
    });
  });
  broadcastLive();
  broadcastUsers();
}

function handleChallenge(client, msg) {
  const target = userSockets.get(msg.target);
  const tc = validTC(msg.tc);
  if (!tc) return wsSend(client, { t: "error", msg: "کنترل زمان نامعتبر است" });
  if (!target) return wsSend(client, { t: "challengeFailed", reason: "offline" });
  if (isPlaying(msg.target)) return wsSend(client, { t: "challengeFailed", reason: "playing" });
  const id = "c" + crypto.randomBytes(4).toString("hex");
  challenges.set(id, { from: client.userId, to: msg.target, tc: tc, createdAt: Date.now() });
  const fromP = publicProfile(client.userId);
  wsSend(target, { t: "challengeIncoming", id: id, from: { userId: fromP.userId, name: fromP.name, avatar: fromP.avatar, rating: fromP.rating }, tc: tc });
  wsSend(client, { t: "challengeSent" });
}
function handleChallengeResp(client, msg) {
  const ch = challenges.get(msg.id);
  if (!ch || ch.to !== client.userId) return;
  challenges.delete(msg.id);
  const fromC = userSockets.get(ch.from);
  if (!msg.accept) {
    if (fromC) wsSend(fromC, { t: "challengeDeclined" });
    return;
  }
  if (!fromC || isPlaying(ch.from) || isPlaying(ch.to)) {
    if (fromC) wsSend(fromC, { t: "error", msg: "دعوت دیگر معتبر نیست" });
    return;
  }
  const whiteFirst = Math.random() < 0.5;
  const g = createGame(whiteFirst ? ch.from : ch.to, whiteFirst ? ch.to : ch.from, ch.tc);
  startForBoth(g);
}

function handleMove(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g || g.over) return;
  const color = colorOf(g, client.userId);
  if (!color) return; // تماشاگر
  if (!g.chess) return;
  if (g.chess.turn() !== color) return;
  // شروع رسمی بازی با اولین حرکت
  if (g.moves.length === 0) {
    g.started = true;
    g.startedAt = Date.now();
  }
  if (g.disconnectTimer) { clearTimeout(g.disconnectTimer); g.disconnectTimer = null; g.disconnectSide = null; }

  const mv = g.chess.move({ from: msg.from, to: msg.to, promotion: msg.promotion || "q" });
  if (!mv) {
    return wsSend(client, { t: "error", msg: "حرکت غیرقانونی", gameId: g.id, fen: g.fen });
  }
  g.moves.push(msg.from + msg.to + (msg.promotion || ""));
  g.fen = g.chess.fen();
  g.lastMove = { from: mv.from, to: mv.to };
  g.drawOffer = null;
  // ⏱ ساعت لغو: بعد از هر حرکت، تا وقتی کمتر از ۲ حرکت است تایمر برای نوبت‌دار بعدی مسلح می‌شود
  armAbortTimer(g);
  // افزوده
  const turn = g.chess.turn(); // نوبت بعدی
  const other = turn === "w" ? "b" : "w";
  g.clocks[other] += g.tc.inc;
  g.lastTick = Date.now();
  broadcastGame(g, publicPosition(g));

  // تشخیص پایان
  const cg = g.chess;
  if (cg.in_checkmate()) {
    return finishGame(g, color === "w" ? "1-0" : "0-1", "checkmate", true);
  }
  if (cg.in_stalemate()) return finishGame(g, "1/2-1/2", "stalemate", true);
  if (cg.insufficient_material()) return finishGame(g, "1/2-1/2", "insufficient", true);
  if (cg.in_threefold_repetition()) return finishGame(g, "1/2-1/2", "threefold", true);
  if (cg.in_draw()) return finishGame(g, "1/2-1/2", "fifty", true);
}

function handleResign(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g || g.over) return;
  const color = colorOf(g, client.userId);
  if (!color || g.moves.length === 0) return; // قبل از حرکت اول = لغو نه تسلیم
  finishGame(g, color === "w" ? "0-1" : "1-0", "resign", true, client.userId);
}

// 🚫 لغو بازی — قاعده‌ی کامل:
//   • حرکتی زده نشده (۰ حرکت): هر دو طرف می‌توانند لغو کنند
//   • سفید حرکت اول را زده (۱ حرکت): فقط سیاه می‌تواند لغو کند
//   • سیاه هم زده (۲+ حرکت): هیچ‌کس — به‌جایش تسلیم/مساوی
function handleAbort(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g || g.over) return;
  const color = colorOf(g, client.userId);
  if (!color) return;
  if (g.moves.length === 0) return finishGame(g, null, "abort", false);
  if (g.moves.length === 1 && color === "b") return finishGame(g, null, "abort", false);
}

function handleDrawOffer(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g || g.over || g.moves.length === 0) return;
  if (colorOf(g, client.userId)) {
    g.drawOffer = client.userId;
    const opp = opponentOf(g, client.userId);
    wsSendTo(opp, { t: "drawOffered", gameId: g.id });
  }
}
function handleDrawResp(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g || g.over) return;
  if (colorOf(g, client.userId)) {
    if (msg.accept && g.drawOffer && g.drawOffer !== client.userId) {
      finishGame(g, "1/2-1/2", "draw-agreement", true);
    } else {
      g.drawOffer = null;
      const opp = opponentOf(g, client.userId);
      wsSendTo(opp, { t: "drawDeclined", gameId: g.id });
    }
  }
}

function handleChat(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g) return;
  const color = colorOf(g, client.userId);
  if (!color) {
    // 📺 تماشاگر اجازه‌ی چت ندارد
    return wsSend(client, { t: "error", msg: "تماشاگر نمی‌تواند چت کند" });
  }
  const me = users[client.userId];
  const text = String(msg.text || "").slice(0, 300).trim();
  if (!text) return;
  g.chat.push({ from: me.name, text: text });
  if (g.chat.length > 50) g.chat.shift();
  broadcastGame(g, { t: "chat", gameId: g.id, from: me.name, text: text });
}

function handleSpectate(client, msg) {
  const g = gamesMap.get(msg.gameId);
  if (!g) return wsSend(client, { t: "error", msg: "بازی یافت نشد" });
  g.spectators.add(client.userId);
  wsSend(client, { t: "spectateStart", gameId: g.id, tc: g.tc, white: { name: users[g.white] ? users[g.white].name : "؟" }, black: { name: users[g.black] ? users[g.black].name : "؟" } });
  wsSend(client, publicPosition(g));
  g.chat.forEach(function (ch) { wsSend(client, { t: "chat", gameId: g.id, from: ch.from, text: ch.text }); });
  wsSend(client, { t: "spectators", gameId: g.id, n: g.spectators.size });
  broadcastGame(g, { t: "spectators", gameId: g.id, n: g.spectators.size });
  broadcastLive();
}
function handleUnSpectate(client) {
  gamesMap.forEach(function (g) {
    if (g.spectators.delete(client.userId)) {
      broadcastGame(g, { t: "spectators", gameId: g.id, n: g.spectators.size });
    }
  });
  wsSend(client, { t: "spectateEnd" });
}

function handleUpdateProfile(client, msg) {
  const u = users[client.userId];
  if (!u) return;
  let changed = false;
  if (msg.name && typeof msg.name === "string") {
    const name = msg.name.trim().slice(0, 16);
    if (name.length >= 2 && name !== u.name) {
      if (Date.now() - u.nameChangedAt < NAME_COOLDOWN_MS) {
        return wsSend(client, {
          t: "error",
          code: "nameCooldown",
          msg: "نام کاربری فقط هر ۱۵ روز یک‌بار قابل تغییر است",
          nextChange: u.nameChangedAt + NAME_COOLDOWN_MS,
        });
      }
      u.name = name;
      u.nameChangedAt = Date.now();
      changed = true;
    }
  }
  if (typeof msg.avatar === "string" && msg.avatar.length < 300) {
    u.avatar = msg.avatar;
    changed = true;
  }
  if (changed) dirtyUsers = true;
  wsSend(client, { t: "authed", profile: publicProfile(client.userId) });
  broadcastUsers();
}

function handleMyGames(client) {
  const mine = games
    .filter(function (g) { return g.white.id === client.userId || g.black.id === client.userId; })
    .slice(-50)
    .reverse()
    .map(function (g) {
      const iAmWhite = g.white.id === client.userId;
      return {
        id: g.id,
        date: g.date,
        tc: g.tc,
        result: g.result,
        reason: g.reason,
        opponent: iAmWhite ? g.black : g.white,
        myColor: iAmWhite ? "w" : "b",
        moves: g.moves,
        pgn: g.pgn,
        myDelta: iAmWhite ? g.white.delta : g.black.delta,
      };
    });
  wsSend(client, { t: "games", list: mine });
}

function validTC(tc) {
  if (!tc) return null;
  let base = parseInt(tc.base, 10);
  let inc = parseInt(tc.inc, 10);
  if (!isFinite(base) || !isFinite(inc)) return null;
  base = Math.max(30, Math.min(7200, base));
  inc = Math.max(0, Math.min(60, inc));
  return { base: base, inc: inc };
}

// ---------- قطع اتصال ----------
function handleDisconnect(client) {
  if (client.userId) {
    // از صف‌ها پاک کن
    quickQueue.forEach(function (q) {
      const i = q.indexOf(client.userId);
      if (i >= 0) q.splice(i, 1);
    });
    challenges.forEach(function (ch, id) {
      if (ch.from === client.userId) challenges.delete(id);
    });
    if (userSockets.get(client.userId) === client) userSockets.delete(client.userId);

    // اگر در بازی فعال است → مهلت ۱۵ثانیه
    gamesMap.forEach(function (g) {
      if (g.over) return;
      const color = colorOf(g, client.userId);
      if (!color) {
        if (g.spectators.delete(client.userId)) {
          broadcastGame(g, { t: "spectators", gameId: g.id, n: g.spectators.size });
        }
        return;
      }
      if (g.moves.length === 0) {
        // هنوز حرکتی نزده → لغو بازی
        clearTimeout(g.abortTimer);
        g.abortTimer = null;
        g.abortDeadline = 0;
        finishGame(g, null, "abort", false);
        return;
      }
      const opp = opponentOf(g, client.userId);
      // تایمر قطعی اولویت دارد — تایمر لغو خاموش شود تا دو حکم متناقض نیایند
      clearTimeout(g.abortTimer);
      g.abortTimer = null;
      g.abortDeadline = 0;
      wsSendTo(opp, { t: "opponentDisconnected", gameId: g.id, seconds: DISCONNECT_TIMEOUT_MS / 1000 });
      clearTimeout(g.disconnectTimer);
      g.disconnectSide = client.userId;
      g.disconnectTimer = setTimeout(function () {
        if (!g.over) {
          finishGame(g, color === "w" ? "0-1" : "1-0", "disconnect", true, client.userId);
        }
      }, DISCONNECT_TIMEOUT_MS);
    });
    broadcastUsers();
  }
  clients.delete(client);
}

// ---------- اتصال ----------
function attach(server) {
  loadFiles();
  setInterval(function () { saveFiles(false); }, 2000);

  process.on("SIGTERM", function () { saveFiles(true); });
  process.on("SIGINT", function () { saveFiles(true); });
  process.on("exit", function () { saveFiles(true); });

  server.on("upgrade", function (req, socket, head) {
    try {
      const key = req.headers["sec-websocket-key"];
      if (!key) { socket.destroy(); return; }
      const accept = acceptKey(key);
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
      );
      socket.setNoDelay(true);

      const client = { ws: socket, userId: null, profile: null };
      clients.add(client);

      const parser = createFrameParser(client, function (text) {
        try {
          const msg = JSON.parse(text);
          route(client, msg);
        } catch (e) {
          console.error("[Online] خطای پردازش پیام:", e.message);
        }
      });

      socket.on("data", parser);
      socket.on("close", function () { handleDisconnect(client); });
      socket.on("error", function () { handleDisconnect(client); });
      if (head && head.length) parser(head);
    } catch (e) {
      try { socket.destroy(); } catch (e2) {}
    }
  });

  console.log("[Online] ماژول بازی آنلاین فعال شد — ws://<host> (WebSocket خالص)");
}

function route(client, msg) {
  switch (msg.t) {
    case "auth": return handleAuth(client, msg);
    case "quick": return handleQuick(client, msg);
    case "cancelQuick": return handleCancelQuick(client);
    case "challenge": return handleChallenge(client, msg);
    case "challengeResp": return handleChallengeResp(client, msg);
    case "move": return handleMove(client, msg);
    case "resign": return handleResign(client, msg);
    case "abort": return handleAbort(client, msg);
    case "drawOffer": return handleDrawOffer(client, msg);
    case "drawResp": return handleDrawResp(client, msg);
    case "chat": return handleChat(client, msg);
    case "spectate": return handleSpectate(client, msg);
    case "unSpectate": return handleUnSpectate(client);
    case "listUsers": return broadcastUsers();
    case "listLive": return broadcastLive();
    case "myGames": return handleMyGames(client);
    case "updateProfile": return handleUpdateProfile(client, msg);
    case "ping": return wsSend(client, { t: "pong" });
    default: break;
  }
}

module.exports = { attach: attach };
