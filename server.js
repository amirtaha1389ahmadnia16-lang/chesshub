const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const app = express();
app.use(express.static(__dirname)); // ریشه استاتیک = پوشه فعلی
const server = http.createServer(app);
const io = new Server(server);

// صفحه اصلی بازی آنلاین
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "online.html"));
});

let waitingPlayer = null;

io.on("connection", (socket) => {
  console.log("یک کاربر وصل شد:", socket.id);

  if (waitingPlayer) {
    // دو نفر پیدا شدن، بازی شروع میشه
    waitingPlayer.emit("gameStart", { color: "w" });
    socket.emit("gameStart", { color: "b" });
    waitingPlayer = null;
  } else {
    // نفر اول منتظر می‌مونه
    waitingPlayer = socket;
  }

  socket.on("move", (data) => {
    // حرکت رو برای حریف می‌فرستیم
    socket.broadcast.emit("opponentMove", data);
  });

  socket.on("disconnect", () => {
    if (waitingPlayer === socket) {
      waitingPlayer = null;
    }
  });
});

server.listen(3000, () => {
  console.log("سرور آماده است! آدرس: http://localhost:3000");
});
