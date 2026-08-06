const logger = require("../utils/logger");

class MatchmakingManager {
  constructor() {
    this.queue = [];
  }

  addToQueue(player) {
    if (this.queue.find((p) => p.id === player.id)) return false;

    this.queue.push(player);
    logger.info(
      `Player ${player.id} added to queue. Queue size: ${this.queue.length}`,
    );
    return this.tryMatch();
  }

  tryMatch() {
    if (this.queue.length < 2) return null;

    const player1 = this.queue.shift();
    const player2 = this.queue.shift();

    return [player1, player2];
  }

  removeFromQueue(playerId) {
    this.queue = this.queue.filter((p) => p.id !== playerId);
  }
}

module.exports = new MatchmakingManager();
