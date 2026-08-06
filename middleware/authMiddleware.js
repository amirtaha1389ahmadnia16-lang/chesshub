const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "chesshub-super-secret-dev-key";

// تولید توکن موقت برای مهمان‌ها
function generateGuestToken(socketId) {
  return jwt.sign({ id: socketId, role: "guest", rating: 1200 }, JWT_SECRET, {
    expiresIn: "2h",
  });
}

// میدلور بررسی توکن در Socket.io
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;

  if (!token) {
    const guestToken = generateGuestToken(socket.id);
    socket.user = jwt.decode(guestToken);
    socket.token = guestToken;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    logger.warn(
      `Authentication failed for socket ${socket.id}: ${err.message}`,
    );
    next(new Error("Authentication error: Invalid or expired token"));
  }
}

module.exports = { authenticateSocket, JWT_SECRET };
