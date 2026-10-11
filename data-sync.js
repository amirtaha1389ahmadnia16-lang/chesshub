/* ============================================================
   ♛ ChessHub — ماندگاری داده‌ها با گیت‌هاب (v8.2 — بازنویسی کامل)
   ------------------------------------------------------------
   چرا بازنویسی؟ سه فاجعه واقعی در تاریخچه‌ی ریپو رخ داده بود:
     ۱) بازنویسی داده‌ی کهنه: هر سرور کلِ فایل را با نسخه‌ی
        خودش جایگزین می‌کرد → محتوای تازه‌ی یک کاربر پاک می‌شد
        (درس «چگونه بهترین گشایش…» و «دفاع سیسیلی» دو بار پاک شدند)
     ۲) push ناموفق = گم‌شدن همیشگی: بعد از خطای شبکه، هیچ تلاش
        مجددی انجام نمی‌شد؛ داده فقط روی دیسک موقتی Render می‌ماند
        و با دیپلوی بعدی نابود می‌شد
     ۳) هر کامیت sync = یک دیپلوی Render: صف دیپلوی، قطعی‌های
        طولانی (حس «۳۰ دقیقه تأخیر»)

   راه‌حل v8.2 (صفر وابستگی، مثل قبل):
     • کامیت گروهی: همه‌ی فایل‌های تغییرکرده در «یک» کامیت
       (Git Trees API) — نه چند کامیت پشت‌سرهم
     • ادغام (merge) به‌جای بازنویسی:
         - boot: همیشه نسخه‌ی گیت‌هاب خوانده و با محلی ادغام می‌شود
         - تداخل (۴۰۹/۴۲۲): نسخه‌ی ریموت گرفته، ادغام، بعد push
       ادغام بر اساس id/کلید است؛ آیتم تازه‌تر با updatedAt می‌برد
     • تومب‌سنگ (تombstone): حذف‌ها هم sync می‌شوند و ادغام
       چیزی حذف‌شده را زنده نمی‌کند
     • retry خودکار با backoff (تا ۶ تلاش) — داده دیگر گم نمی‌شود
     • flush هنگام خاموشی (SIGTERM) — آخرین تغییرات قبل از دیپلوی
       کامیت می‌شوند
     • debounce ۱۲ ثانیه + صف API — مصرف API کم و کامیت تمیز

   تنظیم روی Render (Environment):
     GITHUB_TOKEN = توکن Personal Access (Contents: Read/Write)
     GITHUB_REPO  = amirtaha1389ahmadnia16-lang/chesshub
     GITHUB_BRANCH = main   (اختیاری — پیش‌فرض main)

   ⚠️ مهم: در render.yaml مقدار autoDeploy: false شده است؛
   کامیت‌های sync دیگر دیپلوی نمی‌سازند. دیپلوی فقط با
   Manual Deploy یا push کد جدید خودتان انجام می‌شود.
   ============================================================ */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname);
const DATA_DIR = path.join(ROOT, "data");
const FILES = [
  "users.json",
  "online_games.json",
  "usernames.json",
  "community_content.json",
  "accounts.json",
  // v8.3 — بازی‌های در جریان (بقا پس از دیپلوی) + کلید امضای توکن
  // (رمزگذاری‌شده — نشست‌ها با دیپلوی باطل نمی‌شوند)
  "active_games.json",
  "secret.key.enc",
];

const PUSH_DEBOUNCE_MS = 12000;   // جمع‌کردن تغییرات قبل از کامیت
const API_GAP_MS = 1200;          // فاصله‌ی حداقلی بین درخواست‌های API
const MAX_RETRIES = 6;            // تلاش مجدد push در برابر خطا
const RETRY_BASE_MS = 4000;       // شروع backoff
const RETRY_MAX_MS = 120000;      // سقف backoff
const SHUTDOWN_FLUSH_MS = 3500;   // حداکثر زمان flush هنگام خاموشی

const TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const REPO = (process.env.GITHUB_REPO || "").trim();
const BRANCH = (process.env.GITHUB_BRANCH || "main").trim();
const ENABLED = !!(TOKEN && REPO);

// وضعیت هر فایل
const state = {}; // name → { dirty, busy, timer, pendingRetry }
FILES.forEach(function (n) {
  state[n] = { dirty: false, busy: false, timer: null, pendingRetry: false };
});

