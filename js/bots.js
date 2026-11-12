/* ============================================================
   ♛ ChessHub — ۳۵ بات شطرنج با شخصیت
   ------------------------------------------------------------
   هر بات دقیقاً هم‌اندازه‌ی ریتینگش بازی می‌کند:
     • سطح مهارت Stockfish (Skill Level) + عمق + زمان فکر
       از روی ریتینگ نقشه‌برداری می‌شود
     • blunder = احتمال اشتباه انسانی (بات‌های ضعیف، خطاهای
       بچگانه می‌کنند؛ قهرمانان تقریباً هرگز)
     • style = شخصیت بازی (تهاجمی/منظم/موقعیتی/تله‌گذار/...)
   عکس‌ها: images/bots/1.png … 35.png — کاربر خودش می‌گذارد؛
   تا آن‌موقع فالبک خودکار ui-avatars نمایش داده می‌شود.
   ============================================================ */
(function () {
  "use strict";

  const G = typeof window !== "undefined" ? window : globalThis;

  const STYLE_FA = {
    aggressive: "تهاجمی",
    solid: "منظم",
    positional: "موقعیتی",
    tricky: "تله‌گذار",
    chaotic: "غیرقابل پیش‌بینی",
  };

  // [name, rating, style] — ترتیب = شماره آواتار (1..35)
  const BOT_TABLE = [
    ["لوئیس", 250, "chaotic"],
    ["آقای‌مربع", 400, "positional"],
    ["توپولینو", 550, "aggressive"],
    ["سارا", 700, "solid"],
    ["کاکولیو", 800, "tricky"],
    ["رضاجان", 900, "solid"],
    ["هزارپا", 850, "chaotic"],
    ["سینا", 1000, "aggressive"],
    ["نیلوفر", 1100, "positional"],
    ["پات‌کش", 1200, "aggressive"],
    ["شاهین", 1250, "aggressive"],
    ["پارسا", 1300, "solid"],
    ["فیل‌بلند", 1400, "positional"],
    ["ماریا", 1500, "solid"],
    ["شهاب‌سنگ", 1600, "aggressive"],
    ["الهام", 1700, "positional"],
    ["موج‌ساز", 1750, "tricky"],
    ["قلعه‌باز", 1800, "aggressive"],
    ["نگارین", 1900, "positional"],
    ["غلامرضا", 2000, "positional"],
    ["ستاره‌شمال", 2050, "solid"],
    ["فرهاد", 2100, "solid"],
    ["شروین", 2200, "tricky"],
    ["لیلا", 2300, "positional"],
    ["بابک", 2400, "aggressive"],
    ["مغزمتفکر", 2450, "positional"],
    ["مانی", 2500, "solid"],
    ["مانکی", 2600, "tricky"],
    ["یخ‌شکسته", 2650, "aggressive"],
    ["آناند", 2700, "positional"],
    ["کاروآنا", 2750, "solid"],
    ["فیشر", 2800, "aggressive"],
    ["کاسپاروف", 2820, "aggressive"],
    ["کارلسن", 2850, "solid"],
    ["مگنوس", 2882, "solid"],
  ];

  // نقشه‌ی ریتینگ → تنظیمات انجین (دقیقاً هم‌اندازه‌ی ریتینگ بازی می‌کند)
  function paramsForRating(r) {
    if (r <= 700) return { skill: 0, depth: r <= 400 ? 1 : 2, movetime: 120, blunder: r <= 400 ? 0.6 : 0.5 };
    if (r <= 1100) return { skill: 1 + Math.round((r - 800) / 150), depth: 3, movetime: 150, blunder: 0.34 };
    if (r <= 1400) return { skill: 4 + Math.round((r - 1200) / 100), depth: 5 + Math.round((r - 1200) / 200), movetime: 200, blunder: 0.22 };
    if (r <= 1700) return { skill: 7 + Math.round((r - 1500) / 70), depth: 7 + Math.round((r - 1500) / 100), movetime: 260, blunder: 0.13 };
    if (r <= 2000) return { skill: 11 + Math.round((r - 1800) / 70), depth: 10 + Math.round((r - 1800) / 70), movetime: 320, blunder: 0.07 };
    if (r <= 2300) return { skill: 14 + Math.round((r - 2100) / 70), depth: 12 + Math.round((r - 2100) / 70), movetime: 420, blunder: 0.04 };
    if (r <= 2600) return { skill: 17 + Math.round((r - 2400) / 100), depth: 15 + Math.round((r - 2400) / 100), movetime: 550, blunder: 0.015 };
    return { skill: 20, depth: 18 + Math.round((r - 2700) / 100), movetime: 700, blunder: 0 };
  }

  // جمله‌های هر شخصیت — با لهجه‌ی خودش
  const LINES_BY_STYLE = {
    chaotic: {
      think: ["🤔 صبر کن… کدوم مهره مال من بود؟", "😵 دارم فکر می‌کنم! (شاید)", "🌀 یک ایده‌ی ناب به ذهنم رسید! شاید!", "❓ چرا این فیل اینجاست؟"],
      start: ["🙈 من با تمام قدرتم می‌آسم! تقریباً.", "🤪 حواست باشه، من غیرقابل پیش‌بینیم!", "🎲 امیدوارم شانس امروز با من باشه!", "😅 شطرنج بلدم… تقریباً!"],
      move: ["🎲 حرکت زدم! خودشم نمی‌دونم چرا!", "🌀 این حرکت از کتاب نبود… از جایی دیگه بود!", "✨ نابغه‌وار! یا نه.", "😅 دیدی چی زدم؟ منم ندیدم!"],
      capture: ["🤩 گرفتمش! تصادفی بود ولی مهم نیست!", "😋 اوه! یه مهره خوردم!", "💪 قوی‌ام؟ شاید!"],
      check: ["😱 کیش؟ خودمم تعجب کردم!", "🔥 شاهتو زدم! منظورم بود… تقریباً!"],
      win: ["🤯 بردتم؟! کسی بهم بگه چی شد!", "🏆 من برنده شدم؟ وایسا اسکرین‌شات بگیرم!"],
      lose: ["😅 باختم! مثل همیشه!", "🙈 مهره‌هام کجا رفتن؟"],
      draw: ["🤝 مساوی؟ یعنی چی؟!", "😅 نصف مهره‌ها موند، نصف نصف شد!"],
    },
    aggressive: {
      think: ["🔥 دنبال سوراخ دفاعیت می‌گردم…", "⚡ یک حمله پیدا کنم، تمام!", "🩸 بوی مهره می‌شمم!"],
      start: ["⚔️ بیا بجنگیم! دفاع کاری ندارم.", "🔥 من برای حمله اومدم، نه برای صبر!", "⚡ حرکت اول تا آخر حمله‌ست!"],
      move: ["⚔️ پیشروی! دفاع بی‌معنیه.", "🔥 فشار رو کم نمی‌کنم!", "⚡ شاهتم پیش میاد تا نصفه‌ی صفحه!"],
      capture: ["🩸 قربانی پذیرفته!", "💪 گرفتن، همیشه جذابه!", "😋 یکی کم شد!"],
      check: ["🔥 کیش! یا مات می‌شی یا مهره می‌دی!", "⚡ کیش پیاپی، راه حمله‌ست!"],
      win: ["🏆 حمله‌ی من همیشه می‌رسه!", "👑 تهاجم، بهترین دفاعه — و بهترین حمله هم!"],
      lose: ["😤 دفعه‌ی بعد حمله‌ی سنگین‌تر!", "💥 حمله‌ام نیمه‌کاره موند…"],
      draw: ["🤝 مساوی؟ یعنی نتونستم نفوذ کنم…", "⚔️ دفعه بعد سرعت بیشتر!"],
    },
    solid: {
      think: ["🧮 بذار حساب کنم…", "🤔 امن‌ترین مسیر کدومه؟", "📐 یک اشتباه = کل بازی. دقیق باش!"],
      start: ["🛡️ بازی منظم، بدون هدیه.", "📚 اصول رو رعایت می‌کنم.", "🧊 خونسرد باش، محکم بازی کن."],
      move: ["🧱 استحکامات کامل!", "📚 گام‌به‌گام، بدون عجله.", "🧮 همه‌چیز حساب‌شده‌ست."],
      capture: ["🧮 تعویض سودده — قبول.", "💪 مهره‌ی آزاد رو رها نمی‌کنم."],
      check: ["🛡️ کیش؟ دفع امن انجام می‌شه.", "📌 دقت کن، کیش‌ها گاهی تله‌ان."],
      win: ["🏆 نظم، پاداشش رو می‌ده.", "🧊 بدون ریسک بی‌مورد، برد قطعی."],
      lose: ["🤝 بازی خوبی بود، تو بهتر بودی.", "📚 یاد گرفتم؛ دفعه‌ی بعد محکم‌تر."],
      draw: ["🤝 تساوی منصفانه‌ست.", "🧊 بدون اشتباه، بدون باخت."],
    },
    positional: {
      think: ["♟️ کدوم ساختار پیاده‌ای بهتره؟", "🔍 ضعف دائمی حریف کجاست؟", "🧭 برنامه‌ی بلندمدت مهمه، نه حمله‌ی فوری."],
      start: ["♟️ شطرنج موقعیت، شطرنج واقعیه.", "🧭 من فضا می‌سازم، ضعف دائمی می‌خرم.", "📚 فیلیدور می‌گه پیاده‌ها روح شطرنج‌ان!"],
      move: ["🧭 فضا برای من طلاست.", "♟️ ستون باز رو تصاحب کردم.", "🔍 ضعف‌ها رو جمع می‌کنم."],
      capture: ["♻️ تعویض به نفع ساختارمه.", "♟️ مبادله‌ی حساب‌شده."],
      check: ["🧊 کیش؟ اگر معلول ضعف باشه مات می‌شه.", "📌 شاهت رو حساب کن — هدف بعدی منه!"],
      win: ["👑 موقعیت‌سازی، مهره‌برتر می‌آورد؛ مهره‌ی بیشتر، مات!", "♟️ برنامه‌ام جواب داد."],
      lose: ["🤝 بازی موقعیتی خوبی بود.", "♟️ اشتباه من رو مجازات کردی — احترام!"],
      draw: ["🤝 تعادل ساختاری — منصفانه.", "♟️ نصف امتیاز هم ارزشمنده."],
    },
    tricky: {
      think: ["😈 چه تله‌ای بذارم که خوردش کنه؟", "🐍 دارم طعمه می‌چینم…", "🃏 حواست کجاست؟ روی مهره‌ی اشتباه!"],
      start: ["😈 از مسیر اصلی نرو، تله دارم!", "🐍 به همه‌ی هدیه‌ها اعتماد نکن!", "🃏 بازی من پر از پیچ‌وخمیه."],
      move: ["🃏 این حرکت دو معنی داره!", "🐍 طعمه گذاشتم… خوردی یا نه؟", "😈 حالا چند راه دارم!"],
      capture: ["😋 ممنون برای هدیه!", "🃏 گرفتی ولی مسیر باز شد…"],
      check: ["😈 کیشِ طعمه‌دار!", "🐍 شاه بیا جلوتر… نزدیک‌تر!"],
      win: ["😈 تله‌ام کار کرد!", "🃏 شطرنجِ ذهنی برد که!"],
      lose: ["😤 تله‌م لو رفت!", "🐍 حریف محتاط بود…"],
      draw: ["🤝 تله‌ها نگرفت؛ مساوی شد.", "🃏 نوبت بعدی تله‌ی بهتر می‌چینم!"],
    },
  };

  function faDigits(s) {
    const F = "۰۱۲۳۴۵۶۷۸۹";
    return String(s).replace(/\d/g, function (d) { return F[+d]; });
  }

  G.CHESSHUB_BOTS = BOT_TABLE.map(function (row, i) {
    const name = row[0];
    const rating = row[1];
    const style = row[2];
    const p = paramsForRating(rating);
    return {
      id: "bot" + (i + 1),
      name: name,
      rating: rating,
      faRating: faDigits(rating),
      avatar: "images/bots/" + (i + 1) + ".png",
      style: style,
      styleFa: STYLE_FA[style] || "منظم",
      skill: p.skill,
      depth: p.depth,
      movetime: p.movetime,
      blunder: p.blunder,
      lines: LINES_BY_STYLE[style] || LINES_BY_STYLE.solid,
    };
  });

  G.BotBrain = {
    pickBotById: function (id) {
      for (const b of G.CHESSHUB_BOTS) if (b.id === id) return b;
      return G.CHESSHUB_BOTS[0];
    },

    speak: function (bot, type) {
      const list = (bot.lines && bot.lines[type]) || ["♟️"];
      return list[Math.floor(Math.random() * list.length)];
    },

    // حرکت بات — دقیقاً هم‌اندازه‌ی ریتینگش
    // game: نمونه‌ی chess.js موقعیت جاری (برای فالبک و قواعد انسانی)
    getMove: async function (fen, bot, game) {
      const g = game;
      const legal = g.moves({ verbose: true });
      if (!legal.length) return null;
      let mv = null;

      // ۱) انجین با تنظیمات همین بات
      let resp = { move: null };
      try {
        if (window.ChessEngine) {
          resp = await window.ChessEngine.ask(fen, {
            depth: bot.depth,
            movetime: bot.movetime,
            skill: bot.skill,
          });
        }
      } catch (e) { resp = { move: null }; }
      mv = resp.move;

      // ۲) خطای انسانی — بات ضعیف گاهی حرکت بچگانه می‌زند
      if (bot.blunder > 0 && (!mv || Math.random() < bot.blunder)) {
        mv = this._humanBlunder(g, legal, bot);
      }

      // ۳) شخصیت استایل — بین حرکات امن، سلیقه‌ی خودش
      if (mv && !bot.blunderApplied) {
        mv = this._styleTwist(g, legal, mv, bot);
      }

      // ۴) هرگز حرکتی که بلافاصله ماتِ خودی می‌خورد (در سطوح پایین)
      if (mv && this._losesToMate(g, mv)) {
        const safe = legal.filter((m) => !this._losesToMate(g, m));
        if (safe.length) mv = safe[Math.floor(Math.random() * safe.length)];
      }

      if (!mv) mv = legal[Math.floor(Math.random() * legal.length)];

      // زمان فکر طبیعی
      await new Promise(function (r) { setTimeout(r, 300 + Math.random() * 400); });
      return mv;
    },

    // یک «اشتباه آدم‌مانند»: اکثراً گرفتن/کیش‌های وسوسه‌کننده، گاهی کاملاً تصادفی
    _humanBlunder: function (g, legal, bot) {
      const rand = Math.random();
      if (rand < 0.6 || bot.rating <= 500) {
        const tempting = legal.filter(function (m) {
          return m.captured || m.san.indexOf("+") >= 0;
        });
        if (tempting.length) {
          return tempting[Math.floor(Math.random() * tempting.length)];
        }
      }
      return legal[Math.floor(Math.random() * legal.length)];
    },

    _styleTwist: function (g, legal, best, bot) {
      const r = Math.random();
      if (bot.style === "aggressive" && r < 0.35) {
        const force = legal.filter(function (m) { return m.captured || m.san.indexOf("+") >= 0; });
        if (force.length && force.some(function (m) { return m.san === best.san; }) === false) {
          return force[Math.floor(Math.random() * force.length)];
        }
      }
      if (bot.style === "tricky" && r < 0.15) {
        const quiet = legal.filter(function (m) { return !m.captured && m.san.indexOf("+") < 0 && m.san !== best.san; });
        if (quiet.length) return quiet[Math.floor(Math.random() * quiet.length)];
      }
      if (bot.style === "chaotic" && r < 0.25) {
        return legal[Math.floor(Math.random() * legal.length)];
      }
      return best;
    },

    _losesToMate: function (g, mv) {
      try {
        const applied = g.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" });
        if (!applied) return false;
        const mated = g.in_checkmate();
        g.undo();
        return mated;
      } catch (e) { return false; }
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CHESSHUB_BOTS: G.CHESSHUB_BOTS, BotBrain: G.BotBrain };
  }
})();
