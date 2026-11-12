/* ============================================================
   🎓 ChessHub — آکادمی آخربازی نسخه ۳ — «مربی واقعی»
   ------------------------------------------------------------
   انجین Stockfish موقعیت را کامل تحلیل می‌کند:
   • همه‌ی حرکات قانونی نمره می‌گیرند (برنده / مساوی / بازنده)
   • حرکت غلط → نمایش زنده‌ی ادامه‌ی بازی و تغییر برتری
   • هر FEN داخل data/endgames.json خودکار تبدیل به کارت درس می‌شود
   • چالش: تایمر دلخواه + بات تشخیص ضعف، بدون هیچ بازخورد حرکتی
   ============================================================ */
(function () {
  "use strict";

  // ===== اعمال تم ذخیره‌شده =====
  (function applySavedTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (settings && settings.theme) {
        document.body.className = document.body.className
          .split(" ")
          .filter((c) => !c.startsWith("theme-"))
          .join(" ");
        document.body.classList.add("theme-" + settings.theme);
      }
    } catch (e) {}
  })();

  // ===== ابزارهای پایه =====
  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n) {
    return String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);
  }
  function $(id) {
    return document.getElementById(id);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // ===== مهره‌ها (تصویر با فالبک گلیف) =====
  const GLYPHS = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  let pieceSet = "neo";
  let glyphMode = false; // true = تصاویر نیست → گلیف یونیکد

  function getCurrentPieceSet() {
    try {
      const s = JSON.parse(localStorage.getItem("chesshub_settings"));
      return (s && s.pieceSet) || "neo";
    } catch (e) {
      return "neo";
    }
  }
  // ⚠ تم‌های سایت روی body تعریف می‌شوند (body.theme-X) — پس باید از body خوانده شود
  // (documentElement هیچ‌وقت متغیر تم را ندارد و همیشه رنگ پیش‌فرض برمی‌گشت)
  function getBoardColors() {
    const host = document.body || document.documentElement;
    const light = getComputedStyle(host).getPropertyValue("--board-light").trim() || "#f0d9b5";
    const dark = getComputedStyle(host).getPropertyValue("--board-dark").trim() || "#b58863";
    return { light, dark };
  }
  // بررسی یک‌باره‌ی موجودی تصاویر ست مهره؛ اگر نبود گلیف می‌کشیم
  function probePieceSet() {
    pieceSet = getCurrentPieceSet();
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        glyphMode = !ok;
        resolve(ok);
      };
      img.onload = () => finish(img.naturalWidth > 1);
      img.onerror = () => finish(false);
      setTimeout(() => finish(false), 2500);
      img.src = "pieces/" + pieceSet + "/wp.png";
    });
  }
  function makePieceEl(color, type) {
    if (glyphMode) {
      // گلیف یونیکد داخل SVG تا با اندازه‌ی خانه مقیاس شود
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("class", "piece-glyph");
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", "50");
      t.setAttribute("y", "55");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-size", "80");
      t.setAttribute("fill", color === "w" ? "#3d4a5c" : "#1a202c");
      if (color === "w") {
        t.setAttribute("stroke", "#f7fafc");
        t.setAttribute("stroke-width", "1.2");
      }
      t.textContent = GLYPHS[color][type];
      svg.appendChild(t);
      return svg;
    }
    const img = document.createElement("img");
    img.className = "piece-img";
    img.draggable = false;
    img.src = "pieces/" + pieceSet + "/" + color + type + ".png";
    img.onerror = function () {
      // اگر تصویر مهره‌ی خاصی نبود، همان‌جا گلیف بگذار
      glyphMode = true;
      const s = makePieceEl(color, type);
      img.replaceWith(s);
    };
    return img;
  }

  // ===== امتیاز انجین =====
  // score از دیدِ «طرف نوبت‌دار» است؛ مات هم فاصله‌اش لحاظ می‌شود
  function cpOf(score) {
    if (!score) return 0;
    if (score.type === "cp") return clamp(score.value, -12000, 12000);
    return score.value > 0
      ? 10000 - score.value * 100
      : -10000 + Math.abs(score.value) * 100;
  }
  function fmtCp(cp, fromUser) {
    // نمایش خوانا: ‎+۴٫۲ / ‎−۱٫۳ / مات در ۵
    if (cp >= 9000) return "مات در " + fa(Math.max(1, Math.ceil((10000 - cp) / 100 / 2)));
    if (cp <= -9000) return "مات در برابر تو در " + fa(Math.max(1, Math.ceil((10000 + cp) / 100 / 2)));
    const v = cp / 100;
    const s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
    return fromUser ? s.replace(/\d/g, (d) => FA_DIGITS[+d]).replace(".", "٫") : s;
  }

  // 🧭 طبقه‌بندی موقعیت — «برد یا مساوی» را انجین می‌گوید، نه ستون نتیجه‌ی داده.
  // کاربر فقط FEN می‌دهد؛ آستانه‌ها به «تعداد مهره‌ها» حساس‌اند:
  //   آخربازی خالص (≤۷ مهره): برتری ۱۵۰cp = برنده (مثل برتری یک پیاده‌ی سالم)
  //   موقعیت‌های شلوغ‌تر: ۲۵۰cp تا نویز انجین حکم غلط ندهد
  function winThresholdOf(fen) {
    return pieceCountOf(fen) <= 7 ? 150 : 250;
  }
  function posClassOf(bestCp, fen) {
    const th = fen ? winThresholdOf(fen) : 250;
    if (bestCp >= th) return "win";
    if (bestCp <= -th) return "lose";
    return "draw";
  }
  // 🏷 برچسب انسانی برتری — دیگر «برتری یک پیاده = مساوی» نیست!
  function posTierOf(cp) {
    if (cp >= 300) return { tier: "decisive", fa: "برتری قاطع", cls: "t-win" };
    if (cp >= 150) return { tier: "clear", fa: "برتری روشن", cls: "t-win" };
    if (cp >= 80) return { tier: "pawn", fa: "برتری جزئی (حدود یک پیاده)", cls: "t-edge" };
    if (cp >= 30) return { tier: "tiny", fa: "برتری کم‌وزن", cls: "t-edge" };
    if (cp <= -300) return { tier: "decisive", fa: "محکوم به باخته — دفاع کن", cls: "t-lose" };
    if (cp <= -150) return { tier: "clear", fa: "در برتری حریف — دفاع دقیق لازم است", cls: "t-lose" };
    if (cp <= -80) return { tier: "pawn", fa: "حریف برتری جزئی دارد — قابل دفاع", cls: "t-edge" };
    if (cp <= -30) return { tier: "tiny", fa: "حریف برتری کم‌وزن دارد", cls: "t-edge" };
    return { tier: "equal", fa: "تعادل کامل", cls: "t-eq" };
  }

  // ===== 🧠 ماژول انجین (صف دستورات) =====
  let engine = null;
  let engineReady = false;
  let engineAvailable = false;
  const engineQueue = [];
  let engineBusy = false;
  let currentSkill = null;
  let offlineNoticeShown = false;
  let engineWatchdog = null;

  // اگر انجین وسط کار مرد یا جواب نداد، صف را خالی کن تا رابط هیچ‌وقت قفل نشود
  function flushEngineQueue() {
    engineBusy = false;
    clearTimeout(engineWatchdog);
    while (engineQueue.length) {
      const j = engineQueue.shift();
      if (j && j.resolve) j.resolve({ move: null, score: null, pv: [] });
    }
  }

  function initEngine() {
    if (typeof Worker === "undefined") return;
    try {
      engine = new Worker("js/stockfish.js");
      engine.onmessage = function (e) {
        const line = typeof e.data === "string" ? e.data : (e.data && e.data.data) || "";
        handleEngineLine(line);
      };
      engine.onerror = function () {
        engineReady = false;
        engineAvailable = false;
        flushEngineQueue();
      };
      engine.postMessage("uci");
    } catch (err) {
      engine = null;
    }
    setTimeout(() => {
      if (!engineAvailable) showEngineOfflineNotice();
    }, 6000);
  }

  function handleEngineLine(line) {
    if (!line) return;
    if (line === "uciok") {
      engineReady = true;
      engineAvailable = true;
      engine.postMessage("setoption name UCI_Chess960 value false");
      engine.postMessage("isready");
      document.dispatchEvent(new CustomEvent("engineReady"));
      pumpEngine();
      return;
    }
    if (line.startsWith("info")) {
      const job = engineQueue[0];
      if (job) {
        const sm = line.match(/score (cp|mate) (-?\d+)/);
        if (sm) job.score = { type: sm[1], value: parseInt(sm[2], 10) };
        // گرفتن خط اصلی (PV) برای نمایش «ادامه‌ی بازی» به کاربر
        const pi = line.indexOf(" pv ");
        if (pi > 0) {
          const pv = line
            .slice(pi + 4)
            .trim()
            .split(/\s+/)
            .filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
          if (pv.length) job.pv = pv;
        }
      }
      return;
    }
    if (line.startsWith("bestmove")) {
      clearTimeout(engineWatchdog);
      const job = engineQueue.shift();
      engineBusy = false;
      const bm = line.split(/\s+/)[1] || "";
      let move = null;
      if (bm && bm !== "(none)") {
        move = {
          from: bm.slice(0, 2),
          to: bm.slice(2, 4),
          promotion: bm.length === 5 ? bm[4] : null,
        };
      }
      if (job && job.resolve) job.resolve({ move, score: job.score || null, pv: job.pv || [] });
      pumpEngine();
    }
  }

  function pumpEngine() {
    if (engineBusy || !engineQueue.length || !engineReady) return;
    engineBusy = true;
    const job = engineQueue[0];
    if (job.skill !== currentSkill) {
      currentSkill = job.skill;
      engine.postMessage("setoption name Skill Level value " + currentSkill);
    }
    engine.postMessage("stop");
    engine.postMessage("position fen " + job.fen);
    engine.postMessage(job.go);
    // 🛑 سگ‌منت‌گارد: اگر انجین به bestmove نرسید (کرش/هنگ)، جواب خالی بده تا صف پیش برود
    clearTimeout(engineWatchdog);
    engineWatchdog = setTimeout(() => {
      const j = engineQueue.shift();
      engineBusy = false;
      if (j && j.resolve) j.resolve({ move: null, score: null, pv: [] });
      pumpEngine();
    }, (job.movetimeMs || 800) + 7000);
  }

  // fen ← موقعیت؛ opts: {movetime, depth, skill}
  function askEngine(fen, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!engineAvailable) {
        resolve({ move: null, score: null, pv: [] });
        return;
      }
      let go = "go";
      if (opts.depth) go += " depth " + opts.depth;
      if (opts.movetime) go += " movetime " + opts.movetime;
      if (!opts.depth && !opts.movetime) go += " depth 12";
      engineQueue.push({
        fen,
        go,
        skill: opts.skill || 20,
        resolve,
        score: null,
        pv: [],
        movetimeMs: opts.movetime || 0,
      });
      pumpEngine();
    });
  }

  function showEngineOfflineNotice() {
    if (offlineNoticeShown) return;
    offlineNoticeShown = true;
    const sec = $("academySection");
    if (sec && !sec.hidden) {
      const div = document.createElement("div");
      div.className = "engine-offline";
      div.innerHTML =
        '<i class="fas fa-plug"></i> انجین Stockfish بارگذاری نشد — فایل <b>js/stockfish.js</b> باید کنار بقیه‌ی فایل‌ها باشد. فعلاً حریف تصادفی بازی می‌کند و تحلیل غیرفعال است.';
      sec.insertBefore(div, sec.firstChild);
    }
  }

  function moveCoordToSan(fen, from, to, promotion) {
    try {
      const tmp = new Chess();
      if (!tmp.load(fen)) return from + "-" + to;
      const mv = tmp.move({ from, to, promotion: promotion || "q" });
      return mv ? mv.san : from + "-" + to;
    } catch (e) {
      return from + "-" + to;
    }
  }

  // ===== 💾 کش تحلیل‌ها (localStorage با سقف) — v4: تحلیل عمیق‌تر + خط اصلی =====
  const EVAL_CACHE_KEY = "chesshub_eg_evals_v5";
  const EVAL_CACHE_MAX = 800;
  function evalCacheAll() {
    try {
      return JSON.parse(localStorage.getItem(EVAL_CACHE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function fenKeyOf(fen) {
    return fen.split(" ").slice(0, 2).join(" ");
  }
  function evalCacheGet(key) {
    const all = evalCacheAll();
    return all[key] || null;
  }
  function evalCachePut(key, data) {
    try {
      const all = evalCacheAll();
      all[key] = data;
      const keys = Object.keys(all);
      if (keys.length > EVAL_CACHE_MAX) {
        keys
          .sort((a, b) => (all[a].t || 0) - (all[b].t || 0))
          .slice(0, keys.length - EVAL_CACHE_MAX)
          .forEach((k) => delete all[k]);
      }
      localStorage.setItem(EVAL_CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  window.clearEndgameEvalCache = function () {
    try {
      localStorage.removeItem(EVAL_CACHE_KEY);
    } catch (e) {}
  };

  // ===== 🎛 آپشن‌های مربی (انتخاب کاربر — ماندگار) =====
  // آپشن‌هایی که آموزش را بهتر می‌کنند:
  //   depthMult: قدرت تحلیل انجین (سریع/متوازن/عمیق)
  //   showPV: نمایش «خط اصلی انجین» روی حباب مربی
  //   showEvalBar: نمایش نوار ارزیابی
  //   autoCorrectArrow: بعد از خطا، فلش حرکت درست خودکار نشان داده شود
  //   humanDelay: پاسخ انجین با مکث طبیعی (مثل حریف انسانی) — فرصت فکر
  const COACH_OPTS_KEY = "chesshub_eg_coach_opts";
  const COACH_DEFAULTS = { depthMult: 1, showPV: true, showEvalBar: true, autoCorrectArrow: false, humanDelay: true };
  let COACH_OPTS = (function () {
    try { return { ...COACH_DEFAULTS, ...(JSON.parse(localStorage.getItem(COACH_OPTS_KEY)) || {}) }; }
    catch (e) { return { ...COACH_DEFAULTS }; }
  })();
  function saveCoachOpts() {
    try { localStorage.setItem(COACH_OPTS_KEY, JSON.stringify(COACH_OPTS)); } catch (e) {}
  }
  window.chesshubCoachOpts = {
    get: function () { return { ...COACH_OPTS }; },
    set: function (patch) {
      COACH_OPTS = { ...COACH_OPTS, ...patch };
      saveCoachOpts();
      document.dispatchEvent(new CustomEvent("coachOptsChanged"));
      return { ...COACH_OPTS };
    },
  };

  // ===== 🔍 تحلیل کامل موقعیت (همه‌ی حرکات) =====
  // خروجی: {fen, map:{uci:cp}, pvs:{uci:[uci...]}, bestUci, bestCp, legal, counts, tone}

  // عمق تحلیل هوشمند: هرچه مهره‌ها کمتر (آخربازی خالص‌تر)، انجین عمیق‌تر فکر می‌کند
  function pieceCountOf(fen) {
    let n = 0;
    for (const ch of fen.split(" ")[0]) if (/[a-zA-Z]/.test(ch)) n++;
    return n;
  }
  function adaptiveAnalysis(fen) {
    const n = pieceCountOf(fen);
    const m = COACH_OPTS.depthMult; // ضریب انتخابی کاربر: ۰٫۶ سریع / ۱ متوازن / ۱٫۶ عمیق
    if (n <= 4) return { movetime: Math.round(600 * m), depth: Math.min(30, Math.round(26 * Math.max(1, m))) }; // آخربازی خالص — نهایت دقت
    if (n <= 6) return { movetime: Math.round(450 * m), depth: Math.min(28, Math.round(22 * Math.max(1, m))) };
    if (n <= 8) return { movetime: Math.round(350 * m), depth: Math.min(26, Math.round(20 * Math.max(1, m))) };
    if (n <= 12) return { movetime: Math.round(300 * m), depth: Math.round(18 * Math.max(1, m)) };
    return { movetime: Math.round(260 * m), depth: Math.round(16 * Math.max(1, m)) };
  }

  async function analyzePosition(fen, opts) {
    opts = opts || {};
    const key = fenKeyOf(fen);
    const adaptive = adaptiveAnalysis(fen);
    let data = evalCacheGet(key);
    if (!data) {
      const g = new Chess();
      if (!g.load(fen)) return null;
      const legal = g.moves({ verbose: true });
      const map = {};
      const pvs = {};
      for (let i = 0; i < legal.length; i++) {
        if (opts.T && opts.epoch != null && opts.T.epoch !== opts.epoch) return null; // منصرف شد
        const m = legal[i];
        g.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
        const child = g.fen();
        g.undo();
        const u = m.from + m.to + (m.promotion || "");
        const r = await askEngine(child, {
          movetime: opts.movetime || adaptive.movetime,
          depth: opts.depth || adaptive.depth,
          skill: 20,
        });
        // امتیاز از دید حرکت‌زننده (نوبت‌دارِ fen اصلی) = منفیِ دید حریف در موقعیت فرزند
        map[u] = r.score ? -cpOf(r.score) : 0;
        // خط اصلی از دید حریف — با حرکت بهترین خودمان اول خط شروع می‌شود
        if (r.pv && r.pv.length) pvs[u] = r.pv.slice(0, 10);
        if (opts.onProgress) opts.onProgress(i + 1, legal.length);
      }
      let bestUci = null;
      let bestCp = -Infinity;
      legal.forEach((m) => {
        const u = m.from + m.to + (m.promotion || "");
        if (map[u] > bestCp) {
          bestCp = map[u];
          bestUci = u;
        }
      });
      data = { u: map, b: bestUci, p: pvs, t: Date.now() };
      evalCachePut(key, data);
    }
    const g = new Chess();
    g.load(fen);
    const legal = g.moves({ verbose: true });
    const pvs = data.p || {};
    let bestCp = -Infinity;
    let bestUci = data.b;
    let winCount = 0;
    let holdCount = 0;
    legal.forEach((m) => {
      const u = m.from + m.to + (m.promotion || "");
      const cp = data.u[u];
      if (typeof cp !== "number") return;
      if (cp > bestCp) {
        bestCp = cp;
        bestUci = u;
      }
      if (cp >= 200) winCount++;
      if (cp >= -120) holdCount++;
    });
    const winTh = winThresholdOf(fen);
    let tone = "draw";
    if (bestCp >= winTh) tone = "win";
    else if (bestCp <= -winTh) tone = "lose";
    return {
      fen,
      map: data.u,
      pvs,
      legal,
      bestUci,
      bestCp,
      winCount,
      holdCount,
      tone,
      cached: !!evalCacheGet(key),
    };
  }

  // ===== ⚖️ نمره‌دهی حرکت نسبت به بهترین =====
  // kind: best | good | soft | draw (از برد به مساوی) | lose
  // 🏷 کلاس‌آگاه و آستانه‌ی حساس به تعداد مهره — برتری یک پیاده دیگر «مساوی» نیست
  function gradeMove(an, from, to, promotion) {
    const uci = from + to + (promotion || "");
    const cp = an.map[uci];
    const bestCp = an.bestCp;
    if (typeof cp !== "number") return null;
    const gap = Math.max(0, bestCp - cp);
    const th = an.fen ? winThresholdOf(an.fen) : 250;
    const cls = posClassOf(bestCp, an.fen);
    let kind;
    if (cls === "win") {
      if (cp >= th) {
        // هنوز برنده/برتری حفظ شده — حرکتِ برنده هرگز «باخت» نیست؛ فقط ماتِ خیلی کند هشدار ملایم دارد
        kind = gap <= 60 ? "best" : gap <= 1800 ? "good" : "soft";
      } else if (cp >= 20) {
        kind = "soft"; // برتری آب شد ولی هنوز بهترتی
      } else if (cp >= -th) {
        kind = "draw"; // برنده مساوی شد!
      } else {
        kind = "lose";
      }
    } else if (cls === "draw") {
      // ⚖️ موقعیت متعادل — نویز انجین در تعادل‌های نزدیک زیاد است؛ تحمل بازتر.
      // حرکتی که تساوی را نگه دارد هرگز «تغییر برتری» شمرده نمی‌شود.
      if (gap <= 120) kind = "best";
      else if (gap <= 260) kind = "soft";
      else if (cp <= -350) kind = "lose";
      else kind = "soft";
    } else {
      // 🛡 موقعیت بازنده — دفاع مقاوم را تشویق کن
      if (gap <= 90) kind = "best";
      else if (cp <= -2200) kind = "lose";
      else kind = "soft";
    }
    // «تنها حرکت برنده» — وقتی فقط یکی cp برنده دارد
    let onlyWin = false;
    if (bestCp >= th) {
      const winners = an.legal.filter(
        (m) => an.map[m.from + m.to + (m.promotion || "")] >= th
      );
      onlyWin = winners.length === 1 && winners[0].from + winners[0].to + (winners[0].promotion || "") === uci;
    }
    return { kind, cp, bestCp, gap, isBest: uci === an.bestUci, onlyWin };
  }

  // ===== ➡️ فلش روی تخته (SVG) =====
  function squareToXY(name, flipped) {
    let file = name.charCodeAt(0) - 97;
    let rank = parseInt(name[1], 10) - 1;
    if (flipped) {
      file = 7 - file;
      rank = 7 - rank;
    }
    return { x: (file + 0.5) * 12.5, y: (7 - rank + 0.5) * 12.5 };
  }
  function drawArrows(svgEl, arrows, flipped) {
    if (!svgEl) return;
    svgEl.innerHTML =
      '<defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto">' +
      '<path d="M0,0 L4,2 L0,4 z" fill="context-stroke"></path></marker></defs>';
    if (!arrows || !arrows.length) return;
    arrows.forEach((a) => {
      const p1 = squareToXY(a.from, flipped);
      const p2 = squareToXY(a.to, flipped);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const trimStart = 2.6;
      const trimEnd = 2.2;
      const x1 = p1.x + (dx / len) * trimStart;
      const y1 = p1.y + (dy / len) * trimStart;
      const x2 = p2.x - (dx / len) * trimEnd;
      const y2 = p2.y - (dy / len) * trimEnd;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", a.color || "#e53e3e");
      line.setAttribute("stroke-width", "1.9");
      line.setAttribute("class", "arrow-line");
      line.setAttribute("marker-end", "url(#ah)");
      line.setAttribute("opacity", "0.85");
      svgEl.appendChild(line);
    });
  }

  // ===== 🖼 تخته‌ی کوچک استاتیک (مفاهیم) =====
  function renderMiniBoard(el, fen) {
    if (!el) return;
    el.innerHTML = "";
    try {
      const g = new Chess();
      if (!g.load(fen)) return;
      const board = g.board();
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const sq = document.createElement("div");
          const isLight = (i + j) % 2 === 0;
          sq.className = "square " + (isLight ? "light" : "dark");
          const p = board[i][j];
          if (p) sq.appendChild(makePieceEl(p.color, p.type));
          el.appendChild(sq);
        }
      }
    } catch (e) {}
  }
  // ============================================================
  // 🏋️ هسته‌ی تخته و بازی — مشترک بین آموزش و چالش
  // ============================================================
  function createTrainer(opts) {
    const T = {
      opts,
      boardEl: opts.boardEl,
      arrowsEl: opts.arrowsEl || null,
      evalFillEl: opts.evalFillEl || null,
      statusFn: opts.statusFn || null,
      onUserMove: opts.onUserMove || null,
      timerSec: 0,
      timerStarted: false,
      game: new Chess(),
      userColor: "w",
      phase: "idle", // idle | user | engine | paused | done
      epoch: 0,
      lastMove: null,
      selected: null,
      hintFrom: null,
      hintTo: null,
      mistakes: 0,
      hints: 0,
      userMoves: 0,
      startedAt: 0,
      timerLeft: 0,
      timerInt: null,
      flipped: false,
      press: null, // ژست فعال (pointer) — فقط یک اشاره در هر لحظه
    };

    // ---------- رندر ----------
    T.renderBoard = function () {
      const board = T.game.board();
      const legalTargets = {};
      if (T.selected && T.phase === "user") {
        // فیلتر دستی — سازگار با همه‌ی نسخه‌های chess.js (گزینه‌ی square در برخی نسخه‌ها کامل نیست)
        T.game.moves({ verbose: true }).forEach((m) => {
          if (m.from === T.selected) legalTargets[m.to] = m.captured ? "capture" : "move";
        });
      }
      T.boardEl.innerHTML = "";
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const row = T.flipped ? 7 - i : i;
          const col = T.flipped ? 7 - j : j;
          const p = board[row][col];
          const isLight = (row + col) % 2 === 0;
          const sq = document.createElement("div");
          // رنگ خانه‌ها از کلاس CSS می‌آید (var(--board-light/dark)) — تغییر تم بلافاصله اعمال می‌شود
          sq.className = "square " + (isLight ? "light" : "dark");
          const squareName = String.fromCharCode(97 + col) + (8 - row);
          sq.dataset.square = squareName;

          if (T.lastMove && (T.lastMove.from === squareName || T.lastMove.to === squareName))
            sq.classList.add("last-move");
          if (T.selected === squareName) sq.classList.add("selected");
          if (T.hintFrom === squareName) sq.classList.add("hint-from");
          if (T.hintTo === squareName) sq.classList.add("hint-to");

          if (p) sq.appendChild(makePieceEl(p.color, p.type));
          if (legalTargets[squareName] === "capture") sq.classList.add("legal-capture");
          else if (legalTargets[squareName] === "move") sq.classList.add("legal");
          T.boardEl.appendChild(sq);
        }
      }
      if (T.game.in_check()) {
        const turn = T.game.turn();
        for (const sqEl of T.boardEl.children) {
          const pc = T.game.get(sqEl.dataset.square);
          if (pc && pc.type === "k" && pc.color === turn) sqEl.classList.add("in-check");
        }
      }
    };

    T.setStatus = function (html) {
      if (T.statusFn) T.statusFn(html);
    };
    T.setEval = function (cp) {
      if (!T.evalFillEl) return;
      // 🎛 آپشن مربی: نوار ارزیابی قابل خاموش‌کردن است
      const wrap = T.evalFillEl.closest(".eval-bar");
      if (wrap) wrap.style.display = COACH_OPTS.showEvalBar ? "" : "none";
      if (!COACH_OPTS.showEvalBar) return;
      let width = 50;
      if (typeof cp === "number") {
        width = 50 + (clamp(cp, -3000, 3000) / 3000) * 47;
      }
      T.evalFillEl.style.width = width + "%";
    };

    // ---------- بارگذاری موقعیت ----------
    T.load = function (fen, userColor) {
      T.epoch++;
      T.stopTimer();
      cancelPress();
      T.game = new Chess();
      if (!T.game.load(fen)) T.game = new Chess();
      T.userColor = userColor || T.game.turn();
      T.flipped = T.userColor === "b";
      T.phase = T.game.turn() === T.userColor ? "user" : "engine";
      T.lastMove = null;
      T.selected = null;
      T.hintFrom = null;
      T.hintTo = null;
      T.mistakes = 0;
      T.hints = 0;
      T.userMoves = 0;
      T.startedAt = Date.now();
      T.timerSec = opts.timerSec || 0;
      T.timerStarted = false;
      T.renderBoard();
      T.setEval(null);
      if (T.arrowsEl) T.arrowsEl.innerHTML = "";
      return T.phase;
    };

    // ---------- تایمر (از اولین حرکت کاربر) ----------
    T.startTimer = function () {
      if (T.timerStarted) return;
      T.timerStarted = true;
      T.timerLeft = T.timerSec;
      if (T.timerSec <= 0) return;
      T.stopTimer();
      T.timerInt = setInterval(() => {
        T.timerLeft--;
        if (opts.onTimerTick) opts.onTimerTick(T.timerLeft);
        if (T.timerLeft <= 0) {
          T.stopTimer();
          if (opts.onTimeout) opts.onTimeout();
        }
      }, 1000);
      if (opts.onTimerTick) opts.onTimerTick(T.timerLeft);
    };
    T.stopTimer = function () {
      if (T.timerInt) {
        clearInterval(T.timerInt);
        T.timerInt = null;
      }
    };

    // ---------- وضعیت پایان بازی ----------
    // ⚠️ درس تا «نتیجه‌ی واقعی» تمام نمی‌شود: مات، پات، متریال ناکافی،
    // تکرار سه‌باره یا قانون ۵۰ حرکت — نه هیچ داوری زودهنگامی.
    T.gameState = function () {
      const g = T.game;
      if (!g.game_over()) return { over: false };
      if (g.in_checkmate()) {
        const winner = g.turn() === "w" ? "b" : "w";
        return { over: true, kind: winner === T.userColor ? "mate-win" : "got-mated" };
      }
      if (g.in_stalemate()) return { over: true, kind: "stalemate" };
      if (g.insufficient_material()) return { over: true, kind: "insufficient" };
      if (g.in_threefold_repetition()) return { over: true, kind: "threefold" };
      if (g.in_draw()) return { over: true, kind: "fifty" };
      return { over: true, kind: "drawn" };
    };

    // ---------- حرکت کاربر ----------
    // ♛ ترفیع پیاده: در همه‌ی حالت‌ها کاربر دقیقاً مهره را انتخاب می‌کند (وزیر/رخ/فیل/اسب)
    T.tryUserMove = function (from, to) {
      if (T.phase !== "user") return false;
      const candidates = T.game
        .moves({ verbose: true })
        .filter((m) => m.from === from && m.to === to);
      if (!candidates.length) return false;
      const isPromo = candidates.some((m) => m.promotion);
      if (isPromo && window.ChessUtils && ChessUtils.showPromotion) {
        ChessUtils.showPromotion(T.userColor, function (letter) {
          if (!letter) return; // مودال بسته شد بدون انتخاب — هیچ حرکتی ثبت نمی‌شود
          T.applyUserMove(from, to, letter);
        });
        return true; // ژست مصرف شد؛ حرکت پس از انتخاب اعمال می‌شود
      }
      return T.applyUserMove(from, to, null);
    };
    T.applyUserMove = function (from, to, promoLetter) {
      // ⚠️ FENِ «قبل از حرکت» باید همین‌جا (قبل از game.move) ثبت شود
      // تا مربی بتواند حرکت را با تحلیلِ همان موقعیت نمره دهد
      T.fenBeforeUserMove = T.game.fen();
      const mv = T.game.move({ from, to, promotion: promoLetter || "q" });
      if (!mv) return false;
      T.userMoves++;
      T.selected = null;
      T.hintFrom = null;
      T.hintTo = null;
      // 🧹 فلش راهنما بعد از هر حرکت باید از بین برود (باغ اصلی باگ کاربر)
      if (T.arrowsEl) {
        T.arrowsEl.innerHTML = "";
        T.arrowsEl.classList.remove("fade-out");
      }
      T.lastMove = { from: mv.from, to: mv.to };
      T.renderBoard();
      if (T.timerSec > 0) T.startTimer(); // ساعت با اولین حرکت راه می‌افتد
      if (opts.onUserMove) opts.onUserMove(mv, T);
      return true;
    };

    // ---------- حرکت انجین ----------
    // خروجی: {applied, move, score, aborted}
    // ⚠️ انجین هرگز تسلیم نمی‌شود — بازی تا نتیجه‌ی واقعی ادامه دارد
    T.engineMove = async function (engineOpts) {
      if (T.game.game_over()) return { applied: false };
      T.phase = "engine";
      const myEpoch = T.epoch;
      T.setStatus('<span class="engine-thinking-dots">🤖 انجین فکر می‌کند</span>');
      // 🎛 آپشن مربی: مکث طبیعی — انجین مثل حریف انسانی عجله نمی‌کند؛ فرصت فکر کن
      if (COACH_OPTS.humanDelay) {
        await new Promise((r) => setTimeout(r, 380 + Math.random() * 520));
        if (myEpoch !== T.epoch) return { applied: false, aborted: true };
      }
      const resp = await askEngine(T.game.fen(), engineOpts || { movetime: 150, depth: 16 });
      if (myEpoch !== T.epoch) return { applied: false, aborted: true };
      let mv = resp.move;
      if (!mv) {
        const legal = T.game.moves({ verbose: true });
        if (!legal.length) return { applied: false, resigned: false };
        mv = pick(legal);
      }
      const applied = T.game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" });
      if (applied) {
        T.lastMove = { from: applied.from, to: applied.to };
      } else {
        const legal = T.game.moves({ verbose: true });
        if (!legal.length) return { applied: false, resigned: false };
        const fb = pick(legal);
        const mv2 = T.game.move({ from: fb.from, to: fb.to, promotion: fb.promotion || "q" });
        T.lastMove = mv2 ? { from: mv2.from, to: mv2.to } : null;
      }
      T.renderBoard();
      T.phase = "user";
      return { applied: true, move: mv, score: resp.score, resigned: false };
    };

    T.undoToUser = function (plyCount) {
      let n = plyCount || 1;
      while (n-- > 0) {
        if (!T.game.undo()) break;
      }
      while (T.game.history().length > 0 && T.game.turn() !== T.userColor) {
        if (!T.game.undo()) break;
      }
      T.lastMove = null;
      T.selected = null;
      T.hintFrom = null;
      T.hintTo = null;
      T.renderBoard();
    };

    T.abort = function () {
      T.epoch++;
      T.stopTimer();
      cancelPress();
      T.phase = "idle";
    };

    // ---------- تعامل: Pointer Events (کشیدن + تپ) ----------
    // همان معماری «مسئله روز» و «پازل راش» که روی همه‌ی دستگاه‌ها بی‌نقص کار می‌کند:
    //  • یک ژست در هر لحظه (چندلمسی گیرکردن مهره می‌ساخت)
    //  • pointercancel مدیریت می‌شود (قطع ناگهانی مرورگر، گوستِ معلق نمی‌گذارد)
    //  • آستانه‌ی ۶ پیکسل: تپ ساده هیچ‌وقت گوست نمی‌سازد
    //  • pointerId چک می‌شود تا انگشت دوم رویدادهای انگشت اول را خراب نکند
    function canInteract() {
      return T.phase === "user" && !T.game.game_over();
    }
    function isLegalTarget(from, sq) {
      if (!from || !sq) return false;
      return T.game.moves({ verbose: true }).some((m) => m.from === from && m.to === sq);
    }
    function squareAtPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      const sq = el && el.closest ? el.closest(".square") : null;
      return sq && T.boardEl.contains(sq) && sq.dataset ? sq.dataset.square : null;
    }
    function createGhost(fromSq) {
      const sqEl = T.boardEl.querySelector('[data-square="' + fromSq + '"]');
      const piece = sqEl && (sqEl.querySelector(".piece-img") || sqEl.querySelector(".piece-glyph"));
      if (!piece) return null;
      const rect = sqEl.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.appendChild(piece.cloneNode(true));
      document.body.appendChild(ghost);
      return ghost;
    }
    function cleanupDrag(p) {
      if (p && p.ghost) {
        p.ghost.remove();
        p.ghost = null;
      }
      T.boardEl.querySelectorAll(".dragging, .drag-over").forEach((el) =>
        el.classList.remove("dragging", "drag-over")
      );
      T.boardEl.classList.remove("dragging-active");
    }
    function cancelPress() {
      if (T.press) {
        cleanupDrag(T.press);
        T.press = null;
      }
      document.body.style.userSelect = "";
    }
    function onSquareTap(sq) {
      if (!canInteract()) return;
      if (T.selected === sq) {
        T.selected = null;
      } else if (T.selected && isLegalTarget(T.selected, sq)) {
        const from = T.selected;
        T.selected = null;
        T.tryUserMove(from, sq);
        return;
      } else {
        const piece = T.game.get(sq);
        T.selected = piece && piece.color === T.userColor ? sq : null;
      }
      T.renderBoard();
    }
    function onPointerDown(e) {
      if (T.press) return; // ← کلید حل مشکل: انگشت دوم / ماوس دوم هیچ‌وقت درگِ جاری را خراب نمی‌کند
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const sqEl = e.target && e.target.closest ? e.target.closest(".square") : null;
      if (!sqEl || !T.boardEl.contains(sqEl)) return;
      const sq = sqEl.dataset ? sqEl.dataset.square : null;
      if (!sq) return;
      T.press = {
        pointerId: e.pointerId,
        from: sq,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        consumed: false,
        ghost: null,
        overSq: null,
      };
      // سبک لایچس: تپ روی مقصد مجاز با انتخابِ فعال = حرکت فوری
      if (canInteract() && T.selected && T.selected !== sq && isLegalTarget(T.selected, sq)) {
        T.press.consumed = true;
        const from = T.selected;
        T.selected = null;
        T.tryUserMove(from, sq);
        return;
      }
      e.preventDefault();
      document.body.style.userSelect = "none";
    }
    function onPointerMove(e) {
      const p = T.press;
      if (!p || e.pointerId !== p.pointerId || p.consumed) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (!p.dragging) {
        if (dx * dx + dy * dy < 36) return; // آستانه‌ی ۶ پیکسل — تپ ساده گوست نمی‌سازد
        const piece = T.game.get(p.from);
        if (!piece || !canInteract() || piece.color !== T.userColor) return;
        p.dragging = true;
        T.selected = p.from;
        T.renderBoard(); // خانه‌های مجاز نشان داده شوند
        const srcEl = T.boardEl.querySelector('[data-square="' + p.from + '"]');
        if (srcEl) srcEl.classList.add("dragging");
        T.boardEl.classList.add("dragging-active");
        p.ghost = createGhost(p.from);
      }
      e.preventDefault();
      if (p.ghost) {
        p.ghost.style.left = e.clientX + "px";
        p.ghost.style.top = e.clientY + "px";
        const over = squareAtPoint(e.clientX, e.clientY);
        if (over !== p.overSq) {
          if (p.overSq) {
            const prev = T.boardEl.querySelector('[data-square="' + p.overSq + '"]');
            if (prev) prev.classList.remove("drag-over");
          }
          p.overSq = over;
          if (over && isLegalTarget(p.from, over)) {
            const cur = T.boardEl.querySelector('[data-square="' + over + '"]');
            if (cur) cur.classList.add("drag-over");
          }
        }
      }
    }
    function onPointerUp(e) {
      const p = T.press;
      if (!p || e.pointerId !== p.pointerId) return;
      T.press = null;
      document.body.style.userSelect = "";
      if (p.consumed) {
        cleanupDrag(p);
        return;
      }
      if (p.dragging) {
        const from = p.from;
        const to = squareAtPoint(e.clientX, e.clientY);
        cleanupDrag(p);
        if (to && to !== from && isLegalTarget(from, to)) {
          T.selected = null;
          if (!T.tryUserMove(from, to)) T.renderBoard();
        } else {
          // رها کردن روی خانه‌ی نامعتبر — مهره برمی‌گردد (بدون جریمه)
          T.renderBoard();
        }
        return;
      }
      onSquareTap(p.from);
    }
    function onPointerCancel(e) {
      const p = T.press;
      if (!p) return;
      if (e && e.pointerId !== undefined && e.pointerId !== p.pointerId) return;
      T.press = null;
      document.body.style.userSelect = "";
      cleanupDrag(p);
      T.renderBoard();
    }

    if (window.PointerEvent) {
      T.boardEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      // اگر تب وسط درگ از فوکوس خارج شد، ژست را تمیز کن (مهره گیرکرده نمی‌ماند)
      window.addEventListener("blur", () => onPointerCancel());
    } else {
      // مرورگرهای بسیار قدیمی — فقط تپ/کلیک
      T.boardEl.addEventListener("click", (e) => {
        const sqEl = e.target && e.target.closest ? e.target.closest(".square") : null;
        if (sqEl && T.boardEl.contains(sqEl) && sqEl.dataset.square) onSquareTap(sqEl.dataset.square);
      });
    }

    return T;
  }
  // ============================================================
  // 📦 داده، متریال و پیشرفت
  // ============================================================
  const PIECE_FA = { q: "وزیر", r: "رخ", b: "فیل", n: "اسب", p: "پیاده" };
  const PIECE_ORDER = ["q", "r", "b", "n", "p"];
  const DIFF_LABELS = { 1: "مبتدی", 2: "متوسط", 3: "پیشرفته" };

  const PROGRESS_KEY = "chesshub_eg_progress_v3";
  const CH_KEY = "chesshub_eg_challenge_v3";

  function loadStore(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveStore(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }
  function getProgress() {
    return loadStore(PROGRESS_KEY, {});
  }

  // شمارش مهره‌های هر رنگ از FEN
  function materialOf(fen) {
    const placement = fen.split(" ")[0];
    const mat = { w: {}, b: {} };
    for (const ch of placement) {
      if (ch === "/" || /\d/.test(ch)) continue;
      const color = ch === ch.toUpperCase() ? "w" : "b";
      const type = ch.toLowerCase();
      if (type === "k") continue;
      mat[color][type] = (mat[color][type] || 0) + 1;
    }
    return mat;
  }
  function materialText(mat) {
    const parts = [];
    PIECE_ORDER.forEach((t) => {
      if (mat[t]) parts.push((mat[t] > 1 ? fa(mat[t]) + " " : "") + PIECE_FA[t]);
    });
    return parts.length ? parts.join(" و ") : "فقط شاه";
  }
  function materialGlyphs(mat) {
    let s = "";
    PIECE_ORDER.forEach((t) => {
      if (mat[t]) s += GLYPHS.w[t].repeat(mat[t]);
    });
    return s;
  }
  function sigOf(mat) {
    if (mat.q) return "وزیر";
    if (mat.r) return "رخ";
    if (mat.b || mat.n) return "مهره‌های سبک";
    if (mat.p) return "پیاده";
    return "مختلط";
  }

  // 🗂 دسته‌بندی حرفه‌ای آخربازی — بر اساس قوی‌ترین مهره‌ی غیرشاه در کل موقعیت
  // (مثل کتاب‌های آخربازی: پایانی وزیر، پایانی رخ، مهره‌های سبک، پیاده)
  const CAT_META = {
    queen: { fa: "وزیر", icon: "fa-chess-queen" },
    rook: { fa: "رخ", icon: "fa-chess-rook" },
    minor: { fa: "مهره‌های سبک", icon: "fa-chess-knight" },
    pawn: { fa: "پیاده", icon: "fa-chess-pawn" },
    mixed: { fa: "مختلط", icon: "fa-layer-group" },
  };
  function categoryOf(mat) {
    if (mat.w.q || mat.b.q) return "queen";
    if (mat.w.r || mat.b.r) return "rook";
    if (mat.w.b || mat.w.n || mat.b.b || mat.b.n) return "minor";
    if (mat.w.p || mat.b.p) return "pawn";
    return "mixed";
  }
  function difficultyOf(pieceCount) {
    return pieceCount <= 3 ? 1 : pieceCount <= 6 ? 2 : 3;
  }

  // نرمال‌سازی انعطاف‌پذیر داده — سازگار با چند فرمت نوشتن
  function normalizeEntry(entry) {
    let fen = null;
    let goalRaw = null;
    if (typeof entry === "string") {
      const cols = entry.split("|").map((s) => s.trim());
      fen = cols[0];
      goalRaw = cols[cols.length - 1];
    } else if (entry && typeof entry === "object") {
      fen = entry.fen;
      goalRaw = entry.goal || entry.result || entry.expected || null;
    }
    if (!fen || typeof fen !== "string") return null;
    fen = fen.replace(/\s+/g, " ").trim();
    let goal = "win";
    if (goalRaw) {
      const g = String(goalRaw).trim();
      if (g === "½-½" || g === "1/2-1/2" || g === "0.5-0.5" || g === "draw") goal = "draw";
      else if (g === "1-0" || g === "win") goal = "win";
      else if (g === "0-1") goal = "win"; // نوبت‌دار سیاه → خودکار تشخیص داده می‌شود
    }
    const probe = new Chess();
    if (!probe.load(fen)) return null;
    const side = fen.split(" ")[1] === "b" ? "b" : "w";
    const mat = materialOf(fen);
    const pieceCount = Object.values(mat.w).reduce((a, b) => a + b, 0) +
      Object.values(mat.b).reduce((a, b) => a + b, 0);
    return {
      fen,
      goal,
      side,
      fenKey: fenKeyOf(fen),
      mat,
      pieceCount,
      difficulty: difficultyOf(pieceCount),
      cat: categoryOf(mat),
      sig: sigOf(side === "w" ? mat.w : mat.b),
    };
  }

  async function loadData() {
    const res = await fetch("data/endgames.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    let rawList = [];
    if (Array.isArray(json)) rawList = json;
    else if (Array.isArray(json.positions)) rawList = json.positions;
    else if (Array.isArray(json.categories)) {
      // فرمت قدیمی نسخه ۲ — درس‌های دسته‌بندی‌شده
      json.categories.forEach((c) =>
        (c.lessons || []).forEach((l) => rawList.push({ fen: l.fen, goal: l.expected === "draw" ? "½-½" : "1-0" }))
      );
    }
    const seen = new Set();
    const list = [];
    rawList.forEach((entry) => {
      const norm = normalizeEntry(entry);
      if (!norm) return;
      if (seen.has(norm.fenKey)) return;
      seen.add(norm.fenKey);
      norm.idx = list.length;
      norm.title = "درس " + fa(list.length + 1) + " — " + materialText(norm.mat.w) + " در برابر " + materialText(norm.mat.b);
      list.push(norm);
    });
    return list;
  }

  // ============================================================
  // 🎓 حالت آموزش — درس‌های خودکار انجین
  // ============================================================
  let POSITIONS = [];
  let lessonFilter = "all";
  let lessonCat = "all";
  let lessonTrainer = null;
  let currentLesson = null;
  let lessonAn = null; // تحلیل موقعیت جاری نوبت کاربر
  let lessonAnFen = null;
  let lessonObjective = null; // برد/مساوی — طبقه‌بندی انجین موقع شروع درس

  const coachLogEl = () => $("coachLog");

  function coachMsg(cls, html) {
    const log = coachLogEl();
    if (!log) return;
    const icons = {
      info: "fa-robot",
      good: "fa-check",
      bad: "fa-xmark",
      gold: "fa-lightbulb",
      neutral: "fa-chess-pawn",
    };
    const div = document.createElement("div");
    div.className = "coach-msg " + (cls || "info");
    div.innerHTML =
      '<span class="cm-icon"><i class="fas ' + (icons[cls] || icons.info) + '"></i></span>' +
      '<div class="cm-bubble">' + html + "</div>";
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 40) log.removeChild(log.firstChild);
    return div;
  }
  function coachActionMsg(cls, html, actions) {
    const div = coachMsg(cls, html);
    if (!div) return;
    const bubble = div.querySelector(".cm-bubble");
    const row = document.createElement("div");
    row.className = "cm-actions";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "fb-btn" + (a.primary ? " primary" : "");
      b.setAttribute("data-caction", a.id);
      b.innerHTML = '<i class="fas ' + a.icon + '"></i> ' + a.label;
      row.appendChild(b);
    });
    bubble.appendChild(row);
    coachLogEl().scrollTop = coachLogEl().scrollHeight;
  }
  function setCoachStatus(txt) {
    const el = $("coachStatus");
    if (el) el.textContent = txt;
  }

  // ---------- کارت‌ها و فیلترها ----------
  function lessonFiltersDef() {
    return [
      { code: "all", name: "همه", icon: "fa-th" },
      { code: "win", name: "برد", icon: "fa-trophy" },
      { code: "draw", name: "مساوی", icon: "fa-shield-alt" },
      { code: "d1", name: "مبتدی", icon: "fa-seedling" },
      { code: "d2", name: "متوسط", icon: "fa-chart-simple" },
      { code: "d3", name: "پیشرفته", icon: "fa-fire" },
      { code: "todo", name: "تمام‌نشده", icon: "fa-circle-half-stroke" },
    ];
  }

  function renderLessonFilters() {
    const wrap = $("lessonFilters");
    if (!wrap) return;
    wrap.innerHTML = "";
    lessonFiltersDef().forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip" + (lessonFilter === c.code ? " active" : "");
      b.innerHTML = '<i class="fas ' + c.icon + '"></i> ' + c.name;
      b.addEventListener("click", () => {
        lessonFilter = c.code;
        renderLessonFilters();
        renderLessonsGrid();
      });
      wrap.appendChild(b);
    });
  }

  // 🗂 چیپ‌های دسته‌بندی متریال — با شمارش تعداد هر دسته
  function lessonCatDefs() {
    return [
      { code: "all", name: "همه", icon: "fa-layer-group" },
      { code: "queen", name: "وزیر", icon: "fa-chess-queen" },
      { code: "rook", name: "رخ", icon: "fa-chess-rook" },
      { code: "minor", name: "مهره‌های سبک", icon: "fa-chess-knight" },
      { code: "pawn", name: "پیاده", icon: "fa-chess-pawn" },
      { code: "mixed", name: "مختلط", icon: "fa-table-cells" },
    ];
  }
  function renderLessonCatFilters() {
    const wrap = $("lessonCatFilters");
    if (!wrap) return;
    wrap.innerHTML = "";
    const counts = {};
    POSITIONS.forEach((p) => (counts[p.cat] = (counts[p.cat] || 0) + 1));
    lessonCatDefs().forEach((c) => {
      const n = c.code === "all" ? POSITIONS.length : counts[c.code] || 0;
      if (c.code !== "all" && !n) return; // دسته‌ی خالی نشان داده نشود
      const b = document.createElement("button");
      b.className = "chip" + (lessonCat === c.code ? " active" : "");
      b.innerHTML =
        '<i class="fas ' + c.icon + '"></i> ' + c.name +
        ' <span class="chip-count">' + fa(n) + "</span>";
      b.addEventListener("click", () => {
        lessonCat = c.code;
        renderLessonCatFilters();
        renderLessonsGrid();
      });
      wrap.appendChild(b);
    });
  }

  function filteredLessons() {
    const prog = getProgress();
    return POSITIONS.filter((p) => {
      if (lessonCat !== "all" && p.cat !== lessonCat) return false;
      const rec = prog[p.fenKey] || {};
      switch (lessonFilter) {
        case "win": return p.goal === "win";
        case "draw": return p.goal === "draw";
        case "d1": return p.difficulty === 1;
        case "d2": return p.difficulty === 2;
        case "d3": return p.difficulty === 3;
        case "todo": return !rec.done;
        default: return true;
      }
    });
  }

  function renderLessonsGrid() {
    const grid = $("lessonsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const prog = getProgress();
    const list = filteredLessons();
    $("lessonsEmpty").hidden = list.length > 0;
    list.forEach((pos) => {
      const rec = prog[pos.fenKey] || {};
      const card = document.createElement("div");
      card.className =
        "lesson-card " + (pos.goal === "draw" ? "is-draw" : "is-win") + (rec.done ? " is-done" : "");
      let starsHtml = "";
      if (rec.stars) {
        starsHtml = '<span class="lc-stars">';
        for (let i = 1; i <= 3; i++)
          starsHtml += '<i class="fas fa-star' + (i <= rec.stars ? " earned" : "") + '"></i>';
        starsHtml += "</span>";
      }
      card.innerHTML =
        '<div class="lc-top">' +
        '<span class="lc-num">#' + fa(pos.idx + 1) + "</span>" +
        '<span class="lc-cat"><i class="fas ' + (CAT_META[pos.cat] || CAT_META.mixed).icon + '"></i> ' +
        (CAT_META[pos.cat] || CAT_META.mixed).fa + "</span>" +
        (pos.goal === "draw"
          ? '<span class="lc-result draw"><i class="fas fa-shield-alt"></i> مساوی</span>'
          : '<span class="lc-result"><i class="fas fa-trophy"></i> برد</span>') +
        "</div>" +
        '<div class="lc-material">' +
        '<span class="mat-side mat-white">' + materialGlyphs(pos.mat.w) + "</span>" +
        '<span class="mat-vs">برابر</span>' +
        '<span class="mat-side mat-black">' + materialGlyphs(pos.mat.b) + "</span>" +
        "</div>" +
        '<div class="lc-goal-line">' + materialText(pos.mat.w) + " در برابر " + materialText(pos.mat.b) + "</div>" +
        '<span class="lc-engine-tag"><i class="fas fa-robot"></i> درس خودکار انجین</span>' +
        '<div class="lc-meta">' +
        '<span class="lc-diff" title="' + DIFF_LABELS[pos.difficulty] + '">' +
        [1, 2, 3].map((i) => '<i class="fas fa-bolt' + (i <= pos.difficulty ? " filled" : "") + '"></i>').join("") +
        "</span>" +
        (rec.done ? '<span class="lc-done-badge"><i class="fas fa-circle-check"></i> حل شد</span>' : starsHtml) +
        "</div>";
      card.addEventListener("click", () => openLesson(pos));
      grid.appendChild(card);
    });
  }

  function renderAcademyProgress() {
    const el = $("academyProgress");
    if (!el) return;
    const prog = getProgress();
    const done = POSITIONS.filter((p) => (prog[p.fenKey] || {}).done).length;
    const perfect = POSITIONS.filter((p) => (prog[p.fenKey] || {}).stars === 3).length;
    const pct = POSITIONS.length ? Math.round((done / POSITIONS.length) * 100) : 0;
    // تسلط به تفکیک دسته — پیشرفت هر نوع پایانی جدا دیده می‌شود
    const catTotal = {};
    const catDone = {};
    POSITIONS.forEach((p) => {
      catTotal[p.cat] = (catTotal[p.cat] || 0) + 1;
      if ((prog[p.fenKey] || {}).done) catDone[p.cat] = (catDone[p.cat] || 0) + 1;
    });
    let catsHtml = "";
    Object.keys(CAT_META).forEach((c) => {
      if (!catTotal[c]) return;
      const full = catDone[c] === catTotal[c];
      catsHtml +=
        '<span class="ap-cat' + (full ? " all-done" : "") + '"><i class="fas ' +
        CAT_META[c].icon + '"></i> ' + CAT_META[c].fa +
        " <b>" + fa(catDone[c] || 0) + "/" + fa(catTotal[c]) + "</b></span>";
    });
    el.innerHTML =
      '<i class="fas fa-trophy"></i>' +
      "<span><b>" + fa(done) + "</b> از <b>" + fa(POSITIONS.length) + "</b> درس حل شد · <b>" +
      fa(perfect) + "</b> درس با ۳ ستاره</span>" +
      '<div class="ap-track"><div class="ap-fill" style="width:' + pct + '%"></div></div>' +
      "<span><b>" + fa(pct) + "٪</b></span>" +
      '<div class="ap-cats">' + catsHtml + "</div>";
  }

  // ---------- جریان درس ----------
  function goalBarHtml(pos, an, extra) {
    // 🧭 حکم موقعیت را انجین می‌گوید — نه ستون نتیجه‌ی فایل داده؛ برچسب از طیف برتری
    let verdict;
    if (an) {
      const cls = posClassOf(an.bestCp, an.fen);
      const tier = posTierOf(an.bestCp);
      verdict =
        cls === "win"
          ? '<span class="lg-badge"><i class="fas fa-trophy"></i> انجین: موقعیت برنده است</span>'
          : cls === "lose"
          ? '<span class="lg-badge draw"><i class="fas fa-triangle-exclamation"></i> انجین: موقعیت بازنده است</span>'
          : '<span class="lg-badge draw"><i class="fas fa-shield-alt"></i> انجین: ' + tier.fa + " است</span>";
    } else {
      verdict =
        pos.goal === "draw"
          ? '<span class="lg-badge draw"><i class="fas fa-shield-alt"></i> هدف داده: مساوی</span>'
          : '<span class="lg-badge"><i class="fas fa-trophy"></i> هدف داده: برد</span>';
    }
    let evalHtml = "";
    if (an) {
      const cls = posClassOf(an.bestCp, an.fen);
      const tier = posTierOf(an.bestCp);
      const label =
        cls === "win"
          ? tier.fa + " — تو (" + fmtCp(an.bestCp, true) + ")"
          : cls === "lose"
          ? "موقعیت سخت (" + fmtCp(an.bestCp, true) + ")"
          : tier.fa + " (" + fmtCp(an.bestCp, true) + ")";
      const okMoves = cls === "win" ? an.winCount : an.holdCount;
      const okLabel = cls === "win" ? "حرکات برنده" : cls === "lose" ? "حرکات دفاعی" : "حرکات حفظ تساوی";
      evalHtml = '<span class="lg-stat"><i class="fas fa-chart-line"></i> ارزیابی: <b>' + label + "</b></span>" +
        '<span class="lg-stat"><i class="fas fa-list"></i> ' + okLabel + ": <b>" + fa(okMoves) +
        "</b> از " + fa(an.legal.length) + "</span>";
      // شمارش معکوس مات — مربی حرفه‌ای همیشه فاصله تا مات را می‌گوید
      if (an.bestCp >= 9000) {
        const plies = Math.max(1, Math.ceil((10000 - an.bestCp) / 100 / 2));
        evalHtml +=
          '<span class="lg-stat mate"><i class="fas fa-flag-checkered"></i> <b>مات در ' +
          fa(plies) + " حرکت</b></span>";
      }
    }
    return verdict + evalHtml + (extra || "");
  }

  function updateLessonGoalBar(extra) {
    const bar = $("lessonGoalBar");
    if (!bar) return;
    bar.innerHTML = goalBarHtml(currentLesson, lessonAn, extra);
  }

  function mistakeNote(kind) {
    if (kind === "draw")
      return "این حرکت تمام برتری را مساوی می‌کند — انجین با بهترین دفاع بازی را نجات می‌دهد.";
    if (kind === "lose") return "با این حرکت موقعیت بازنده می‌شود — ادامه‌اش را انجین برایت نشان می‌دهد.";
    return "دقیقت کم شد — انجین گزینه‌ی بهتری داشت.";
  }

  async function ensureLessonAnalysis(opts) {
    opts = opts || {};
    const myEpoch = lessonTrainer.epoch;
    const fenBefore = lessonTrainer.game.fen();
    // ⚡ نوار ارزیابی سریع: اول یک پرسش تک‌موقعیتی (~۱۵۰ms) تا نوار بلافاصله بعد
    // از هر حرکت تکان بخورد؛ تحلیل کامل همه‌ی حرکات در ادامه دقت را بالا می‌برد
    if (opts.quickFirst && engineAvailable) {
      const q = await askEngine(fenBefore, { movetime: 150, depth: 14 });
      if (myEpoch !== lessonTrainer.epoch) return null;
      if (q.score) lessonTrainer.setEval(cpOf(q.score));
    }
    setCoachStatus("در حال تحلیل موقعیت…");
    updateLessonGoalBar(
      '<span class="lg-badge analyzing"><i class="fas fa-spinner fa-spin"></i> تحلیل انجین…</span>'
    );
    // عمق تحلیل خودکار بر اساس تعداد مهره‌ها — مربی در آخربازی‌های خالص حداکثر دقت را دارد
    const an = await analyzePosition(fenBefore, {
      T: lessonTrainer,
      epoch: myEpoch,
      onProgress: (n, total) => {
        setCoachStatus("در حال تحلیل " + fa(n) + "/" + fa(total) + " حرکت…");
      },
    });
    if (myEpoch !== lessonTrainer.epoch) return null; // درس عوض شد
    lessonAn = an;
    lessonAnFen = fenBefore;
    if (an) {
      lessonTrainer.setEval(an.bestCp);
      setCoachStatus("تحلیل شد — نوبت توست");
      updateLessonGoalBar();
    } else {
      setCoachStatus("انجین در دسترس نیست");
    }
    return an;
  }

  function lessonIntroBubble(an) {
    const pos = currentLesson;
    if (!an) {
      coachMsg("info", "🤖 انجین در دسترس نیست؛ حریف تصادفی بازی می‌کند و نمره‌دهی فعلاً خاموش است.");
      return;
    }
    const cls = posClassOf(an.bestCp, an.fen);
    const tier = posTierOf(an.bestCp);
    const total = an.legal.length;
    if (cls === "draw") {
      coachMsg("info",
        "🧭 انجین این موقعیت را <b>" + tier.fa + "</b> می‌داند (" + fmtCp(an.bestCp, true) + "). متریال: " +
        materialText(pos.mat.w) + " در برابر " + materialText(pos.mat.b) + ". از " + fa(total) +
        " حرکت، <b>" + fa(an.holdCount) + " حرکت</b> تعادل را حفظ می‌کنند. بازی تا نتیجه‌ی واقعی ادامه دارد: پات، تکرار سه‌باره یا قانون ۵۰ حرکت یعنی موفقیت؛ اشتباه کنی چطور همه‌چیز از دست می‌رود را نشانت می‌دهم.");
    } else if (cls === "win") {
      coachMsg("info",
        "🧭 انجین می‌گوید این موقعیت <b>" + tier.fa + "</b> دارد (" + fmtCp(an.bestCp, true) + "). متریال: " +
        materialText(pos.mat.w) + " در برابر " + materialText(pos.mat.b) + ". از " + fa(total) +
        " حرکت، <b>" + fa(an.winCount) + " حرکت</b> برد را نگه می‌دارند" +
        (an.winCount === 1 ? " — فقط یکی درست است، پیدایش کن!" : ".") +
        " پایان راه فقط مات قطعی است — بازی تا کیش‌ومات ادامه دارد.");
    } else {
      coachMsg("info",
        "🧭 انجین می‌گوید این موقعیت <b>بازنده</b> است (" + fmtCp(an.bestCp, true) + ") — دفاع دشوار! " +
        "مقاوم‌ترین دفاع را بازی کن؛ پات، تکرار سه‌باره یا قانون ۵۰ حرکت هم نجات است.");
    }
  }

  // 💡 تکنیک‌های طلایی هر دسته — خودکار بر اساس نوع پایانی (بدون متن دستی برای هر درس)
  const CAT_TIPS = {
    queen: [
      "با وزیر اول شاهت را نزدیک کن، بعد مات بگیر — وزیر تنها مات نمی‌کند!",
      "مراقب پات باش! وزیر قدرتمندترین مهره است و راحت‌ترین ابزار پات‌ساز — قبل از هر کیش خانه‌ی آخر حریف را چک کن.",
      "وزیر را نزدیک شاه حریف نگه دار تا فرارش را ببندی، بعد با شاه پیش بیا.",
    ],
    rook: [
      "رخ را پشت پیاده‌ی عبوری بگذار و با کیش‌های ردیفی حریف را خسته کن — قاعده‌ی تاراش.",
      "پل لوچنا برای بردن پایانی رخ‌وپیاده اجباری است: پل روی ردیف چهارم، کناررفتن شاه، پیشروی پیاده.",
      "فعال‌بودن رخ مهم‌تر از برتری پیاده است — رخِ منفعل یعنی بازی با مهره‌ی کمتر.",
    ],
    minor: [
      "فیل‌هم‌رنگ: فیل حریف کنترل‌کننده‌ی خانه‌های تبدیل پیاده‌ات است — پیاده‌اش را هدف بگیر.",
      "با دو فیل، آن‌ها را در دو قطر متقاطع نگه دار تا شاه حریف هیچ راه فراری نداشته باشد.",
      "اسب در آخربازی باید فعال و مرکزی باشد — اسبِ لبه نیمی از قدرتش را از دست می‌دهد.",
    ],
    pawn: [
      "اول شاه، بعد پیاده! شاهِ فعال کلید همه‌ی پایانی‌های پیاده است.",
      "اوپوزیسیون را بگیر و پیاده را فقط وقتی پیش ببر که شاه حریف مجبور به عقب‌نشینی شود.",
      "پیاده‌ی ستون a و h بردشان سخت‌تر است — شاهِ مدافع در گوشه پات می‌سازد.",
    ],
    mixed: [
      "مهره‌ی اضافه را با مبادله به پیاده‌ی برنده تبدیل کن، نه با کیش‌های پیاپی.",
      "هر مبادله در آخربازی یعنی نزدیک‌ترشدن به تبدیل — حساب‌شده مبادله کن.",
    ],
  };
  function coachCategoryTip(pos) {
    const tips = CAT_TIPS[pos.cat];
    const meta = CAT_META[pos.cat];
    if (!tips || !tips.length || !meta) return;
    const tip = tips[pos.idx % tips.length];
    coachMsg("gold", "💡 تکنیک دسته‌ی «" + meta.fa + "»: " + tip);
  }

  // تبدیل خط اصلی (PV) انجین به زنجیره‌ی جبری خوانا
  function pvSanList(fen, firstUci, pv, maxPly) {
    const out = [];
    try {
      const g = new Chess();
      if (!g.load(fen)) return out;
      const seq = [];
      if (firstUci) seq.push(firstUci);
      (pv || []).forEach((u) => seq.push(u));
      for (let i = 0; i < seq.length && out.length < maxPly; i++) {
        const u = seq[i];
        const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length === 5 ? u[4] : "q" });
        if (!mv) break;
        out.push(mv.san);
      }
    } catch (e) {}
    return out;
  }

  // 🧭 خط اصلی انجین — بعد از حرکت درست، بازی این‌طور ادامه پیدا می‌کند
  function coachBestLine(an) {
    if (!an || !an.bestUci) return;
    if (!COACH_OPTS.showPV) return; // 🎛 آپشن: خط اصلی خاموش
    const pv = an.pvs ? an.pvs[an.bestUci] : null;
    const sans = pvSanList(an.fen, an.bestUci, pv, 8);
    if (sans.length < 2) return;
    coachMsg("info",
      "🧭 خط اصلی انجین: <span class='cm-line'>" + sans.join(" ") + (sans.length >= 8 ? " …" : "") + "</span>");
  }

  // 🔍 گزارش کامل تحلیل — همه‌ی حرکات قانونی مرتب‌شده با ارزیابی (قابل باز و بستن)
  function coachMoveReport(an) {
    if (!an || !an.legal || !an.legal.length || typeof an.map[an.bestUci] !== "number") return;
    const rows = an.legal
      .map((m) => {
        const u = m.from + m.to + (m.promotion || "");
        return { san: m.san, u, cp: typeof an.map[u] === "number" ? an.map[u] : 0 };
      })
      .sort((a, b) => b.cp - a.cp);
    const rowsHtml = rows
      .map((r) => {
        const tag = r.cp >= 250 ? ["win", "برنده"] : r.cp >= -120 ? ["hold", "تساوی"] : ["lose", "بازنده"];
        const best = r.u === an.bestUci;
        return '<div class="cm-row' + (best ? " best" : "") + '"><span class="mr-san">' + r.san +
          (best ? " ★" : "") + "</span>" +
          '<span class="mr-tag ' + tag[0] + '">' + tag[1] + "</span>" +
          '<span class="mr-cp">' + fmtCp(r.cp, true) + "</span></div>";
      })
      .join("");
    coachMsg("info",
      '<details class="cm-report"><summary>🔍 گزارش کامل تحلیل — ' + fa(rows.length) + " حرکت بررسی شد</summary>" +
      '<div class="cm-rows">' + rowsHtml + "</div></details>");
  }

  async function openLesson(pos) {
    currentLesson = pos;
    lessonAn = null;
    lessonAnFen = null;
    lessonObjective = null;
    $("lessonTitle").textContent = pos.title;
    const prog = getProgress()[pos.fenKey] || {};
    $("lessonBestStars").innerHTML = [1, 2, 3]
      .map((i) => '<i class="fas fa-star' + (i <= (prog.stars || 0) ? " earned" : "") + '"></i>')
      .join("");
    $("lessonDoneCard").hidden = true;
    $("lessonHintBtn").disabled = true;
    $("lessonFeedback").hidden = true;
    coachLogEl().innerHTML = "";
    document.body.style.overflow = "hidden";
    $("lessonOverlay").classList.add("open");
    $("lessonOverlay").setAttribute("aria-hidden", "false");

    const phase = lessonTrainer.load(pos.fen, pos.side);
    coachMsg("neutral", "♟️ تو <b>" + (pos.side === "w" ? "سفید" : "سیاه") + "</b> هستی و همه‌ی حرکات با توست. تخته هم مثل بقیه‌ی بخش‌ها با کشیدن و کلیک کار می‌کند.");
    if (phase === "engine") {
      // اگر نوبت حریف بود (غیرممکن در دیتای فعلی، ولی محض احتیاط)
      coachMsg("info", "اول انجین حرکت می‌دهد…");
      const r = await lessonTrainer.engineMove({ movetime: 200, depth: 16 });
      if (r.applied) {
        $("lessonFeedback").hidden = true;
      }
    }
    const an = await ensureLessonAnalysis();
    if (!an) return;
    // 🧭 هدف درس را انجین از روی FEN تعیین می‌کند (برد/مساوی/دفاع) — نه داده
    lessonObjective = posClassOf(an.bestCp, an.fen) === "lose" ? "draw" : posClassOf(an.bestCp, an.fen);
    lessonIntroBubble(an);
    coachCategoryTip(pos);
    coachBestLine(an);
    coachMoveReport(an);
    $("lessonHintBtn").disabled = !engineAvailable;
  }

  function closeLesson() {
    lessonTrainer.abort();
    $("lessonOverlay").classList.remove("open");
    $("lessonOverlay").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    currentLesson = null;
    renderLessonsGrid();
    renderAcademyProgress();
  }

  // پیام نتیجه‌ی حرکت کاربر + ادامه‌ی بازی
  const PRAISE = [
    "🏆 بهترین حرکت! دقیقاً همان چیزی که موقعیت می‌خواست.",
    "✅ عالی — این حرکت بازی را در مسیر درست نگه می‌دارد.",
    "💎 دقیق! انجین هم همین را انتخاب می‌کند.",
  ];
  const GOOD = [
    "👍 حرکت خوبی بود — برنده را حفظ می‌کند.",
    "👍 درست است! ادامه بده.",
  ];

  async function onLessonUserMove(mv, T) {
    const myEpoch = T.epoch;
    // پایان بازی؟
    const st = T.gameState();
    if (st.over) return finishLesson(st.kind);

    // تحلیلِ پیش از حرکت باید دقیقاً همان موقعیتِ قبل از حرکت باشد
    const an = lessonAn && T.fenBeforeUserMove && lessonAn.fen === T.fenBeforeUserMove ? lessonAn : null;
    const grade = an ? gradeMove(an, mv.from, mv.to, mv.promotion) : null;

    if (!grade) {
      // بدون انجین یا تحلیل قدیمی → فقط ادامه
      $("lessonFeedback").hidden = false;
      $("lessonFeedback").className = "feedback-bar info";
      $("lessonFeedback").innerHTML = "<span>🤖 حرکت ثبت شد — نوبت حریف…</span>";
      const r = await T.engineMove({ movetime: 180, depth: 16 });
      if (myEpoch !== T.epoch) return;
      const st2 = T.gameState();
      if (st2.over) return finishLesson(st2.kind);
      await ensureLessonAnalysis({ quickFirst: true });
      return;
    }

    const bestSan = an.bestUci
      ? moveCoordToSan(
          an.fen,
          an.bestUci.slice(0, 2),
          an.bestUci.slice(2, 4),
          an.bestUci.length === 5 ? an.bestUci[4] : null
        )
      : null;

    if (grade.kind === "best" || grade.kind === "good") {
      T.setEval(grade.cp);
      let html = "<span>" + (grade.kind === "best" ? pick(PRAISE) : pick(GOOD));
      if (grade.onlyWin) html = "<span>🎉 تنها حرکت برنده در این موقعیت همین بود!";
      html += "</span>";
      if (grade.kind === "good" && bestSan) {
        html += "<br><small>بهترین انجین: <span class='fb-best'>" + bestSan + "</span> — حرکتت هم کاملاً سالم است.</small>";
      }
      if (mv.promotion) html += "<br>♟️ تبدیل پیاده — مهره‌ی اضافه یعنی پایان کار.";
      coachMsg(grade.kind === "best" ? "good" : "good", html);
      $("lessonFeedback").hidden = false;
      $("lessonFeedback").className = "feedback-bar success";
      $("lessonFeedback").innerHTML =
        "<span>✅ " + moveCoordToSan(an.fen, mv.from, mv.to, mv.promotion) + " درست بود — ادامه بده</span>";

      // نوبت حریف: بهترین دفاع — بازی تا نتیجه‌ی واقعی ادامه دارد (بدون تسلیم)
      const preEngineFen = T.game.fen();
      const r = await T.engineMove({ movetime: 180, depth: 16 });
      if (myEpoch !== T.epoch) return;
      const st2 = T.gameState();
      if (st2.over) return finishLesson(st2.kind);
      if (r.applied) {
        $("lessonFeedback").innerHTML =
          "<span>🤖 حریف: <span class='fb-best'>" +
          moveCoordToSan(preEngineFen, r.move.from, r.move.to, r.move.promotion) +
          "</span> — نوبت توست</span>";
      }
      await ensureLessonAnalysis({ quickFirst: true });
      return;
    }

    // حرکت اشتباه — مربی وارد عمل می‌شود
    T.mistakes++;
    T.phase = "paused";
    pendingBad = {
      bestUci: an.bestUci,
      bestFen: an.fen,
      plyBefore: T.game.history().length - 1, // تعداد پلی قبل از حرکتِ بد
    };
    T.setEval(grade.cp);
    const userSan = moveCoordToSan(an.fen, mv.from, mv.to, mv.promotion);
    const evalLine =
      '<span class="cm-eval"><span class="ev-best">' + fmtCp(grade.bestCp, true) +
      '</span> ← <span class="ev-drop">' + fmtCp(grade.cp, true) + "</span></span>";
    const kindLabel =
      grade.kind === "draw"
        ? "⚠️ برتری مساوی شد!"
        : grade.kind === "lose"
        ? "❌ این حرکت بازی را می‌بازد!"
        : "🤏 غیردقیق";
    // ادامه‌ی درست بازی بعد از بهترین حرکت — تا کاربر بفهمد «چرا» درست است
    const fixSans = bestSan && COACH_OPTS.showPV
      ? pvSanList(an.fen, an.bestUci, an.pvs ? an.pvs[an.bestUci] : null, 6)
      : [];
    // 🎛 آپشن مربی: فلش خودکار حرکت درست بعد از خطا
    if (COACH_OPTS.autoCorrectArrow && an.bestUci) {
      drawArrows($("boardArrows"), [{ from: an.bestUci.slice(0, 2), to: an.bestUci.slice(2, 4), color: "#38a169" }], T.flipped);
    }
    coachMsg("bad",
      "<b>" + kindLabel + "</b> حرکت تو: <span class='san'>" + userSan + "</span><br>" +
      evalLine + "<br>" + mistakeNote(grade.kind) +
      (bestSan ? " حرکت درست: <span class='san'>" + bestSan + "</span>" : "") +
      (fixSans.length > 1
        ? "<br>🧭 بعد از حرکت درست: <span class='cm-line'>" + fixSans.join(" ") + "</span>"
        : "")
    );
    coachActionMsg("info", "چطور ادامه بدهیم؟", [
      { id: "retry", label: "برگرد و تلاش کن", icon: "fa-undo", primary: true },
      { id: "show-best", label: "حرکت درست را نشانم بده", icon: "fa-eye" },
      { id: "demo", label: "نمایش ادامه‌ی بازی", icon: "fa-play" },
      { id: "continue", label: "ادامه از همین‌جا", icon: "fa-forward" },
    ]);
    $("lessonFeedback").hidden = false;
    $("lessonFeedback").className = "feedback-bar error";
    $("lessonFeedback").innerHTML =
      "<span>" + kindLabel + (bestSan ? " بهترین حرکت: <span class='fb-best'>" + bestSan + "</span>" : "") +
      '<span class="fb-actions"><button class="fb-btn primary" data-fb="retry"><i class="fas fa-undo"></i> برگشت</button>' +
      '<button class="fb-btn" data-fb="demo"><i class="fas fa-play"></i> نمایش ادامه</button></span></span>';
  }

  let pendingBad = null; // {bestUci, bestFen} برای «حرکت درست را نشانم بده»

  // نمایش زنده‌ی ادامه‌ی خطای کاربر: انجین بهترین بازی را نشانت می‌دهد
  async function demoContinuation() {
    const T = lessonTrainer;
    const myEpoch = T.epoch;
    T.phase = "engine";
    $("lessonFeedback").hidden = true;
    let plies = 0;
    const startCp = lessonAn ? lessonAn.bestCp : null;
    let finalCp = null;
    while (plies < 4) {
      if (myEpoch !== T.epoch) return;
      const r = await askEngine(T.game.fen(), { movetime: 150, depth: 14 });
      if (myEpoch !== T.epoch) return;
      if (!r.move) break;
      const applied = T.game.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion || "q" });
      if (!applied) break;
      T.lastMove = { from: applied.from, to: applied.to };
      T.renderBoard();
      plies++;
      const sideIsUser = applied.color === T.userColor;
      const cpForUser = r.score ? (sideIsUser ? cpOf(r.score) : -cpOf(r.score)) : null;
      if (cpForUser !== null) {
        T.setEval(cpForUser);
        finalCp = cpForUser;
      }
      const st = T.gameState();
      if (st.over) {
        coachMsg(st.kind === "got-mated" ? "bad" : "info",
          st.kind === "got-mated"
            ? "💀 دیدی؟ ادامه‌ی بازی به ماتِ تو رسید!"
            : "🤝 ادامه‌ی بازی به پایان رسید.");
        break;
      }
      if (cpForUser !== null) {
        coachMsg(plies % 2 ? "info" : "neutral",
          "پلی " + fa(plies) + ": <span class='san'>" + applied.san + "</span> — ارزیابی برای تو: <b>" +
          fmtCp(cpForUser, true) + "</b>");
      }
      await new Promise((res) => setTimeout(res, 650));
      if (myEpoch !== T.epoch) return;
    }
    coachActionMsg("info",
      "همین‌طور ادامه پیدا می‌کند" +
      (startCp !== null && finalCp !== null
        ? " — برتری از <b>" + fmtCp(startCp, true) + "</b> به <b>" + fmtCp(finalCp, true) + "</b> رسید."
        : ".") +
      " بهترین راه: برگرد و حرکت درست را پیدا کن.", [
      { id: "retry", label: "برگرد و تلاش کن", icon: "fa-undo", primary: true },
      { id: "continue", label: "ادامه از همین‌جا", icon: "fa-forward" },
    ]);
  }

  // برگشت هوشمند: دقیقاً به موقعیتِ «قبل از حرکتِ بد» — حتی بعد از دمو
  function retryBadMove() {
    const T = lessonTrainer;
    const plyBefore = pendingBad && pendingBad.plyBefore != null ? pendingBad.plyBefore : Math.max(0, T.game.history().length - 1);
    const n = Math.max(1, T.game.history().length - plyBefore);
    T.undoToUser(n);
    T.phase = "user";
    $("lessonFeedback").hidden = true;
    setCoachStatus("نوبت توست");
  }

  function handleCoachAction(id) {
    const T = lessonTrainer;
    if (id === "retry") {
      retryBadMove();
      pendingBad = null;
      coachMsg("neutral", "↩️ برگشتیم — حالا حرکت درست را پیدا کن!");
      ensureLessonAnalysis();
    } else if (id === "show-best" && pendingBad) {
      retryBadMove();
      $("lessonFeedback").hidden = true;
      const { bestUci, bestFen } = pendingBad;
      if (bestUci) {
        drawArrows($("boardArrows"), [{ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), color: "#38a169" }], T.flipped);
        T.hintFrom = bestUci.slice(0, 2);
        T.hintTo = bestUci.slice(2, 4);
        T.renderBoard();
        const san = moveCoordToSan(bestFen, bestUci.slice(0, 2), bestUci.slice(2, 4), bestUci.length === 5 ? bestUci[4] : null);
        coachMsg("gold", "💡 حرکت درست: <span class='san'>" + san + "</span> — خودت بزن تا یادت بماند!");
      }
      pendingBad = null;
      setCoachStatus("نوبت توست");
    } else if (id === "demo") {
      // pendingBad نگه داشته می‌شود تا «برگرد و تلاش کن» بعد از دمو هم درست کار کند
      demoContinuation();
    } else if (id === "continue") {
      pendingBad = null;
      $("lessonFeedback").hidden = true;
      const T2 = lessonTrainer;
      (async () => {
        const myEpoch = T2.epoch;
        const r = await T2.engineMove({ movetime: 180, depth: 16 });
        if (myEpoch !== T2.epoch) return;
        const st = T2.gameState();
        if (st.over) return finishLesson(st.kind);
        await ensureLessonAnalysis({ quickFirst: true });
      })();
    }
  }
  // ---------- پایان درس ----------
  const END_TITLES = {
    "mate-win": "🏆 مات! معما را بردی",
    drawn: "🤝 بازی مساوی شد",
    survived: "🛡 دفاع موفق — مساوی گرفتی",
    stalemate: "🤝 پات! بازی مساوی شد",
    insufficient: "🤝 مهره‌ی کافی برای مات نیست",
    threefold: "🤝 تساوی با تکرار سه‌باره",
    fifty: "🤝 قانون ۵۰ حرکت — تساوی رسمی",
    fiftylost: "📉 قانون ۵۰ حرکت — برد از دست رفت",
    "got-mated": "💀 مات شدی",
    mated: "💀 مات شدی",
    timeout: "⏰ زمان تمام شد",
  };

  function finishLesson(reason) {
    const T = lessonTrainer;
    T.phase = "done";
    T.epoch++; // تحلیل‌های معلق را باطل کن
    T.stopTimer();
    const pos = currentLesson;
    if (!pos) return;
    // 🎯 موفقیت بر اساس طبقه‌بندی انجین موقع شروع درس؛ درس تا نتیجه‌ی واقعی بازی شد
    const objective = lessonObjective || (pos.goal === "draw" ? "draw" : "win");
    let success = false;
    if (objective === "win") {
      success = reason === "mate-win";
      if (reason === "fifty") reason = "fiftylost"; // برد با شمارنده‌ی ۵۰ حرکت سوخت
    } else {
      success = ["drawn", "stalemate", "insufficient", "threefold", "survived", "fifty"].includes(reason);
    }
    let stars = 0;
    if (success) {
      stars = T.mistakes === 0 && T.hints === 0 ? 3 : T.mistakes <= 2 ? 2 : 1;
    }
    // ذخیره پیشرفت
    const prog = getProgress();
    const rec = prog[pos.fenKey] || { stars: 0, attempts: 0, done: false };
    rec.attempts++;
    if (success) {
      rec.done = true;
      rec.stars = Math.max(rec.stars || 0, stars);
    }
    prog[pos.fenKey] = rec;
    saveStore(PROGRESS_KEY, prog);

    // کارت پایان
    const card = $("lessonDoneCard");
    card.hidden = false;
    card.classList.toggle("failed", !success);
    $("doneStars").innerHTML = [1, 2, 3]
      .map((i) => '<i class="fas fa-star' + (i <= stars ? " earned" : "") + '"></i>')
      .join("");
    $("doneTitle").textContent = END_TITLES[reason] || (success ? "🏆 آفرین!" : "این‌بار نشد");
    $("doneDetail").textContent =
      "حرکت‌ها: " + fa(T.userMoves) + " · اشتباه: " + fa(T.mistakes) + " · راهنما: " + fa(T.hints) +
      " · زمان: " + fa(Math.round((Date.now() - T.startedAt) / 1000)) + " ثانیه";
    coachMsg(success ? "gold" : "bad",
      success
        ? "<b>" + END_TITLES[reason] + "</b> — این درس ثبت شد. برو سراغ بعدی!"
        : "نتیجه‌ی مطلوب به دست نیامد — «تمرین دوباره» بزن یا برو درس بعدی.");
    // دکمه‌ها
    const nextBtn = $("doneNextBtn");
    const next = POSITIONS[pos.idx + 1];
    if (next) {
      nextBtn.disabled = false;
      nextBtn.onclick = () => openLesson(next);
    } else {
      nextBtn.disabled = true;
      nextBtn.onclick = null;
    }
    $("doneRetryBtn").onclick = () => openLesson(pos);
    setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
  }

  // ============================================================
  // ⚡ حالت چالش — تایمر دلخواه + بات تشخیص ضعف
  // ============================================================
  let challengeTrainer = null;
  let chTime = 60;
  let chMode = "smart"; // smart | random
  let chRunning = false;
  let chSession = { solved: 0, failed: 0, streak: 0, bestStreak: 0, posNum: 0 };
  let chCurrent = null;
  let chObjective = null; // برد/مساوی — حکم انجین برای موقعیت جاری چالش
  let chRecentFens = [];
  let chNextTimer = null;

  function getChStats() {
    return loadStore(CH_KEY, { score: 0, solved: 0, failed: 0, streak: 0, bestStreak: 0, cats: {} });
  }
  function saveChStats(s) {
    saveStore(CH_KEY, s);
  }

  function renderChStats() {
    const el = $("chStats");
    if (!el) return;
    const s = getChStats();
    const net = s.score;
    el.innerHTML =
      '<div class="ch-stat"><div class="cs-val ' + (net >= 0 ? "pos" : net < 0 ? "neg" : "") + '">' + fa(net) + "</div><div class='cs-label'>امتیاز کل</div></div>" +
      '<div class="ch-stat"><div class="cs-val">' + fa(s.solved) + "</div><div class='cs-label'>حل‌شده</div></div>" +
      '<div class="ch-stat"><div class="cs-val">' + fa(s.failed) + "</div><div class='cs-label'>شکست</div></div>" +
      '<div class="ch-stat"><div class="cs-val">' + fa(s.bestStreak) + "</div><div class='cs-label'>بهترین زنجیره</div></div>";
  }

  // بات ضعف‌یاب: دسته‌بندی متریال با کمترین نسبت برد — با دسته‌بندی جدید حرفه‌ای‌تر شد
  function pickChallengePosition() {
    const pool = POSITIONS.filter((p) => !chRecentFens.includes(p.fenKey));
    const usable = pool.length ? pool : POSITIONS;
    if (chMode === "random" || usable.length <= 1) return pick(usable);
    const stats = getChStats();
    // دسته‌های موجود در استخر با آمار
    const byCat = {};
    usable.forEach((p) => {
      (byCat[p.cat] = byCat[p.cat] || []).push(p);
    });
    let weakest = null;
    let weakestRate = Infinity;
    Object.keys(byCat).forEach((cat) => {
      const c = stats.cats[cat] || { a: 0, w: 0 };
      if (c.a < 2) return; // آمار کافی نیست
      const rate = c.w / c.a;
      if (rate < weakestRate) {
        weakestRate = rate;
        weakest = cat;
      }
    });
    if (weakest && weakestRate < 1) {
      return pick(byCat[weakest]);
    }
    // آمار کافی نیست → هر دسته‌ای که کمترین تلاش را داشته (تنوع یادگیری)
    const cats = Object.keys(byCat);
    if (cats.length) {
      cats.sort((a, b) => ((stats.cats[a] || { a: 0 }).a) - ((stats.cats[b] || { a: 0 }).a));
      if (Math.random() < 0.65) return pick(byCat[cats[0]]);
    }
    return pick(usable);
  }

  function fmtTimer(sec) {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.max(0, sec) % 60;
    return fa(m) + ":" + fa(String(s).padStart(2, "0"));
  }

  function updateChHud() {
    $("chScoreNum").textContent = fa(chSession.solved - chSession.failed);
    $("chStreakNum").textContent = fa(chSession.streak);
    $("chPosNum").textContent = "موقعیت " + fa(chSession.posNum);
  }

  function chTick(sec) {
    const el = $("chTimerNum");
    el.textContent = fmtTimer(sec);
    el.classList.toggle("urgent", sec <= 10);
  }

  function startChallenge() {
    chRunning = true;
    chSession = { solved: 0, failed: 0, streak: 0, bestStreak: 0, posNum: 0 };
    $("challengeIntro").hidden = true;
    $("challengeSummary").hidden = true;
    $("challengeRun").hidden = false;
    $("chTimerNum").classList.remove("urgent");
    loadNextChallengePos();
  }

  async function loadNextChallengePos() {
    const pos = pickChallengePosition();
    chCurrent = pos;
    chSession.posNum++;
    chRecentFens.unshift(pos.fenKey);
    chRecentFens = chRecentFens.slice(0, 6);
    // ثبت تلاش در آمار دسته
    const stats = getChStats();
    stats.cats[pos.cat] = stats.cats[pos.cat] || { a: 0, w: 0 };
    stats.cats[pos.cat].a++;
    saveChStats(stats);

    $("chFeedback").hidden = true;
    challengeTrainer.opts.timerSec = chTime;
    challengeTrainer.load(pos.fen, pos.side);
    updateChHud();
    chTick(chTime);
    // 🧭 هدف را انجین از روی FEN تشخیص می‌دهد:
    // اگر کش تحلیل درس موجود است رایگان می‌آید؛ وگرنه یک پرسشِ تکی سریع
    // (تحلیل کاملِ همه‌ی حرکات صف انجین را اشغال نمی‌کند تا پاسخ حریف کند نشود)
    let objective = pos.goal === "draw" ? "draw" : "win";
    let verdictFa = null;
    if (engineAvailable) {
      const cached = evalCacheGet(pos.fenKey);
      let bestCp = null;
      if (cached && cached.u && typeof cached.b === "string") {
        bestCp = typeof cached.u[cached.b] === "number" ? cached.u[cached.b] : null;
      }
      if (bestCp === null) {
        const q = await askEngine(pos.fen, { movetime: 220, depth: 16 });
        if (q.score) bestCp = cpOf(q.score);
      }
      if (bestCp !== null) {
        const cls = posClassOf(bestCp, pos.fen);
        objective = cls === "lose" ? "draw" : cls;
        verdictFa = cls === "win" ? "برنده" : cls === "lose" ? "بازنده — دفاع کن" : posTierOf(bestCp).fa;
      }
    }
    chObjective = objective;
    $("chGoal").innerHTML =
      (objective === "draw"
        ? '<i class="fas fa-shield-alt"></i> ' + (verdictFa ? "انجین: <b>" + verdictFa + "</b> · هدف: <b>مساوی/دفاع</b>" : "هدف: <b>مساوی</b>")
        : '<i class="fas fa-trophy"></i> ' + (verdictFa ? "انجین: <b>" + verdictFa + "</b> · هدف: <b>مات</b>" : "هدف: <b>برد</b>")) +
      " · متریال: <b>" + materialText(pos.mat.w) + " برابر " + materialText(pos.mat.b) + "</b>" +
      (chMode === "smart" ? ' · <i class="fas fa-user-graduate"></i> انتخاب مربی: <b>' + ((CAT_META[pos.cat] || {}).fa || pos.sig) + "</b>" : "") +
      " · ساعت با اولین حرکت شروع می‌شود";
  }

  function challengeResult(success, reason) {
    if (!chRunning) return;
    const T = challengeTrainer;
    T.phase = "done";
    T.epoch++; // هر تحلیل/حرکت معلق را باطل کن
    T.stopTimer();
    const fb = $("chFeedback");
    fb.hidden = false;
    // امتیاز شناور
    const fl = document.createElement("div");
    fl.className = "score-float " + (success ? "plus" : "minus");
    fl.textContent = success ? "+۱" : "−۱";
    document.body.appendChild(fl);
    setTimeout(() => fl.remove(), 1400);

    const stats = getChStats();
    if (success) {
      chSession.solved++;
      chSession.streak++;
      chSession.bestStreak = Math.max(chSession.bestStreak, chSession.streak);
      stats.score++;
      stats.solved++;
      stats.streak = chSession.streak;
      stats.bestStreak = Math.max(stats.bestStreak || 0, chSession.streak);
      if (chCurrent && stats.cats[chCurrent.cat]) stats.cats[chCurrent.cat].w++;
      fb.className = "feedback-bar success";
      fb.innerHTML = "<span>✅ نتیجه‌ی درست رسید! <b>+۱</b> — موقعیت بعدی…</span>";
    } else {
      chSession.failed++;
      chSession.streak = 0;
      stats.score--;
      stats.failed++;
      stats.streak = 0;
      fb.className = "feedback-bar error";
      const msgs = {
        timeout: "⏰ زمان تمام شد و به نتیجه نرسیدی",
        "got-mated": "💀 مات شدی",
        stalemate: "🤝 پات — نتیجه‌ی برد از دست رفت",
        drawn: "🤝 بازی مساوی شد ولی هدف برد بود",
        insufficient: "🤝 مهره‌ی کافی برای برد نبود",
        threefold: "🤝 تکرار سه‌باره — هدف برد محقق نشد",
        fifty: "🤝 قانون ۵۰ حرکت — نتیجه‌ی برد محقق نشد",
        holdlost: "📉 موقعیت بازنده — نتیجه‌ی مساوی نگه نداشتی",
      };
      fb.innerHTML = "<span>" + (msgs[reason] || "❌ نتیجه‌ی درست به دست نیامد") + " — <b>−۱</b>، موقعیت بعدی…</span>";
    }
    saveChStats(stats);
    updateChHud();
    clearTimeout(chNextTimer);
    chNextTimer = setTimeout(() => {
      if (chRunning) loadNextChallengePos();
    }, 1500);
  }

  async function onChallengeUserMove(mv, T) {
    if (!chRunning) return;
    const myEpoch = T.epoch;
    const objective = chObjective || (chCurrent && chCurrent.goal === "draw" ? "draw" : "win");
    const drawKinds = ["drawn", "stalemate", "insufficient", "threefold", "fifty"];
    const st = T.gameState();
    if (st.over) {
      if (objective === "draw") {
        challengeResult(drawKinds.includes(st.kind), st.kind);
      } else {
        challengeResult(st.kind === "mate-win", st.kind);
      }
      return;
    }
    $("chFeedback").hidden = true;
    // حرکت انجین — بدون هیچ بازخوردی درباره‌ی حرکت کاربر، تا نتیجه‌ی واقعی
    const r = await T.engineMove({ movetime: 130, depth: 14 });
    if (myEpoch !== T.epoch) return;
    const st2 = T.gameState();
    if (st2.over) {
      if (objective === "draw") {
        challengeResult(drawKinds.includes(st2.kind), st2.kind);
      } else {
        challengeResult(st2.kind === "mate-win", st2.kind);
      }
    }
  }

  async function onChallengeTimeout() {
    const T = challengeTrainer;
    if (!chRunning || T.phase === "done") return;
    const objective = chObjective || (chCurrent && chCurrent.goal === "draw" ? "draw" : "win");
    if (objective === "draw") {
      // اگر موقعیت هنوز دفاع‌پذیر است = مساوی حفظ شد
      const resp = await askEngine(T.game.fen(), { movetime: 250, depth: 16 });
      const st = T.game.turn();
      const cpUser = resp.score ? (st === T.userColor ? cpOf(resp.score) : -cpOf(resp.score)) : 0;
      challengeResult(cpUser >= -150, cpUser >= -150 ? "survived" : "holdlost");
    } else {
      challengeResult(false, "timeout");
    }
  }

  function endChallengeSession() {
    chRunning = false;
    clearTimeout(chNextTimer);
    challengeTrainer.abort();
    $("challengeRun").hidden = true;
    const sum = $("challengeSummary");
    sum.hidden = false;
    const s = getChStats();
    const net = chSession.solved - chSession.failed;
    let verdict;
    if (chSession.posNum === 0) verdict = "هنوز موقعیتی بازی نکردی!";
    else if (net >= 3) verdict = "🔥 فوق‌العاده بودی! همین روند را حفظ کن.";
    else if (net >= 0) verdict = "👍 مثبت بستی — با چند درس از «آموزش» بهتر هم می‌شوی.";
    else verdict = "💪 نگران نباش — اول تکنیک‌ها را در بخش «آموزش» یاد بگیر، بعد برگرد.";
    sum.innerHTML =
      "<h3><i class='fas fa-flag-checkered'></i> جلسه‌ی چالش تمام شد</h3>" +
      '<div class="cs-big">' + (net >= 0 ? "+" : "−") + fa(Math.abs(net)) + "</div>" +
      "<p>" + fa(chSession.solved) + " حل · " + fa(chSession.failed) + " شکست · بهترین زنجیره: <b>" +
      fa(chSession.bestStreak) + "</b></p>" +
      "<p>" + verdict + "</p>" +
      "<p style='margin-top:0.3rem'>📊 امتیاز کل: <b>" + fa(s.score) + "</b> · حل‌شده: <b>" + fa(s.solved) +
      "</b> · شکست: <b>" + fa(s.failed) + "</b></p>" +
      '<div class="done-buttons">' +
      '<button class="btn-sm primary" id="chAgainBtn"><i class="fas fa-redo"></i> جلسه‌ی جدید</button>' +
      '<button class="btn-sm" id="chGoLearn"><i class="fas fa-graduation-cap"></i> رفتن به آموزش</button>' +
      "</div>";
    $("chAgainBtn").addEventListener("click", () => {
      sum.hidden = true;
      startChallenge();
    });
    $("chGoLearn").addEventListener("click", () => switchMode("academy"));
    renderChStats();
  }

  // ============================================================
  // 📚 مفاهیم — حرفه‌ای با فیلتر و نمونه‌ی زنده
  // ============================================================
  const CONCEPTS = [
    {
      id: "opposition", cat: "king", icon: "fa-arrows-alt-h", title: "اوپوزیسیون (روبه‌رویی)",
      text: "دو پادشاه در یک ستون یا ردیف، دقیقاً مقابل هم و با یک خانه فاصله: قاعده‌ی طلایی «نوبتِ بد است!» — پادشاهی که باید حرکت کند مجبور به واگذاری مسیر می‌شود. در پایانی‌های پیاده، کسی که اوپوزیسیون را بگیرد کل بازی را در دست دارد؛ به همین دلیل قبل از پیشروی پیاده، اول باید جای پادشاه‌ها و نوبت حرکت را حساب کنی.",
      tip: "اگر می‌خواهی حریف عقب بنشیند، خودت را در موقعیتی نگه دار که نوبت با او باشد و دو شاه مقابل هم ایستاده باشند.",
      fen: "8/8/3k4/8/3KP3/8/8/8 w - - 0 1",
      fenNote: "پادشاه سیاه اوپوزیسیون را گرفته و چون نوبت با سفید است، سفید هیچ راه پیشروی ندارد — تساوی قطعی.",
    },
    {
      id: "king-activity", cat: "king", icon: "fa-crown", title: "فعالیت پادشاه — قهرمان آخربازی",
      text: "در گشایش پادشاه باید پنهان بماند، اما وقتی مهره‌های سنگین از تخته رفتند، پادشاه به مهره‌ای تقریباً هم‌ارز رخ تبدیل می‌شود: مرکز را تصاحب می‌کند، پیاده‌ها را حمایت می‌کند و خودش مهاجم می‌شود. اکثر آخربازی‌های مساوی‌نما فقط با «پادشاه فعال‌تر» برنده می‌شوند؛ پادشاه منفعل یعنی بازی با یک مهره‌ی کمتر.",
      tip: "قبل از هر برنامه‌ریزی بپرس: «پادشاه من کجاست؟» — در آخربازی پادشاهِ جلوتر معمولاً برنده است.",
      fen: null, fenNote: null,
    },
    {
      id: "passed-pawn", cat: "pawn", icon: "fa-chess-pawn", title: "پیاده‌ی گذری — بلیت پیروزی",
      text: "پیاده‌ای که در مسیر تبدیلش هیچ پیاده‌ی حریفی جلویش یا کنارش نیست، «گذری» است. قانون مهم: پیاده‌ی گذری باید پیش برود و حریف را وادار به واکنش کند — هر مهره‌ای که برای متوقف‌کردنش سر و کله می‌زند، از وظیفه‌ی اصلیش غافل می‌شود. دو پیاده‌ی گذری متصل تقریباً غیرقابل توقف‌اند و پیاده‌ی گذریِ دور از پادشاه مدافع (خارج از «مربع») تبدیل می‌شود.",
      tip: "پیاده‌ی گذری را زود عجولانه جلو نکش؛ اول پادشاه را حمایتگر کن، بعد پیش ببر.",
      fen: null, fenNote: null,
    },
    {
      id: "square-rule", cat: "pawn", icon: "fa-vector-square", title: "قانون مربع",
      text: "برای فهمیدن اینکه پادشاه می‌تواند پیاده‌ی عبوری را بگیرد، مربعی خیالی جلوی پیاده بکش که ضلعش برابر فاصله‌ی پیاده تا خانه‌ی تبدیل است. اگر پادشاه مدافع داخل مربع (یا روی مسیرش) بایستد، پیاده را می‌گیرد؛ وگرنه پیاده آزاد است. نکته‌ی دقیق: اگر نوبت با پیاده است، مربع را از خانه‌ی جلوی پیاده بکش — پیاده یک خانه «سرپایی» دارد.",
      tip: "قبل از فداکردن مهره برای ساخت پیاده‌ی گذری، مربع را روی کاغذ ذهنی‌ات بکش.",
      fen: null, fenNote: null,
    },
    {
      id: "zugzwang", cat: "tactic", icon: "fa-lock", title: "زوتسوانگ — اجبار به حرکت",
      text: "زوتسوانگ وضعیتی است که هر حرکتی موقعیت را بدتر می‌کند ولی مجبور به حرکتی. در آخربازی این سلاح اصلی برنده‌شدن است: وقتی همه‌چیز روبروست، «حرکت انتظار» نوبت را به حریف می‌دهد و او مجبور می‌شود دفاعش را رها کند یا پیاده‌ای بدهد. ماتِ کلاسیک رخ هم دقیقاً با همین ابزار تکمیل می‌شود: پادشاه‌ها روبرو، رخِ شما صبر می‌کند و پادشاه حریف باید راه بدهد.",
      tip: "وقتی حریف هیچ حرکت مفیدی ندارد، با پیاده یا رخ یک حرکت انتظار بزن — نه با پادشاه!",
      fen: null, fenNote: null,
    },
    {
      id: "stalemate-trap", cat: "tactic", icon: "fa-ban", title: "پات — تله‌ی همیشگی",
      text: "پات یعنی نوبت‌دار هیچ حرکت قانونی ندارد و کیش هم نیست: تساوی! مهاجمِ بی‌دقت در موقعیت کاملاً برنده، همه‌چیز را با یک حرکت از دست می‌دهد — مخصوصاً وزیر که عاشق ساختن پات است. قاعده‌ی ضدپات: قبل از مات کردن، همیشه یک خانه‌ی فرار برای پادشاه حریف باقی بگذار و وقتی متریال کم است، از کیش‌های بی‌هدف پرهیز کن. مدافع برعکس، عاشق پات است: پادشاه را گوشه‌ای ببر که خانه‌هایش با مهره‌های مهاجم پر شود.",
      tip: "با وزیر در آخربازی، قبل از هر کیش بپرس: «آیا این کیش خانه‌ی آخر حریف را هم می‌بندد؟»",
      fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      fenNote: "پات کلاسیک! شاه سیاه هیچ حرکتی ندارد ولی کیش هم نیست — برتری کامل سفید مساوی شد.",
    },
    {
      id: "waiting-move", cat: "tactic", icon: "fa-hourglass-half", title: "حرکت انتظار — هنر صبر",
      text: "حرکت انتظار یعنی مهره‌ای را یک‌جا عقب‌وجلو بردن (با رخ، فیل یا پیاده) بدون تغییر ساختار، فقط برای برگرداندن نوبت. در پایانی‌های دقیق، نیمی از بردن‌ها با «چه کسی مجبور است اول حرکت کند» تعیین می‌شود نه با متریال. تکنیک: ساختار را طوری بساز که وقتی حریف «حرکت مفیدی ندارد»، تو حرکت انتظار داشته باشی و او مجبور به تسلیمِ یکی از مواضع شود.",
      tip: "در پایانی پیاده، حرکت انتظار معمولاً با پیاده زده می‌شود تا پادشاه همیشه اوپوزیسیون را حفظ کند.",
      fen: null, fenNote: null,
    },
    {
      id: "fifty-move", cat: "tactic", icon: "fa-list-ol", title: "قانون ۵۰ حرکت",
      text: "۵۰ حرکت پشت‌سرهم بدون گرفتن و بدون حرکت پیاده = حق ادعای تساوی. در آخربازی‌های طولانی (دو فیل، رخ در برابر مهره‌های سبک و…) این شمارنده بخشی از برنامه است: مهاجم باید قبل از پرشدن شمارنده راه مات را باز کند و مدافع می‌تواند فقط با بقا، امتیاز بگیرد. هر گرفتن یا حرکت پیاده شمارنده را صفر می‌کند — گاهی یک حرکت پیاده‌ی به‌ظاهر بی‌فایده دقیقاً برای همین زده می‌شود.",
      tip: "در دنبال‌کردن مات‌های طولانی، هرچند حرکت یک‌بار شمارنده را در ذهنت چک کن.",
      fen: null, fenNote: null,
    },
    {
      id: "rook-behind", cat: "rook", icon: "fa-grip-lines", title: "رخ پشت پیاده‌ی عبوری (قانون تاراش)",
      text: "قاعده‌ی مشهور تاراش: رخ را «پشت» پیاده‌ی عبوری بگذار — پشتِ پیاده‌ی خودت (حمایت و پیشروی) یا پشتِ پیاده‌ی حریف (توقف و کیش از عقب). رخی که پشت پیاده است با هر پیشرویِ پیاده قدرتمندتر می‌شود؛ رخی که جلوی پیاده است با هر قدم، محدودتر. در پایانی‌های رخ و پیاده، این قاعده ساده نتیجه‌ی ده‌ها موقعیت را تعیین می‌کند.",
      tip: "شک داری؟ رخ را پشت پیاده‌ی عبوری بگذار — هرکه مالش باشد.",
      fen: null, fenNote: null,
    },
    {
      id: "lucena-bridge", cat: "rook", icon: "fa-archway", title: "پل لوچنا",
      text: "معروف‌ترین موقعیت پایانی رخ: پادشاهِ تو جلوی پیاده‌ی رج است و رخِ حریف از پشت کیش می‌دهد. راه‌حل قرن هفدهمی: اول رخ را به ردیف چهارم ببر («پل»)، بعد پادشاه را کنار برو، بعد پیاده را جلو بکش؛ حالا کیش‌های ردیفی حریف را با خودِ رخ روی ردیف چهارم مهار می‌کنی و پیاده آزادانه تبدیل می‌شود. با این ترتیب، هیچ دفاعی جواب نمی‌دهد — برای هر شطرنج‌باز جدی اجباری است.",
      tip: "ترتیب مقدس: ۱) پل روی ردیف ۴ ۲) کناررفتن پادشاه ۳) پیشروی پیاده.",
      fen: "3K4/3P1k2/8/8/8/8/6r1/4R3 w - - 0 1",
      fenNote: "موقعیت لوچنا: سفید با پل‌زدن روی ردیف چهارم برنده است — در بخش آموزش خود انجین قدم‌به‌قدم یادت می‌دهد.",
    },
    {
      id: "philidor-defense", cat: "rook", icon: "fa-shield-virus", title: "دفاع فیلیدور",
      text: "سمت مدافعِ پایانی رخ: وقتی حریف پیاده‌ی رج دارد و پادشاهش جلوی پیاده است، رخت را روی «ردیف سومِ خودت» (از سمت مدافع) قرار بده تا پادشاه حریف هرگز نتواند جلوی پیاده‌اش جا بگیرد. تا وقتی رخ آن‌جا ایستاده، حریف پیشرفتی ندارد؛ به‌محض اینکه پیاده به ردیف ششم رسید، رخ را به عقب (پشت پیاده) ببر و از آن به بعد کیش‌های ردیفی بی‌پایان می‌دهد: تساوی. جفتِ لوچنا-فیلیدور یعنی تسلط کامل بر مهم‌ترین پایانی شطرنج.",
      tip: "مدافع: رخ روی ردیف سوم، انتظار برای پیشروی پیاده، بعد کیش از پشت. مهاجم: اگر رخ حریف ردیف سوم است، اول فکر کن!",
      fen: null, fenNote: null,
    },
    {
      id: "rook-pawn-draw", cat: "rook", icon: "fa-corner", title: "پیاده‌ی رخ و گوشه",
      text: "پیاده‌های ستون a و h («پیاده‌ی رخ») قدرتِ بردِ کمتری دارند: اگر پادشاه مدافع به گوشه برسد، پیشروی پیاده به پات می‌خورد — خانه‌ی تبدیل کنار دیوار است و پادشاهِ گوشه‌نشین راهِ فرارِ پات‌ساز را می‌بندد. حتی وزیر هم به‌تنهایی در برابر پادشاهِ گوشه‌گیر و پیاده‌ی رخِ محافظت‌شده هیچ کاری نمی‌کند. مدافع: برو گوشه و تمام. مهاجم: با پیاده‌ی رخ فقط وقتی می‌بری که پادشاهت بتواند به گوشه‌ی حریف نفوذ کند.",
      tip: "دفاع سخت‌ترین پایانی‌ها: پادشاه را در گوشه‌ی ستونِ پیاده نگه دار و از وسط تخته دور شو.",
      fen: "7k/8/8/8/8/8/7P/7K w - - 0 1",
      fenNote: "پیاده‌ی h سفید در برابر پادشاهِ گوشه‌گیر سیاه: مساوی قطعی — خودت تجربه‌اش کن!",
    },
  ];
  const CONCEPT_CATS = [
    { code: "all", name: "همه", icon: "fa-th" },
    { code: "king", name: "پادشاه", icon: "fa-crown" },
    { code: "pawn", name: "پیاده", icon: "fa-chess-pawn" },
    { code: "rook", name: "رخ", icon: "fa-chess-rook" },
    { code: "tactic", name: "تاکتیک", icon: "fa-bolt" },
  ];
  let conceptFilter = "all";
  const miniBoards = [];

  function renderConceptFilters() {
    const wrap = $("conceptFilters");
    if (!wrap) return;
    wrap.innerHTML = "";
    CONCEPT_CATS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip" + (conceptFilter === c.code ? " active" : "");
      b.innerHTML = '<i class="fas ' + c.icon + '"></i> ' + c.name;
      b.addEventListener("click", () => {
        conceptFilter = c.code;
        renderConceptFilters();
        renderConcepts();
      });
      wrap.appendChild(b);
    });
  }

  function renderConcepts() {
    const grid = $("conceptsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    miniBoards.length = 0;
    CONCEPTS.filter((c) => conceptFilter === "all" || c.cat === conceptFilter).forEach((c) => {
      const card = document.createElement("div");
      card.className = "concept-card cat-" + c.cat;
      let diagram = "";
      if (c.fen) {
        diagram =
          '<div class="concept-diagram">' +
          '<div class="mini-board" data-mini="' + c.id + '"></div>' +
          '<div class="mini-board-note">' + c.fenNote + "</div></div>";
      }
      card.innerHTML =
        '<div class="concept-head"><span class="concept-icon"><i class="fas ' + c.icon + '"></i></span>' +
        "<h3>" + c.title + "</h3></div>" +
        '<div class="concept-body"><div class="cc-text">' + c.text + "</div>" +
        diagram +
        '<div class="cc-tip"><b>💡 نکته‌ی طلایی:</b> ' + c.tip + "</div></div>" +
        '<div class="concept-foot"><button class="concept-practice" data-practice="' + c.id + '">' +
        '<i class="fas fa-graduation-cap"></i> تمرین موقعیت‌های مرتبط در آموزش</button></div>';
      grid.appendChild(card);
      if (c.fen) {
        const mb = card.querySelector("[data-mini]");
        miniBoards.push({ el: mb, fen: c.fen });
        renderMiniBoard(mb, c.fen);
      }
    });
  }

  // ============================================================
  // 🧭 تب‌ها و راه‌اندازی
  // ============================================================
  function switchMode(mode) {
    ["academy", "concepts", "challenge"].forEach((m) => {
      const sec = $(m + "Section");
      if (sec) sec.hidden = m !== mode;
    });
    document.querySelectorAll("#modeTabs .mode-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.mode === mode);
    });
    // قطع فعالیت چالش هنگام خروج
    if (mode !== "challenge" && chRunning) {
      endChallengeSession();
    }
    if (mode === "concepts") {
      miniBoards.forEach((m) => renderMiniBoard(m.el, m.fen));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function init() {
    initEngine();

    // مربی‌ها
    lessonTrainer = createTrainer({
      boardEl: $("lessonBoard"),
      arrowsEl: $("boardArrows"),
      evalFillEl: $("lessonEvalFill"),
      statusFn: null,
      onUserMove: onLessonUserMove,
    });
    challengeTrainer = createTrainer({
      boardEl: $("chBoard"),
      statusFn: null,
      onUserMove: onChallengeUserMove,
      onTimeout: onChallengeTimeout,
      onTimerTick: chTick,
    });

    // تب‌ها
    document.querySelectorAll("#modeTabs .mode-tab").forEach((t) => {
      t.addEventListener("click", () => switchMode(t.dataset.mode));
    });

    // اورلی درس
    $("lessonBackBtn").addEventListener("click", closeLesson);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("lessonOverlay").classList.contains("open")) closeLesson();
    });
    $("lessonHintBtn").addEventListener("click", () => {
      const T = lessonTrainer;
      if (T.phase !== "user" || !engineAvailable) return;
      // تحلیل باید دقیقاً برای «موقعیت فعلی نوبت کاربر» باشد
      if (!lessonAn || lessonAn.fen !== T.game.fen()) {
        ensureLessonAnalysis().then((an) => showHint(an));
        return;
      }
      showHint(lessonAn);
    });
    function showHint(an) {
      if (!an || !an.bestUci) return;
      lessonTrainer.hints++;
      drawArrows(
        $("boardArrows"),
        [{ from: an.bestUci.slice(0, 2), to: an.bestUci.slice(2, 4), color: "#38a169" }],
        lessonTrainer.flipped
      );
      lessonTrainer.hintFrom = an.bestUci.slice(0, 2);
      lessonTrainer.hintTo = an.bestUci.slice(2, 4);
      lessonTrainer.selected = null;
      lessonTrainer.renderBoard();
      const san = moveCoordToSan(
        an.fen,
        an.bestUci.slice(0, 2),
        an.bestUci.slice(2, 4),
        an.bestUci.length === 5 ? an.bestUci[4] : null
      );
      coachMsg("gold",
        "💡 بهترین حرکت انجین: <span class='san'>" + san + "</span>" +
        " (ارزیابی " + fmtCp(an.bestCp, true) + ") — راهنما روی ستاره‌هایت اثر دارد.");
    }
    $("lessonUndoBtn").addEventListener("click", () => {
      const T = lessonTrainer;
      if (T.phase !== "user" || T.game.history().length === 0) return;
      // برگشت آخرین جفت حرکت (حریف + کاربر)
      T.undoToUser(2);
      T.phase = "user";
      $("lessonFeedback").hidden = true;
      coachMsg("neutral", "↩️ یک جفت حرکت برگشت — موقعیت را دوباره بساز.");
      ensureLessonAnalysis();
    });
    $("lessonRestartBtn").addEventListener("click", () => {
      if (currentLesson) openLesson(currentLesson);
    });

    // 🎛 آپشن‌های مربی — آموزش را به سلیقه‌ی کاربر تنظیم می‌کند
    $("coachGearBtn").addEventListener("click", function () {
      const p = $("coachOptsPanel");
      p.hidden = !p.hidden;
    });
    function syncCoachOptsUI() {
      const o = COACH_OPTS;
      document.querySelectorAll("#coptDepth button").forEach(function (b) {
        b.classList.toggle("active", parseFloat(b.dataset.v) === o.depthMult);
      });
      $("coptPV").checked = o.showPV;
      $("coptEval").checked = o.showEvalBar;
      $("coptArrow").checked = o.autoCorrectArrow;
      $("coptDelay").checked = o.humanDelay;
    }
    document.querySelectorAll("#coptDepth button").forEach(function (b) {
      b.addEventListener("click", function () {
        chesshubCoachOpts.set({ depthMult: parseFloat(this.dataset.v) || 1 });
        syncCoachOptsUI();
        coachMsg("neutral", "⚙️ قدرت تحلیل انجین به <b>" + this.textContent + "</b> تغییر کرد — تحلیل‌های جدید با همین سطح انجام می‌شود.");
      });
    });
    $("coptPV").addEventListener("change", function () { chesshubCoachOpts.set({ showPV: this.checked }); });
    $("coptEval").addEventListener("change", function () {
      chesshubCoachOpts.set({ showEvalBar: this.checked });
      if (!this.checked) {
        const wrap = $("lessonEvalBar");
        if (wrap) wrap.style.display = "none";
      } else {
        const wrap = $("lessonEvalBar");
        if (wrap) wrap.style.display = "";
        if (lessonAn) lessonTrainer.setEval(lessonAn.bestCp);
      }
    });
    $("coptArrow").addEventListener("change", function () { chesshubCoachOpts.set({ autoCorrectArrow: this.checked }); });
    $("coptDelay").addEventListener("change", function () { chesshubCoachOpts.set({ humanDelay: this.checked }); });
    syncCoachOptsUI();

    // دکمه‌های داخل چت مربی و نوار بازخورد
    coachLogEl().addEventListener("click", (e) => {
      const b = e.target.closest("[data-caction]");
      if (b) handleCoachAction(b.dataset.caction);
    });
    $("lessonFeedback").addEventListener("click", (e) => {
      const b = e.target.closest("[data-fb]");
      if (!b) return;
      if (b.dataset.fb === "retry") handleCoachAction("retry");
      if (b.dataset.fb === "demo") handleCoachAction("demo");
    });

    // چالش
    document.querySelectorAll("#chTimeChips .time-chip").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#chTimeChips .time-chip").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        chTime = parseInt(b.dataset.sec, 10) || 60;
      });
    });
    document.querySelectorAll("#chModeSelect .mode-opt").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#chModeSelect .mode-opt").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        chMode = b.dataset.mode;
      });
    });
    $("challengeStartBtn").addEventListener("click", startChallenge);
    $("chEndBtn").addEventListener("click", endChallengeSession);
    renderChStats();

    // مفاهیم
    renderConceptFilters();
    renderConcepts();

    // داده
    try {
      POSITIONS = await loadData();
      renderLessonCatFilters();
      renderLessonFilters();
      renderLessonsGrid();
      renderAcademyProgress();
    } catch (err) {
      console.error("خطا در بارگذاری آخربازی‌ها:", err);
      $("lessonsEmpty").hidden = false;
    }

    // رویدادهای سراسری
    document.addEventListener("engineReady", () => {
      if (currentLesson) $("lessonHintBtn").disabled = false;
    });
    document.addEventListener("pieceSetChanged", async () => {
      await probePieceSet();
      if (lessonTrainer) lessonTrainer.renderBoard();
      if (challengeTrainer && !$("challengeRun").hidden) challengeTrainer.renderBoard();
      miniBoards.forEach((m) => renderMiniBoard(m.el, m.fen));
    });
    document.addEventListener("themeChanged", () => {
      if (lessonTrainer) lessonTrainer.renderBoard();
      if (challengeTrainer && !$("challengeRun").hidden) challengeTrainer.renderBoard();
      miniBoards.forEach((m) => renderMiniBoard(m.el, m.fen));
    });
    $("conceptsGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-practice]");
      if (b) switchMode("academy");
    });

    await probePieceSet();
    pieceSet = getCurrentPieceSet();
    // دیباگ توسعه‌دهنده (بی‌خطر — فقط خواندنی)
    window.__EG = {
      get phase() { return lessonTrainer && lessonTrainer.phase; },
      get fen() { return lessonTrainer && lessonTrainer.game.fen(); },
      get turn() { return lessonTrainer && lessonTrainer.game.turn(); },
      get userColor() { return lessonTrainer && lessonTrainer.userColor; },
      get hist() { return lessonTrainer && lessonTrainer.game.history().length; },
      get chRunning() { return chRunning; },
    };
    console.log("✅ ChessHub Endgame Coach v3 — آماده");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