let initPromise = null;
let flushRequested = false;
let apiQueue = [];
let apiBusy = false;
let batchTimer = null;

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
      timeout: 20000,
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

/* ---------------- خواندن/نوشتن محلی ---------------- */

function localRead(name) {
  try { return fs.readFileSync(path.join(DATA_DIR, name), "utf8"); } catch (e) { return null; }
}
function localWrite(name, content) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = path.join(DATA_DIR, "." + name + ".tmp");
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, path.join(DATA_DIR, name));
    return true;
  } catch (e) { return false; }
}

function hashOf(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return String(x) + ":" + str.length;
}

function parseJSONSafe(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

/* ---------------- منطق ادغام (قلب ضد-گم‌شدن داده) ---------------- */

// کلید یکتا برای ادغام — همان کلیدی که خود سرور برای نام کاربری استفاده می‌کند
function normKey(v) {
  return String(v == null ? "" : v).trim().replace(/\s+/g, " ").toLowerCase();
}

function newerAt(a, b) {
  return (Number(a) || 0) - (Number(b) || 0);
}

// آرایه‌ی اقلام بر اساس id (یا کلید جایگزین) ادغام می‌شود؛ تازه‌تر می‌ماند
function mergeItemArrays(localArr, remoteArr, keyFn, timeFn) {
  const map = {};
  const order = [];
  function add(item, source) {
    if (!item || typeof item !== "object") return;
    const k = keyFn(item);
    if (k == null) return;
    const sk = String(k);
    if (!Object.prototype.hasOwnProperty.call(map, sk)) {
      order.push(sk);
      map[sk] = { item: item, time: timeFn(item) || 0 };
    } else {
      const cur = map[sk];
      const t = timeFn(item) || 0;
      if (t > cur.time) { cur.item = item; cur.time = t; }
      // برابر بودن زمان → نسخه‌ی ریموت (source=remote) برنده است چون
      // احتمالاً نتیجه‌ی سروری تازه‌تری است
      else if (t === cur.time && source === "remote") { cur.item = item; }
    }
  }
  (Array.isArray(localArr) ? localArr : []).forEach(function (x) { add(x, "local"); });
  (Array.isArray(remoteArr) ? remoteArr : []).forEach(function (x) { add(x, "remote"); });
  return order.map(function (k) { return map[k].item; });
}

// جمعِ دو نگاشت کلید→مقدار (usernames / accounts) — مقدار «تازه‌تر» می‌برد
// timeFn: چه چیزی زمانِ رکورد را تعیین می‌کند (پیش‌فرض: updatedAt/registeredAt/createdAt)
function mergeKeyMaps(localMap, remoteMap, timeFn) {
  timeFn = timeFn || function (r) { return newerAt(r && (r.updatedAt || r.registeredAt || r.createdAt), 0); };
  const out = {};
  const L = localMap && typeof localMap === "object" ? localMap : {};
  const R = remoteMap && typeof remoteMap === "object" ? remoteMap : {};
  const keys = Object.keys(L);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    out[k] = L[k];
  }
  const rk = Object.keys(R);
  for (let i = 0; i < rk.length; i++) {
    const k = rk[i];
    if (!Object.prototype.hasOwnProperty.call(out, k)) { out[k] = R[k]; continue; }
    const a = out[k] || {};
    const b = R[k] || {};
    const ta = Number(timeFn(a)) || 0;
    const tb = Number(timeFn(b)) || 0;
    if (tb > ta) out[k] = b;
    else if (tb === ta) {
      // ادغام میدان‌های ساده: آواتار تازه‌تر (avatarUpdatedAt) می‌برد
      const avA = Number(a.avatarUpdatedAt) || 0;
      const avB = Number(b.avatarUpdatedAt) || 0;
      const winner = Object.assign({}, a);
      if (avB > avA && b.avatar) { winner.avatar = b.avatar; winner.avatarUpdatedAt = b.avatarUpdatedAt; }
      if (!winner.name && b.name) winner.name = b.name;
      out[k] = winner;
    }
  }
  return out;
}

