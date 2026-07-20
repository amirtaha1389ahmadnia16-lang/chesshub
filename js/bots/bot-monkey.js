// bot-monkey.js - مانکی (ریتینگ ۲۰۰۰) - کارشناس تاکتیک‌ها با شخصیت بازیگوش
// بر اساس تحلیل عمیق رفتار یک بازیکن ۲۰۰۰ ریتینگ

const BotMonkey = {
  name: "مانکی",
  rating: "۲۰۰۰",
  avatar: "images/bots/3.png",

  // ===== تنظیمات Stockfish =====
  skillLevel: 15, // سطح پیشرفته
  depth: 12, // عمق ۱۲ – معادل ۶ حرکت کامل (با برش آلفا-بتا)

  // ===== متغیرهای داخلی مانکی =====
  _moveCount: 0,
  _hasMirrored: false,
  _hasOpenedCenter: false,
  _hasCastled: false,
  _hasDoneRetrograde: false,

  // ============================================
  // 🎯 حرکت‌های خاص مانکی (ترکیبی از منطق دستی + Stockfish)
  // ============================================
  getMove: function (game, useStockfishCallback) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    const turn = game.turn();
    const moveCount = game.history().length;
    const board = game.board();
    const fen = game.fen();
    const allPieces = board.flat().filter((p) => p !== null);
    const pieceCount = allPieces.length;

    this._moveCount = moveCount;

    // ============================================
    // 🪞 ۱. حرکت آینه‌ای (Mirroring) در گشایش (تا حرکت ۸)
    // ============================================
    if (moveCount < 8 && !this._hasMirrored) {
      const lastMove = game.history({ verbose: true }).pop();
      if (lastMove) {
        // پیدا کردن حرکت آینه‌ای
        const mirrorMove = moves.find((m) => {
          // آینه‌سازی در صفحه: if from e2 -> to e7, etc.
          const fromFile = String.fromCharCode(
            97 + (7 - (lastMove.from.charCodeAt(0) - 97)),
          );
          const fromRank = 9 - parseInt(lastMove.from[1]);
          const toFile = String.fromCharCode(
            97 + (7 - (lastMove.to.charCodeAt(0) - 97)),
          );
          const toRank = 9 - parseInt(lastMove.to[1]);
          const mirrorFrom = fromFile + fromRank;
          const mirrorTo = toFile + toRank;
          return m.from === mirrorFrom && m.to === mirrorTo;
        });
        if (mirrorMove && Math.random() < 0.7) {
          this._hasMirrored = true;
          return mirrorMove;
        }
      }
    }

    // ============================================
    // 🎯 ۲. حرکت امضا: قربانی اسب در g5 علیه f7 (مانکی اسپرایز)
    // ============================================
    if (moveCount >= 10 && moveCount <= 25) {
      const knightSacrifice = moves.find(
        (m) =>
          m.piece === "n" &&
          m.to === "g5" &&
          (m.captured === undefined || m.captured === "p"),
      );
      if (knightSacrifice && Math.random() < 0.35) {
        // بررسی کن که آیا پیاده f7 تهدید میشه
        const testGame = new Chess(fen);
        testGame.move(knightSacrifice);
        const nextMoves = testGame.moves({ verbose: true });
        const f7Threat = nextMoves.find(
          (m) => m.to === "f7" && m.piece === "n",
        );
        if (f7Threat || Math.random() < 0.3) {
          // ۳۰٪ مواقع حتی بدون تهدید هم حمله میکنه (شوت!)
          return knightSacrifice;
        }
      }

      // حمله به b7 (وزیر حریف)
      const b7Attack = moves.find(
        (m) =>
          (m.piece === "b" || m.piece === "n") &&
          m.to === "b7" &&
          m.captured === "p",
      );
      if (b7Attack && Math.random() < 0.25) {
        return b7Attack;
      }
    }

    // ============================================
    // 🏰 ۳. شکستن مرکز با d5 یا d4 (تا حرکت ۱۵)
    // ============================================
    if (!this._hasOpenedCenter && moveCount <= 15) {
      const centerBreak = moves.find(
        (m) =>
          m.piece === "p" &&
          ((m.from === "d2" && m.to === "d4") ||
            (m.from === "d7" && m.to === "d5") ||
            (m.from === "e2" && m.to === "e4") ||
            (m.from === "e7" && m.to === "e5")) &&
          !m.captured,
      );
      if (centerBreak && Math.random() < 0.7) {
        this._hasOpenedCenter = true;
        return centerBreak;
      }
    }

    // ============================================
    // 🔄 ۴. بازگشت به خانه (Retrograde Castling)
    // ============================================
    if (
      this._hasCastled &&
      !this._hasDoneRetrograde &&
      moveCount >= 15 &&
      moveCount <= 30
    ) {
      // اگر موقعیت بسته است، شاه رو به مرکز برگردون
      const kingToCenter = moves.find(
        (m) =>
          m.piece === "k" &&
          (m.to === "e2" || m.to === "e7" || m.to === "d2" || m.to === "d7") &&
          m.captured === undefined,
      );
      if (kingToCenter && Math.random() < 0.3) {
        this._hasDoneRetrograde = true;
        return kingToCenter;
      }
    }

    // ============================================
    // 🎯 ۵. تشخیص پات و ترفیع به اسب
    // ============================================
    const promotionMoves = moves.filter((m) => m.promotion);
    if (promotionMoves.length > 0) {
      for (const promo of promotionMoves) {
        // شبیه‌سازی ترفیع به وزیر و بررسی پات
        const testGame = new Chess(fen);
        const queenPromo = { from: promo.from, to: promo.to, promotion: "q" };
        testGame.move(queenPromo);
        if (testGame.in_stalemate()) {
          // اگه وزیر باعث پات بشه، به اسب ترفیع کن
          const knightPromo = moves.find(
            (m) =>
              m.from === promo.from && m.to === promo.to && m.promotion === "n",
          );
          if (knightPromo) return knightPromo;
        }
      }
      // اگه خطری نبود، وزیر کن (با احتمال کم اسب برای شوک)
      if (Math.random() < 0.1 && promotionMoves.length > 0) {
        const underPromo = promotionMoves.find(
          (m) => m.promotion === "n" || m.promotion === "r",
        );
        if (underPromo) return underPromo;
      }
    }

    // ============================================
    // 🐵 ۶. استراتژی "تقلید در حمله" (Copycat Attack)
    // ============================================
    if (moveCount >= 12 && moveCount <= 30) {
      const lastMove = game.history({ verbose: true }).pop();
      if (lastMove) {
        // اگه حریف در جناح شاه حمله کرد، مانکی در جناح وزیر حمله میکنه
        const isKingSideAttack =
          lastMove.to[0] === "g" || lastMove.to[0] === "h";
        if (isKingSideAttack && Math.random() < 0.4) {
          const queenSideAttack = moves.find(
            (m) =>
              (m.piece === "b" || m.piece === "n" || m.piece === "q") &&
              (m.to[0] === "a" || m.to[0] === "b" || m.to[0] === "c"),
          );
          if (queenSideAttack) return queenSideAttack;
        }
      }
    }

    // ============================================
    // ♟️ ۷. پایان‌بازی رخ + پیاده راحلی (نقطه کور)
    // ============================================
    if (pieceCount <= 8) {
      // تشخیص پایان‌بازی رخ + پیاده راحلی
      const hasRook = board.flat().some((p) => p && p.type === "r");
      const hasAPawn = board
        .flat()
        .some(
          (p) =>
            p &&
            p.type === "p" &&
            p.color === turn &&
            (p.position[0] === "a" || p.position[0] === "h"),
        );
      // اینجا نمیتونیم به راحتی تشخیص بدیم، پس اجازه میدیم Stockfish تصمیم بگیره
      // ولی با کمی تصادفی‌سازی برای شبیه‌سازی اشتباه
      if (hasRook && hasAPawn && Math.random() < 0.15) {
        // گاهی وقت‌تلف کن (با رخ حرکت تصادفی)
        const rookMoves = moves.filter((m) => m.piece === "r");
        if (rookMoves.length > 0) {
          return rookMoves[Math.floor(Math.random() * rookMoves.length)];
        }
      }
    }

    // ============================================
    // ⏱️ ۸. مدیریت زمان (Flag Monkey)
    // ============================================
    // اینجا در engine-game مدیریت میشه، ولی برای شبیه‌سازی:
    // اگه زمان کم باشه، فقط کیش‌ها و حرکات مهره‌های درجه‌یک رو بررسی کن

    // ============================================
    // 🎯 ۹. حرکات تصادفی برای تنوع (۱۰٪ مواقع)
    // ============================================
    if (Math.random() < 0.1) {
      // حرکات جالب و غیرمنتظره
      const interestingMoves = moves.filter(
        (m) =>
          m.piece === "n" ||
          (m.piece === "b" && (m.to[0] === "g" || m.to[0] === "b")) ||
          (m.piece === "q" && m.captured),
      );
      if (interestingMoves.length > 0) {
        return interestingMoves[
          Math.floor(Math.random() * interestingMoves.length)
        ];
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // ============================================
    // 🧠 ۱۰. در نهایت، از Stockfish استفاده کن
    // ============================================
    // برای حرکت‌های دیگه، از Stockfish استفاده میشه
    // ولی با تنظیمات ویژه برای مانکی (عمق ۱۲، Skill Level 15)
    return null; // یعنی از Stockfish استفاده کن
  },

  // ============================================
  // 💬 پیام‌های خاص مانکی
  // ============================================
  getMessage: function (type) {
    const messages = {
      thinking: [
        "🧠 مانکی عمیقاً تحلیل میکنه... عمق ۶ پلی!",
        "🔍 مانکی داره استراتژی می‌چینه!",
        "📈 مانکی همه‌چیز رو حساب میکنه!",
        "🐵 مانکی داره حرکت بعدی حریف رو تقلید میکنه!",
        "🎯 مانکی دنبال قربانی اسب می‌گرده!",
      ],
      move: [
        "♟️ مانکی حرکت کرد!",
        "🎯 مانکی یه حرکت محاسبه‌شده زد!",
        "💡 مانکی بهترین گزینه رو انتخاب کرد!",
        "🐵 مانکی یه حرکت میمونی زد!",
      ],
      capture: [
        "💀 مانکی مهره‌ات رو گرفت!",
        "🎯 مانکی دقیقاً می‌دونه چیکار کنه!",
        "⚔️ مانکی ضربه‌ی مهلک زد!",
        "🐵 مانکی با یه حرکت میمونی گرفت!",
      ],
      check: [
        "🔥 کیش! مانکی بهت حمله کرد!",
        "⚡ مانکی کیش داد! مواظب باش!",
        "🎯 مانکی شاه رو تهدید میکنه!",
      ],
      win: [
        "🏆 مانکی برنده شد! احسنت!",
        "👑 مانکی استراتژی بهتری داشت!",
        "😎 مانکی نشان داد چرا ۲۰۰۰ ریتینگ داره!",
        "🐵 مانکی با بازی هوشمندانه برد!",
      ],
      lose: [
        "🎉 تو مانکی رو شکست دادی! عالی!",
        "😢 مانکی شکست خورد... ولی برگشته!",
        "🤯 مانکی باور نمیکنه! چطور؟!",
        "😤 مانکی می‌گه بازهم می‌بینمت!",
      ],
      draw: [
        "🤝 مانکی با تو مساوی شد!",
        "🤝 بازی مساوی با مانکی! سخت بود!",
        "🐵 مانکی پات کرد! (تشخیص داد!)",
      ],
      start: [
        "♟️ مانکی آماده‌ست! آماده‌ای؟",
        "👋 سلام! من مانکی هستم!",
        "🔥 مانکی برای یه بازی جدی اومده!",
        "🐵 مانکی می‌گه از من تقلید کن!",
        "🎯 مانکی دنبال قربانی‌های جذابه!",
      ],
    };
    const list = messages[type] || ["مانکی!"];
    return list[Math.floor(Math.random() * list.length)];
  },
};

window.BotMonkey = BotMonkey;
