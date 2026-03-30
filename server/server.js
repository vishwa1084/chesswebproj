import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

let waitingSocketId = null;
let roomCounter = 1;

const games = new Map();
const playerState = new Map();
const RAPID_TIME_SECONDS = 600;

function getGameStatus(chess) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return `${winner} wins by checkmate`;
  }

  if (chess.isDraw()) {
    if (chess.isStalemate()) return 'Draw by stalemate';
    if (chess.isThreefoldRepetition()) return 'Draw by repetition';
    if (chess.isInsufficientMaterial()) return 'Draw by insufficient material';
    return 'Draw';
  }

  if (chess.isCheck()) {
    return `${chess.turn() === 'w' ? 'White' : 'Black'} is in check`;
  }

  return `${chess.turn() === 'w' ? 'White' : 'Black'} to move`;
}

function serializeGame(game, extra = {}) {
  const { chess, players } = game;
  let status = getGameStatus(chess);

  if (game.awaitingSwap) {
    status = 'Choose if you want to switch colors';
  } else if (game.awaitingStart) {
    status = 'White must click Start Game';
  } else if (game.timeWinner) {
    status = `${game.timeWinner === 'w' ? 'White' : 'Black'} wins on time`;
  }

  return {
    fen: chess.fen(),
    turn: chess.turn(),
    status,
    gameOver: chess.isGameOver() || Boolean(game.timeWinner),
    players,
    awaitingSwap: Boolean(game.awaitingSwap),
    awaitingStart: Boolean(game.awaitingStart),
    started: Boolean(game.started),
    awaitingPlayAgain: Boolean(game.awaitingPlayAgain),
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    ...extra,
  };
}

function getPlayerColor(players, socketId) {
  if (players.w === socketId) return 'w';
  if (players.b === socketId) return 'b';
  return null;
}

function emitGameStateToRoom(game, eventName, extra = {}) {
  const { players } = game;
  const sockets = [players.w, players.b]
    .map((socketId) => io.sockets.sockets.get(socketId))
    .filter(Boolean);

  for (const targetSocket of sockets) {
    const color = getPlayerColor(players, targetSocket.id);
    const opponentId = color === 'w' ? players.b : players.w;

    targetSocket.emit(eventName, {
      roomId: game.roomId,
      color,
      opponentId,
      mySwapDecision: game.swapDecisions[targetSocket.id] ?? null,
      opponentSwapDecision: game.swapDecisions[opponentId] ?? null,
      myPlayAgainDecision: game.playAgainDecisions[targetSocket.id] ?? null,
      opponentPlayAgainDecision: game.playAgainDecisions[opponentId] ?? null,
      ...serializeGame(game, extra),
    });
  }
}

function resetGameForRematch(game) {
  game.chess = new Chess();
  game.awaitingSwap = true;
  game.awaitingStart = false;
  game.started = false;
  game.swapDecisions = {};
  game.awaitingPlayAgain = false;
  game.playAgainDecisions = {};
  game.timeWinner = null;
  game.whiteTime = RAPID_TIME_SECONDS;
  game.blackTime = RAPID_TIME_SECONDS;
}

function pairPlayers(socketAId, socketBId) {
  const roomId = `room-${roomCounter++}`;
  const whiteFirst = Math.random() < 0.5;
  const whiteId = whiteFirst ? socketAId : socketBId;
  const blackId = whiteFirst ? socketBId : socketAId;

  const game = {
    roomId,
    chess: new Chess(),
    players: {
      w: whiteId,
      b: blackId,
    },
    awaitingSwap: true,
    awaitingStart: false,
    started: false,
    swapDecisions: {},
    awaitingPlayAgain: false,
    playAgainDecisions: {},
    whiteTime: RAPID_TIME_SECONDS,
    blackTime: RAPID_TIME_SECONDS,
    timeWinner: null,
  };

  games.set(roomId, game);

  const socketA = io.sockets.sockets.get(socketAId);
  const socketB = io.sockets.sockets.get(socketBId);

  if (!socketA || !socketB) {
    games.delete(roomId);
    return;
  }

  socketA.join(roomId);
  socketB.join(roomId);

  playerState.set(game.players.w, { roomId, color: 'w' });
  playerState.set(game.players.b, { roomId, color: 'b' });
  emitGameStateToRoom(game, 'gameFound');
}

function cleanupGame(roomId, disconnectedId) {
  const game = games.get(roomId);
  if (!game) return;

  const players = game.players;
  const opponentId = players.w === disconnectedId ? players.b : players.w;

  if (opponentId) {
    const opponentSocket = io.sockets.sockets.get(opponentId);
    if (opponentSocket) {
      opponentSocket.emit('opponentLeft');
      opponentSocket.leave(roomId);
    }
    playerState.delete(opponentId);
  }

  playerState.delete(disconnectedId);
  games.delete(roomId);
}