// ریتینگ بازیکن: آخرین lastSeen برنده است؛ و حذف تکراری‌های هم‌نام
function mergeUsers(localObj, remoteObj) {
  const merged = mergeKeyMaps(localObj, remoteObj, function (r) {
    return newerAt(r && r.lastSeen, 0);
  });
  // حذف تکراری هم‌نام — جدیدترین lastSeen می‌ماند
  const byName = {};
  const keys = Object.keys(merged);
  const dropped = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const rec = merged[k];
    if (!rec || !rec.name) continue;
    const nk = normKey(rec.name);
    if (!byName[nk]) { byName[nk] = k; continue; }
    const keepKey = byName[nk];
    const keep = merged[keepKey];
    const aSeen = Number(keep.lastSeen) || 0;
    const bSeen = Number(rec.lastSeen) || 0;
    const loserKey = bSeen > aSeen ? keepKey : k;
    const winnerKey = bSeen > aSeen ? k : keepKey;
    if (loserKey !== winnerKey) {
      dropped[loserKey] = true;
      byName[nk] = winnerKey;
    }
  }
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!dropped[k]) out[k] = merged[k];
  }
  return out;
}

function mergeGames(localArr, remoteArr) {
  return mergeItemArrays(localArr, remoteArr,
    function (g) { return g && (g.id || g.gameId); },
    function (g) { return (g && (g.finishedAt || g.updatedAt || g.createdAt)) || 0; });
}

// 🎮 v8.3 — بازی‌های «در جریان»: برنده = نسخه‌ای که آخرین رویداد را داشته
// (lastTick / updatedAt)؛ کلید = id بازی
function mergeActiveGames(localArr, remoteArr) {
  return mergeItemArrays(localArr, remoteArr,
    function (g) { return g && g.id; },
    function (g) { return Math.max(Number(g && g.lastTick) || 0, Number(g && g.updatedAt) || 0); });
}

// 🔑 v8.3 — کلید امضای توکن (رمزگذاری‌شده): برنده = نسخه‌ی با ts بزرگ‌تر.
// هر دو طرف از یک گذرواژه‌ی واحد رمزگشایی می‌کنند؛ مهم فقط این است که
// «یک» کلید واحد در کل سیستم زندگی کند.
function mergeSecretEnc(localText, remoteText) {
  const lp = parseJSONSafe(localText);
  const rp = parseJSONSafe(remoteText);
  if (!rp) return localText;
  if (!lp) return remoteText;
  return (Number(rp.ts) || 0) >= (Number(lp.ts) || 0) ? remoteText : localText;
}

function mergeCommunity(local, remote) {
  const L = local && typeof local === "object" ? local : {};
  const R = remote && typeof remote === "object" ? remote : {};

  // تومب‌سنگ‌ها: id → زمان حذف. ادغام دو طرف؛ آیتم قدیمی‌تر از تومب‌سنگ نمی‌ماند
  const tombs = {};
  const lt = L.deleted && typeof L.deleted === "object" ? L.deleted : {};
  const rt = R.deleted && typeof R.deleted === "object" ? R.deleted : {};
  Object.keys(lt).forEach(function (k) { tombs[k] = Number(lt[k]) || 0; });
  Object.keys(rt).forEach(function (k) {
    if (!tombs[k] || tombs[k] < (Number(rt[k]) || 0)) tombs[k] = Number(rt[k]) || 0;
  });

  function mergeType(type) {
    const merged = mergeItemArrays(L[type], R[type],
      function (x) { return x && x.id; },
      function (x) { return (x && (x.updatedAt || x.createdAt)) || 0; });
    // اعمال تومب‌سنگ‌ها
    return merged.filter(function (x) {
      if (!x || !x.id) return false;
      const t = tombs[String(x.id)];
      if (t) {
        const updated = (x.updatedAt || x.createdAt || 0);
        if (updated <= t) return false; // قبل از حذف بوده → حذف معتبر است
      }
      return true;
    });
  }

  return {
    lessons: mergeType("lessons"),
    openings: mergeType("openings"),
    articles: mergeType("articles"),
    deleted: tombs,
  };
}

// 🔧 v8.2.1 — ترمیم متن‌های دارای نشانگر تداخل گیت
// (فاجعه‌ی واقعی: فایل community_content.json با نشانگرهای
//  <<<<<<< / ======= / >>>>>>> کامیت شد و محتوای عمومی پنهان شد.
//  حالا هر دو نسخه‌ی متعارض خوانده و «اجتماع» آن‌ها ساخته می‌شود)
function unionValues(a, b) {
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
    const timeOf = function (o) { return (o && (o.updatedAt || o.createdAt || o.lastSeen || o.registeredAt || o.finishedAt)) || 0; };
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
    Object.keys(b).forEach(function (k) { out[k] = unionValues(a[k], b[k]); });
    return out;
  }
  return b;
}

