/**
 * debouncedInvoke — Debouncing utility for Tauri IPC calls
 * =========================================================
 *
 * When users interact with sliders or rapidly changing inputs (like the
 * overlay opacity slider), we don't want to send an IPC call on every
 * pixel of movement. That would:
 *   - Flood the Rust backend with requests
 *   - Cause excessive disk I/O (settings are persisted)
 *   - Add unnecessary latency to the UI
 *
 * This utility creates debounced invoke functions that:
 *   1. Accept the same arguments as a normal invoke
 *   2. Wait for a quiet period (default 300ms) before actually calling
 *   3. Cancel pending calls if new ones come in
 *
 * USAGE:
 *   // Create a debounced version of a command
 *   const debouncedSetOpacity = createDebouncedInvoke<{ opacity: number }>(
 *     'set_overlay_opacity',
 *     300 // optional delay in ms
 *   );
 *
 *   // Call it like normal invoke - only the last call in 300ms actually fires
 *   debouncedSetOpacity({ opacity: 0.5 });
 *   debouncedSetOpacity({ opacity: 0.6 }); // cancels previous
 *   debouncedSetOpacity({ opacity: 0.7 }); // this one actually fires after 300ms
 *
 * IMMEDIATE vs DEBOUNCED:
 * For responsive UI, update local React state immediately, then use debounced
 * invoke for the backend sync:
 *
 *   const handleOpacityChange = (value: number) => {
 *     setLocalOpacity(value);              // Instant UI update
 *     debouncedSetOpacity({ opacity: value }); // Debounced backend sync
 *   };
 */

// Type for the invoke function from Tauri
type InvokeFunction = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// Cache for the invoke function (loaded once, reused)
let cachedInvoke: InvokeFunction | null = null;

/**
 * Get the Tauri invoke function, caching it for reuse.
 * Returns null if not in a Tauri context.
 */
async function getInvoke(): Promise<InvokeFunction | null> {
  if (cachedInvoke) return cachedInvoke;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedInvoke = invoke;
    return invoke;
  } catch {
    // Not in Tauri context (dev browser)
    return null;
  }
}

/**
 * Creates a debounced version of a Tauri invoke call.
 *
 * @param command - The Tauri command name to invoke
 * @param delay - Debounce delay in milliseconds (default: 300)
 * @returns A function that accepts the command arguments and debounces the call
 *
 * @example
 * const debouncedSave = createDebouncedInvoke<{ value: string }>('save_setting', 500);
 * debouncedSave({ value: 'hello' }); // Will call after 500ms of no new calls
 */
export function createDebouncedInvoke<T extends Record<string, unknown>>(
  command: string,
  delay = 300
): (args: T) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (args: T) => {
    // Clear any pending call
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Schedule new call after delay
    timeoutId = setTimeout(async () => {
      timeoutId = null;

      const invoke = await getInvoke();
      if (!invoke) {
        console.debug(`[DebouncedInvoke] Not in Tauri context, skipping: ${command}`);
        return;
      }

      try {
        await invoke(command, args);
        console.debug(`[DebouncedInvoke] Called: ${command}`, args);
      } catch (error) {
        console.error(`[DebouncedInvoke] Failed: ${command}`, error);
      }
    }, delay);
  };
}

/**
 * Creates a debounced invoke with a flush capability.
 *
 * This is useful when you need to ensure pending changes are saved
 * before navigating away or closing a component.
 *
 * @param command - The Tauri command name to invoke
 * @param delay - Debounce delay in milliseconds (default: 300)
 * @returns Object with `call` function and `flush` function
 *
 * @example
 * const debouncedSave = createDebouncedInvokeWithFlush<{ value: string }>('save_setting');
 *
 * // During interaction
 * debouncedSave.call({ value: 'hello' });
 *
 * // On component unmount or navigation
 * await debouncedSave.flush();
 */
export function createDebouncedInvokeWithFlush<T extends Record<string, unknown>>(
  command: string,
  delay = 300
): {
  call: (args: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: T | null = null;
  let flushPromise: Promise<void> | null = null;

  const executeCall = async () => {
    if (pendingArgs === null) return;

    const args = pendingArgs;
    pendingArgs = null;

    const invoke = await getInvoke();
    if (!invoke) {
      console.debug(`[DebouncedInvoke] Not in Tauri context, skipping: ${command}`);
      return;
    }

    try {
      await invoke(command, args);
      console.debug(`[DebouncedInvoke] Called: ${command}`, args);
    } catch (error) {
      console.error(`[DebouncedInvoke] Failed: ${command}`, error);
    }
  };

  return {
    call: (args: T) => {
      pendingArgs = args;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        executeCall();
      }, delay);
    },

    flush: async () => {
      // If there's a pending timeout, clear it and execute immediately
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // If there are pending args and no flush in progress, execute
      if (pendingArgs !== null && flushPromise === null) {
        flushPromise = executeCall();
        await flushPromise;
        flushPromise = null;
      } else if (flushPromise !== null) {
        // Wait for existing flush to complete
        await flushPromise;
      }
    },

    cancel: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pendingArgs = null;
    },
  };
}

export default createDebouncedInvoke;
