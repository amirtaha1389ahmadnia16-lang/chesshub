/* ============================================================
   ♛ ChessHub — هسته‌ی مشترک انجین Stockfish (Worker Singleton)
   ------------------------------------------------------------
   همه‌ی صفحاتی که به انجین نیاز دارند از همین یک Worker
   مشترک استفاده می‌کنند (بازی با بات، آنلاین، مرور بازی).
   صف درخواست + سگ‌منت‌گارد + امتیاز + خط اصلی (PV)

   API:
     ChessEngine.init()
     ChessEngine.ask(fen, {depth, movetime, skill, multiPV}) → Promise
         خروجی: { move:{from,to,promotion}|null,
                  score:{type:'cp'|'mate',value}|null,   ← از دید نوبت‌دار
                  pv:[uci...], bestUci }
     ChessEngine.isAvailable() / isReady()
     ChessEngine.cpOf(score)        ← تبدیل به سانتی‌پیاده (مات هم لحاظ می‌شود)
     ChessEngine.onReady(cb)
     ChessEngine.flush()
   ============================================================ */
(function () {
  "use strict";

  let worker = null;
  let ready = false;
  let available = false;
  let announced = false;
  const readyCbs = [];
  const queue = [];
  let busy = false;
  let currentSkill = null;
  let currentMultiPV = null;
  let watchdog = null;

  function flush() {
    busy = false;
    clearTimeout(watchdog);
    while (queue.length) {
      const j = queue.shift();
      if (j && j.resolve) j.resolve({ move: null, score: null, pv: [], bestUci: null });
    }
  }

  function init() {
    if (worker || typeof Worker === "undefined") return;
    try {
      worker = new Worker("js/stockfish.js");
      worker.onmessage = function (e) {
        const line = typeof e.data === "string" ? e.data : (e.data && e.data.data) || "";
        handle(line);
      };
      worker.onerror = function () {
        ready = false;
        available = false;
        flush();
      };
      worker.postMessage("uci");
    } catch (err) {
      worker = null;
    }
    setTimeout(function () {
      if (!available) flush();
    }, 8000);
  }

  function handle(line) {
    if (!line) return;
    if (line === "uciok") {
      ready = true;
      available = true;
      worker.postMessage("setoption name UCI_Chess960 value false");
      worker.postMessage("setoption name Threads value 2");
      worker.postMessage("setoption name Hash value 128");
      worker.postMessage("isready");
      if (!announced) {
        announced = true;
        readyCbs.splice(0).forEach(function (cb) {
          try { cb(); } catch (e) {}
        });
      }
      pump();
      return;
    }
    if (line.indexOf("info") === 0) {
      const job = queue[0];
      if (!job) return;
      const sm = line.match(/score (cp|mate) (-?\d+)/);
      if (sm) job.score = { type: sm[1], value: parseInt(sm[2], 10) };
      const pi = line.indexOf(" pv ");
      if (pi > 0) {
        const pv = line
          .slice(pi + 4)
          .trim()
          .split(/\s+/)
          .filter(function (t) { return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t); });
        if (pv.length) job.pv = pv;
      }
      return;
    }
    if (line.indexOf("bestmove") === 0) {
      clearTimeout(watchdog);
      const job = queue.shift();
      busy = false;
      const bm = line.split(/\s+/)[1] || "";
      let move = null;
      if (bm && bm !== "(none)") {
        move = {
          from: bm.slice(0, 2),
          to: bm.slice(2, 4),
          promotion: bm.length === 5 ? bm[4] : null,
        };
      }
      if (job && job.resolve) {
        job.resolve({
          move: move,
          score: job.score || null,
          pv: job.pv || [],
          bestUci: move ? bm : null,
        });
      }
      pump();
    }
  }

  function pump() {
    if (busy || !queue.length || !ready) return;
    busy = true;
    const job = queue[0];
    if (job.skill !== currentSkill) {
      currentSkill = job.skill;
      worker.postMessage("setoption name Skill Level value " + currentSkill);
    }
    if (job.multiPV !== currentMultiPV) {
      currentMultiPV = job.multiPV;
      worker.postMessage("setoption name MultiPV value " + (currentMultiPV || 1));
    }
    worker.postMessage("stop");
    worker.postMessage("position fen " + job.fen);
    worker.postMessage(job.go);
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      const j = queue.shift();
      busy = false;
      if (j && j.resolve) j.resolve({ move: null, score: null, pv: [], bestUci: null });
      pump();
    }, (job.movetimeMs || 0) + 8000);
  }

  // fen ← موقعیت؛ opts: {movetime, depth, skill, multiPV}
  function ask(fen, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      init();
      if (!worker || (!available && queue.length > 8)) {
        resolve({ move: null, score: null, pv: [], bestUci: null });
        return;
      }
      let go = "go";
      if (opts.depth) go += " depth " + opts.depth;
      if (opts.movetime) go += " movetime " + opts.movetime;
      if (!opts.depth && !opts.movetime) go += " depth 12";
      queue.push({
        fen: fen,
        go: go,
        skill: opts.skill == null ? 20 : opts.skill,
        multiPV: opts.multiPV || 1,
        resolve: resolve,
        score: null,
        pv: [],
        movetimeMs: opts.movetime || 0,
      });
      pump();
    });
  }

  // امتیاز انجین (از دید نوبت‌دار) → سانتی‌پیاده؛ مات هم فاصله‌اش لحاظ می‌شود
  function cpOf(score) {
    if (!score) return 0;
    if (score.type === "cp") return Math.max(-12000, Math.min(12000, score.value));
    return score.value > 0
      ? 10000 - score.value * 100
      : -10000 + Math.abs(score.value) * 100;
  }

  window.ChessEngine = {
    init: init,
    ask: ask,
    cpOf: cpOf,
    flush: flush,
    isReady: function () { return ready; },
    isAvailable: function () { return available; },
    onReady: function (cb) {
      if (announced) cb();
      else readyCbs.push(cb);
    },
  };
})();