function repairConflictText(text) {
  text = String(text == null ? "" : text);
  if (text.indexOf("<<<<<<<") < 0) return text;
  const m = text.match(/^\s*<{7}[^\n]*\n([\s\S]*?)\n={7}\n([\s\S]*?)\n>{7}[^\n]*\n?$/);
  if (!m) return text;
  const a = parseJSONSafe(m[1].trim());
  const b = parseJSONSafe(m[2].trim());
  if (a === null && b === null) return text;
  if (a === null) return m[2].trim();
  if (b === null) return m[1].trim();
  return JSON.stringify(unionValues(a, b));
}

// ادغام دو متن JSON برای فایل مشخص — بر اساس نوع فایل
function mergeFileContent(name, localText, remoteText) {
  // 🔧 اول نشانگرهای تداخل گیت (اگر باشند) ترمیم می‌شوند — بعد ادغام عادی
  if (localText != null) localText = repairConflictText(localText);
  if (remoteText != null) remoteText = repairConflictText(remoteText);
  const localParsed = localText != null ? parseJSONSafe(localText) : null;
  const remoteParsed = remoteText != null ? parseJSONSafe(remoteText) : null;
  if (remoteText == null) return { content: localText, merged: false };
  if (localText == null) return { content: remoteText, merged: true };
  if (localParsed === null) return { content: remoteText, merged: true }; // محلی خراب → ریموت
  if (remoteParsed === null) return { content: localText, merged: false }; // ریموت خراب → محلی
  if (hashOf(JSON.stringify(localParsed)) === hashOf(JSON.stringify(remoteParsed)))
    return { content: localText, merged: false };

  let merged, out;
  switch (name) {
    case "community_content.json":
      merged = mergeCommunity(localParsed, remoteParsed);
      out = { lessons: merged.lessons, openings: merged.openings, articles: merged.articles, deleted: merged.deleted };
      break;
    case "usernames.json":
      out = { usernames: mergeKeyMaps(localParsed.usernames, remoteParsed.usernames) };
      break;
    case "accounts.json":
      out = { accounts: mergeKeyMaps(localParsed.accounts, remoteParsed.accounts) };
      break;
    case "users.json":
      out = mergeUsers(localParsed, remoteParsed);
      break;
    case "online_games.json":
      out = mergeGames(localParsed, remoteParsed);
      break;
    case "active_games.json":
      out = mergeActiveGames(localParsed, remoteParsed);
      break;
    case "secret.key.enc":
      return { content: mergeSecretEnc(localText, remoteText), merged: true };
    default:
      return { content: remoteText, merged: true };
  }
  return { content: JSON.stringify(out), merged: true };
}

/* ---------------- خواندن ریموت ---------------- */

function remotePath(name) {
  return "/repos/" + REPO + "/contents/data/" + encodeURIComponent(name) + "?ref=" + encodeURIComponent(BRANCH);
}

function fetchRemote(name) {
  return apiCall("GET", remotePath(name))
    .then(function (j) {
      let content = null;
      if (j && j.content) {
        content = Buffer.from(j.content, "base64").toString("utf8");
      } else if (j && j.sha && j.git_url) {
        // فایل بزرگ‌تر از ۱مگابایت → از blob API بخوان
        return apiCall("GET", "/repos/" + REPO + "/git/blobs/" + j.sha).then(function (b) {
          return Buffer.from(b.content, "base64").toString("utf8");
        });
      }
      return content;
    })
    .catch(function (err) {
      if (err.status === 404) return null; // هنوز در ریپو نیست — طبیعی
      throw err;
    });
}

/* ---------------- کامیت گروهی (Git Trees API) ----------------
   همه‌ی فایل‌های dirty در «یک» کامیت ثبت می‌شوند:
     GET ref → GET commit → POST tree (با base_tree) → POST commit → PATCH ref
--------------------------------------------------------------- */

