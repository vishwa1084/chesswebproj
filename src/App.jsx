import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';
import './App.css';

import wk from './assets/wk.png';
import wq from './assets/wq.png';
import wr from './assets/wr.png';
import wb from './assets/wb.png';
import wn from './assets/wn.png';
import wp from './assets/wp.png';

import bk from './assets/bk.png';
import bq from './assets/bq.png';
import br from './assets/br.png';
import bb from './assets/bb.png';
import bn from './assets/bn.png';
import bp from './assets/bp.png';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const socket = io(socketUrl, { autoConnect: false });

const pieceImages = { wk, wq, wr, wb, wn, wp, bk, bq, br, bb, bn, bp };
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RAPID_TIME_SECONDS = 600;
const INITIAL_CHESS = new Chess();
const INITIAL_FEN = INITIAL_CHESS.fen();
const INITIAL_BOARD = INITIAL_CHESS.board();

function squareFromCoords(row, col) {
  return `${files[col]}${8 - row}`;
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function shortId(id) {
  if (!id) return 'Waiting...';
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function App() {
  const chessRef = useRef(new Chess());
  const lastServerFenRef = useRef(INITIAL_FEN);

  const [fen, setFen] = useState(INITIAL_FEN);
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [roomId, setRoomId] = useState(null);
  const [myColor, setMyColor] = useState(null);
  const [mySocketId, setMySocketId] = useState('');
  const [players, setPlayers] = useState({ w: '', b: '' });
  const [turn, setTurn] = useState('w');
  const [status, setStatus] = useState('Connecting...');
  const [isGameOver, setIsGameOver] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [whiteTime, setWhiteTime] = useState(RAPID_TIME_SECONDS);
  const [blackTime, setBlackTime] = useState(RAPID_TIME_SECONDS);
  const [awaitingSwap, setAwaitingSwap] = useState(false);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [started, setStarted] = useState(false);
  const [mySwapDecision, setMySwapDecision] = useState(null);
  const [opponentSwapDecision, setOpponentSwapDecision] = useState(null);
  const [awaitingPlayAgain, setAwaitingPlayAgain] = useState(false);
  const [myPlayAgainDecision, setMyPlayAgainDecision] = useState(false);
  const [opponentPlayAgainDecision, setOpponentPlayAgainDecision] = useState(false);
  const [checkedKingSquare, setCheckedKingSquare] = useState(null);

  function updateCheckHighlight(chessInstance, turnColor) {
    const isInCheck =
      typeof chessInstance.inCheck === 'function'
        ? chessInstance.inCheck()
        : chessInstance.isCheck();

    if (!isInCheck) {
      setCheckedKingSquare(null);
      return;
    }

    const boardState = chessInstance.board();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = boardState[row]?.[col];
        if (piece && piece.type === 'k' && piece.color === turnColor) {
          setCheckedKingSquare(squareFromCoords(row, col));
          return;
        }
      }
    }

    setCheckedKingSquare(null);
  }

  useEffect(() => {
    socket.connect();

    const onWelcome = ({ socketId }) => {
      setMySocketId(socketId);
      setStatus('Connected. Searching for opponent...');
      socket.emit('joinQueue');
    };

    const onQueueWaiting = () => {
      setStatus('Waiting for another player...');
    };

    const onGameFound = (payload) => {
      if (!payload?.fen) return;
      chessRef.current.load(payload.fen);
      lastServerFenRef.current = payload.fen;
      setFen(payload.fen);
      setBoard(chessRef.current.board());
      setRoomId(payload.roomId || null);
      setMyColor(payload.color || null);
      setPlayers(payload.players || { w: '', b: '' });
      setTurn(payload.turn || 'w');
      setStatus(payload.status || 'Game started');
      setIsGameOver(Boolean(payload.gameOver));
      setAwaitingSwap(Boolean(payload.awaitingSwap));
      setAwaitingStart(Boolean(payload.awaitingStart));
      setStarted(Boolean(payload.started));
      setAwaitingPlayAgain(Boolean(payload.awaitingPlayAgain));
      setMySwapDecision(payload.mySwapDecision ?? null);
      setOpponentSwapDecision(payload.opponentSwapDecision ?? null);
      setMyPlayAgainDecision(Boolean(payload.myPlayAgainDecision));
      setOpponentPlayAgainDecision(Boolean(payload.opponentPlayAgainDecision));
      setSelectedSquare(null);
      setPossibleMoves([]);
      setLastMove(null);
      setWhiteTime(payload.whiteTime ?? RAPID_TIME_SECONDS);
      setBlackTime(payload.blackTime ?? RAPID_TIME_SECONDS);
      updateCheckHighlight(chessRef.current, payload.turn || 'w');
    };

    const onGameUpdate = (payload) => {
      if (!payload?.fen) return;
      chessRef.current.load(payload.fen);
      lastServerFenRef.current = payload.fen;
      setFen(payload.fen);
      setBoard(chessRef.current.board());
      setMyColor(payload.color || null);
      setTurn(payload.turn || 'w');
      setStatus(payload.status || 'Updated');
      setIsGameOver(Boolean(payload.gameOver));
      setAwaitingSwap(Boolean(payload.awaitingSwap));
      setAwaitingStart(Boolean(payload.awaitingStart));
      setStarted(Boolean(payload.started));
      setAwaitingPlayAgain(Boolean(payload.awaitingPlayAgain));
      setMySwapDecision(payload.mySwapDecision ?? null);
      setOpponentSwapDecision(payload.opponentSwapDecision ?? null);
      setMyPlayAgainDecision(Boolean(payload.myPlayAgainDecision));
      setOpponentPlayAgainDecision(Boolean(payload.opponentPlayAgainDecision));
      setPlayers((prev) => payload.players || prev);
      setWhiteTime(payload.whiteTime ?? RAPID_TIME_SECONDS);
      setBlackTime(payload.blackTime ?? RAPID_TIME_SECONDS);
      setLastMove(payload.lastMove || null);
      updateCheckHighlight(chessRef.current, payload.turn || 'w');
    };

    const onSwapUpdate = (payload) => {
      setAwaitingSwap(Boolean(payload.awaitingSwap));
      setMySwapDecision(payload.mySwapDecision ?? null);
      setOpponentSwapDecision(payload.opponentSwapDecision ?? null);
    };

    const onSwapResolved = (payload) => {
      if (!payload?.fen) return;
      chessRef.current.load(payload.fen);
      lastServerFenRef.current = payload.fen;
      setFen(payload.fen);
      setBoard(chessRef.current.board());
      setRoomId(payload.roomId || null);
      setTurn(payload.turn || 'w');
      setStatus(payload.status || 'Colors finalized');
      setPlayers(payload.players || { w: '', b: '' });
      setMyColor(payload.color || null);
      setAwaitingSwap(false);
      setAwaitingStart(Boolean(payload.awaitingStart));
      setStarted(Boolean(payload.started));
      setAwaitingPlayAgain(false);
      setMySwapDecision(null);
      setOpponentSwapDecision(null);
      setMyPlayAgainDecision(false);
      setOpponentPlayAgainDecision(false);
      setWhiteTime(payload.whiteTime ?? RAPID_TIME_SECONDS);
      setBlackTime(payload.blackTime ?? RAPID_TIME_SECONDS);
      setSelectedSquare(null);
      setPossibleMoves([]);
      updateCheckHighlight(chessRef.current, payload.turn || 'w');
    };

    const onGameStarted = (payload) => {
      if (!payload?.fen) return;
      chessRef.current.load(payload.fen);
      lastServerFenRef.current = payload.fen;
      setFen(payload.fen);
      setBoard(chessRef.current.board());
      setMyColor(payload.color || null);
      setTurn(payload.turn || 'w');
      setStatus(payload.status || 'Game Started');
      setAwaitingStart(Boolean(payload.awaitingStart));
      setStarted(Boolean(payload.started));
      setWhiteTime(payload.whiteTime ?? RAPID_TIME_SECONDS);
      setBlackTime(payload.blackTime ?? RAPID_TIME_SECONDS);
      updateCheckHighlight(chessRef.current, payload.turn || 'w');
    };

    const onPlayAgainUpdate = (payload) => {
      setAwaitingPlayAgain(Boolean(payload.awaitingPlayAgain));
      setMyPlayAgainDecision(Boolean(payload.myPlayAgainDecision));
      setOpponentPlayAgainDecision(Boolean(payload.opponentPlayAgainDecision));
    };

    const onRematchStarted = (payload) => {
      if (!payload?.fen) return;
      chessRef.current.load(payload.fen);
      lastServerFenRef.current = payload.fen;
      setFen(payload.fen);
      setBoard(chessRef.current.board());
      setMyColor(payload.color || null);
      setPlayers(payload.players || { w: '', b: '' });
      setTurn(payload.turn || 'w');
      setStatus(payload.status || 'New game started');
      setIsGameOver(false);
      setAwaitingSwap(Boolean(payload.awaitingSwap));
      setAwaitingPlayAgain(false);
      setMySwapDecision(null);
      setOpponentSwapDecision(null);
      setMyPlayAgainDecision(false);
      setOpponentPlayAgainDecision(false);
      setWhiteTime(payload.whiteTime ?? RAPID_TIME_SECONDS);
      setBlackTime(payload.blackTime ?? RAPID_TIME_SECONDS);
      setLastMove(null);
      updateCheckHighlight(chessRef.current, payload.turn || 'w');
    };

    const onMoveRejected = ({ reason }) => {
      setStatus(reason || 'Move rejected');
      chessRef.current.load(lastServerFenRef.current);
      setFen(lastServerFenRef.current);
      setBoard(chessRef.current.board());
      setTurn(chessRef.current.turn());
      setIsGameOver(false);
      setAwaitingPlayAgain(false);
      setMyPlayAgainDecision(false);
      setOpponentPlayAgainDecision(false);
      setSelectedSquare(null);
      setPossibleMoves([]);
      updateCheckHighlight(chessRef.current, chessRef.current.turn());
    };

    const onOpponentLeft = () => {
      chessRef.current.reset();
      lastServerFenRef.current = chessRef.current.fen();
      setFen(chessRef.current.fen());
      setBoard(chessRef.current.board());
      setStatus('Opponent disconnected. Searching for a new game...');
      setRoomId(null);
      setMyColor(null);
      setPlayers({ w: '', b: '' });
      setTurn('w');
      setIsGameOver(false);
      setAwaitingSwap(false);
      setAwaitingStart(false);
      setStarted(false);
      setAwaitingPlayAgain(false);
      setMySwapDecision(null);
      setOpponentSwapDecision(null);
      setMyPlayAgainDecision(false);
      setOpponentPlayAgainDecision(false);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setLastMove(null);
      setWhiteTime(RAPID_TIME_SECONDS);
      setBlackTime(RAPID_TIME_SECONDS);
      setCheckedKingSquare(null);
      socket.emit('joinQueue');
    };

    socket.on('welcome', onWelcome);
    socket.on('queueWaiting', onQueueWaiting);
    socket.on('gameFound', onGameFound);
    socket.on('gameUpdate', onGameUpdate);
    socket.on('moveRejected', onMoveRejected);
    socket.on('swapUpdate', onSwapUpdate);
    socket.on('swapResolved', onSwapResolved);
    socket.on('gameStarted', onGameStarted);
    socket.on('playAgainUpdate', onPlayAgainUpdate);
    socket.on('rematchStarted', onRematchStarted);
    socket.on('opponentLeft', onOpponentLeft);

    return () => {
      socket.off('welcome', onWelcome);
      socket.off('queueWaiting', onQueueWaiting);
      socket.off('gameFound', onGameFound);
      socket.off('gameUpdate', onGameUpdate);
      socket.off('moveRejected', onMoveRejected);
      socket.off('swapUpdate', onSwapUpdate);
      socket.off('swapResolved', onSwapResolved);
      socket.off('gameStarted', onGameStarted);
      socket.off('playAgainUpdate', onPlayAgainUpdate);
      socket.off('rematchStarted', onRematchStarted);
      socket.off('opponentLeft', onOpponentLeft);
      socket.disconnect();
    };
  }, []);

  function handleSquareClick(square) {
  if (!roomId || !myColor || isGameOver || awaitingSwap || awaitingPlayAgain) return;

  const chess = chessRef.current;
  const piece = chess.get(square);
  const isMyTurn = turn === myColor;

 
  if (piece && piece.color === myColor) {
    setSelectedSquare(square);

    // show moves ONLY if allowed
    if (isMyTurn && started && !awaitingStart) {
      const moves = chess.moves({ square, verbose: true }).map(m => m.to);
      setPossibleMoves(moves);
    } else {
      setPossibleMoves([]);
    }

    return;
  }

  
  if (selectedSquare) {
    if (!started || awaitingStart) {
      setStatus("Click Start Game");
      return;
    }

    if (!isMyTurn) {
      setStatus("Wait for your turn");
      return;
    }

    const move = chess.move({
      from: selectedSquare,
      to: square,
      promotion: "q",
    });

    if (move) {
      setFen(chess.fen());
      setBoard(chess.board());
      setTurn(chess.turn());
      setLastMove(move);

      socket.emit("makeMove", {
        roomId,
        from: selectedSquare,
        to: square,
        promotion: "q",
      });

     
      updateCheckHighlight(chess, chess.turn());
    }

    setSelectedSquare(null);
    setPossibleMoves([]);
  }
}

  const whitePlayerId = players.w || (myColor === 'w' ? mySocketId : '');
  const blackPlayerId = players.b || (myColor === 'b' ? mySocketId : '');
  const isFlipped = myColor === 'b';
  const topColor = isFlipped ? 'w' : 'b';
  const bottomColor = isFlipped ? 'b' : 'w';
  const topPlayerId = topColor === 'w' ? whitePlayerId : blackPlayerId;
  const bottomPlayerId = bottomColor === 'w' ? whitePlayerId : blackPlayerId;
  const topTime = topColor === 'w' ? whiteTime : blackTime;
  const bottomTime = bottomColor === 'w' ? whiteTime : blackTime;
  const displayRows = isFlipped ? [...board].reverse() : board;

  function handleSwapDecision(wantsSwitch) {
    if (!roomId || !awaitingSwap) return;
    setMySwapDecision(wantsSwitch);
    socket.emit('swapDecision', { roomId, wantsSwitch });
  }

  function handlePlayAgain() {
    if (!roomId || !awaitingPlayAgain || myPlayAgainDecision) return;
    setMyPlayAgainDecision(true);
    socket.emit('playAgain', { roomId });
  }

  function handleStartGame() {
    if (!roomId || !awaitingStart || myColor !== 'w') return;
    socket.emit('startGame', { roomId });
  }

  return (
    <>
      <div className="navigator">
        <h1>CHESS</h1>
        <p>Room: {roomId || 'Matching'}</p>
        <p>Status: {status}</p>
      </div>

      <div className="game-shell">
        <div className={`player-card ${turn === topColor ? 'active' : ''}`}>
          <span className="player-title">{topColor === 'w' ? 'White' : 'Black'}</span>
          <span className="player-id">{shortId(topPlayerId)}</span>
          <span className="player-time">{formatTime(topTime)}</span>
        </div>

        <div className="board" key={fen}>
          {displayRows.map((rank, displayRow) =>
            rank.map((_, displayCol) => {
              const row = isFlipped ? 7 - displayRow : displayRow;
              const col = isFlipped ? 7 - displayCol : displayCol;
              const piece = board[row]?.[col] || null;
              const square = squareFromCoords(row, col);
              const imageKey = piece ? `${piece.color}${piece.type}` : null;
              const isLight = (row + col) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isPossibleMove = possibleMoves.includes(square);
              const isLastFrom = lastMove?.from === square;
              const isLastTo = lastMove?.to === square;
              const isCheckedKing = checkedKingSquare === square;
              const isDisabled =
                !myColor ||
                isGameOver ||
                awaitingSwap ||
                awaitingPlayAgain;

              return (
                <button
                  key={square}
                  type="button"
                  className={`square ${isLight ? 'light' : 'dark'} ${
                    isSelected ? 'selected' : ''
                  } ${isPossibleMove ? 'possible' : ''} ${
                    isLastFrom || isLastTo ? 'last-move' : ''
                  } ${isCheckedKing ? 'in-check' : ''}`}
                  onClick={() => handleSquareClick(square)}
                  disabled={isDisabled}
                >
                  {piece && (
                    <img
                      src={pieceImages[imageKey]}
                      className="piece"
                      alt={`${piece.color}${piece.type}`}
                    />
                  )}
                </button>
              );
            }),
          )}
        </div>

        <div className={`player-card ${turn === bottomColor ? 'active' : ''}`}>
          <span className="player-title">{bottomColor === 'w' ? 'White' : 'Black'}</span>
          <span className="player-id">{shortId(bottomPlayerId)}</span>
          <span className="player-time">{formatTime(bottomTime)}</span>
        </div>
      </div>

      {awaitingSwap && (
        <div className="overlay">
          <div className="modal">
            <h2>Switch Pieces?</h2>
            <p>Both players must request switch to swap colors.</p>
            <p>
              Your choice:{' '}
              {mySwapDecision === null ? 'Pending' : mySwapDecision ? 'Switch' : 'Keep'}
            </p>
            <p>
              Opponent:{' '}
              {opponentSwapDecision === null
                ? 'Pending'
                : opponentSwapDecision
                  ? 'Wants switch'
                  : 'Wants keep'}
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => handleSwapDecision(false)}>
                Keep Colors
              </button>
              <button type="button" onClick={() => handleSwapDecision(true)}>
                Request Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {awaitingStart && !awaitingSwap && (
        <div className="overlay">
          <div className="modal">
            <h2>Start Game</h2>
            <p>Click Start Game to begin and start White's timer.</p>
            {myColor === 'w' ? (
              <div className="modal-actions">
                <button type="button" onClick={handleStartGame}>
                  Start Game
                </button>
              </div>
            ) : (
              <p>Waiting for White to start...</p>
            )}
          </div>
        </div>
      )}

      {isGameOver && !awaitingSwap && (
        <div className="overlay">
          <div className="modal">
            <h2>Game Over</h2>
            <p>{status}</p>
            <p>
              {myPlayAgainDecision
                ? 'Waiting for opponent to accept rematch...'
                : 'Press Play Again to start a rematch.'}
            </p>
            <p>Opponent ready: {opponentPlayAgainDecision ? 'Yes' : 'No'}</p>
            <div className="modal-actions">
              <button type="button" onClick={handlePlayAgain} disabled={myPlayAgainDecision}>
                {myPlayAgainDecision ? 'Play Again Sent' : 'Play Again'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
