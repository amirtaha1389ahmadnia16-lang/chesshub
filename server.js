#!/usr/bin/env node
/* ============================================================
   ♛ ChessHub Backend — سرور رسمی پروژه
   ------------------------------------------------------------
   Node.js خالص — صفر وابستگی (npm install لازم ندارد)
   آماده برای GitHub و استقرار روی Render.com

   اجرا:              node server.js
   تغییر پورت:        PORT=8080 node server.js   یا   node server.js 8080

   API:
     GET /api/daily-puzzle    پازل روز — چرخش هر ۲۴ ساعت؛ با ?day=N بر پایه‌ی تقویم محلی مرورگر
     GET /api/puzzle?index=7  پازل با شماره دلخواه (اندیس از صفر)
     GET /api/puzzles         فهرست همه پازل‌ها (متادیتا)
     GET /api/rush-puzzles    پازل‌های «پازل عجله‌ای» — data/puzzles.txt (فرمت: FEN,Moves,Rating,Themes)
     GET /api/health          سلامت سرور — Health Check Path در Render

   فایل داده (به ترتیب اولویت):
     data/daily_puzzle.txt
     data/daily_puzzle.csv
   فرمت: استاندارد Lichess — با یا بدون سطر هدر (خودکار تشخیص داده می‌شود)
   ============================================================ */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ------------------------- تنظیمات ------------------------- */

const VERSION = "8.3.0";
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // Render باید روی 0.0.0.0 گوش دهد
const ROOT = __dirname;

// 🌍 محتوای عمومی کاربران (دروس/گشایش‌ها/مقالات) — برای «همه‌ی» بازدیدکنندگان سایت
const COMMUNITY_FILE = path.join(ROOT, "data", "community_content.json");
const COMMUNITY_LIMITS = {
  lessons: { max: 300 },
  openings: { max: 300 },
  articles: { max: 300 },
};

// 👤 رجیستری نام کاربری سراسری — هر نام فقط «یک بار» قابل انتخاب است
// (هم نام بازیکن در بازی آنلاین، هم نام نویسنده در دروس/گشایش‌ها/مقالات)
const USERNAMES_FILE = path.join(ROOT, "data", "usernames.json");
const USERNAME_RULES = { min: 2, max: 16 };

// 🔐 حساب کاربری امن (رمز عبور + نشست) — v8.2
const auth = require("./server-auth");

// 🔄 ماندگاری داده‌ها با گیت‌هاب (اختیاری — با GITHUB_TOKEN فعال می‌شود)
let dataSync = null;
try { dataSync = require("./data-sync"); } catch (e) { dataSync = null; }

function readUsernames() {
  try {
    const j = JSON.parse(fs.readFileSync(USERNAMES_FILE, "utf8"));
    return j && typeof j === "object" && j.usernames && typeof j.usernames === "object"
      ? j.usernames
      : {};
  } catch (e) {
    return {};
  }
}

function writeUsernames(map) {
  fs.mkdirSync(path.dirname(USERNAMES_FILE), { recursive: true });
  fs.writeFileSync(USERNAMES_FILE + ".tmp", JSON.stringify({ usernames: map }, null, 2));
  fs.renameSync(USERNAMES_FILE + ".tmp", USERNAMES_FILE);
  if (dataSync) dataSync.pushLater("usernames.json"); // 🔄 همگام‌سازی گیت‌هاب
}

// کلید یکتا: حروف کوچک + فاصله‌های تکراری حذف‌شده → «علی» و «ALI» یکی هستند
function normUsername(v) {
  return String(v == null ? "" : v).trim().replace(/\s+/g, " ").toLowerCase();
}

function validateUsername(raw) {
  const name = String(raw == null ? "" : raw).trim().replace(/\s+/g, " ");
  if (name.length < USERNAME_RULES.min)
    return { error: "نام کاربری باید حداقل ۲ حرف باشد" };
  if (name.length > USERNAME_RULES.max)
    return { error: "نام کاربری حداکثر ۱۶ حرف است" };
  if (/[<>"'\\\\/{}$`]/.test(name))
    return { error: "نام کاربری نمی‌تواند کاراکترهای خاص (< > \" ' / \\ { } $ `) داشته باشد" };
  if (/[\u0000-\u001f\u007f]/.test(name))
    return { error: "نام کاربری نامعتبر است" };
  return { name };
}

// فایل‌های داده به ترتیب اولویت (txt = فرمت فعلی کاربر)
const DATA_FILES = [
  path.join(ROOT, "data", "daily_puzzle.txt"),
  path.join(ROOT, "data", "daily_puzzle.csv"),
];

// فایل‌های «پازل عجله‌ای» — فرمت: FEN,Moves,Rating,Themes
const RUSH_FILES = [
  path.join(ROOT, "data", "puzzles.txt"),
  path.join(ROOT, "data", "puzzle_rush.txt"),
];

// مبنای چرخش پازل — بر پایه UTC تا با فرانت‌اند همیشه هماهنگ بماند
// روز ۰ = 2024-01-01 → سطر اول؛ هر ۲۴ ساعت یک سطر جلو (چرخشی)
const DAY_EPOCH_UTC = Date.UTC(2024, 0, 1);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".csv": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pgn": "application/x-chess-pgn; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".map": "application/json; charset=utf-8",
};

const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|application\/x-chess-pgn)/;
const STATIC_ASSETS = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav)$/i;

/* --------------------------- لاگ --------------------------- */

function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}

/* ---------------- پارس CSV (سازگار RFC4180) ---------------- */

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') {
      q = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* ------------------- کتابخانه پازل‌ها ---------------------- */

const puzzleCache = { file: null, mtimeMs: -1, list: [], error: null };

// تشخیص خودکار هدر — فایل کاربر بدون هدر است و مستقیم از سطر اول می‌خواند
function parsePuzzleRows(lines) {
  const rows = lines.map((l) => parseCSVLine(l)).filter((f) => f.length > 1);
  if (!rows.length) return [];

  const firstRow = rows[0].map((h) => String(h).trim().toLowerCase());
  const hasHeader = firstRow[0] === "puzzleid" || firstRow.indexOf("fen") >= 0;
  const header = hasHeader ? firstRow : [];

  const col = (name, fb) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fb;
  };

  const C = {
    id: col("puzzleid", 0),
    fen: col("fen", 1),
    moves: col("moves", 2),
    rating: col("rating", 3),
    rd: col("ratingdeviation", 4),
    pop: col("popularity", 5),
    nb: col("nbplays", 6),
    themes: col("themes", 7),
    url: col("gameurl", 8),
    open: col("openingtags", 9),
  };

  const list = [];
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const f = rows[i];
    if (!f[C.fen] || !f[C.moves]) continue;

    const fen = String(f[C.fen]).trim();
    const fenParts = fen.split(/\s+/);
    if (fenParts.length < 2) continue;

    const moves = String(f[C.moves]).trim().split(/\s+/).filter(Boolean);
    if (!moves.length) continue;

    list.push({
      puzzleId: (f[C.id] || String(i + 1)).trim(),
      fen,
      moves,
      rating: Number(f[C.rating]) || 0,
      ratingDeviation: Number(f[C.rd]) || 0,
      popularity: Number(f[C.pop]) || 0,
      nbPlays: Number(f[C.nb]) || 0,
      themes: String(f[C.themes] || "").split(/\s+/).filter(Boolean),
      gameUrl: (f[C.url] || "").trim(),
      openingTags: (f[C.open] || "").trim(),
      userColor: fenParts[1] === "b" ? "w" : "b",
    });
  }
  return list;
}

