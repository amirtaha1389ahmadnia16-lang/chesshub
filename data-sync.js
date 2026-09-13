/* ============================================================
   ♛ ChessHub — ماندگاری داده‌ها با گیت‌هاب (v8)
   ------------------------------------------------------------
   مشکل: روی Render فایل‌سستم موقتی است — با هر دیپلوی/ری‌استارت،
   ریتینگ بازیکن‌ها، تاریخچه‌ی بازی‌ها، نام‌های ثبت‌شده و محتوای
   عمومی (data/*.json) پاک می‌شوند.

   راه‌حل این ماژول (اختیاری و صفر-وابستگی):
     • اگر دو متغیر GITHUB_TOKEN و GITHUB_REPO روی Render ست شوند،
       سرور داده‌های data/*.json را به‌صورت debounceشده در همان
       ریپو کامیت می‌کند و در بوت بعدی برمی‌گرداند.
     • پیام کامیت شامل [skip ci] است تا Render دیپلوی جدید نسازد
       (وگرنه حلقه‌ی دیپلوی بی‌پایان درست می‌شد).
     • بدون این متغیرها، همه‌چیز مثل قبل کار می‌کند — صفر تغییر.

   تنظیم روی Render (Environment):
     GITHUB_TOKEN = توکن Personal Access (دسترسی Contents: Read/Write به همین ریپو)
     GITHUB_REPO  = amirtaha1389ahmadnia16-lang/chesshub
     GITHUB_BRANCH = main   (اختیاری — پیش‌فرض main)
   ============================================================ */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname);
const DATA_DIR = path.join(ROOT, "data");
const FILES = ["users.json", "online_games.json", "usernames.json", "community_content.json"];
const PUSH_DEBOUNCE_MS = 8000;   // کامیت‌ها فشرده و کم می‌شوند
const API_GAP_MS = 1500;         // فاصله‌ی حداقلی بین درخواست‌های API

const TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const REPO = (process.env.GITHUB_REPO || "").trim();
const BRANCH = (process.env.GITHUB_BRANCH || "main").trim();
const ENABLED = !!(TOKEN && REPO);

// وضعیت هر فایل
const state = {}; // name → { sha, lastPushedHash, timer, pending, busy }
FILES.forEach(function (n) {
  state[n] = { sha: null, lastPushedHash: null, timer: null, pending: false, busy: false };
});

let initPromise = null;
let apiQueue = [];
let apiBusy = false;

function log(msg) { console.log("[Sync] " + msg); }

/* ---------------- لایه‌ی API (صف‌بندی‌شده) ---------------- */

function apiCall(method, apiPath, bodyObj) {
  return new Promise(function (resolve, reject) {
    apiQueue.push({ method: method, path: apiPath, body: bodyObj, resolve: resolve, reject: reject });
    drainApiQueue();
  });
}

function drainApiQueue() {
  if (apiBusy || !apiQueue.length) return;
  apiBusy = true;
  const job = apiQueue.shift();
  runApi(job.method, job.path, job.body)
    .then(function (r) { job.resolve(r); })
    .catch(function (e) { job.reject(e); })
    .then(function () {
      setTimeout(function () { apiBusy = false; drainApiQueue(); }, API_GAP_MS);
    });
}

function runApi(method, apiPath, bodyObj) {
  return new Promise(function (resolve, reject) {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), "utf8") : null;
    const opts = {
      hostname: "api.github.com",
      port: 443,
      path: apiPath,
      method: method,
      headers: {
        "User-Agent": "ChessHub-Server",
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + TOKEN,
      },
      timeout: 15000,
    };
    if (payload) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = payload.length;
    }
    const req = https.request(opts, function (res) {
      const chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        const err = new Error("GitHub " + res.statusCode + ": " + (json && json.message ? json.message : text.slice(0, 120)));
        err.status = res.statusCode;
        err.body = json;
        reject(err);
      });
    });
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function remotePath(name) {
  return "/repos/" + REPO + "/contents/data/" + encodeURIComponent(name) + "?ref=" + encodeURIComponent(BRANCH);
}

/* ---------------- خواندن/نوشتن ---------------- */

function localRead(name) {
  try { return fs.readFileSync(path.join(DATA_DIR, name), "utf8"); } catch (e) { return null; }
}
function localWrite(name, content) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, name), content);
    return true;
  } catch (e) { return false; }
}
function hashOf(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return String(x) + ":" + str.length;
}

