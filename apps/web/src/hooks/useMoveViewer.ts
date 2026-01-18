'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Move } from '@chess-game/shared';
import { STARTING_FEN } from '@chess-game/shared';

interface UseMoveViewerOptions {
  moves: Move[];
  startingFen?: string;
  autoPlaySpeed?: number; // moves per second
}

interface UseMoveViewerReturn {
  currentMoveIndex: number;
  currentFen: string;
  isPlaying: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  totalMoves: number;

  // Navigation
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  goBack: () => void;
  goForward: () => void;

  // Playback
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  playbackSpeed: number;

  // Current move info
  currentMove: Move | null;
  moveNumber: number; // 1-indexed chess move number (1. e4 e5 2. Nf3 ...)
  isWhiteMove: boolean;
}

export function useMoveViewer({
  moves,
  startingFen = STARTING_FEN,
  autoPlaySpeed = 1,
}: UseMoveViewerOptions): UseMoveViewerReturn {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(autoPlaySpeed);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalMoves = moves.length;
  const canGoBack = currentMoveIndex >= 0;
  const canGoForward = currentMoveIndex < totalMoves - 1;

  // Get current FEN position
  const currentFen = currentMoveIndex === -1
    ? startingFen
    : moves[currentMoveIndex]?.fen || startingFen;

  // Get current move
  const currentMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;

  // Chess move number (1-indexed, accounting for pairs of moves)
  const moveNumber = currentMoveIndex >= 0 ? Math.floor(currentMoveIndex / 2) + 1 : 0;
  const isWhiteMove = currentMoveIndex >= 0 ? currentMoveIndex % 2 === 0 : true;

  // Navigation functions
  const goToMove = useCallback((index: number) => {
    const clampedIndex = Math.max(-1, Math.min(totalMoves - 1, index));
    setCurrentMoveIndex(clampedIndex);
    // Stop playback if manually navigating
    setIsPlaying(false);
  }, [totalMoves]);

  const goToStart = useCallback(() => {
    goToMove(-1);
  }, [goToMove]);

  const goToEnd = useCallback(() => {
    goToMove(totalMoves - 1);
  }, [goToMove, totalMoves]);

  const goBack = useCallback(() => {
    if (canGoBack) {
      goToMove(currentMoveIndex - 1);
    }
  }, [canGoBack, currentMoveIndex, goToMove]);

  const goForward = useCallback(() => {
    if (canGoForward) {
      goToMove(currentMoveIndex + 1);
    }
  }, [canGoForward, currentMoveIndex, goToMove]);

  // Playback functions
  const play = useCallback(() => {
    if (currentMoveIndex >= totalMoves - 1) {
      // Start from beginning if at end
      setCurrentMoveIndex(-1);
    }
    setIsPlaying(true);
  }, [currentMoveIndex, totalMoves]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Auto-advance during playback
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentMoveIndex(prev => {
          const next = prev + 1;
          if (next >= totalMoves) {
            setIsPlaying(false);
            return totalMoves - 1;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, totalMoves]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goForward();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
        case ' ':
          e.preventDefault();
          togglePlayback();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, goForward, goToStart, goToEnd, togglePlayback]);

  // Reset when moves change
  useEffect(() => {
    setCurrentMoveIndex(-1);
    setIsPlaying(false);
  }, [moves]);

  return {
    currentMoveIndex,
    currentFen,
    isPlaying,
    canGoBack,
    canGoForward,
    totalMoves,

    goToMove,
    goToStart,
    goToEnd,
    goBack,
    goForward,

    play,
    pause,
    togglePlayback,
    setPlaybackSpeed,
    playbackSpeed,

    currentMove,
    moveNumber,
    isWhiteMove,
  };
}