// خواندن فایل داده با کش — اگر محتوا عوض شود خودکار دوباره خوانده می‌شود
function loadPuzzles() {
  for (let i = 0; i < DATA_FILES.length; i++) {
    const file = DATA_FILES[i];
    try {
      const st = fs.statSync(file);
      if (puzzleCache.file === file && puzzleCache.mtimeMs === st.mtimeMs) {
        return puzzleCache.list;
      }
      let text = fs.readFileSync(file, "utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
      const list = parsePuzzleRows(lines);
      if (!list.length) throw new Error("هیچ پازل معتبری در فایل یافت نشد");

      puzzleCache.file = file;
      puzzleCache.mtimeMs = st.mtimeMs;
      puzzleCache.list = list;
      puzzleCache.error = null;
      log(`کتابخانه پازل بارگذاری شد: ${path.relative(ROOT, file)} — ${list.length} پازل`);
      return list;
    } catch (err) {
      if (err.code === "ENOENT") continue; // فایل نیست → بعدی
      puzzleCache.error = `${path.basename(file)}: ${err.message}`; // فایل هست ولی خراب
    }
  }

  // هیچ‌کدام از فایل‌ها در دسترس نبود → کش کهنه پاک می‌شود
  const anyExists = DATA_FILES.some((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch (e) {
      return false;
    }
  });
  if (!anyExists) {
    puzzleCache.file = null;
    puzzleCache.mtimeMs = -1;
    puzzleCache.list = [];
    if (!puzzleCache.error) puzzleCache.error = "فایل داده پیدا نشد";
  }
  return puzzleCache.list;
}

/* ---------------- کتابخانه پازل عجله‌ای -------------------- */

const rushCache = { file: null, mtimeMs: -1, list: [], error: null };

// فرمت: FEN,Moves,Rating,Themes — با یا بدون سطر هدر (خودکار تشخیص داده می‌شود)
function parseRushRows(lines) {
  const list = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 2) continue;

    const fen = parts[0].trim();
    const movesStr = (parts[1] || "").trim();
    if (!fen || !movesStr) continue;

    const fenParts = fen.split(/\s+/);
    if (fenParts.length < 4) continue; // هدر یا سطر ناقص
    if (!/^[pnbrqkPNBRQK1-8/]+$/.test(fenParts[0])) continue;
    const turn = fenParts[1];
    if (turn !== "w" && turn !== "b") continue;

    const moves = movesStr.split(/\s+/).filter(Boolean);
    if (!moves.length) continue;
    if (!moves.every((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) continue;

    list.push({
      fen,
      moves,
      rating: Number(parts[2]) || 0,
      themes: (parts[3] || "").trim().split(/\s+/).filter(Boolean),
    });
  }
  return list;
}

// خواندن فایل پازل عجله‌ای با کش — تغییر محتوا = بازخوانی خودکار
function loadRushPuzzles() {
  for (const file of RUSH_FILES) {
    try {
      const st = fs.statSync(file);
      if (rushCache.file === file && rushCache.mtimeMs === st.mtimeMs) {
        return rushCache.list;
      }
      let text = fs.readFileSync(file, "utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
      const list = parseRushRows(lines);
      if (!list.length) throw new Error("هیچ پازل معتبری در فایل یافت نشد");

      rushCache.file = file;
      rushCache.mtimeMs = st.mtimeMs;
      rushCache.list = list;
      rushCache.error = null;
      log(`کتابخانه پازل عجله‌ای بارگذاری شد: ${path.relative(ROOT, file)} — ${list.length} پازل`);
      return list;
    } catch (err) {
      if (err.code === "ENOENT") continue; // فایل نیست → بعدی
      rushCache.error = `${path.basename(file)}: ${err.message}`; // فایل هست ولی خراب
    }
  }

  const rushExists = RUSH_FILES.some((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch (e) {
      return false;
    }
  });
  if (!rushExists) {
    rushCache.file = null;
    rushCache.mtimeMs = -1;
    rushCache.list = [];
    if (!rushCache.error) rushCache.error = "فایل data/puzzles.txt پیدا نشد";
  }
  return rushCache.list;
}

/* ------------------- منطق پازل روزانه ---------------------- */

function dayNumber() {
  return Math.max(0, Math.floor((Date.now() - DAY_EPOCH_UTC) / 86400000));
}

function dailyIndex(total, dayOverride) {
  const day =
    Number.isFinite(dayOverride) && dayOverride >= 0 ? Math.floor(dayOverride) : dayNumber();
  return total > 0 ? day % total : -1;
}

function nextUpdateISO() {
  const tomorrow = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
  return new Date(tomorrow).toISOString();
}

function dailyPuzzlePayload(clientDay) {
  const list = loadPuzzles();
  if (!list.length) {
    return { ok: false, error: "پازلی یافت نشد", detail: puzzleCache.error, hint: "فایل data/daily_puzzle.txt را در ریشه پروژه بگذار (فرمت Lichess)" };
  }
  // اگر مرورگر «شماره‌ی روز محلی» خودش را فرستاده باشد (?day=N) از همان استفاده می‌شود
  // تا چرخش پازل دقیقاً هم‌زمان با تغییر تقویمِ خود کاربر باشد
  const hasClientDay = Number.isFinite(clientDay) && clientDay >= 0;
  const index = dailyIndex(list.length, clientDay);
  const p = list[index];
  return {
    ok: true,
    puzzle: p,
    meta: {
      index,
      total: list.length,
      dayNumber: hasClientDay ? Math.floor(clientDay) : dayNumber(),
      clientDay: hasClientDay,
      date: new Date().toISOString().slice(0, 10),
      rotatesEveryHours: 24,
      startedFromFirstRow: true,
      nextUpdate: nextUpdateISO(),
      source: path.relative(ROOT, puzzleCache.file),
    },
  };
}

/* ------------- محتوای عمومی کاربران ------------- */

// پاک‌سازی متن ساده
function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

// پاک‌سازی HTML تولیدی ویرایشگر درس — حذف اسکریپت/رویداد/لینک خطرناک
function sanitizeHtml(html, maxLen) {
  let s = String(html == null ? "" : html);
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta|base)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function hexColor(v, fb) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? v : fb;
}

/* ------------- ترمیم خودکار فایل‌های داده‌ی خراب (تداخل گیت) -------------
   اگر فایل نشانگرهای تداخل داشته باشد (<<<<<<< / ======= / >>>>>>>)،
   هر دو نسخه خوانده و «اجتماع» آن‌ها برمی‌گردد — هیچ داده‌ای دور ریخته
   نمی‌شود. این همان فاجعه‌ای بود که محتوای عمومی سایت را پنهان کرده بود:
   فایل community_content.json با نشانگر تداخل کامیت شد و readCommunity
   بی‌صدا [] برمی‌گرداند. حالا سرور خودش ترمیم و ذخیره می‌کند.
-------------------------------------------------------------------------- */
function repairConflictedJSONText(text) {
  text = String(text == null ? "" : text);
  // الگوی کامل: <<<<<<< x \n A \n ======= \n B \n >>>>>>> y
  const m = text.match(/^\s*<{7}[^\n]*\n([\s\S]*?)\n={7}\n([\s\S]*?)\n>{7}[^\n]*\n?$/);
  if (!m) return null;
  function safe(t) { try { return JSON.parse(t); } catch (e) { return null; } }
  const a = safe(m[1].trim());
  const b = safe(m[2].trim());
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  // اجتماع دو شیء — آرایه‌ها بر اساس id/name ادغام می‌شوند (تازه‌تر می‌ماند)
  function union(a, b) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      const out = [];
      const seen = {};
      const keyOf = function (o) {
        if (!o || typeof o !== "object") return null;
        if (o.id != null && o.id !== "") return "id:" + String(o.id);
        if (o.name != null && o.name !== "") return "name:" + String(o.name).trim().toLowerCase();
        return null;
      };
      const timeOf = function (o) { return (o && (o.updatedAt || o.createdAt || o.lastSeen)) || 0; };
      a.concat(b).forEach(function (x) {
        if (!x || typeof x !== "object") { out.push(x); return; }
        const k = keyOf(x);
        if (k == null) { out.push(x); return; }
        if (!seen[k]) { seen[k] = { item: x, t: timeOf(x) }; out.push(x); return; }
        const t = timeOf(x);
        if (t > seen[k].t) {
          seen[k].item = x; seen[k].t = t;
          for (let i = 0; i < out.length; i++) {
            if (out[i] && typeof out[i] === "object" && keyOf(out[i]) === k) { out[i] = x; break; }
          }
        }
      });
      return out;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const out = Object.assign({}, a);
      Object.keys(b).forEach(function (k) { out[k] = union(a[k], b[k]); });
      return out;
    }
    return b;
  }
  return union(a, b);
}

