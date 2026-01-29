'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSMessage, WSMessageType, GameMode } from '@chess-game/shared';
import { useAuthStore } from '@/store/auth';
import { useGameStore } from '@/store/game';
import { useSpectatorStore } from '@/store/spectator';
import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { useChallengeStore } from '@/store/challenge';
import { useSpectatorPredictionStore } from '@/store/spectatorPrediction';
import { useNotificationStore } from '@/store/notification';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const connectRef = useRef<() => void>(() => {});
  const [isConnected, setIsConnected] = useState(false);

  const { token } = useAuthStore();
  const gameStore = useGameStore();
  const spectatorStore = useSpectatorStore();
  const multiSpectatorStore = useMultiSpectatorStore();
  const challengeStore = useChallengeStore();
  const spectatorPredictionStore = useSpectatorPredictionStore();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        const { type, payload } = message;

        switch (type as WSMessageType) {
          // Game events
          case 'game:started': {
            const data = payload as any;
            gameStore.setGame(data.game);
            gameStore.setPlayers(data.whitePlayer, data.blackPlayer);
            gameStore.setStatus('playing');
            break;
          }

          case 'game:move_made': {
            const data = payload as any;
            gameStore.addMove(data.move);
            gameStore.updateClocks(data.whiteTimeRemaining, data.blackTimeRemaining);
            // Multi-game store: spectators receive move_made events too
            if (data.gameId && multiSpectatorStore.hasGame(data.gameId)) {
              multiSpectatorStore.updateGameState(
                data.gameId,
                data.move.fen,
                data.whiteTimeRemaining,
                data.blackTimeRemaining
              );
            }
            break;
          }

          case 'game:clock_update': {
            const data = payload as any;
            gameStore.updateClocks(data.whiteTimeRemaining, data.blackTimeRemaining);
            // Legacy single-game spectator store
            if (spectatorStore.isSpectating) {
              spectatorStore.updateGameState(
                spectatorStore.currentFen,
                data.whiteTimeRemaining,
                data.blackTimeRemaining
              );
            }
            // Multi-game store: route by gameId
            if (data.gameId && multiSpectatorStore.hasGame(data.gameId)) {
              const game = multiSpectatorStore.games[data.gameId];
              if (game) {
                multiSpectatorStore.updateGameState(
                  data.gameId,
                  game.currentFen,
                  data.whiteTimeRemaining,
                  data.blackTimeRemaining
                );
              }
            }
            break;
          }

          case 'game:ended': {
            const data = payload as any;
            gameStore.endGame(data.result, data.whiteEloChange);
            // Multi-game store: mark game as ended
            if (data.gameId && multiSpectatorStore.hasGame(data.gameId)) {
              multiSpectatorStore.setGameEnded(data.gameId);
            }
            break;
          }

          case 'game:draw_offered': {
            gameStore.setDrawOffered(true, false);
            break;
          }

          case 'game:draw_declined': {
            gameStore.setDrawOffered(false, false);
            break;
          }

          // Queue events
          case 'queue:joined': {
            gameStore.joinQueue();
            break;
          }

          case 'queue:left': {
            gameStore.leaveQueue();
            break;
          }

          case 'queue:match_found': {
            const data = payload as any;
            gameStore.setStatus('matched');
            gameStore.setPlayerColor(data.playerColor);
            break;
          }

          // Spectator events
          case 'spectate:game_state': {
            const data = payload as any;
            // Legacy single-game store
            spectatorStore.setPlayers(data.game.whitePlayer, data.game.blackPlayer);
            spectatorStore.updateGameState(
              data.game.currentFen,
              data.game.whiteTimeRemaining,
              data.game.blackTimeRemaining
            );
            // Multi-game store: route by gameId
            if (data.game.id) {
              multiSpectatorStore.setGamePlayers(data.game.id, data.game.whitePlayer, data.game.blackPlayer);
              multiSpectatorStore.updateGameState(
                data.game.id,
                data.game.currentFen,
                data.game.whiteTimeRemaining,
                data.game.blackTimeRemaining
              );
            }
            break;
          }

          case 'odds:updated': {
            const data = payload as any;
            // Legacy single-game store
            spectatorStore.updateOdds(data.whiteOdds, data.blackOdds);
            // Multi-game store: route by gameId
            if (data.gameId) {
              multiSpectatorStore.updateGameOdds(data.gameId, data.whiteOdds, data.blackOdds);
            }
            break;
          }

          // Challenge events
          case 'challenge:created': {
            const data = payload as any;
            challengeStore.challengeCreated(data.challenge);
            break;
          }

          case 'challenge:list_update': {
            const data = payload as any;
            challengeStore.setChallenges(data.challenges);
            break;
          }

          case 'challenge:accepted': {
            const data = payload as any;
            challengeStore.challengeAccepted(data.challenge);
            break;
          }

          case 'challenge:confirmed': {
            const data = payload as any;
            challengeStore.setUIState('starting');
            // Set up game
            gameStore.setGame(data.game);
            gameStore.setPlayers(data.whitePlayer, data.blackPlayer);
            const myId = useAuthStore.getState().user?.id;
            if (myId === data.whitePlayer.id) {
              gameStore.setPlayerColor('white');
            } else {
              gameStore.setPlayerColor('black');
            }
            gameStore.setStatus('playing');
            challengeStore.reset();
            break;
          }

          case 'challenge:declined':
          case 'challenge:cancelled': {
            challengeStore.challengeDeclined();
            break;
          }

          case 'challenge:expired': {
            challengeStore.challengeExpired();
            break;
          }

          // Spectator prediction events
          case 'spectator:prediction_created': {
            const data = payload as any;
            spectatorPredictionStore.addPrediction(data.prediction);
            break;
          }

          case 'spectator:prediction_matched': {
            const data = payload as any;
            spectatorPredictionStore.updatePrediction(data.prediction);
            break;
          }

          case 'spectator:predictions_list': {
            const data = payload as any;
            spectatorPredictionStore.setPredictions(data.predictions);
            break;
          }

          // Achievement notifications
          case 'achievement:unlocked': {
            const data = payload as any;
            // Show toast for each unlocked achievement
            if (data.achievements && Array.isArray(data.achievements)) {
              data.achievements.forEach((achievement: any) => {
                useNotificationStore.getState().addAchievementNotification({
                  id: achievement.id,
                  name: achievement.name,
                  description: achievement.description,
                  icon: achievement.icon,
                  category: achievement.category,
                });
              });
            }
            break;
          }

          // Keepalive
          case 'pong':
            break;

          // Errors
          case 'error': {
            const data = payload as any;
            console.error('WebSocket error:', data.code, data.message);
            // Update challenge store with error and reset to idle
            if (data.code?.startsWith('CHALLENGE_') || data.message?.toLowerCase().includes('challenge')) {
              challengeStore.setError(data.message || 'An error occurred');
              challengeStore.setUIState('idle');
            }
            break;
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    [gameStore, spectatorStore, multiSpectatorStore, challengeStore, spectatorPredictionStore]
  );

  const connect = useCallback(() => {
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Attempt reconnect via ref to avoid accessing connect before declaration
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectRef.current();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = handleMessage;

    wsRef.current = ws;
  }, [token, handleMessage]);

  // Keep the ref in sync so onclose can always call the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback(<T>(type: WSMessageType, payload: T) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: WSMessage<T> = {
        type,
        payload,
        timestamp: Date.now(),
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Game actions
  const joinGame = useCallback(
    (gameId: string) => send('game:join', { gameId }),
    [send]
  );

  const leaveGame = useCallback(
    () => send('game:leave', {}),
    [send]
  );

  const makeMove = useCallback(
    (gameId: string, from: string, to: string, promotion?: string) =>
      send('game:move', { gameId, from, to, promotion }),
    [send]
  );

  const resign = useCallback(
    () => send('game:resign', {}),
    [send]
  );

  const offerDraw = useCallback(
    () => send('game:offer_draw', {}),
    [send]
  );

  const acceptDraw = useCallback(
    () => send('game:accept_draw', {}),
    [send]
  );

  const declineDraw = useCallback(
    () => send('game:decline_draw', {}),
    [send]
  );

  // Queue actions
  const joinQueue = useCallback(
    (wagerAmount: number, timeControl: { initial: number; increment: number }) =>
      send('queue:join', { wagerAmount, timeControl }),
    [send]
  );

  const leaveQueueWs = useCallback(
    () => send('queue:leave', {}),
    [send]
  );

  // Spectator actions (legacy single-game)
  const spectateGame = useCallback(
    (gameId: string) => {
      spectatorStore.startSpectating(gameId);
      send('spectate:join', { gameId });
    },
    [send, spectatorStore]
  );

  const stopSpectating = useCallback(() => {
    send('spectate:leave', {});
    spectatorStore.stopSpectating();
  }, [send, spectatorStore]);

  // Multi-game spectator actions
  const spectateMultiGame = useCallback(
    (gameId: string) => {
      multiSpectatorStore.addGame(gameId);
      send('spectate:join', { gameId });
    },
    [send, multiSpectatorStore]
  );

  const stopSpectatingGame = useCallback(
    (gameId: string) => {
      send('spectate:leave', { gameId });
      multiSpectatorStore.removeGame(gameId);
    },
    [send, multiSpectatorStore]
  );

  const stopAllSpectating = useCallback(() => {
    send('spectate:leave_all', {});
    multiSpectatorStore.removeAllGames();
  }, [send, multiSpectatorStore]);

  // Challenge actions
  const createChallenge = useCallback(
    (params: {
      gameMode: GameMode;
      timeControlKey: string;
      wagerAmount: number;
      minElo?: number;
      maxElo?: number;
    }) => {
      challengeStore.setUIState('creating');
      send('challenge:create', params);
    },
    [send, challengeStore]
  );

  const cancelChallenge = useCallback(
    (challengeId: string) => send('challenge:cancel', { challengeId }),
    [send]
  );

  const acceptChallenge = useCallback(
    (challengeId: string) => send('challenge:accept', { challengeId }),
    [send]
  );

  const confirmChallenge = useCallback(
    (challengeId: string) => send('challenge:confirm', { challengeId }),
    [send]
  );

  const declineChallenge = useCallback(
    (challengeId: string) => send('challenge:decline', { challengeId }),
    [send]
  );

  // Spectator prediction actions
  const createSpectatorPrediction = useCallback(
    (gameId: string, predictedWinnerId: string, amount: number) =>
      send('spectator:prediction_create', { gameId, predictedWinnerId, amount }),
    [send]
  );

  const acceptSpectatorPrediction = useCallback(
    (predictionId: string) => send('spectator:prediction_accept', { predictionId }),
    [send]
  );

  // Auto-connect when token is available
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  // Ping keepalive
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      send('ping', {});
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, send]);

  return {
    isConnected,
    connect,
    disconnect,
    joinGame,
    leaveGame,
    makeMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    joinQueue,
    leaveQueue: leaveQueueWs,
    spectateGame,
    stopSpectating,
    // Multi-game spectator actions
    spectateMultiGame,
    stopSpectatingGame,
    stopAllSpectating,
    // Challenge actions
    createChallenge,
    cancelChallenge,
    acceptChallenge,
    confirmChallenge,
    declineChallenge,
    // Spectator prediction actions
    createSpectatorPrediction,
    acceptSpectatorPrediction,
  };
}
