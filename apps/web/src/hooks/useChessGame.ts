'use client';

import { useState, useCallback, useMemo } from 'react';
import { Chess, type Square, type Move } from '@chess-game/shared/chess';
import { useGameStore } from '@/store/game';
import { useWebSocket } from './useWebSocket';

export function useChessGame() {
  const { currentFen, game, isMyTurn, playerColor } = useGameStore();
  const { makeMove } = useWebSocket();
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);

  const chess = useMemo(() => new Chess(currentFen), [currentFen]);

  const legalMoves = useMemo((): Move[] => {
    if (!selectedSquare) return [];
    return chess.moves({ square: selectedSquare, verbose: true }) as Move[];
  }, [chess, selectedSquare]);

  const isPromotion = useCallback(
    (from: Square, to: Square): boolean => {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'p') return false;

      const toRank = to[1];
      return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
    },
    [chess]
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (!isMyTurn || !game) return;

      // If we have a selected square, try to move
      if (selectedSquare) {
        const move = legalMoves.find((m) => m.to === square);

        if (move) {
          // Check for promotion
          if (isPromotion(selectedSquare, square)) {
            setPromotionMove({ from: selectedSquare, to: square });
          } else {
            makeMove(game.id, selectedSquare, square);
          }
        }

        setSelectedSquare(null);
        return;
      }

      // Select a piece if it's the player's piece
      const piece = chess.get(square);
      if (piece && piece.color === (playerColor === 'white' ? 'w' : 'b')) {
        setSelectedSquare(square);
      }
    },
    [chess, selectedSquare, legalMoves, isMyTurn, playerColor, game, isPromotion, makeMove]
  );

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (!isMyTurn || !game) return false;

      // Validate move
      const moves = chess.moves({ square: sourceSquare, verbose: true }) as Move[];
      const move = moves.find((m) => m.to === targetSquare);

      if (!move) return false;

      // Check for promotion
      if (isPromotion(sourceSquare, targetSquare)) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        return false; // Don't complete the move yet
      }

      makeMove(game.id, sourceSquare, targetSquare);
      setSelectedSquare(null);
      return true;
    },
    [chess, isMyTurn, game, isPromotion, makeMove]
  );

  const onPromotionSelect = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (!promotionMove || !game) return;

      makeMove(game.id, promotionMove.from, promotionMove.to, piece);
      setPromotionMove(null);
      setSelectedSquare(null);
    },
    [promotionMove, game, makeMove]
  );

  const cancelPromotion = useCallback(() => {
    setPromotionMove(null);
    setSelectedSquare(null);
  }, []);

  const getSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Highlight selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
      };
    }

    // Highlight legal moves
    legalMoves.forEach((move) => {
      styles[move.to] = {
        background:
          chess.get(move.to as Square)
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });

    // Highlight king in check
    if (chess.isCheck()) {
      const turn = chess.turn();
      const kingSquare = chess.board().flat().find((p) => p?.type === 'k' && p.color === turn)?.square;
      if (kingSquare) {
        styles[kingSquare] = {
          backgroundColor: 'rgba(255, 0, 0, 0.5)',
        };
      }
    }

    return styles;
  }, [selectedSquare, legalMoves, chess]);

  return {
    chess,
    selectedSquare,
    promotionMove,
    legalMoves,
    onSquareClick,
    onDrop,
    onPromotionSelect,
    cancelPromotion,
    getSquareStyles,
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    isGameOver: chess.isGameOver(),
  };
}