function readCommunity() {
  let raw = null;
  try {
    raw = fs.readFileSync(COMMUNITY_FILE, "utf8");
  } catch (e) {
    return { lessons: [], openings: [], articles: [], deleted: {} };
  }
  try {
    const j = JSON.parse(raw);
    return {
      lessons: Array.isArray(j.lessons) ? j.lessons : [],
      openings: Array.isArray(j.openings) ? j.openings : [],
      articles: Array.isArray(j.articles) ? j.articles : [],
      deleted: j.deleted && typeof j.deleted === "object" && !Array.isArray(j.deleted) ? j.deleted : {},
    };
  } catch (e) {
    // 🔧 ترمیم خودکار — فایل نشانگر تداخل گیت دارد یا خراب است
    const repaired = repairConflictedJSONText(raw);
    if (repaired && (repaired.lessons || repaired.openings || repaired.articles)) {
      const fixed = {
        lessons: Array.isArray(repaired.lessons) ? repaired.lessons : [],
        openings: Array.isArray(repaired.openings) ? repaired.openings : [],
        articles: Array.isArray(repaired.articles) ? repaired.articles : [],
        deleted: repaired.deleted && typeof repaired.deleted === "object" && !Array.isArray(repaired.deleted) ? repaired.deleted : {},
      };
      try {
        fs.writeFileSync(COMMUNITY_FILE + ".tmp", JSON.stringify(fixed));
        fs.renameSync(COMMUNITY_FILE + ".tmp", COMMUNITY_FILE);
        log("🔧 community_content.json خودکار ترمیم شد — " +
          fixed.lessons.length + " درس، " + fixed.openings.length + " گشایش، " + fixed.articles.length + " مقاله بازیابی شد");
        if (dataSync) dataSync.pushLater("community_content.json");
      } catch (e2) {}
      return fixed;
    }
    return { lessons: [], openings: [], articles: [], deleted: {} };
  }
}

function writeCommunity(data) {
  fs.mkdirSync(path.dirname(COMMUNITY_FILE), { recursive: true });
  // تومب‌سنگ‌های قدیمی‌تر از ۳۰ روز پاک می‌شوند (حذف‌ها جاودانه نمی‌مانند)
  if (data.deleted && typeof data.deleted === "object") {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    Object.keys(data.deleted).forEach(function (k) {
      if ((Number(data.deleted[k]) || 0) < cutoff) delete data.deleted[k];
    });
  }
  fs.writeFileSync(COMMUNITY_FILE + ".tmp", JSON.stringify(data));
  fs.renameSync(COMMUNITY_FILE + ".tmp", COMMUNITY_FILE);
  if (dataSync) dataSync.pushLater("community_content.json"); // 🔄 همگام‌سازی گیت‌هاب
}

// آماده‌سازی اقلام بر اساس نوع — خروجی تمیز و محدودشده
function cleanCommunityItem(type, item) {
  item = item || {};
  if (type === "lessons") {
    return {
      title: cleanText(item.title, 120),
      category: cleanText(item.category, 30) || "شروع بازی",
      level: cleanText(item.level, 30) || "همه سطوح",
      duration: cleanText(item.duration, 40) || "۱۰ دقیقه",
      description: cleanText(item.description, 400),
      content: sanitizeHtml(item.content, 80000),
      thumbIcon: cleanText(item.thumbIcon, 60) || "fas fa-book-open",
      color: hexColor(item.color, "#2c7da0"),
    };
  }
  if (type === "openings") {
    const moves = (Array.isArray(item.moves) ? item.moves : [])
      .slice(0, 40)
      .map((m) => cleanText(m, 8))
      .filter(Boolean);
    const variants = (Array.isArray(item.variants) ? item.variants : [])
      .slice(0, 12)
      .map((v) => ({
        name: cleanText(v && v.name, 80),
        moves: (Array.isArray(v && v.moves) ? v.moves : [])
          .slice(0, 30)
          .map((m) => cleanText(m, 8))
          .filter(Boolean),
        stats: {
          whiteWins: Math.max(0, Math.min(100000, Number(v && v.stats && v.stats.whiteWins) || 0)),
          blackWins: Math.max(0, Math.min(100000, Number(v && v.stats && v.stats.blackWins) || 0)),
          draws: Math.max(0, Math.min(100000, Number(v && v.stats && v.stats.draws) || 0)),
        },
        strengths: ((v && v.strengths) || []).slice(0, 12).map((s) => cleanText(s, 300)).filter(Boolean),
        weaknesses: ((v && v.weaknesses) || []).slice(0, 12).map((s) => cleanText(s, 300)).filter(Boolean),
        popularMoves: ((v && v.popularMoves) || []).slice(0, 10).map((p) => ({
          san: cleanText(p && p.san, 12),
          description: cleanText(p && p.description, 400),
          moves: (Array.isArray(p && p.moves) ? p.moves : []).slice(0, 30).map((m) => cleanText(m, 8)).filter(Boolean),
        })).filter((p) => p.san),
        evaluation: {
          score: cleanText(v && v.evaluation && v.evaluation.score, 16) || "0.0",
          summary: cleanText(v && v.evaluation && v.evaluation.summary, 600),
        },
        ideas: ((v && v.ideas) || []).slice(0, 12).map((s) => cleanText(s, 300)).filter(Boolean),
        endgames: ((v && v.endgames) || []).slice(0, 12).map((s) => cleanText(s, 300)).filter(Boolean),
        traps: ((v && v.traps) || []).slice(0, 10).map((t) => ({
          name: cleanText(t && t.name, 100),
          moves: (Array.isArray(t && t.moves) ? t.moves : []).slice(0, 30).map((m) => cleanText(m, 8)).filter(Boolean),
        })).filter((t) => t.name && t.moves.length),
        sampleGames: ((v && v.sampleGames) || []).slice(0, 8).map((g) => {
          const o = {
            white: cleanText(g && g.white, 60),
            black: cleanText(g && g.black, 60),
            year: Math.max(0, Math.min(2100, Number(g && g.year) || 0)),
            result: cleanText(g && g.result, 12) || "*",
          };
          if (g && g.pgn) o.pgn = cleanText(g.pgn, 20000);
          return o;
        }).filter((g) => g.white && g.black),
      }))
      .filter((v) => v.name && v.moves.length);
    return {
      name: cleanText(item.name, 80),
      moves,
      categoryCode: cleanText(item.categoryCode, 16) || "other",
      categoryName: cleanText(item.categoryName, 40) || "سایر گشایش‌ها",
      thumbIcon: cleanText(item.thumbIcon, 60) || "fas fa-chess-queen",
      color: hexColor(item.color, "#2c7da0"),
      variants,
    };
  }
  // articles — متن خام است؛ در مرورگر با فرارِ کامل رندر می‌شود
  return {
    title: cleanText(item.title, 120),
    category: cleanText(item.category, 30) || "سایر",
    desc: cleanText(item.desc, 300),
    body: cleanText(item.body, 40000),
    icon: cleanText(item.icon, 60) || "fas fa-user-pen",
  };
}

