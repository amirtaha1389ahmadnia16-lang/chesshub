/* ============================================================
   ♛ ChessHub — سیستم حساب کاربری امن (v8.2)
   ------------------------------------------------------------
   هدف: امنیت حساب‌ها بره بالا — هر کاربر «نام کاربری + رمز عبور»
   دارد؛ بدون رمز عبور ثبت‌نام ممکن نیست.

   ویژگی‌های امنیتی:
     • هش رمز عبور با scrypt (ساخته‌شده در Node — صفر وابستگی)
       + salt تصادفی ۱۶بایتی برای هر کاربر
     • مقایسه با timingSafeEqual (مقاوم به حمله‌ی زمانی)
     • توکن نشست: HMAC-SHA256 امضاشده + تاریخ انقضا (۳۰ روز)
       کلید امضا در data/secret.key (تصادفی، خارج از وب)
     • محدودیت تلاش ورود: ۵ خطا → قفل ۱۰ دقیقه‌ای
     • محدودیت نرخ درخواست (rate limit) برای مسیرهای حساس
     • قواعد رمز: حداقل ۶ حرف، حاوی حرف و رقم، حداکثر ۶۴ حرف

   فایل داده: data/accounts.json  (هرگز برای وب سرو نمی‌شود)
     { "accounts": { "<نرمال‌شده‌ی نام>": {
         name, avatar, salt, hash, createdAt, lastLoginAt } } }

   ارتقای حساب‌های قدیمی (upgrade):
     نام‌های قبلی در data/usernames.json هستند (بدون رمز). با
     /api/auth/upgrade صاحب همان نام، برای خودش رمز انتخاب می‌کند —
     نام و آواتار قبلی‌اش حفظ می‌شود.
   ============================================================ */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname);
const DATA_DIR = path.join(ROOT, "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // ۳۰ روز
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

const PASSWORD_RULES = { min: 6, max: 64 };

let dataSync = null;
try { dataSync = require("./data-sync"); } catch (e) { dataSync = null; }

/* ---------------- نگهداری فایل حساب‌ها ---------------- */

let accountsCache = null;

function readAccounts() {
  if (accountsCache) return accountsCache;
  try {
    const j = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    accountsCache = j && typeof j === "object" && j.accounts && typeof j.accounts === "object"
      ? j.accounts
      : {};
  } catch (e) {
    accountsCache = {};
  }
  return accountsCache;
}

function writeAccounts(map) {
  accountsCache = map;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = ACCOUNTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ accounts: map }));
  fs.renameSync(tmp, ACCOUNTS_FILE);
  if (dataSync) dataSync.pushLater("accounts.json");
}

/* ---------------- کلید امضای توکن ---------------- */

let tokenSecret = null;
function getTokenSecret() {
  if (tokenSecret) return tokenSecret;
  try {
    const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s.length >= 32) { tokenSecret = s; return tokenSecret; }
  } catch (e) { /* نبود — ساخته می‌شود */ }
  tokenSecret = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, tokenSecret, { mode: 0o600 });
  } catch (e) {
    console.error("[Auth] خطا در ذخیره‌ی کلید امضا: " + e.message);
  }
  return tokenSecret;
}

/* ---------------- هش رمز عبور ---------------- */

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p,
  });
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

