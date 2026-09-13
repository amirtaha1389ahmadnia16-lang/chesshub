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

const VERSION = "8.0.0";
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

function readCommunity() {
  try {
    const j = JSON.parse(fs.readFileSync(COMMUNITY_FILE, "utf8"));
    return {
      lessons: Array.isArray(j.lessons) ? j.lessons : [],
      openings: Array.isArray(j.openings) ? j.openings : [],
      articles: Array.isArray(j.articles) ? j.articles : [],
    };
  } catch (e) {
    return { lessons: [], openings: [], articles: [] };
  }
}

function writeCommunity(data) {
  fs.mkdirSync(path.dirname(COMMUNITY_FILE), { recursive: true });
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

        // ❌ حذف — فقط نویسنده‌ی همان اثر
        if (action === "delete") {
          const idx = arr.findIndex((x) => String(x.id) === String(body.id));
          if (idx < 0) return sendJSON(res, 404, { ok: false, error: "اثر مورد نظر پیدا نشد" });
          if (normAuthor(arr[idx].author) !== normAuthor(body.item && body.item.author)) {
            return sendJSON(res, 403, { ok: false, error: "فقط نویسنده می‌تواند این اثر را حذف کند" });
          }
          arr.splice(idx, 1);
          writeCommunity(data);
          return sendJSON(res, 200, { ok: true, deleted: String(body.id) });
        }

        // ✍️ انتشار / ویرایش
        const author = cleanText(body.item && body.item.author, 40);
        if (author.length < 2) {
          return sendJSON(res, 400, { ok: false, error: "نام نویسنده الزامی است" });
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
          arr.unshift(stored);
          writeCommunity(data);
          log(`محتوای عمومی جدید (${type}): «${clean.title || clean.name}» اثر ${author}`);
          return sendJSON(res, 200, { ok: true, item: stored });
        }

        // action === update
        const idx = arr.findIndex((x) => String(x.id) === String(body.id));
        if (idx < 0) return sendJSON(res, 404, { ok: false, error: "اثر مورد نظر پیدا نشد" });
        if (normAuthor(arr[idx].author) !== normAuthor(author)) {
          return sendJSON(res, 403, { ok: false, error: "فقط نویسنده می‌تواند این اثر را ویرایش کند" });
        }
        arr[idx] = Object.assign({}, arr[idx], clean, {
          author,
          updatedAt: Date.now(),
        });
        writeCommunity(data);
        return sendJSON(res, 200, { ok: true, item: arr[idx] });
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
    const map = readUsernames();
    const taken = Object.prototype.hasOwnProperty.call(map, normUsername(v.name));
    return sendJSON(res, 200, { ok: true, name: v.name, available: !taken });
  }

  // 👤 ثبت نام کاربری + پروفایل (آواتار) — هر نام فقط «یک بار» در کل سایت
  if (pathname === "/api/username/register") {
    if (req.method !== "POST") {
      return sendJSON(res, 405, { ok: false, error: "متد مجاز نیست" });
    }
    let rawU = "";
    let abortedU = false;
    req.on("data", (c) => {
      rawU += c;
      if (rawU.length > 16 * 1024) { abortedU = true; req.destroy(); }
    });
    req.on("end", () => {
      if (abortedU) return;
      try {
        const body = JSON.parse(rawU || "{}");
        const v = validateUsername(body.name);
        if (v.error) return sendJSON(res, 400, { ok: false, error: v.error });
        const avatar = cleanText(body.avatar, 300);
        if (avatar && !/^(https?:\/\/|images\/)/i.test(avatar)) {
          return sendJSON(res, 400, { ok: false, error: "آواتار نامعتبر است" });
        }
        const map = readUsernames();
        const key = normUsername(v.name);
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          return sendJSON(res, 409, {
            ok: false,
            available: false,
            error: "این نام کاربری قبلاً انتخاب شده است — نام دیگری برگزین",
          });
        }
        const record = { name: v.name, avatar: avatar || "", registeredAt: Date.now() };
        map[key] = record;
        writeUsernames(map);
        log(`نام کاربری جدید ثبت شد: «${v.name}»`);
        return sendJSON(res, 200, { ok: true, profile: { name: record.name, avatar: record.avatar } });
      } catch (err) {
        sendJSON(res, 500, { ok: false, error: "خطا در ثبت نام کاربری" });
      }
    });
    return;
  }

  // 👤 تغییر آواتار (نام برای همیشه قفل است — فقط تصویر پروفایل قابل تغییر است)
  if (pathname === "/api/username/avatar") {
    if (req.method !== "POST") {
      return sendJSON(res, 405, { ok: false, error: "متد مجاز نیست" });
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
        const v = validateUsername(body.name);
        if (v.error) return sendJSON(res, 400, { ok: false, error: v.error });
        const avatar = cleanText(body.avatar, 300);
        if (!avatar || !/^(https?:\/\/|images\/)/i.test(avatar)) {
          return sendJSON(res, 400, { ok: false, error: "آواتار نامعتبر است" });
        }
        const map = readUsernames();
        const key = normUsername(v.name);
        if (!Object.prototype.hasOwnProperty.call(map, key)) {
          return sendJSON(res, 404, { ok: false, error: "این نام کاربری ثبت نشده است" });
        }
        map[key].avatar = avatar;
        map[key].avatarUpdatedAt = Date.now();
        writeUsernames(map);
        log(`آواتار به‌روز شد: «${map[key].name}»`);
        return sendJSON(res, 200, { ok: true, profile: { name: map[key].name, avatar: map[key].avatar } });
      } catch (err) {
        sendJSON(res, 500, { ok: false, error: "خطا در تغییر آواتار" });
      }
    });
    return;
  }

  if (pathname === "/api/health") {
    const list = loadPuzzles();
    const rush = loadRushPuzzles();
    return sendJSON(res, 200, {
      ok: true,
      status: "healthy",
      service: "ChessHub",
      version: VERSION,
      puzzles: list.length,
      rushPuzzles: rush.length,
      usernames: Object.keys(readUsernames()).length,
      todayIndex: dailyIndex(list.length),
      date: new Date().toISOString().slice(0, 10),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
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
    "online-server.js", "worklog.md", "users.json", "online_games.json",
  ];
  if (
    rel.indexOf("lib/") === 0 ||
    rel.indexOf("data/users") === 0 ||
    rel === "data/online_games.json" ||
    rel === "data/community_content.json" ||
    rel === "data/usernames.json"
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
try {
  const online = require("./online-server");
  online.attach(server);
} catch (err) {
  log("هشدار: ماژول بازی آنلاین بارگذاری نشد — " + err.message);
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
function shutdown(signal) {
  log(`سیگنال ${signal} دریافت شد — خاموشی تمیز…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
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