// ♟️ موتور شطرنج برای اعتبارسنجی حرکات گشایش‌ها (اختیاری — اگر کتابخانه باشد)
let ChessCtor = null;
try {
  const m = require("./lib/chess.min.js");
  ChessCtor = m.Chess || m;
} catch (e) { ChessCtor = null; }

// پاک‌سازی توکن حرکت: حذف شماره‌ی حرکت (1.e4) و نتایج (1-0)
function cleanMoveTokenList(list, max) {
  return (Array.isArray(list) ? list : [])
    .map((m) => String(m == null ? "" : m).trim())
    .filter(Boolean)
    .map((m) => m.replace(/^\d+\.(\.\.)?/, "").replace(/[!?]+$/, ""))
    .filter((m) => m && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(m))
    .slice(0, max);
}

// قانونی بودن توالی حرکات با موتور واقعی — خروجی: null یا پیام خطا
function validateMovesLegality(moves, label) {
  if (!ChessCtor) return null; // بدون کتابخانه — مانند قبل
  let g;
  try { g = new ChessCtor(); } catch (e) { return null; }
  for (let i = 0; i < moves.length; i++) {
    let mv = null;
    try { mv = g.move(moves[i], { sloppy: true }); } catch (e) { mv = null; }
    if (!mv) {
      return "حرکت غیرقانونی در " + label + ": «" + moves[i] + "» (حرکت‌ها را با نماد استاندارد انگلیسی بنویس)";
    }
  }
  return null;
}

function validateCommunityItem(type, c) {
  if (type === "lessons") {
    if (c.title.length < 3) return "عنوان درس خیلی کوتاه است";
    if (c.description.length < 5) return "توضیحات درس خیلی کوتاه است";
    if (c.content.length < 20) return "محتوای درس خیلی کوتاه است";
    return null;
  }
  if (type === "openings") {
    if (c.name.length < 2) return "نام گشایش خیلی کوتاه است";
    if (!c.moves.length) return "حرکات اصلی گشایش نامعتبر است";
    if (!c.variants.length) return "حداقل یک واریانت معتبر لازم است";
    // ♟️ اعتبارسنجی موتور شطرنج — حرکت‌های خلاف قوانین ذخیره نمی‌شوند
    const mainMoves = cleanMoveTokenList(c.moves, 40);
    const verr0 = validateMovesLegality(mainMoves, "حرکات اصلی");
    if (verr0) return verr0;
    for (let i = 0; i < c.variants.length; i++) {
      const v = c.variants[i];
      const vm = cleanMoveTokenList(v.moves, 30);
      if (!vm.length) return "واریانت «" + v.name + "» حرکات ندارد";
      const verr = validateMovesLegality(vm, "واریانت «" + v.name + "»");
      if (verr) return verr;
    }
    return null;
  }
  if (c.title.length < 5) return "عنوان مقاله خیلی کوتاه است";
  if (c.desc.length < 10) return "توضیح کوتاه مقاله خیلی کوتاه است";
  if (c.body.length < 50) return "متن مقاله خیلی کوتاه است (حداقل ۵۰ حرف)";
  return null;
}

function normAuthor(a) {
  return String(a || "").trim().toLowerCase();
}

/* ---------------------- پاسخ‌ها ---------------------------- */

function sendJSON(res, code, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function notFoundPage(res) {
  if (res.headersSent) return;
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      "<title>۴۰۴ — پیدا نشد | ChessHub</title>" +
      "<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f7fafc;color:#2d3748;margin:0}" +
      ".box{text-align:center;padding:2rem}h1{font-size:4rem;margin:0;color:#3182ce}p{color:#718096}" +
      "a{display:inline-block;margin-top:1rem;padding:.7rem 1.5rem;background:#3182ce;color:#fff;border-radius:8px;text-decoration:none}</style></head>" +
      '<body><div class="box"><h1>♔ ۴۰۴</h1><p>این صفحه در چوب‌های ChessHub پیدا نشد!</p>' +
      '<a href="/">بازگشت به خانه</a></div></body></html>'
  );
}

/* ---------------------- کمکی‌های auth ----------------------- */

// آی‌پی واقعی کلاینت (پشت پروکسی Render)
function clientIP(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

// خواندن امن بدنه‌ی JSON با سقف حجم
function readJSONBody(req, maxBytes) {
  return new Promise(function (resolve, reject) {
    let raw = "";
    let aborted = false;
    req.on("data", function (c) {
      if (aborted) return;
      raw += c;
      if (raw.length > maxBytes) { aborted = true; try { req.destroy(); } catch (e) {} reject(new Error("حجم درخواست بیش از حد مجاز است")); }
    });
    req.on("end", function () {
      if (aborted) return;
      try { resolve(JSON.parse(raw || "{}")); }
      catch (e) { reject(new Error("بدنه‌ی درخواست JSON معتبر نیست")); }
    });
    req.on("error", reject);
  });
}

// ذخیره‌ی حساب‌ها (میان‌بر تمیز)
function writeAccountsSafe(map) { auth.saveAccounts(map); }

// ثبت نام کاربر تازه در رجیستری قدیمی هم انجام می‌شود (سازگاری صفحات فعلی)
function mirrorUsernameToRegistry(name, avatar) {
  const map = readUsernames();
  const key = normUsername(name);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = { name: name, avatar: avatar || "", registeredAt: Date.now() };
    writeUsernames(map);
  }
  return map[key] || null;
}

/* ---------------- مسیرهای حساب کاربری (v8.2) ---------------- */