// در بوت: اگر فایل محلی نبود ولی در ریپو بود → بازیابی + کشِ sha برای push
function fetchRemote(name) {
  return apiCall("GET", remotePath(name))
    .then(function (j) {
      const st = state[name];
      st.sha = j && j.sha ? j.sha : null;
      let content = null;
      if (j && j.content) {
        content = Buffer.from(j.content, "base64").toString("utf8");
      } else if (j && j.git_url) {
        // فایل بزرگ‌تر از ۱مگابایت → از blob API بخوان
        return apiCall("GET", "/repos/" + REPO + "/git/blobs/" + j.sha).then(function (b) {
          return Buffer.from(b.content, "base64").toString("utf8");
        });
      }
      return content;
    })
    .catch(function (err) {
      const st = state[name];
      if (err.status === 404) { st.sha = null; return null; } // هنوز در ریپو نیست — طبیعی
      throw err;
    });
}

function pushFile(name) {
  const st = state[name];
  const content = localRead(name);
  if (content == null) return Promise.resolve(false);
  const h = hashOf(content);
  if (st.lastPushedHash === h) return Promise.resolve(false); // تغییری نکرده

  const body = {
    message: "🔄 ChessHub data sync — " + name + " [skip ci]",
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (st.sha) body.sha = st.sha;

  return apiCall("PUT", "/repos/" + REPO + "/contents/data/" + encodeURIComponent(name), body)
    .then(function (j) {
      st.sha = j && j.content && j.content.sha ? j.content.sha : st.sha;
      st.lastPushedHash = h;
      return true;
    })
    .catch(function (err) {
      if (err.status === 409 || err.status === 422 || err.status === 400) {
        // sha کهنه → تازه کن و یک بار دیگر تلاش کن (آخرین نسخه برنده است)
        return fetchRemote(name).then(function () {
          const body2 = {
            message: "🔄 ChessHub data sync — " + name + " (retry) [skip ci]",
            content: Buffer.from(content, "utf8").toString("base64"),
            branch: BRANCH,
          };
          if (state[name].sha) body2.sha = state[name].sha;
          return apiCall("PUT", "/repos/" + REPO + "/contents/data/" + encodeURIComponent(name), body2)
            .then(function (j2) {
              st.sha = j2 && j2.content && j2.content.sha ? j2.content.sha : st.sha;
              st.lastPushedHash = h;
              return true;
            });
        });
      }
      throw err;
    });
}

/* ---------------- API عمومی ---------------- */

// idempotent — چند بار صدا زدن مشکلی ندارد
function init() {
  if (!ENABLED) {
    if (!initPromise) initPromise = Promise.resolve([]);
    return initPromise;
  }
  if (initPromise) return initPromise;
  log("فعال شد — ریپو " + REPO + " (شاخه " + BRANCH + ") — داده‌ها با هر دیپلوی زنده می‌مانند");
  initPromise = (async function () {
    const fetched = [];
    for (const name of FILES) {
      try {
        const remote = await fetchRemote(name);
        const local = localRead(name);
        if (local == null && remote != null) {
          if (localWrite(name, remote)) fetched.push(name);
        } else if (local != null) {
          state[name].lastPushedHash = hashOf(local); // محتوای فعلی مبناست
        }
      } catch (e) {
        log("خطای دریافت " + name + ": " + e.message);
      }
    }
    return fetched;
  })();
  return initPromise;
}

// بعد از هر ذخیره‌ی محلی صدا زده می‌شود — debounce و صف
function pushLater(name) {
  if (!ENABLED) return;
  const st = state[name];
  if (!st) return;
  st.pending = true;
  if (st.timer) return;
  st.timer = setTimeout(function () {
    st.timer = null;
    if (!st.pending || st.busy) return;
    st.pending = false;
    st.busy = true;
    pushFile(name)
      .then(function (pushed) { if (pushed) log("کامیت شد: data/" + name); })
      .catch(function (e) { log("خطای کامیت " + name + ": " + e.message); })
      .then(function () { st.busy = false; });
  }, PUSH_DEBOUNCE_MS);
}

module.exports = { init: init, pushLater: pushLater, enabled: function () { return ENABLED; } };
