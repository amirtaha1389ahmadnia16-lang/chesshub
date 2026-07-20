// bot-maria.js - ماریا (ریتینگ ۱۵۰۰) - مبتدی حرفه‌ای با وسواس جفت‌فیل
// بر اساس تحلیل عمیق رفتار یک بازیکن ۱۵۰۰ ریتینگ

const BotMaria = {
  name: "ماریا",
  rating: "۱۵۰۰",
  avatar: "images/bots/2.png",

  // ===== تنظیمات Stockfish =====
  skillLevel: 8, // سطح متوسط-رو به پایین
  depth: 8, // عمق ۸ – معادل ۴ حرکت کامل (عمق ۳ پلی + کمی بیشتر)

  // ===== متغیرهای داخلی ماریا =====
  _moveCount: 0,
  _hasCastled: false,
  _hasPlayedH3: false,

  // ============================================
  // 🎯 حرکت‌های خاص ماریا (ترکیبی از منطق دستی + Stockfish)
  // ============================================
  getMove: function (game, useStockfishCallback) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    const turn = game.turn();
    const moveCount = game.history().length;
    const board = game.board();
    const fen = game.fen();

    // به‌روزرسانی تعداد حرکات
    this._moveCount = moveCount;

    // ============================================
    // 🔥 ۱. حرکت‌های خاص گشایشی (تا حرکت ۱۰)
    // ============================================
    if (moveCount < 10) {
      // ۱-۱. همیشه در حرکت اول e4
      if (moveCount === 0) {
        const e4 = moves.find((m) => m.from === "e2" && m.to === "e4");
        if (e4) return e4;
      }

      // ۱-۲. در برابر e5، گشایش ایتالیایی (Bc4)
      if (moveCount >= 1 && moveCount <= 4) {
        // بررسی اینکه حریف e5 زده
        const lastMove = game.history({ verbose: true }).pop();
        if (lastMove && lastMove.to === "e5") {
          // حرکت‌های ایتالیایی: Nf3, Bc4
          if (moveCount === 1) {
            const nf3 = moves.find((m) => m.from === "g1" && m.to === "f3");
            if (nf3) return nf3;
          }
          if (moveCount === 3) {
            const bc4 = moves.find((m) => m.from === "f1" && m.to === "c4");
            if (bc4) return bc4;
          }
        }

        // اگر حریف c5 زد (سیسیلی)، ماریا گیج میشه و تصادفی حرکت میده
        if (lastMove && lastMove.to === "c5") {
          // حرکات تصادفی ولی با تقدم توسعه
          const devMoves = moves.filter(
            (m) =>
              (m.piece === "n" && (m.to[0] === "c" || m.to[0] === "f")) ||
              (m.piece === "b" && (m.to[0] === "c" || m.to[0] === "f")),
          );
          if (devMoves.length > 0)
            return devMoves[Math.floor(Math.random() * devMoves.length)];
        }
      }

      // ۱-۳. حرکت بی‌هدف h3 در حرکت ۶ یا ۷
      if ((moveCount === 5 || moveCount === 6) && !this._hasPlayedH3) {
        const h3 = moves.find((m) => m.from === "h2" && m.to === "h3");
        if (h3) {
          this._hasPlayedH3 = true;
          // ۸۰٪ مواقع h3 می‌زنه
          if (Math.random() < 0.8) return h3;
        }
        // گاهی h6 برای سیاه
        if (turn === "b") {
          const h6 = moves.find((m) => m.from === "h7" && m.to === "h6");
          if (h6 && Math.random() < 0.6) return h6;
        }
      }
    }

    // ============================================
    // ♟️ ۲. وسواس جفت‌فیل (قبل از هر چیز دیگه)
    // ============================================
    // اگر فیل مورد تهدید هست، فرار کن نه تبادل
    const threatenedBishops = moves.filter(
      (m) =>
        m.piece === "b" &&
        m.captured === undefined &&
        (m.to.includes("x") || false),
    );

    // بررسی اینکه آیا فیل با اسب تبادل میشه
    const bishopTrades = moves.filter(
      (m) => m.piece === "b" && m.captured === "n",
    );

    if (bishopTrades.length > 0) {
      // ماریا هرگز فیل رو با اسب عوض نمی‌کنه
      // به جای اون، دنبال یه حرکت دیگه می‌گرده
      const alternativeMoves = moves.filter(
        (m) => !(m.piece === "b" && m.captured === "n"),
      );
      if (alternativeMoves.length > 0) {
        // ولی اگه مجبور بشه، رخ رو قربانی میکنه تا فیل رو حفظ کنه
        const rookSacrifice = alternativeMoves.find(
          (m) => m.piece === "r" && m.captured === "b",
        );
        if (rookSacrifice && Math.random() < 0.3) {
          return rookSacrifice; // معاوضه رخ در برابر فیل
        }
        return alternativeMoves[
          Math.floor(Math.random() * alternativeMoves.length)
        ];
      }
    }

    // ============================================
    // 🐴 ۳. چنگال‌بین حرفه‌ای (تشخیص چنگال اسب)
    // ============================================
    // چنگال با اسب رو در عمق ۲ حرکتی تشخیص بده
    const knightForks = moves.filter(
      (m) => m.piece === "n" && m.captured === undefined,
    );

    if (knightForks.length > 0) {
      // بررسی کن که آیا این حرکت باعث میشه در حرکت بعدی یه مهره با ارزش بگیره
      for (const forkMove of knightForks) {
        const testGame = new Chess(fen);
        testGame.move(forkMove);
        const opponentMoves = testGame.moves({ verbose: true });
        // ببینیم آیا مهره با ارزشی (وزیر، رخ) قابل گرفتن هست
        const valuableCapture = opponentMoves.find(
          (m) => m.captured && (m.captured === "q" || m.captured === "r"),
        );
        if (valuableCapture) {
          // اگه چنگال پیدا شد، ۹۰٪ مواقع انجامش بده
          if (Math.random() < 0.9) return forkMove;
        }
      }
    }

    // ============================================
    // 🏰 ۴. قلعه با تأخیر (تا حرکت ۱۲)
    // ============================================
    if (!this._hasCastled && moveCount < 12) {
      const castleMoves = moves.filter(
        (m) => m.san.includes("O-O") || m.san.includes("O-O-O"),
      );
      if (castleMoves.length > 0) {
        // فقط ۳۰٪ مواقع زودتر از حرکت ۱۲ قلعه میره
        if (moveCount < 8 && Math.random() < 0.2) {
          this._hasCastled = true;
          return castleMoves[0];
        }
        if (moveCount >= 8 && moveCount < 12 && Math.random() < 0.5) {
          this._hasCastled = true;
          return castleMoves[0];
        }
      }
    }

    // ============================================
    // ⏱️ ۵. مدیریت زمان (فلج تحلیلی)
    // ============================================
    // اینجا در engine-game.js مدیریت میشه، ولی برای شبیه‌سازی:
    // اگه زمان کم باشه، عمق رو کم میکنیم (این رو در engine-game تنظیم می‌کنیم)

    // ============================================
    // ۶. حرکت‌های میانی: ترجیح تبادل پیاده‌های مرکزی
    // ============================================
    if (moveCount >= 10 && moveCount <= 25) {
      // تبادل پیاده‌های مرکزی (بازی باز)
      const centerTrades = moves.filter(
        (m) =>
          m.piece === "p" &&
          (m.to === "d4" || m.to === "e5" || m.to === "d5" || m.to === "e4") &&
          m.captured,
      );
      if (centerTrades.length > 0 && Math.random() < 0.6) {
        return centerTrades[Math.floor(Math.random() * centerTrades.length)];
      }
    }

    // ============================================
    // 🎯 ۷. در نهایت، از Stockfish استفاده کن
    // ============================================
    // برای حرکت‌های دیگه، از Stockfish استفاده میشه
    // ولی قبلش یه سری حرکات تصادفی برای تنوع
    if (Math.random() < 0.15) {
      // ۱۵٪ مواقع حرکت تصادفی برای تنوع
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // اگه به اینجا رسیدیم، یعنی حرکت خاصی پیدا نشد
    // باید از Stockfish استفاده کنیم (که در engine-game انجام میشه)
    return null;
  },

  // ============================================
  // 💬 پیام‌های خاص ماریا
  // ============================================
  getMessage: function (type) {
    const messages = {
      thinking: [
        "🤔 ماریا داره تحلیل میکنه... عمق ۳ پلی!",
        "🧠 ماریا یه تاکتیک داره! (فکر میکنه)",
        "📊 ماریا داره گزینه‌ها رو بررسی میکنه...",
        "🔍 ماریا داره چنگال اسب می‌گرده!",
        "♟️ ماریا فیل‌هاش رو دوست داره!",
      ],
      move: [
        "♟️ ماریا حرکت کرد!",
        "✨ ماریا یه حرکت خوب زد! (فکر میکنه)",
        "🎯 ماریا هدفش رو انتخاب کرد!",
        "💪 ماریا مطمئنه! (شاید)",
      ],
      capture: [
        "🎯 ماریا مهره‌ات رو گرفت!",
        "💪 ماریا دقیق زد!",
        "⚡ ماریا یه گرفتن عالی!",
        "👀 ماریا مهره رو دید و گرفت!",
      ],
      check: [
        "🔥 کیش! ماریا حمله کرد!",
        "⚡ ماریا کیش داد!",
        "💥 ماریا به شاه حمله کرد!",
      ],
      win: [
        "🏆 ماریا برنده شد! دفعه بعد!",
        "👑 ماریا قوی‌تر بود!",
        "😊 ماریا خوشحاله!",
        "🎉 ماریا برد! جفت‌فیل‌هاش کار کردن!",
      ],
      lose: [
        "🎉 تو ماریا رو شکست دادی!",
        "😢 ماریا شکست خورد...",
        "😤 ماریا باور نمیکنه!",
        "💔 ماریا بازنده شد! ولی جفت‌فیل‌هاش رو حفظ کرد!",
      ],
      draw: [
        "🤝 ماریا با تو مساوی شد!",
        "🤝 بازی مساوی با ماریا!",
        "😅 ماریا پات کرد! (نمیدونه چطور مات کنه!)",
      ],
      start: [
        "♟️ ماریا آماده‌ست! بزن بریم!",
        "👋 سلام! ماریا اینجاست!",
        "💪 ماریا برای برد اومده! (با جفت‌فیل‌هاش)",
        "🎯 ماریا دنبال چنگال اسبه!",
        "♝ ماریا عاشق فیل‌هاشه!",
      ],
    };
    const list = messages[type] || ["ماریا!"];
    return list[Math.floor(Math.random() * list.length)];
  },
};

window.BotMaria = BotMaria;