io.on('connection', (socket) => {
  socket.emit('welcome', { socketId: socket.id });

  socket.on('joinQueue', () => {
    if (playerState.has(socket.id)) return;

    if (!waitingSocketId) {
      waitingSocketId = socket.id;
      socket.emit('queueWaiting');
      return;
    }

    if (waitingSocketId === socket.id) {
      socket.emit('queueWaiting');
      return;
    }

    const opponentId = waitingSocketId;
    waitingSocketId = null;
    pairPlayers(opponentId, socket.id);
  });

  socket.on('makeMove', ({ roomId, from, to, promotion = 'q' }) => {
    const state = playerState.get(socket.id);
    if (!state || state.roomId !== roomId) return;

    const game = games.get(roomId);
    if (!game) return;

    if (game.awaitingSwap) {
      socket.emit('moveRejected', { reason: 'Wait for both players to finish color selection' });
      return;
    }

    if (game.awaitingStart || !game.started) {
      socket.emit('moveRejected', { reason: 'Game has not started yet' });
      return;
    }

    if (game.awaitingPlayAgain) {
      socket.emit('moveRejected', { reason: 'Game is over. Start a rematch to continue' });
      return;
    }

    const playerColor = state.color;
    if (game.chess.turn() !== playerColor) {
      socket.emit('moveRejected', { reason: 'Not your turn' });
      return;
    }

    try {
      const move = game.chess.move({ from, to, promotion });
      if (!move) {
        socket.emit('moveRejected', { reason: 'Illegal move' });
        return;
      }

      if (game.chess.isGameOver()) {
        game.awaitingPlayAgain = true;
        game.playAgainDecisions = {};
      }

      emitGameStateToRoom(game, 'gameUpdate', {
        lastMove: move,
      });
    } catch {
      socket.emit('moveRejected', { reason: 'Illegal move' });
    }
  });

  socket.on('swapDecision', ({ roomId, wantsSwitch }) => {
    const state = playerState.get(socket.id);
    if (!state || state.roomId !== roomId) return;

    const game = games.get(roomId);
    if (!game || !game.awaitingSwap) return;

    game.swapDecisions[socket.id] = Boolean(wantsSwitch);
    emitGameStateToRoom(game, 'swapUpdate');

    const whiteDecision = game.swapDecisions[game.players.w];
    const blackDecision = game.swapDecisions[game.players.b];
    const bothAnswered = typeof whiteDecision === 'boolean' && typeof blackDecision === 'boolean';

    if (!bothAnswered) return;

    let resolvedMessage = 'Colors kept';
    if (whiteDecision && blackDecision) {
      const oldWhite = game.players.w;
      game.players.w = game.players.b;
      game.players.b = oldWhite;

      playerState.set(game.players.w, { roomId, color: 'w' });
      playerState.set(game.players.b, { roomId, color: 'b' });
      resolvedMessage = 'Both agreed, colors switched';
    }

    game.awaitingSwap = false;
    game.awaitingStart = true;
    game.started = false;
    game.swapDecisions = {};

    emitGameStateToRoom(game, 'swapResolved', {
      status: `${resolvedMessage}. White clicks Start Game`,
    });
  });

  socket.on('startGame', ({ roomId }) => {
    const state = playerState.get(socket.id);
    if (!state || state.roomId !== roomId) return;

    const game = games.get(roomId);
    if (!game || game.awaitingSwap || game.awaitingPlayAgain || !game.awaitingStart) return;
    if (state.color !== 'w') return;

    game.whiteTime = RAPID_TIME_SECONDS;
    game.blackTime = RAPID_TIME_SECONDS;
    game.awaitingStart = false;
    game.started = true;
    game.timeWinner = null;
    emitGameStateToRoom(game, 'gameStarted', { status: 'Game Started - White to move' });
  });

  socket.on('playAgain', ({ roomId }) => {
    const state = playerState.get(socket.id);
    if (!state || state.roomId !== roomId) return;

    const game = games.get(roomId);
    if (!game || !game.awaitingPlayAgain) return;

    game.playAgainDecisions[socket.id] = true;
    emitGameStateToRoom(game, 'playAgainUpdate');

    const whiteReady = Boolean(game.playAgainDecisions[game.players.w]);
    const blackReady = Boolean(game.playAgainDecisions[game.players.b]);
    if (!whiteReady || !blackReady) return;

    resetGameForRematch(game);
    emitGameStateToRoom(game, 'rematchStarted');
  });

  socket.on('disconnect', () => {
    if (waitingSocketId === socket.id) {
      waitingSocketId = null;
    }

    const state = playerState.get(socket.id);
    if (!state) return;

    cleanupGame(state.roomId, socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Socket server listening on http://localhost:${PORT}`);
});

setInterval(() => {
  for (const game of games.values()) {
    if (
      game.awaitingSwap ||
      game.awaitingStart ||
      !game.started ||
      game.awaitingPlayAgain ||
      game.timeWinner ||
      game.chess.isGameOver()
    ) {
      continue;
    }

    const activeColor = game.chess.turn();
    if (activeColor === 'w') {
      game.whiteTime = Math.max(0, game.whiteTime - 1);
      if (game.whiteTime === 0) {
        game.timeWinner = 'b';
        game.awaitingPlayAgain = true;
        game.playAgainDecisions = {};
      }
    } else {
      game.blackTime = Math.max(0, game.blackTime - 1);
      if (game.blackTime === 0) {
        game.timeWinner = 'w';
        game.awaitingPlayAgain = true;
        game.playAgainDecisions = {};
      }
    }

    emitGameStateToRoom(game, 'gameUpdate');
  }
}, 1000);