function verifyPassword(password, saltHex, expectedHashHex) {
  try {
    const { hash } = hashPassword(password, saltHex);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(String(expectedHashHex || ""), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ---------------- توکن نشست (HMAC) ---------------- */

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", getTokenSecret()).update(body).digest());
  return body + "." + sig;
}

// خروجی: payload معتبر یا null (منقضی/دستکاری‌شده)
function verifyToken(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const body = parts[0];
  const expected = crypto.createHmac("sha256", getTokenSecret()).update(body).digest();
  let given;
  try { given = b64urlDecode(parts[1]); } catch (e) { return null; }
  if (!given.length || given.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(given, expected)) return null;
  } catch (e) { return null; }
  let payload = null;
  try { payload = JSON.parse(b64urlDecode(body).toString("utf8")); } catch (e) { return null; }
  if (!payload || typeof payload !== "object") return null;
  if (!payload.u || !payload.n) return null;
  const exp = Number(payload.exp) || 0;
  if (!exp || Date.now() > exp) return null;
  return payload;
}

function issueToken(name) {
  return signToken({ u: String(name).trim().replace(/\s+/g, " ").toLowerCase(), n: String(name), iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS });
}

function tokenFromReq(req) {
  const h = req.headers["x-session-token"] || req.headers["authorization"] || "";
  return String(h).replace(/^Bearer\s+/i, "").trim();
}

/* ---------------- نرمال‌سازی و اعتبارسنجی ---------------- */

function normName(v) {
  return String(v == null ? "" : v).trim().replace(/\s+/g, " ").toLowerCase();
}

function validatePassword(pw, name) {
  const p = String(pw == null ? "" : pw);
  if (p.length < PASSWORD_RULES.min) return "رمز عبور باید حداقل ۶ حرف باشد";
  if (p.length > PASSWORD_RULES.max) return "رمز عبور حداکثر ۶۴ حرف است";
  if (!/[a-zA-Z\u0600-\u06FF]/.test(p)) return "رمز عبور باید حداقل یک حرف داشته باشد";
  if (!/[0-9]/.test(p)) return "رمز عبور باید حداقل یک رقم داشته باشد";
  if (normName(p) === normName(name)) return "رمز عبور نمی‌تواند همان نام کاربری باشد";
  if (/^\s+$|\s{3,}/.test(p)) return "رمز عبور نمی‌تواند فقط فاصله باشد";
  return null;
}

/* ---------------- محدودیت نرخ (rate limit) ---------------- */

const buckets = {}; // key → {count, resetAt}
function rateLimit(key, max, windowMs) {
  if (!key) return true;
  const now = Date.now();
  let b = buckets[key];
  if (!b || now > b.resetAt) {
    buckets[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  b.count += 1;
  if (b.count > max) return false;
  return true;
}
// پاک‌سازی دوره‌ای باکت‌ها — جلوگیری از رشد حافظه
setInterval(function () {
  const now = Date.now();
  Object.keys(buckets).forEach(function (k) {
    if (now > buckets[k].resetAt) delete buckets[k];
  });
}, 15 * 60 * 1000).unref();

/* ---------------- قفل ورود بعد از تلاش‌های ناموفق ---------------- */

const loginFails = {}; // normName → {count, lockedUntil}
function isLoginLocked(key) {
  const f = loginFails[key];
  if (!f) return false;
  if (f.lockedUntil && Date.now() < f.lockedUntil) return true;
  if (f.lockedUntil && Date.now() >= f.lockedUntil) { delete loginFails[key]; }
  return false;
}
function recordLoginFail(key) {
  const f = loginFails[key] || (loginFails[key] = { count: 0, lockedUntil: 0 });
  f.count += 1;
  if (f.count >= MAX_FAILED_LOGINS) {
    f.lockedUntil = Date.now() + LOCKOUT_MS;
    f.count = 0;
  }
}
function clearLoginFails(key) { delete loginFails[key]; }
setInterval(function () {
  const now = Date.now();
  Object.keys(loginFails).forEach(function (k) {
    if (loginFails[k].lockedUntil && now > loginFails[k].lockedUntil) delete loginFails[k];
  });
}, 10 * 60 * 1000).unref();

/* ---------------- عملیات حساب ---------------- */

function accountExists(name) {
  const map = readAccounts();
  return Object.prototype.hasOwnProperty.call(map, normName(name));
}

// ثبت‌نام جدید — رمز عبور «الزامی» است
function registerAccount(name, password, avatar) {
  const map = readAccounts();
  const key = normName(name);
  if (!key) return { error: "نام کاربری الزامی است" };
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return { error: "این نام کاربری قبلاً ثبت شده است — وارد شو یا نام دیگری برگزین", status: 409 };
  }
  const perr = validatePassword(password, name);
  if (perr) return { error: perr, status: 400 };

  const { salt, hash } = hashPassword(password);
  const rec = {
    name: String(name).trim().replace(/\s+/g, " "),
    avatar: String(avatar || "").slice(0, 300),
    salt: salt,
    hash: hash,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  map[key] = rec;
  writeAccounts(map);
  return { ok: true, record: rec, token: issueToken(rec.name) };
}

// ورود — نام + رمز
function loginAccount(name, password) {
  const key = normName(name);
  if (!key) return { error: "نام کاربری و رمز عبور را وارد کن", status: 400 };
  if (isLoginLocked(key)) {
    return { error: "به‌خاطر تلاش‌های ناموفق، این حساب موقتاً قفل شده — ۱۰ دقیقه بعد دوباره امتحان کن", status: 423 };
  }
  const map = readAccounts();
  const rec = map[key];
  if (!rec || !verifyPassword(password, rec.salt, rec.hash)) {
    recordLoginFail(key);
    return { error: "نام کاربری یا رمز عبور اشتباه است", status: 401 };
  }
  clearLoginFails(key);
  rec.lastLoginAt = Date.now();
  writeAccounts(map);
  return { ok: true, record: rec, token: issueToken(rec.name) };
}

// ارتقای حساب قدیمی — نام باید از قبل در رجیستری usernames.json باشد
function upgradeAccount(name, password, avatar) {
  const key = normName(name);
  if (!key) return { error: "نام کاربری الزامی است", status: 400 };
  const map = readAccounts();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return { error: "این حساب قبلاً رمز عبور گرفته — وارد شو", status: 409 };
  }
  // صاحبِ نام: از فایل usernames.json (رجیستری قدیمی)
  let legacy = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "usernames.json"), "utf8"));
    legacy = j && j.usernames ? j.usernames[key] : null;
  } catch (e) { legacy = null; }
  if (!legacy || !legacy.name) {
    return { error: "این نام کاربری در رجیستری سایت پیدا نشد — اگر حساب جدید می‌خواهی، ثبت‌نام کن", status: 404 };
  }
  const perr = validatePassword(password, name);
  if (perr) return { error: perr, status: 400 };

  const { salt, hash } = hashPassword(password);
  const rec = {
    name: legacy.name,
    avatar: avatar || legacy.avatar || "",
    salt: salt,
    hash: hash,
    createdAt: (legacy.registeredAt || Date.now()),
    lastLoginAt: Date.now(),
    upgradedAt: Date.now(),
  };
  map[key] = rec;
  writeAccounts(map);
  return { ok: true, record: rec, token: issueToken(rec.name), legacy: true };
}

