// bot-magnus.js - مگنوس کارلسن (ریتینگ ۲۸۸۲) - اسطوره‌ی شطرنج جهان
// بر اساس تحلیل عمیق شخصیت شطرنجی مگنوس کارلسن

const BotMagnus = {
  name: "مگنوس کارلسن",
  rating: "۲۸۸۲",
  avatar: "images/bots/Magnus_Carlsen.png",

  // ===== تنظیمات Stockfish برای بالاترین سطح =====
  skillLevel: 20, // حداکثر سطح ممکن
  depth: 20, // عمق بسیار بالا برای تحلیل عمیق

  // ===== متغیرهای داخلی برای شبیه‌سازی شخصیت =====
  _moveCount: 0,
  _hasCastled: false,
  _phase: "opening", // opening, middlegame, endgame
  _pressureMode: false, // حالت فشار خاموش
  _unorthodoxPlayed: false,

  // ============================================
  // 🎯 حرکت‌های خاص مگنوس (ترکیبی از شهود و محاسبه)
  // ============================================
  getMove: function (game) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    const moveCount = game.history().length;
    const turn = game.turn();
    const fen = game.fen();
    const board = game.board();
    const allPieces = board.flat().filter((p) => p !== null);
    const pieceCount = allPieces.length;

    this._moveCount = moveCount;

    // ===== تشخیص فاز بازی =====
    if (moveCount < 12) this._phase = "opening";
    else if (pieceCount <= 10) this._phase = "endgame";
    else this._phase = "middlegame";

    // ============================================
    // 🌟 ۱. گشایش‌های غیرمتعارف (خارج کردن حریف از منطقه امن)
    // ============================================
    if (this._phase === "opening" && !this._unorthodoxPlayed) {
      // ۷۰٪ مواقع در حرکت اول e4 (کلاسیک ولی با تنوع بعدی)
      if (moveCount === 0) {
        const e4 = moves.find((m) => m.from === "e2" && m.to === "e4");
        if (e4 && Math.random() < 0.7) return e4;
        const d4 = moves.find((m) => m.from === "d2" && m.to === "d4");
        if (d4 && Math.random() < 0.5) return d4;
        const c4 = moves.find((m) => m.from === "c2" && m.to === "c4");
        if (c4 && Math.random() < 0.3) return c4;
      }

      // حرکات غیرمتعارف در گشایش (مثل Nf3, g3, b3)
      if (moveCount >= 1 && moveCount <= 6) {
        const unorthodoxMoves = moves.filter((m) => {
          // حرکات غیرمنتظره
          const weirdFroms = ["g1", "b1", "g2", "b2", "f2"];
          const weirdTos = [
            "f3",
            "c3",
            "g3",
            "b3",
            "f4",
            "g4",
            "b4",
            "a3",
            "h3",
          ];
          return (
            weirdFroms.includes(m.from) ||
            weirdTos.includes(m.to) ||
            (m.piece === "b" && (m.to === "b5" || m.to === "g5")) ||
            (m.piece === "n" && (m.to === "a3" || m.to === "h3"))
          );
        });
        if (unorthodoxMoves.length > 0 && Math.random() < 0.25) {
          this._unorthodoxPlayed = true;
          return unorthodoxMoves[
            Math.floor(Math.random() * unorthodoxMoves.length)
          ];
        }
      }
    }

    // ============================================
    // 🪨 ۲. فشار خاموش و فشردن آب از سنگ (برتری‌های میکروسکوپی)
    // ============================================
    if (this._phase === "middlegame" && moveCount >= 12) {
      // تشخیص موقعیت‌های مساوی و ایجاد فشار
      // ۱. حرکت‌های آرام و بی‌صدا برای بهبود موقعیت
      const quietMoves = moves.filter(
        (m) =>
          !m.captured &&
          !m.san.includes("+") &&
          !m.san.includes("O-O") &&
          m.piece !== "p" &&
          (m.to[0] === "c" ||
            m.to[0] === "d" ||
            m.to[0] === "e" ||
            m.to[0] === "f"),
      );

      // ۲. حرکات عقب‌نشینی تاکتیکی (چشم‌انداز ۱۰ حرکته)
      const retreatMoves = moves.filter(
        (m) =>
          !m.captured &&
          !m.san.includes("+") &&
          m.piece !== "p" &&
          m.piece !== "k" &&
          (m.from[0] === m.to[0] ||
            Math.abs(parseInt(m.from[1]) - parseInt(m.to[1])) === 1),
      );

      // ۳. پیشبرد پیاده‌ها برای ایجاد برتری موقعیتی
      const pawnAdvances = moves.filter(
        (m) =>
          m.piece === "p" &&
          !m.captured &&
          (m.to[1] === "4" || m.to[1] === "5" || m.to[1] === "6") &&
          (m.to[0] === "c" ||
            m.to[0] === "d" ||
            m.to[0] === "e" ||
            m.to[0] === "f"),
      );

      // ترکیب: ۴۰٪ مواقع حرکت آرام، ۳۰٪ حرکت عقب‌نشینی، ۲۰٪ پیشبرد پیاده، ۱۰٪ تصادفی
      const r = Math.random();
      if (r < 0.4 && quietMoves.length > 0) {
        return quietMoves[
          Math.floor(Math.random() * Math.min(quietMoves.length, 3))
        ];
      }
      if (r < 0.7 && retreatMoves.length > 0) {
        return retreatMoves[
          Math.floor(Math.random() * Math.min(retreatMoves.length, 3))
        ];
      }
      if (r < 0.9 && pawnAdvances.length > 0) {
        return pawnAdvances[
          Math.floor(Math.random() * Math.min(pawnAdvances.length, 2))
        ];
      }
    }

    // ============================================
    // 🎯 ۳. استاد آخر بازی (تبدیل برتری‌های جزئی)
    // ============================================
    if (this._phase === "endgame") {
      // تشخیص برتری‌های میکروسکوپی در آخر بازی
      // ۱. اگر پیاده‌ی عبوری داریم، اولویت با پیشبرد آن
      const passedPawns = moves.filter(
        (m) =>
          m.piece === "p" &&
          !m.captured &&
          ((turn === "w" && m.to[1] === "6") ||
            (turn === "b" && m.to[1] === "3")) &&
          (m.from[0] === "c" ||
            m.from[0] === "d" ||
            m.from[0] === "e" ||
            m.from[0] === "f"),
      );
      if (passedPawns.length > 0 && Math.random() < 0.5) {
        return passedPawns[Math.floor(Math.random() * passedPawns.length)];
      }

      // ۲. فعال‌سازی شاه در آخر بازی (حرکت شاه به جلو)
      const kingMoves = moves.filter(
        (m) =>
          m.piece === "k" &&
          !m.captured &&
          ((turn === "w" && m.to[1] > m.from[1]) ||
            (turn === "b" && m.to[1] < m.from[1])),
      );
      if (kingMoves.length > 0 && Math.random() < 0.2) {
        return kingMoves[Math.floor(Math.random() * kingMoves.length)];
      }

      // ۳. حرکات دقیق با رخ (بهبود جایگاه رخ)
      const rookMoves = moves.filter(
        (m) =>
          m.piece === "r" &&
          !m.captured &&
          (m.to[0] === "d" ||
            m.to[0] === "e" ||
            m.to[0] === "f" ||
            m.to[0] === "c"),
      );
      if (rookMoves.length > 0 && Math.random() < 0.3) {
        return rookMoves[Math.floor(Math.random() * rookMoves.length)];
      }
    }

    // ============================================
    // 💡 ۴. شهود و شفافیت (انتخاب حرکت ساده و درست)
    // ============================================
    if (this._phase === "middlegame" && Math.random() < 0.15) {
      // حرکات شفاف و ساده (بدون پیچیدگی)
      const simpleMoves = moves.filter(
        (m) =>
          !m.captured &&
          !m.san.includes("+") &&
          m.piece !== "p" &&
          (m.to[0] === "e" ||
            m.to[0] === "d" ||
            m.to[0] === "c" ||
            m.to[0] === "f"),
      );
      if (simpleMoves.length > 0) {
        return simpleMoves[
          Math.floor(Math.random() * Math.min(simpleMoves.length, 4))
        ];
      }
    }

    // ============================================
    // 🧠 ۵. در نهایت، از Stockfish با بالاترین سطح استفاده کن
    // ============================================
    // مگنوس به Stockfish با Skill Level 20 و Depth 20 اعتماد دارد
    // ولی گاهی برای تنوع، حرکت تصادفی از بین ۵ حرکت برتر
    if (Math.random() < 0.08) {
      // ۸٪ مواقع حرکت تصادفی برای غیرقابل پیش‌بینی بودن
      const topMoves = moves.slice(0, Math.min(5, moves.length));
      return topMoves[Math.floor(Math.random() * topMoves.length)];
    }

    return null; // استفاده از Stockfish با تنظیمات بالا
  },

  // ============================================
  // 💬 پیام‌های خاص مگنوس کارلسن
  // ============================================
  getMessage: function (type) {
    const messages = {
      thinking: [
        "🧠 مگنوس داره موقعیت رو شفاف می‌کنه...",
        "👑 مگنوس با شهودش حرکت رو حس می‌کنه!",
        "🔍 مگنوس داره برتری‌های میکروسکوپی رو جمع می‌کنه...",
        "♟️ مگنوس مثل آب از سنگ فشار رو خارج می‌کنه!",
        "🎯 مگنوس منتظر اشتباه حریفه...",
        "🧘 مگنوس در آرامش کامل موقعیت رو تحلیل می‌کنه",
      ],
      move: [
        "♟️ مگنوس حرکت کرد! فشار خاموش...",
        "🎯 مگنوس یه حرکت شفاف و ساده زد!",
        "💡 مگنوس بهترین گزینه رو با شهودش انتخاب کرد!",
        "👑 مگنوس داره آب از سنگ فشار می‌ده!",
        "✨ مگنوس یه حرکت غیرمنتظره زد!",
      ],
      capture: [
        "💀 مگنوس مهره‌ات رو گرفت! فشار رو بیشتر می‌کنه!",
        "🎯 مگنوس دقیقاً می‌دونه چیکار کنه!",
        "⚔️ مگنوس یه گرفتن حساب‌شده انجام داد!",
        "🪤 مگنوس تله‌اش رو گذاشت و مهره رو گرفت!",
      ],
      check: [
        "🔥 کیش! مگنوس بهت حمله کرد! آروم ولی مرگبار!",
        "⚡ مگنوس کیش داد! فشار روانی شروع شد!",
        "👑 مگنوس شاه رو تهدید میکنه... ولی عجله نداره!",
      ],
      win: [
        "🏆 مگنوس برنده شد! احسنت! (همیشه)",
        "👑 مگنوس نشان داد چرا ۲۸۸۲ ریتینگ داره!",
        "😎 مگنوس مثل همیشه، آب رو از سنگ فشار داد!",
        "🎉 مگنوس برد! یه بازی دیگه از اسطوره!",
      ],
      lose: [
        "😱 مگنوس باخت! این باورکردنی نیست!",
        "🤯 تو مگنوس رو شکست دادی! تاریخ‌ساز شدی!",
        "😢 مگنوس باخت... ولی این فقط یه استثناست!",
        "💪 مگنوس برگشته! دفعه بعد می‌بینی!",
      ],
      draw: [
        "🤝 مگنوس با تو مساوی شد! (البته ناراضیه)",
        "🤝 بازی مساوی با مگنوس! کار بزرگی کردی!",
        "😤 مگنوس از تساوی راضی نیست، ولی قبول میکنه!",
      ],
      start: [
        "♟️ مگنوس آماده‌ست! آماده‌ای برای یه بازی تاریخی؟",
        "👋 سلام! من مگنوس کارلسن هستم! ۲۸۸۲ ریتینگ!",
        "🔥 مگنوس برای یه بازی جدی اومده! (همیشه)",
        "👑 اسطوره‌ی شطرنج مقابل شماست! مواظب باش!",
        "🧠 مگنوس می‌خواد بهت نشون بده چرا بهترینه!",
      ],
    };
    const list = messages[type] || ["مگنوس!"];
    return list[Math.floor(Math.random() * list.length)];
  },
};

window.BotMagnus = BotMagnus;