function batchPush() {
  const changed = FILES.filter(function (n) { return state[n].dirty; });
  if (!changed.length) return Promise.resolve(false);

  const contents = {};
  const blobs = [];
  changed.forEach(function (n) {
    const c = localRead(n);
    if (c == null) return;
    contents[n] = c;
    blobs.push({ path: "data/" + n, content: c });
  });
  if (!blobs.length) return Promise.resolve(false);

  const msg =
    "🔄 ChessHub data sync (" + blobs.length + " file" + (blobs.length > 1 ? "s" : "") + ") [skip ci]";

  return apiCall("GET", "/repos/" + REPO + "/git/ref/heads/" + encodeURIComponent(BRANCH))
    .then(function (ref) {
      const baseSha = ref && ref.object && ref.object.sha;
      if (!baseSha) throw new Error("مرجع شاخه پیدا نشد");
      return apiCall("GET", "/repos/" + REPO + "/git/commits/" + baseSha).then(function (commit) {
        return { baseSha: baseSha, baseTree: commit && commit.tree && commit.tree.sha };
      });
    })
    .then(function (ctx) {
      return apiCall("POST", "/repos/" + REPO + "/git/trees", {
        base_tree: ctx.baseTree,
        tree: blobs.map(function (b) {
          return { path: b.path, mode: "100644", type: "blob", content: b.content };
        }),
      }).then(function (tree) { return { baseSha: ctx.baseSha, treeSha: tree && tree.sha }; });
    })
    .then(function (ctx) {
      return apiCall("POST", "/repos/" + REPO + "/git/commits", {
        message: msg,
        tree: ctx.treeSha,
        parents: [ctx.baseSha],
      }).then(function (commit) { return { commitSha: commit && commit.sha }; });
    })
    .then(function (ctx) {
      return apiCall("PATCH", "/repos/" + REPO + "/git/refs/heads/" + encodeURIComponent(BRANCH), {
        sha: ctx.commitSha,
        force: false,
      });
    })
    .then(function () {
      changed.forEach(function (n) {
        if (contents[n] != null) state[n].dirty = false;
      });
      log("کامیت گروهی شد: " + blobs.map(function (b) { return b.path.replace("data/", ""); }).join(", "));
      return true;
    })
    .catch(function (err) {
      if (err.status === 404 && String(err.message || "").indexOf("Ref not found") >= 0) {
        // شاخه هنوز وجود ندارد → کامیت بدون والد (اولین کامیت) — نادر
        throw err;
      }
      throw err;
    });
}

// تلاش مجدد با backoff — داده هرگز به‌خاطر یک خطای موقت گم نمی‌شود
function batchPushWithRetry(attempt) {
  attempt = attempt || 1;
  return batchPush().catch(function (err) {
    if (attempt >= MAX_RETRIES) {
      log("پس از " + attempt + " تلاش ناموفق بود: " + err.message + " — داده محلی سالم است، بعداً دوباره تلاش می‌شود");
      // تغییرات نگه داشته می‌شوند (dirty برنمی‌گردد به false) — از طریق scheduleBatch دوباره
      FILES.forEach(function (n) { if (localRead(n) != null && state[n].pendingRetry) state[n].dirty = true; });
      scheduleBatch(RETRY_MAX_MS);
      throw err;
    }
    // تداخل ref (کسی هم‌زمان push کرده) → ریموت را ادغام کن و دوباره
    const isConflict = err.status === 409 || err.status === 422 || err.status === 400;
    const wait = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), RETRY_MAX_MS);
    if (isConflict) {
      log("تداخل هنگام کامیت (تلاش " + attempt + ") — ادغام با نسخه‌ی گیت‌هاب و تلاش مجدد…");
      return mergeRemoteIntoAll().catch(function () {})
        .then(function () { return delay(wait); })
        .then(function () { return batchPushWithRetry(attempt + 1); });
    }
    log("خطای شبکه در کامیت (تلاش " + attempt + "): " + err.message + " — تلاش مجدد پس از " + Math.round(wait / 1000) + "s");
    return delay(wait).then(function () { return batchPushWithRetry(attempt + 1); });
  });
}

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function scheduleBatch(delayMs) {
  if (!ENABLED) return;
  if (batchTimer) return; // قبلاً زمان‌بندی شده
  batchTimer = setTimeout(function () {
    batchTimer = null;
    const anyDirty = FILES.some(function (n) { return state[n].dirty; });
    if (!anyDirty) return;
    FILES.forEach(function (n) { state[n].pendingRetry = state[n].dirty; });
    batchPushWithRetry(1).catch(function () {});
  }, delayMs == null ? PUSH_DEBOUNCE_MS : delayMs);
  if (batchTimer.unref) batchTimer.unref();
}

