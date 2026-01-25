/**
 * Notification Store
 *
 * Manages toast notifications for achievements and other alerts.
 * Uses Zustand for state management with automatic cleanup.
 */

import { create } from 'zustand';
import type { AchievementCategory } from '@chess-game/shared';

// ========================================
// TYPES
// ========================================

export type NotificationType = 'achievement' | 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  icon?: string;
  duration?: number; // ms, default 5000
  createdAt: Date;
}

export interface AchievementNotification extends Notification {
  type: 'achievement';
  achievementId: string;
  category: AchievementCategory;
}

interface NotificationState {
  notifications: Notification[];

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => string;
  addAchievementNotification: (achievement: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AchievementCategory;
  }) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

// ========================================
// STORE
// ========================================

/**
 * Generate unique notification ID
 */
function generateId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Notification store with auto-cleanup
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = generateId();
    const fullNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date(),
      duration: notification.duration ?? 5000,
    };

    set((state) => ({
      notifications: [...state.notifications, fullNotification],
    }));

    // Auto-remove after duration
    if (fullNotification.duration && fullNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, fullNotification.duration);
    }

    return id;
  },

  addAchievementNotification: (achievement) => {
    const id = generateId();
    const notification: AchievementNotification = {
      id,
      type: 'achievement',
      title: achievement.name,
      message: achievement.description,
      icon: achievement.icon,
      achievementId: achievement.id,
      category: achievement.category,
      duration: 6000, // Slightly longer for achievements
      createdAt: new Date(),
    };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-remove after duration
    setTimeout(() => {
      get().removeNotification(id);
    }, notification.duration);

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));

// ========================================
// HELPER HOOKS
// ========================================

/**
 * Hook to show notifications easily
 */
export function useNotifications() {
  const { addNotification, addAchievementNotification, removeNotification, clearAll } = useNotificationStore();

  return {
    showSuccess: (title: string, message?: string) =>
      addNotification({ type: 'success', title, message }),

    showError: (title: string, message?: string) =>
      addNotification({ type: 'error', title, message, duration: 8000 }),

    showInfo: (title: string, message?: string) =>
      addNotification({ type: 'info', title, message }),

    showAchievement: addAchievementNotification,

    dismiss: removeNotification,
    clearAll,
  };
}
