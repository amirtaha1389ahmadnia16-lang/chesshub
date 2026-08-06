const { Chess } = require("chess.js");
const logger = require("../utils/logger");

class GameRoom {
  constructor(id, playerW, playerB, timeControlMinutes = 10) {
    this.id = id;
    this.chess = new Chess();
    this.players = { w: playerW, b: playerB };

    // زمان بر حسب میلی‌ثانیه
    this.timeControl = timeControlMinutes * 60 * 1000;
    this.clocks = { w: this.timeControl, b: this.timeControl };
    this.lastMoveTime = Date.now();

    this.isGameOver = false;
    this.moveHistory = [];
  }

  makeMove(playerSocket, from, to, promotion) {
    if (this.isGameOver)
      return { success: false, reason: "Game is already over" };

    const playerColor = this.players.w.id === playerSocket.id ? "w" : "b";

    // بررسی نوبت بازیکن
    if (this.chess.turn() !== playerColor) {
      return { success: false, reason: "Not your turn" };
    }

    try {
      const move = this.chess.move({ from, to, promotion: promotion || "q" });
      if (!move) return { success: false, reason: "Illegal move" };

      // مدیریت ساعت (فعلاً فقط ذخیره می‌کنیم، در قدم بعد تایمر اکتیو می‌شود)
      const now = Date.now();
      const elapsed = now - this.lastMoveTime;
      this.clocks[playerColor] -= elapsed;
      this.lastMoveTime = now;

      this.moveHistory.push(move);

      if (this.chess.game_over()) {
        this.isGameOver = true;
        let result = "draw";
        if (this.chess.in_checkmate()) {
          result = playerColor === "w" ? "1-0" : "0-1";
        }
        return {
          success: true,
          move,
          gameOver: true,
          result,
          fen: this.chess.fen(),
        };
      }

      return { success: true, move, gameOver: false, fen: this.chess.fen() };
    } catch (e) {
      logger.error(`Move error in room ${this.id}: ${e.message}`);
      return { success: false, reason: "Server validation error" };
    }
  }
}

module.exports = GameRoom;