function handleAuthAPI(req, res, pathname, query) {
  // در صورت نبود پارامتر query، از آدرس درخواست بساز
  if (!query) {
    try {
      query = new URL(req.url, "http://localhost").searchParams;
    } catch (e) {
      query = new URLSearchParams();
    }
  }
  const ip = clientIP(req);

  // 🔐 محدودیت نرخ هوشمند (اصلاح واقعی: قبلاً «همه‌ی» مسیرهای حساب در یک
  // سطل مشترک بودند — هر بار باز کردن صفحه /api/auth/me می‌خورد و در یک
  // اینترنت مشترک (مدرسه) سطل پر می‌شد و همه قفل می‌شدند. حالا فقط
  // عملیات‌های رمزمحور سخت محدود می‌شوند؛ me/status خفیف‌اند.)
  const AUTH_SENSITIVE = ["/api/auth/register", "/api/auth/login", "/api/auth/upgrade", "/api/auth/change-password"];
  if (AUTH_SENSITIVE.indexOf(pathname) >= 0) {
    // ضد بروت‌فورس — ۳۰ تلاش رمز در ۱۰ دقیقه برای هر آی‌پی
    if (!auth.rateLimit("auth:" + ip, 30, 10 * 60 * 1000)) {
      return sendJSON(res, 429, { ok: false, error: "درخواست‌های زیاد — چند دقیقه بعد دوباره تلاش کن" });
    }
  } else {
    // ضد طوفان درخواست — کاربر عادی هرگز نمی‌خورد (حدود ۰٫۷ درخواست/ثانیه)
    if (!auth.rateLimit("authlight:" + ip, 400, 10 * 60 * 1000)) {
      return sendJSON(res, 429, { ok: false, error: "درخواست‌های زیاد — چند دقیقه بعد دوباره تلاش کن" });
    }
  }

  // 📝 ثبت‌نام — «بدون رمز عبور ممکن نیست»
  if (pathname === "/api/auth/register" && req.method === "POST") {
    readJSONBody(req, 16 * 1024)
      .then(function (body) {
        const v = validateUsername(body.name);
        if (v.error) return sendJSON(res, 400, { ok: false, error: v.error });
        const avatar = cleanText(body.avatar, 300);
        if (avatar && !/^(https?:\/\/|images\/)/i.test(avatar)) {
          return sendJSON(res, 400, { ok: false, error: "آواتار نامعتبر است" });
        }
        if (!body.password || String(body.password).length === 0) {
          return sendJSON(res, 400, { ok: false, error: "رمز عبور الزامی است — بدون رمز عبور نمی‌توانی ثبت‌نام کنی" });
        }
        // نامی که در رجیستری قدیمی هست ولی حساب ندارد → باید از «ارتقا» استفاده کند
        const regMap = readUsernames();
        if (Object.prototype.hasOwnProperty.call(regMap, normUsername(v.name)) && !auth.accountExists(v.name)) {
          return sendJSON(res, 409, {
            ok: false,
            error: "این نام کاربری از قبل متعلق به توست — در پنجره‌ی ورود، گزینه‌ی «انتخاب رمز عبور» را بزن",
            needUpgrade: true,
          });
        }
        const r = auth.registerAccount(v.name, body.password, avatar);
        if (!r.ok) return sendJSON(res, r.status || 400, { ok: false, error: r.error });
        mirrorUsernameToRegistry(r.record.name, r.record.avatar);
        log(`حساب جدید ساخته شد: «${r.record.name}»`);
        return sendJSON(res, 200, {
          ok: true,
          token: r.token,
          profile: auth.publicProfile(r.record),
          note: "✅ از اطلاعات فعلی سایت یک نسخه‌ی پشتیبان در گیت‌هاب نگهداری می‌شود",
        });
      })
      .catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
    return;
  }

  // 🔑 ورود
  if (pathname === "/api/auth/login" && req.method === "POST") {
    readJSONBody(req, 16 * 1024)
      .then(function (body) {
        const r = auth.loginAccount(body.name, body.password);
        if (!r.ok) return sendJSON(res, r.status || 401, { ok: false, error: r.error });
        log(`ورود موفق: «${r.record.name}»`);
        return sendJSON(res, 200, { ok: true, token: r.token, profile: auth.publicProfile(r.record) });
      })
      .catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
    return;
  }

  // 🔐 ارتقای حساب قدیمی — صاحب نام، برای خودش رمز انتخاب می‌کند
  if (pathname === "/api/auth/upgrade" && req.method === "POST") {
    readJSONBody(req, 16 * 1024)
      .then(function (body) {
        const v = validateUsername(body.name);
        if (v.error) return sendJSON(res, 400, { ok: false, error: v.error });
        if (!body.password || String(body.password).length === 0) {
          return sendJSON(res, 400, { ok: false, error: "انتخاب رمز عبور برای این مرحله اجباری است" });
        }
        const r = auth.upgradeAccount(v.name, body.password, cleanText(body.avatar, 300));
        if (!r.ok) return sendJSON(res, r.status || 400, { ok: false, error: r.error });
        log(`حساب قدیمی ارتقا یافت: «${r.record.name}»`);
        return sendJSON(res, 200, { ok: true, token: r.token, profile: auth.publicProfile(r.record) });
      })
      .catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
    return;
  }

  // 👤 اطلاعات نشست من
  if (pathname === "/api/auth/me" && req.method === "GET") {
    const session = auth.verifyToken(auth.tokenFromReq(req));
    if (!session) return sendJSON(res, 401, { ok: false, error: "نشست منقضی یا نامعتبر است" });
    const map = auth.readAccounts();
    const rec = map[session.u];
    if (!rec) return sendJSON(res, 401, { ok: false, error: "حساب پیدا نشد — دوباره وارد شو" });
    return sendJSON(res, 200, { ok: true, profile: auth.publicProfile(rec) });
  }

  // 🔍 وضعیت یک نام — آیا حساب دارد؟ (برای پنجره‌ی امنیتی سایت)
  if (pathname === "/api/auth/status" && req.method === "GET") {
    const v = validateUsername(query.get("name"));
    if (v.error) return sendJSON(res, 400, { ok: false, error: v.error });
    const has = auth.accountExists(v.name);
    let legacy = false;
    let avatar = "";
    const regMap = readUsernames();
    const rec = regMap[normUsername(v.name)];
    if (rec) { legacy = true; avatar = rec.avatar || ""; }
    return sendJSON(res, 200, { ok: true, name: v.name, hasAccount: has, legacy: legacy, avatar: avatar });
  }

  // 🔁 تغییر رمز عبور (کاربر واردشده)
  if (pathname === "/api/auth/change-password" && req.method === "POST") {
    const session = auth.verifyToken(auth.tokenFromReq(req));
    if (!session) return sendJSON(res, 401, { ok: false, error: "اول وارد حساب خودت شو" });
    readJSONBody(req, 16 * 1024)
      .then(function (body) {
        const r = auth.changePassword(session, body.currentPassword, body.newPassword);
        if (!r.ok) return sendJSON(res, r.status || 400, { ok: false, error: r.error });
        log(`رمز عبور تغییر کرد: «${session.n}»`);
        return sendJSON(res, 200, { ok: true });
      })
      .catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
    return;
  }

  // 🚪 خروج — توکن سمت کلاینت پاک می‌شود
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { ok: false, error: "این مسیر حساب کاربری وجود ندارد" });
}

/* ---------------------- مسیرهای API ------------------------ */

