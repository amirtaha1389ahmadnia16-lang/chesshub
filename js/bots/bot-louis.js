// bot-louis.js - لوئیس (ریتینگ ۲۵۰) - نوآموز تصادفی با اشتباهات فاحش
// بر اساس تحلیل عمیق رفتار یک بازیکن ۲۵۰ ریتینگ

const BotLouis = {
  name: "لوئیس",
  rating: "۲۵۰",
  avatar: "images/bots/1.png",

  // ===== تنظیمات Stockfish =====
  skillLevel: 0, // ضعیف‌ترین سطح
  depth: 1, // عمق ۱ – فقط حرکت قانونی می‌بینه

  // ============================================
  // 🎯 حرکت‌های خاص لوئیس (عمق صفر - چشم‌بسته)
  // ============================================
  getMove: function (game) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    const turn = game.turn();
    const moveCount = game.history().length;
    const board = game.board();
    const allPieces = board.flat().filter((p) => p !== null);
    const pieceCount = allPieces.length;

    // 🔥 ۱. حرکت امضای لوئیس: Qxb2 در حرکت ۴ یا ۵
    if (moveCount >= 4 && moveCount <= 10) {
      const signatureMove = moves.find(
        (m) =>
          m.piece === "q" &&
          m.captured === "p" &&
          ["b2", "a2", "h2", "g2"].includes(m.to) &&
          m.from[0] !== "a" &&
          m.from[0] !== "h", // وزیر از ستون‌های داخلی
      );
      if (signatureMove) {
        return signatureMove;
      }
    }

    // 🎯 ۲. قربانی‌سازی تصادفی وزیر (۷۰٪ بازی‌ها)
    const queenMoves = moves.filter((m) => m.piece === "q");
    if (queenMoves.length > 0 && Math.random() < 0.3) {
      // وزیر رو به جایی بفرست که قابل گرفتن باشه
      // ساده‌ترین: وزیر رو به جایی بفرست که مهره حریف رو بگیره (حتی اگه محافظت داشته باشه)
      const captureWithQueen = queenMoves.filter((m) => m.captured);
      if (captureWithQueen.length > 0) {
        return captureWithQueen[
          Math.floor(Math.random() * captureWithQueen.length)
        ];
      }
      // یا وزیر رو به لبه صفحه بفرست
      const edgeMoves = queenMoves.filter(
        (m) =>
          m.to[0] === "a" ||
          m.to[0] === "h" ||
          m.to[1] === "1" ||
          m.to[1] === "8",
      );
      if (edgeMoves.length > 0) {
        return edgeMoves[Math.floor(Math.random() * edgeMoves.length)];
      }
    }

    // 🎯 ۳. گرفتن طعمه‌خوار کور (اولویت ۱۰۰٪)
    const captureMoves = moves.filter((m) => m.captured);
    if (captureMoves.length > 0) {
      // حتی اگه محافظت داشته باشه، می‌زنه
      // برای تنوع، گاهی وزیر رو برای گرفتن می‌فرسته
      const queenCaptures = captureMoves.filter((m) => m.piece === "q");
      if (queenCaptures.length > 0 && Math.random() < 0.6) {
        return queenCaptures[Math.floor(Math.random() * queenCaptures.length)];
      }
      return captureMoves[Math.floor(Math.random() * captureMoves.length)];
    }

    // 🎯 ۴. کیش‌باز کودکانه (کیش انتحاری)
    const checkMoves = moves.filter((m) => m.san.includes("+"));
    if (checkMoves.length > 0) {
      // کیش با وزیر رو ترجیح بده
      const queenChecks = checkMoves.filter((m) => m.piece === "q");
      if (queenChecks.length > 0 && Math.random() < 0.7) {
        return queenChecks[Math.floor(Math.random() * queenChecks.length)];
      }
      return checkMoves[Math.floor(Math.random() * checkMoves.length)];
    }

    // 🎯 ۵. حرکت عجیب اسب به لبه (Na3, Nh3, Na6, Nh6)
    const knightEdgeMoves = moves.filter(
      (m) =>
        m.piece === "n" &&
        (m.to[0] === "a" ||
          m.to[0] === "h" ||
          m.to[1] === "1" ||
          m.to[1] === "8"),
    );
    if (knightEdgeMoves.length > 0 && Math.random() < 0.4) {
      return knightEdgeMoves[
        Math.floor(Math.random() * knightEdgeMoves.length)
      ];
    }

    // 🎯 ۶. پیشبرد پیاده‌های کناری (a4, h4)
    const pawnEdgeMoves = moves.filter(
      (m) =>
        m.piece === "p" &&
        (m.to[0] === "a" ||
          m.to[0] === "h" ||
          m.to[1] === "4" ||
          m.to[1] === "5") &&
        !m.captured,
    );
    if (pawnEdgeMoves.length > 0 && Math.random() < 0.3) {
      return pawnEdgeMoves[Math.floor(Math.random() * pawnEdgeMoves.length)];
    }

    // 🎯 ۷. حرکت پیاده‌روی شاه (در میانه بازی)
    if (moveCount >= 10 && moveCount <= 30) {
      const kingMoves = moves.filter(
        (m) =>
          m.piece === "k" &&
          Math.abs(parseInt(m.to[1]) - parseInt(m.from[1])) > 0, // به جلو یا عقب
      );
      if (kingMoves.length > 0 && Math.random() < 0.2) {
        return kingMoves[Math.floor(Math.random() * kingMoves.length)];
      }
    }

    // 🎯 ۸. حرکت تکراری در آخر بازی (اگر مهره‌ها کم باشه)
    if (pieceCount <= 6) {
      const lastMove = game.history({ verbose: true }).pop();
      if (lastMove) {
        const sameMove = moves.find(
          (m) => m.from === lastMove.from && m.to === lastMove.to,
        );
        if (sameMove) {
          return sameMove;
        }
      }
    }

    // 🎯 ۹. حرکت تصادفی (در نهایت)
    return moves[Math.floor(Math.random() * moves.length)];
  },

  // ============================================
  // 💬 پیام‌های خاص لوئیس
  // ============================================
  getMessage: function (type) {
    const messages = {
      thinking: [
        "🤔 لوئیس داره فکر میکنه... خیلی سخته!",
        "🧠 لوئیس یه چیزی حس میکنه!",
        "😕 لوئیس گیج شده!",
        "🔍 لوئیس داره دنبال وزیر حریف می‌گرده...",
        "🤡 لوئیس یه ایده‌ی عالی داره! (نه واقعاً)",
      ],
      move: [
        "♟️ لوئیس حرکت کرد! امیدوارم خوب باشه!",
        "🎯 لوئیس اینو دوست داره!",
        "🙈 لوئیس چشماش رو بسته!",
        "💪 لوئیس حرکت کرد! ببینیم چی میشه!",
        "✨ لوئیس یه حرکت جادویی زد! (احتمالاً بد)",
      ],
      capture: [
        "😱 لوئیس مهره‌ات رو گرفت! شانسی!",
        "💪 لوئیس یه گرفتن خوب کرد! اتفاقی!",
        "🎯 لوئیس یه مهره گرفت! (نمیدونه چرا)",
        "⚡ لوئیس ضربه زد! (نمی‌دونه چیکار کرد)",
      ],
      check: [
        "🔥 کیش! لوئیس بهت حمله کرد! نمی‌دونست چیکار داره!",
        "⚡ لوئیس کیش داد! تعجب‌آور!",
        "👑 وزیر لوئیس کیش داد! (واسه اینکه گرفته بشه)",
        "😅 لوئیس کیش زد! ولی وزیرش رو از دست میده!",
      ],
      win: [
        "🏆 لوئیس برنده شد! چطور ممکنه؟!",
        "😎 لوئیس قوی‌تر بود! (شانسی!)",
        "🎉 لوئیس برد! باور کردنی نیست!",
        "🤯 لوئیس استاد بزرگ رو شکست داد! (نه واقعاً)",
      ],
      lose: [
        "🎉 تو لوئیس رو شکست دادی! آسون بود!",
        "😢 لوئیس بازنده شد... ولی خب انتظار می‌رفت!",
        "🤡 لوئیس باخت! بازم وزیرش رو داد!",
        "💀 بازم لوئیس وزیرش رو قربانی کرد!",
      ],
      draw: [
        "🤝 لوئیس با تو مساوی شد! نه‌بد!",
        "🤝 بازی مساوی با لوئیس! (چون پات شد!)",
        "😅 لوئیس پات کرد! نمی‌دونه چطور مات کنه!",
      ],
      start: [
        "♟️ لوئیس آماده‌ست! ولی زیاد بهش سخت نگیر!",
        "👋 سلام! من لوئیس هستم! ۲۵۰ تا ریتینگ دارم!",
        "🤡 لوئیس میاد که ببازه!",
        "🎯 هدف لوئیس: گرفتن پیاده‌های کناری!",
        "👑 لوئیس وزیرش رو هدیه میده!",
      ],
    };
    const list = messages[type] || ["لوئیس!"];
    return list[Math.floor(Math.random() * list.length)];
  },
};

window.BotLouis = BotLouis;