/* ---------------- ادغام ریموت ← محلی ---------------- */

function mergeRemoteIntoAll() {
  const results = [];
  let chain = Promise.resolve();
  FILES.forEach(function (name) {
    chain = chain.then(function () {
      return fetchRemote(name)
        .then(function (remote) {
          if (remote == null) return;
          const local = localRead(name);
          const r = mergeFileContent(name, local, remote);
          if (r.merged && r.content != null) {
            localWrite(name, r.content);
            results.push(name);
          }
        })
        .catch(function (e) {
          log("خطای ادغام " + name + ": " + e.message);
        });
    });
  });
  return chain.then(function () { return results; });
}

/* ---------------- API عمومی ---------------- */

// idempotent — چند بار صدا زدن مشکلی ندارد
function init() {
  if (!ENABLED) {
    if (!initPromise) initPromise = Promise.resolve([]);
    return initPromise;
  }
  if (initPromise) return initPromise;
  log("فعال شد (v8.2 merge-safe) — ریپو " + REPO + " (شاخه " + BRANCH + ")");
  initPromise = (async function () {
    // ۱) همیشه ریموت خوانده و با محلی ادغام می‌شود — نه فقط وقتی محلی خالی است
    let merged = [];
    let missingRemote = [];
    try {
      merged = await mergeRemoteIntoAll();
      if (merged.length) log("ادغام اولیه با گیت‌هاب: " + merged.join(", "));
    } catch (e) {
      log("خطای ادغام اولیه: " + e.message);
    }
    // ۲) فایل‌هایی که در گیت‌هاب نیستند ولی محلی داده دارند → باید push شوند
    //    (ریپوی تازه، حذف تصادفی فایل از ریپو، یا داده‌ی نجات‌یافته)
    for (const n of FILES) {
      const local = localRead(n);
      if (local == null) continue;
      const remote = await fetchRemote(n).catch(function () { return null; });
      if (remote == null) missingRemote.push(n);
    }
    if (merged.length || missingRemote.length) {
      FILES.forEach(function (n) {
        if (localRead(n) == null) return;
        if (missingRemote.indexOf(n) >= 0 || merged.indexOf(n) >= 0) state[n].dirty = true;
      });
      scheduleBatch(3000);
    }
    return merged;
  })();
  return initPromise;
}

// بعد از هر ذخیره‌ی محلی صدا زده می‌شود — debounce و کامیت گروهی
function pushLater(name) {
  if (!ENABLED) return;
  const st = state[name];
  if (!st) return;
  st.dirty = true;
  scheduleBatch();
}

// فوراً push کن (هنگام خاموشی سرور) — حداکثر SHUTDOWN_FLUSH_MS منتظر می‌ماند
function flushNow() {
  if (!ENABLED) return Promise.resolve(false);
  if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
  const anyDirty = FILES.some(function (n) { return state[n].dirty; });
  if (!anyDirty) return Promise.resolve(false);
  FILES.forEach(function (n) { state[n].pendingRetry = state[n].dirty; });
  const p = batchPushWithRetry(1).then(
    function () { return true; },
    function () { return false; }
  );
  // محدودیت زمانی — خاموشی نباید بیش از حد طول بکشد
  const timeout = new Promise(function (r) { setTimeout(function () { r(false); }, SHUTDOWN_FLUSH_MS).unref(); });
  return Promise.race([p, timeout]);
}

module.exports = {
  init: init,
  pushLater: pushLater,
  flushNow: flushNow,
  enabled: function () { return ENABLED; },
  // 🔧 هوک تست — منطق ادغام را بدون شبکه قابل تست می‌کند
  _test: {
    mergeFileContent: mergeFileContent,
    repairConflictText: repairConflictText,
    unionValues: unionValues,
    mergeCommunity: mergeCommunity,
    mergeKeyMaps: mergeKeyMaps,
    mergeUsers: mergeUsers,
    mergeGames: mergeGames,
    mergeActiveGames: mergeActiveGames,
    mergeSecretEnc: mergeSecretEnc,
    mergeItemArrays: mergeItemArrays,
    normKey: normKey,
  },
};
