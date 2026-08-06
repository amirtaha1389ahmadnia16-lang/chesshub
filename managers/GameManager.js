const GameRoom = require("../models/GameRoom");
const logger = require("../utils/logger");

class GameManager {
  constructor() {
    this.activeGames = new Map();
  }

  createGame(playerW, playerB, timeControl = 10) {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const game = new GameRoom(gameId, playerW, playerB, timeControl);
    this.activeGames.set(gameId, game);
    logger.info(`Game created: ${gameId}`);
    return game;
  }

  getGame(gameId) {
    return this.activeGames.get(gameId);
  }

  removeGame(gameId) {
    if (this.activeGames.has(gameId)) {
      this.activeGames.delete(gameId);
      logger.info(`Game removed: ${gameId}`);
    }
  }
}

module.exports = new GameManager();
