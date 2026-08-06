const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// مسیرهای جدید نسبت به فایل server.js
const { authenticateSocket } = require("./middleware/authMiddleware");
const MatchmakingManager = require("./managers/MatchmakingManager");
const GameManager = require("./managers/GameManager");
const logger = require("./utils/logger"); // اگر پوشه utils را ساختی

const app = express();

// این خط بسیار مهم است! به Render می‌گوید فایل‌های سایت (HTML/CSS) کجا هستند
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// احراز هویت و ضد تقلب
io.use(authenticateSocket);

io.on("connection", (socket) => {
  logger.info(`User connected: ${socket.id}`);

  socket.on("findGame", () => {
    const playerData = { id: socket.id, socket: socket };
    const matchedPlayers = MatchmakingManager.addToQueue(playerData);

    if (matchedPlayers) {
      const [p1, p2] = matchedPlayers;
      const game = GameManager.createGame(p1, p2, 10); // 10 دقیقه

      p1.socket.join(game.id);
      p2.socket.join(game.id);

      p1.socket.emit("gameStart", {
        gameId: game.id,
        color: "w",
        fen: game.chess.fen(),
      });
      p2.socket.emit("gameStart", {
        gameId: game.id,
        color: "b",
        fen: game.chess.fen(),
      });
    } else {
      socket.emit("waiting", { message: "Searching for opponent..." });
    }
  });

  socket.on("makeMove", ({ gameId, from, to, promotion }) => {
    const game = GameManager.getGame(gameId);
    if (!game) return;

    const result = game.makeMove(socket, from, to, promotion);

    if (result.success) {
      io.to(gameId).emit("moveMade", {
        from: result.move.from,
        to: result.move.to,
        fen: result.fen,
      });
    } else {
      socket.emit("invalidMove", { reason: result.reason });
    }
  });

  socket.on("disconnect", () => {
    MatchmakingManager.removeFromQueue(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ChessHub Server running on port ${PORT}`);
});
