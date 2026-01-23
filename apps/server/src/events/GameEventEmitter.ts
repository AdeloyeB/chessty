import type { GameEventMap, GameEventName } from './types';

export interface HandlerOptions {
  nonBlocking?: boolean;
  priority?: number;
  label?: string;
}

interface RegisteredHandler<K extends GameEventName> {
  handler: (payload: GameEventMap[K]) => void | Promise<void>;
  options: Required<HandlerOptions>;
}

/**
 * A typed event emitter for game events.
 *
 * Handlers are executed in priority order (lower numbers first).
 * Blocking handlers run sequentially and errors propagate.
 * Non-blocking handlers fire concurrently (fire-and-forget) with errors logged.
 */
export class GameEventEmitter {
  private handlers = new Map<GameEventName, RegisteredHandler<any>[]>();

  /**
   * Register an event handler.
   * @returns An unsubscribe function.
   */
  on<K extends GameEventName>(
    event: K,
    handler: (payload: GameEventMap[K]) => void | Promise<void>,
    options: HandlerOptions = {}
  ): () => void {
    const resolved: Required<HandlerOptions> = {
      nonBlocking: options.nonBlocking ?? false,
      priority: options.priority ?? 50,
      label: options.label ?? 'anonymous',
    };

    const entry: RegisteredHandler<K> = { handler, options: resolved };

    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    const list = this.handlers.get(event)!;
    list.push(entry);

    // Keep sorted by priority (lower first)
    list.sort((a, b) => a.options.priority - b.options.priority);

    return () => {
      const idx = list.indexOf(entry);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    };
  }

  /**
   * Emit an event.
   * Blocking handlers execute sequentially by priority; errors propagate.
   * Non-blocking handlers fire concurrently; errors are logged but swallowed.
   */
  async emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): Promise<void> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    const blocking: RegisteredHandler<K>[] = [];
    const nonBlocking: RegisteredHandler<K>[] = [];

    for (const entry of list) {
      if (entry.options.nonBlocking) {
        nonBlocking.push(entry);
      } else {
        blocking.push(entry);
      }
    }

    // Execute blocking handlers sequentially by priority
    for (const entry of blocking) {
      await entry.handler(payload);
    }

    // Fire non-blocking handlers concurrently (fire-and-forget)
    if (nonBlocking.length > 0) {
      for (const entry of nonBlocking) {
        Promise.resolve(entry.handler(payload)).catch((err) => {
          console.error(
            `[GameEventEmitter] Non-blocking handler "${entry.options.label}" for "${String(event)}" failed:`,
            err
          );
        });
      }
    }
  }

  /**
   * Remove all handlers (useful for testing).
   */
  removeAllHandlers(): void {
    this.handlers.clear();
  }
}

export const gameEvents = new GameEventEmitter();