// تغییر رمز (کاربر واردشده)
function changePassword(tokenPayload, currentPw, newPw) {
  const map = readAccounts();
  const rec = map[tokenPayload.u];
  if (!rec) return { error: "حساب پیدا نشد", status: 404 };
  if (!verifyPassword(currentPw, rec.salt, rec.hash)) {
    return { error: "رمز عبور فعلی اشتباه است", status: 401 };
  }
  const perr = validatePassword(newPw, rec.name);
  if (perr) return { error: perr, status: 400 };
  const { salt, hash } = hashPassword(newPw);
  rec.salt = salt;
  rec.hash = hash;
  rec.passwordChangedAt = Date.now();
  writeAccounts(map);
  return { ok: true };
}

// پروفایل عمومی امن — هرگز salt/hash بیرون نمی‌رود
function publicProfile(rec) {
  if (!rec) return null;
  return {
    name: rec.name,
    avatar: rec.avatar || "",
    createdAt: rec.createdAt || 0,
    lastLoginAt: rec.lastLoginAt || 0,
  };
}

module.exports = {
  // توکن/نشست
  issueToken: issueToken,
  verifyToken: verifyToken,
  tokenFromReq: tokenFromReq,
  // حساب‌ها
  registerAccount: registerAccount,
  loginAccount: loginAccount,
  upgradeAccount: upgradeAccount,
  changePassword: changePassword,
  accountExists: accountExists,
  readAccounts: readAccounts,
  saveAccounts: writeAccounts,
  publicProfile: publicProfile,
  // نرمال‌سازی
  normName: normName,
  validatePassword: validatePassword,
  // محدودسازی
  rateLimit: rateLimit,
  isLoginLocked: isLoginLocked,
  recordLoginFail: recordLoginFail,
  clearLoginFails: clearLoginFails,
  // برای تست
  _test: { hashPassword: hashPassword, verifyPassword: verifyPassword, signToken: signToken },
};