function handleAPI(req, res, pathname, query) {
  // 🔄 ماندگاری گیت‌هاب — بازیابی فایل‌های داده در اولین فرصت
  if (dataSync) dataSync.init();

  if (pathname === "/api/daily-puzzle") {
    const dayParam = parseInt(query.get("day"), 10);
    const payload = dailyPuzzlePayload(Number.isFinite(dayParam) ? dayParam : undefined);
    return sendJSON(res, payload.ok ? 200 : 503, payload);
  }

  if (pathname === "/api/puzzle") {
    const list = loadPuzzles();
    if (!list.length) {
      return sendJSON(res, 503, { ok: false, error: "پازلی یافت نشد", detail: puzzleCache.error });
    }
    let index = parseInt(query.get("index"), 10);
    if (!Number.isFinite(index)) index = 0;
    index = ((index % list.length) + list.length) % list.length;
    return sendJSON(res, 200, { ok: true, puzzle: list[index], meta: { index, total: list.length } });
  }

  if (pathname === "/api/puzzles") {
    const list = loadPuzzles();
    return sendJSON(res, 200, {
      ok: true,
      total: list.length,
      puzzles: list.map((p) => ({
        puzzleId: p.puzzleId,
        fen: p.fen,
        rating: p.rating,
        themes: p.themes,
        userColor: p.userColor,
      })),
    });
  }

  if (pathname === "/api/rush-puzzles") {
    const list = loadRushPuzzles();
    if (!list.length) {
      return sendJSON(res, 503, {
        ok: false,
        error: "پازل عجله‌ای یافت نشد",
        detail: rushCache.error,
        hint: "فایل data/puzzles.txt را بگذار — فرمت: FEN,Moves,Rating,Themes",
      });
    }
    let puzzles = list;
    const limit = parseInt(query.get("limit"), 10);
    if (Number.isFinite(limit) && limit > 0 && limit < puzzles.length) {
      puzzles = puzzles.slice(0, limit); // ?limit=500 برای موبایل‌های کم‌سرعت
    }
    return sendJSON(res, 200, { ok: true, total: puzzles.length, puzzles });
  }

  // 🌍 انتشار عمومی — محتوای هر کاربر برای «همه‌ی» کاربران سایت نمایش داده می‌شود
  if (pathname === "/api/community/content") {
    const d = readCommunity();
    return sendJSON(res, 200, {
      ok: true,
      lessons: d.lessons,
      openings: d.openings,
      articles: d.articles,
    });
  }

  if (pathname === "/api/community/publish") {
    if (req.method !== "POST") {
      return sendJSON(res, 405, { ok: false, error: "متد مجاز نیست" });
    }
    // 🔐 v8.2 — انتشار فقط با حساب کاربری؛ ضد اسپم هم هست
    // کلید محدودیت = آی‌پی + کاربر (آی‌پی مشترک مدرسه باعث محرومیت هم‌قطارها نمی‌شود)
    const sessionForRate = auth.verifyToken(auth.tokenFromReq(req));
    const pubKey = "pub:" + clientIP(req) + ":" + (sessionForRate ? sessionForRate.u : "anon");
    if (!auth.rateLimit(pubKey, 12, 5 * 60 * 1000)) {
      return sendJSON(res, 429, { ok: false, error: "تعداد انتشارها زیاد است — چند دقیقه صبر کن" });
    }
    const session = sessionForRate;
    if (!session) {
      return sendJSON(res, 401, {
        ok: false,
        error: "برای انتشار محتوا اول وارد حساب خودت شو (امنیت همه‌ی کاربران)",
        needLogin: true,
      });
    }
    let raw = "";
    let aborted = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 250 * 1024) { aborted = true; req.destroy(); }
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const body = JSON.parse(raw || "{}");
        const type = String(body.type || "");
        const action = String(body.action || "publish");
        if (!COMMUNITY_LIMITS[type]) {
          return sendJSON(res, 400, { ok: false, error: "نوع محتوا نامعتبر است" });
        }
        if (["publish", "update", "delete"].indexOf(action) < 0) {
          return sendJSON(res, 400, { ok: false, error: "عملیات نامعتبر است" });
        }

        const data = readCommunity();
        const arr = data[type];

        // 📥 مسیر ویژه‌ی «آپلود فایل JSON» — با پرچم صریحِ خود کاربر،
        // نام نویسنده‌ی داخل فایل حفظ می‌شود (و ارجاع به آپلودکننده ثبت می‌شود)
        let author = cleanText(session.n, 40);
        let importedBy = null;
        if (body.allowFileAuthor === true && body.item && body.item.author) {
          const fileAuthor = cleanText(body.item.author, 40);
          if (fileAuthor.length >= 2) {
            author = fileAuthor;
            importedBy = cleanText(session.n, 40);
          }
        }

        // ❌ حذف — فقط نویسنده‌ی همان اثر (یا کسی که آن را آپلود کرده)
        if (action === "delete") {
          const idx = arr.findIndex((x) => String(x.id) === String(body.id));
          if (idx < 0) return sendJSON(res, 404, { ok: false, error: "اثر مورد نظر پیدا نشد" });
          const owner = normAuthor(arr[idx].author);
          const uploader = normAuthor(arr[idx].importedBy);
          const me = normAuthor(session.n);
          if (owner !== me && uploader !== me) {
            return sendJSON(res, 403, { ok: false, error: "فقط نویسنده می‌تواند این اثر را حذف کند" });
          }
          // 🪦 تومب‌سنگ — تا ادغام گیت‌هاب، اثر حذف‌شده را زنده نکند
          data.deleted = data.deleted && typeof data.deleted === "object" ? data.deleted : {};
          data.deleted[String(body.id)] = Date.now();
          arr.splice(idx, 1);
          writeCommunity(data);
          return sendJSON(res, 200, { ok: true, deleted: String(body.id) });
        }

        // ✍️ انتشار / ویرایش — نام نویسنده «سروری» است، نه از مرورگر
        if (author.length < 2) {
          return sendJSON(res, 400, { ok: false, error: "نام نویسنده الزامی است" });
        }

        // 🔍 برای ویرایش: اول وجود اثر و مالکیت — بعد اعتبارسنجی محتوا
        let editIdx = -1;
        if (action === "update") {
          editIdx = arr.findIndex((x) => String(x.id) === String(body.id));
          if (editIdx < 0) return sendJSON(res, 404, { ok: false, error: "اثر مورد نظر پیدا نشد" });
          const owner = normAuthor(arr[editIdx].author);
          const uploader = normAuthor(arr[editIdx].importedBy);
          const me = normAuthor(session.n);
          if (owner !== me && uploader !== me) {
            return sendJSON(res, 403, { ok: false, error: "فقط نویسنده می‌تواند این اثر را ویرایش کند" });
          }
        }

        const clean = cleanCommunityItem(type, body.item);
        const verr = validateCommunityItem(type, clean);
        if (verr) return sendJSON(res, 400, { ok: false, error: verr });

        if (action === "publish") {
          if (arr.length >= COMMUNITY_LIMITS[type].max) {
            return sendJSON(res, 400, { ok: false, error: "ظرفیت این بخش پر شده است" });
          }
          const stored = Object.assign(clean, {
            id: "srv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            author,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          if (importedBy) stored.importedBy = importedBy;
          arr.unshift(stored);
          writeCommunity(data);
          log(`محتوای عمومی جدید (${type}): «${clean.title || clean.name}» اثر ${author}${importedBy ? " (آپلود توسط " + importedBy + ")" : ""}`);
          return sendJSON(res, 200, { ok: true, item: stored });
        }

        // action === update
        arr[editIdx] = Object.assign({}, arr[editIdx], clean, {
          author,
          updatedAt: Date.now(),
        });
        if (importedBy) arr[editIdx].importedBy = importedBy;
        writeCommunity(data);
        return sendJSON(res, 200, { ok: true, item: arr[editIdx] });
      } catch (err) {
        sendJSON(res, 500, { ok: false, error: "خطا در ذخیره‌سازی" });
      }
    });
    return;
  }

  // 👤 رجیستری نام کاربری — بررسی آزاد بودن نام (زنده، هنگام تایپ)
  if (pathname === "/api/username/check") {
    const v = validateUsername(query.get("name"));
    if (v.error) {
      return sendJSON(res, 200, { ok: true, name: String(query.get("name") || ""), available: false, error: v.error });
    }
    // نام باید هم در رجیستری قدیمی و هم در حساب‌های امن آزاد باشد
    const map = readUsernames();
    const taken = Object.prototype.hasOwnProperty.call(map, normUsername(v.name));
    const hasAccount = auth.accountExists(v.name);
    const rec = taken ? map[normUsername(v.name)] : null;
    return sendJSON(res, 200, {
      ok: true,
      name: v.name,
      available: !taken && !hasAccount,
      hasAccount: hasAccount,
      avatar: rec ? rec.avatar || "" : "",
    });
  }

  // ⛔ ثبت نام کاربری «بدون رمز عبور» دیگر مجاز نیست (v8.2)
  // ثبت‌نام فقط از طریق /api/auth/register با رمز عبور انجام می‌شود
  if (pathname === "/api/username/register") {
    return sendJSON(res, 410, {
      ok: false,
      error: "از نسخه‌ی ۸.۲ ثبت‌نام فقط با رمز عبور انجام می‌شود — از پنجره‌ی ورود/ثبت‌نام سایت استفاده کن",
    });
  }

  // 👤 تغییر آواتار — فقط صاحب حساب (با نشست معتبر) (v8.2)
  if (pathname === "/api/username/avatar") {
    if (req.method !== "POST") {
      return sendJSON(res, 405, { ok: false, error: "متد مجاز نیست" });
    }
    const session = auth.verifyToken(auth.tokenFromReq(req));
    if (!session) {
      return sendJSON(res, 401, { ok: false, error: "برای تغییر آواتار اول وارد حساب خودت شو" });
    }
    let rawA = "";
    let abortedA = false;
    req.on("data", (c) => {
      rawA += c;
      if (rawA.length > 16 * 1024) { abortedA = true; req.destroy(); }
    });
    req.on("end", () => {
      if (abortedA) return;
      try {
        const body = JSON.parse(rawA || "{}");
        // نام فقط از نشست خود کاربر — نه از بدنه‌ی درخواست (جلوگیری از دستکاری)
        const name = session.n;
        const avatar = cleanText(body.avatar, 300);
        if (!avatar || !/^(https?:\/\/|images\/)/i.test(avatar)) {
          return sendJSON(res, 400, { ok: false, error: "آواتار نامعتبر است" });
        }
        // آواتار در هر دو فایل به‌روز می‌شود (حساب + رجیستری قدیمی برای سازگاری)
        const accMap = auth.readAccounts();
        const accKey = auth.normName(name);
        if (accMap[accKey]) {
          accMap[accKey].avatar = avatar;
          accMap[accKey].avatarUpdatedAt = Date.now();
          writeAccountsSafe(accMap);
        }
        const map = readUsernames();
        const key = normUsername(name);
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          map[key].avatar = avatar;
          map[key].avatarUpdatedAt = Date.now();
          writeUsernames(map);
        }
        log(`آواتار به‌روز شد: «${name}»`);
        return sendJSON(res, 200, { ok: true, profile: { name: name, avatar: avatar } });
      } catch (err) {
        sendJSON(res, 500, { ok: false, error: "خطا در تغییر آواتار" });
      }
    });
    return;
  }

  // 🔐 مسیرهای حساب کاربری امن (v8.2)
  if (pathname.indexOf("/api/auth/") === 0) {
    return handleAuthAPI(req, res, pathname, query);
  }

  if (pathname === "/api/health") {
    const list = loadPuzzles();
    const rush = loadRushPuzzles();
    // 🎮 v8.3 — تعداد بازی‌های در جریان (برای پایش)
    let activeGameCount = 0;
    try { activeGameCount = onlineModule && onlineModule._test ? onlineModule._test.activeCount() : 0; } catch (e) { activeGameCount = 0; }
    return sendJSON(res, 200, {
      ok: true,
      status: "healthy",
      service: "ChessHub",
      version: VERSION,
      puzzles: list.length,
      rushPuzzles: rush.length,
      usernames: Object.keys(readUsernames()).length,
      accounts: Object.keys(auth.readAccounts()).length,
      activeGames: activeGameCount,
      todayIndex: dailyIndex(list.length),
      date: new Date().toISOString().slice(0, 10),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      // 🔄 وضعیت ماندگاری داده — برای اطمینان مدیر سایت
      persistence: {
        enabled: !!(dataSync && dataSync.enabled()),
        repo: (process.env.GITHUB_REPO || "").trim() || null,
        branch: (process.env.GITHUB_BRANCH || "main").trim() || "main",
      },
    });
  }

  return sendJSON(res, 404, { ok: false, error: "این مسیر API وجود ندارد" });
}

