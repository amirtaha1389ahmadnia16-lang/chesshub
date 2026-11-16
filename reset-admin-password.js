#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   ChessHub — ابزار بازیابی رمز حساب سوپر ادمین (AdminChessHub)
   ---------------------------------------------------------------
   استفاده:
       node reset-admin-password.js "رمز_جدید"
   مثال:
       node reset-admin-password.js "My#Strong2026!Pass"
   داده در data/accounts.json به‌روز می‌شود؛ بعد از آن می‌توانی با
   نام کاربری AdminChessHub و رمز جدید وارد پنل ادمین شوی
   (admin.html). روی Render هم این فایل در ریشهٔ پروژه است.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const pw = (process.argv[2] || "").trim();
if (pw.length < 6) {
  console.error('✗ رمز جدید را در آرگومان بده — حداقل ۶ کاراکتر:');
  console.error('  node reset-admin-password.js "رمز_جدید"');
  process.exit(1);
}

const FILE = path.join(__dirname, "data", "accounts.json");
const acc = JSON.parse(fs.readFileSync(FILE, "utf8"));
acc.accounts = acc.accounts && typeof acc.accounts === "object" ? acc.accounts : {};

const saltHex = crypto.randomBytes(16).toString("hex");
const salt = Buffer.from(saltHex, "hex");
const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");

acc.accounts.adminchesshub = Object.assign(acc.accounts.adminchesshub || {}, {
  name: "AdminChessHub",
  avatar: acc.accounts.adminchesshub && acc.accounts.adminchesshub.avatar || "",
  email: acc.accounts.adminchesshub && acc.accounts.adminchesshub.email || "",
  salt: saltHex,
  hash: hash,
  createdAt: acc.accounts.adminchesshub && acc.accounts.adminchesshub.createdAt || Date.now(),
  lastLoginAt: Date.now(),
});

const tmp = FILE + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(acc, null, 1));
fs.renameSync(tmp, FILE);
console.log("✓ رمز AdminChessHub با موفقیت ریست شد — حالا با همین رمز وارد admin.html شو");
