'use client';

/**
 * ToastContainer
 *
 * Container component that renders all active toast notifications.
 * Positioned fixed at bottom-right of screen.
 *
 * ★ Insight ─────────────────────────────────────
 * The container subscribes to the notification store and renders
 * each notification as a toast. It handles:
 * - Stacking multiple toasts
 * - Animation coordination
 * - Different toast types (achievement, success, error, info)
 * ─────────────────────────────────────────────────
 */

import { useNotificationStore, type Notification, type AchievementNotification } from '@/store/notification';
import { AchievementToast } from './AchievementToast';

/**
 * Generic toast for non-achievement notifications
 */
function GenericToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const typeStyles = {
    success: 'border-green-400/50 text-green-400',
    error: 'border-red-400/50 text-red-400',
    info: 'border-blue-400/50 text-blue-400',
    achievement: 'border-yellow-400/50 text-yellow-400',
  };

  const icons = {
    success: '✓',
    error: '!',
    info: 'i',
    achievement: '★',
  };

  return (
    <div
      role="alert"
      onClick={() => onDismiss(notification.id)}
      className={`
        bg-off-black border ${typeStyles[notification.type]}
        p-4 cursor-pointer
        transition-all duration-200 ease-out
        hover:border-opacity-80
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 flex items-center justify-center border ${typeStyles[notification.type]} text-sm`}>
          {notification.icon || icons[notification.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-pure-white font-mono text-sm lowercase truncate">
            {notification.title}
          </p>
          {notification.message && (
            <p className="text-xs text-mid-light font-mono lowercase truncate">
              {notification.message}
            </p>
          )}
        </div>
        <div className="text-mid/50 text-xs font-mono">×</div>
      </div>
    </div>
  );
}

/**
 * Type guard for achievement notifications
 */
function isAchievementNotification(n: Notification): n is AchievementNotification {
  return n.type === 'achievement' && 'achievementId' in n;
}

/**
 * Main toast container - render at app root level
 */
export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none"
    >
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          {isAchievementNotification(notification) ? (
            <AchievementToast
              id={notification.id}
              title={notification.title}
              message={notification.message}
              icon={notification.icon}
              category={notification.category}
              onDismiss={removeNotification}
            />
          ) : (
            <GenericToast
              notification={notification}
              onDismiss={removeNotification}
            />
          )}
        </div>
      ))}
    </div>
  );
}