/* ------------------- سرو فایل استاتیک ---------------------- */

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    return res.end("405 — متد مجاز نیست");
  }

  // robots.txt مجازی
  if (pathname === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
    return res.end("User-agent: *\nAllow: /\nDisallow: /api/\n");
  }

  if (pathname === "/") pathname = "/index.html";

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("400 — درخواست نامعتبر");
  }

  // جلوگیری از Path Traversal (حتی به شکل انکود‌شده مثل %2e%2e)
  const filePath = path.normalize(path.join(ROOT, decoded));
  if (filePath !== ROOT && filePath.indexOf(ROOT + path.sep) !== 0) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 — دسترسی مجاز نیست");
  }

  // فایل‌های حساس بک‌اند و فایل‌های مخفی نباید از وب سرو شوند
  // (چک بعد از normalize تا مسیرهای انکود‌شده هم گرفته شوند)
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/").toLowerCase();
  const BLOCKED_REL = [
    "server.js", "package.json", "package-lock.json", "render.yaml", "readme.md",
    "online-server.js", "server-auth.js", "data-sync.js", "worklog.md", "users.json", "online_games.json",
  ];
  if (
    rel.indexOf("data/users") === 0 ||
    rel === "data/online_games.json" ||
    rel === "data/active_games.json" ||
    rel === "data/community_content.json" ||
    rel === "data/usernames.json" ||
    rel === "data/accounts.json" ||
    rel === "data/secret.key" ||
    rel === "data/secret.key.enc" ||
    rel === "data/accounts.json.tmp" ||
    rel === "data/secret.key.tmp"
  ) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 — دسترسی مجاز نیست");
  }
  const hiddenSeg = rel.split("/").some((seg) => seg.charAt(0) === ".");
  if (BLOCKED_REL.indexOf(rel) >= 0 || rel.indexOf(".git/") === 0 || rel === ".git" || hiddenSeg) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 — دسترسی مجاز نیست");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return notFoundPage(res);

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const isText = COMPRESSIBLE.test(mime);

    // کش: HTML/JS/CSS/داده = بدون کش (با ETag/304 که پهنای باند صفر می‌ماند)؛
    // عکس/فونت = یک هفته — به‌روزرسانی سایت همیشه فوراً به مرورگر می‌رسد
    let cacheControl = "no-cache";
    if (ext === ".html" || ext === ".htm") cacheControl = "no-cache";
    else if (ext === ".txt" || ext === ".csv") cacheControl = "no-cache";
    else if (STATIC_ASSETS.test(ext)) cacheControl = "public, max-age=604800";

    const etag = '"' + stat.size + "-" + Number(stat.mtimeMs) + '"';

    // پاسخ 304 — مرورگر نسخه کش‌شده را نگه می‌دارد (پهنای باند صفر)
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, {
        ETag: etag,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      });
      return res.end();
    }

    const headers = {
      "Content-Type": mime,
      "Cache-Control": cacheControl,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };

    // 🔒 v8.3 — هدرهای امنیتی stronger:
    //  • CSP: همه‌چیز فقط از خود سایت؛ inline مجاز (۴ صفحه اسکریپت داخلی دارند)
    //  • 'wasm-unsafe-eval' برای موتور Stockfish (WASM)
    //  • worker-src blob: برای کارگرهای موتور
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
    if (ext === ".html") {
      headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
      headers["Cross-Origin-Opener-Policy"] = "same-origin";
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        log("خطای خواندن فایل " + filePath + ": " + readErr.message);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("500 — خطای داخلی سرور");
      }

      // Gzip خودکار برای فایل‌های متنی بزرگ‌تر از ۱ کیلوبایت
      const acceptsGzip = /gzip/.test(req.headers["accept-encoding"] || "");
      if (isText && data.length > 1024 && acceptsGzip) {
        zlib.gzip(data, (gErr, gz) => {
          if (gErr) {
            headers["Content-Length"] = data.length;
            res.writeHead(200, headers);
            return res.end(req.method === "HEAD" ? undefined : data);
          }
          headers["Content-Encoding"] = "gzip";
          headers["Vary"] = "Accept-Encoding";
          headers["Content-Length"] = gz.length;
          res.writeHead(200, headers);
          res.end(req.method === "HEAD" ? undefined : gz);
        });
        return;
      }

      headers["Content-Length"] = data.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
}

/* ------------------------ سرور ----------------------------- */

const server = http.createServer((req, res) => {
  const start = Date.now();
  let pathname = "/";
  let query = new URLSearchParams();

  try {
    const parsed = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    query = parsed.searchParams;
  } catch (e) {
    /* آدرس خراب → مسیر ریشه */
  }

  res.on("finish", () => {
    log(`${req.method} ${pathname} → ${res.statusCode} (${Date.now() - start}ms)`);
  });

  req.on("error", () => {}); // قطع شدن ناگهانی کلاینت → کرش نکند
  res.on("error", () => {});

  try {
    if (pathname.indexOf("/api/") === 0) {
      return handleAPI(req, res, pathname, query);
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    log("خطای پردازش درخواست: " + err.message);
    return sendJSON(res, 500, { ok: false, error: "Internal Server Error" });
  }
});

// تنظیمات Keep-Alive سازگار با پروکسی Render (جلوگیری از 502 تصادفی)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// ♟️ ماژول بازی آنلاین — WebSocket خالص روی همین سرور
let onlineModule = null;
try {
  onlineModule = require("./online-server");
  onlineModule.attach(server);
} catch (err) {
  log("هشدار: ماژول بازی آنلاین بارگذاری نشد — " + err.message);
}

// 🔄 v8.2 — بعد از ادغام اولیه‌ی گیت‌هاب، داده‌ی بازی آنلاین از دیسک دوباره
// خوانده می‌شود تا هیچ رکوردی که توسط ادغام نجات پیدا کرده از دست نرود
// 🔐 v8.3 — کلید امضای توکن هم ممکن است از گیت‌هاب برگردد (نشست‌ها پایدار می‌مانند)
if (dataSync && onlineModule && typeof onlineModule.reloadFiles === "function") {
  Promise.resolve(dataSync.init())
    .then(function () {
      try { if (auth.reloadTokenSecret) auth.reloadTokenSecret(); } catch (e) {}
      try { onlineModule.reloadFiles(); } catch (e) { log("خطای بارگذاری مجدد داده‌ی بازی آنلاین: " + e.message); }
    })
    .catch(function () {});
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n⚠ پورت ${PORT} اشغال است!`);
    console.error(`  اینطوری امتحان کن:  PORT=${PORT + 1} node server.js\n`);
    process.exit(1);
  }
  log("خطای سرور: " + err.message);
});

server.listen(PORT, HOST, () => {
  const puzzles = loadPuzzles();
  const idx = dailyIndex(puzzles.length);

  console.log("");
  console.log("  ♛ ♛ ♛  ChessHub Server v" + VERSION + "  ♛ ♛ ♛");
  console.log("  ─────────────────────────────────────");
  console.log(`  ▸ لوکال:          http://localhost:${PORT}`);
  console.log(`  ▸ شبکه:           http://0.0.0.0:${PORT}`);
  console.log(`  ▸ API پازل روز:   /api/daily-puzzle`);
  console.log(`  ▸ API عجله‌ای:     /api/rush-puzzles`);
  console.log(`  ▸ سلامت سرور:     /api/health`);
  console.log(`  ▸ محتوای عمومی:   /api/community/content`);
  console.log(`  ▸ نام کاربری:     /api/username/check + /api/username/register + /api/username/avatar`);
  console.log(
    `  ▸ ماندگاری داده:  ` +
      (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO
        ? `فعال (گیت‌هاب) — ریتینگ/بازی‌ها/محتوا با هر دیپلوی می‌ماند`
        : `فقط همین سرور — با هر دیپلوی Render پاک می‌شود (GITHUB_TOKEN بگذار)`)
  );
  console.log(
    `  ▸ پازل‌ها:         ${
      puzzles.length
        ? puzzles.length + " عدد آماده"
        : "فایل data/daily_puzzle.txt پیدا نشد (پازل نمونه داخلی نمایش داده می‌شود)"
    }`
  );
  if (puzzles.length) {
    console.log(`  ▸ پازل امروز:     شماره ${idx + 1} از ${puzzles.length}`);
  }
  const rush = loadRushPuzzles();
  console.log(
    `  ▸ پازل عجله‌ای:    ${
      rush.length
        ? rush.length + " عدد آماده"
        : "فایل data/puzzles.txt پیدا نشد (صفحه عجله‌ای از پازل نمونه داخلی استفاده می‌کند)"
    }`
  );
  console.log("  ─────────────────────────────────────");
  console.log("  توقف سرور: Ctrl+C");
  console.log("");
});

// خاموشی تمیز — Render هنگام دیپلوی جدید سیگنال SIGTERM می‌فرستد
// v8.2: قبل از خاموشی، همه‌ی تغییرات در انتظار «فوراً» به گیت‌هاب کامیت می‌شوند
// تا با ری‌استارت/دیپلوی، هیچ داده‌ای گم نشود
function shutdown(signal) {
  log(`سیگنال ${signal} دریافت شد — خاموشی تمیز…`);
  let closed = false;
  const done = () => { if (!closed) { closed = true; process.exit(0); } };
  const flush = dataSync ? dataSync.flushNow() : Promise.resolve(false);
  flush.then(function (pushed) {
    if (pushed) log("آخرین تغییرات قبل از خاموشی کامیت شد ✅");
    done();
  }, function () { done(); });
  server.close(() => done());
  setTimeout(done, 6000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// جلوگیری از کرش سرور با خطاهای پیش‌بینی‌نشده
process.on("unhandledRejection", (reason) => {
  log("UnhandledRejection: " + (reason && reason.message ? reason.message : reason));
});
process.on("uncaughtException", (err) => {
  log("UncaughtException: " + (err && err.message ? err.message : err));
});
