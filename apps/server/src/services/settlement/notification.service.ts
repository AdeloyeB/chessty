/**
 * Settlement Notification Service
 * ================================
 *
 * Handles sending notifications to players about their game settlements.
 * These notifications keep players informed about:
 * - Winning payouts
 * - Games under review (funds held)
 * - Resolution of disputes (cleared or found guilty)
 *
 * CURRENT IMPLEMENTATION:
 * Notifications are currently logged to console. In production, these would
 * integrate with:
 * - In-app notification system (WebSocket push)
 * - Email notifications for important events
 * - Push notifications for mobile
 *
 * FUTURE: Add integration with notification infrastructure when it's built.
 */

import type { SettlementNotification } from './types';

// ---------------------------------------------------------------------------
// In-Memory Notification Queue (Temporary)
// ---------------------------------------------------------------------------
// For now, notifications are just logged. This queue allows us to track
// what notifications have been sent for testing purposes.

interface QueuedNotification extends SettlementNotification {
  id: string;
  createdAt: Date;
  sent: boolean;
}

const notificationQueue: QueuedNotification[] = [];
let notificationIdCounter = 0;

// ---------------------------------------------------------------------------
// Notification Functions
// ---------------------------------------------------------------------------

/**
 * Notify a player that they won and received their payout.
 *
 * This is the happy path - game was clean, funds transferred immediately.
 *
 * @param userId - The winner's user ID
 * @param amount - Amount they received
 * @param gameId - The game they won
 */
export async function notifyWinner(
  userId: string,
  amount: number,
  gameId: string
): Promise<void> {
  const notification: SettlementNotification = {
    userId,
    type: 'winner',
    gameId,
    amount,
    message: `You won $${amount.toFixed(2)} from your chess match!`,
  };

  await sendNotification(notification);

  console.log(
    `[Settlement:Notify] Winner notification sent to ${userId} ` +
    `(game: ${gameId}, amount: $${amount.toFixed(2)})`
  );
}

/**
 * Notify players that their game is under review.
 *
 * Both players are notified so they know why funds are being held.
 * The notification is intentionally vague about who is suspected.
 *
 * @param playerIds - Both players' user IDs
 * @param gameId - The game under review
 */
export async function notifyUnderReview(
  playerIds: string[],
  gameId: string
): Promise<void> {
  const promises = playerIds.map(async (userId) => {
    const notification: SettlementNotification = {
      userId,
      type: 'under_review',
      gameId,
      message:
        'Your recent game is being reviewed by our fair play team. ' +
        'Funds will be released within 48 hours.',
    };

    await sendNotification(notification);
  });

  await Promise.all(promises);

  console.log(
    `[Settlement:Notify] Under review notification sent to ${playerIds.length} players ` +
    `(game: ${gameId})`
  );
}

/**
 * Notify a player about the resolution of a dispute.
 *
 * Different messages depending on the outcome:
 * - 'cleared': You're not suspected, normal payout
 * - 'guilty': You were found guilty of cheating
 * - 'compensated': You were the victim, received compensation
 *
 * @param userId - The player to notify
 * @param result - The outcome for this player
 * @param gameId - The game that was disputed
 * @param amount - Amount involved (if applicable)
 */
export async function notifyResolution(
  userId: string,
  result: 'cleared' | 'guilty' | 'victim_compensated',
  gameId: string,
  amount?: number
): Promise<void> {
  let message: string;
  let type: SettlementNotification['type'];

  switch (result) {
    case 'cleared':
      type = 'cleared';
      message =
        'Your game has been reviewed and cleared. ' +
        (amount ? `$${amount.toFixed(2)} has been credited to your account.` : 'Thank you for your patience.');
      break;

    case 'guilty':
      type = 'guilty';
      message =
        'After review, your account has been flagged for fair play violations. ' +
        'Funds from this game have been forfeited. ' +
        'If you believe this is an error, you may appeal this decision.';
      break;

    case 'victim_compensated':
      type = 'compensated';
      message =
        'Your opponent was found to have violated fair play rules. ' +
        (amount ? `You have been awarded $${amount.toFixed(2)} as compensation.` : 'You have been compensated.');
      break;
  }

  const notification: SettlementNotification = {
    userId,
    type,
    gameId,
    amount,
    message,
  };

  await sendNotification(notification);

  console.log(
    `[Settlement:Notify] Resolution notification sent to ${userId} ` +
    `(game: ${gameId}, result: ${result})`
  );
}

/**
 * Notify a player about timeout resolution.
 *
 * When a dispute times out after 48 hours, the original winner
 * receives their funds and gets this notification.
 *
 * @param userId - The original winner's user ID
 * @param amount - Amount released
 * @param gameId - The game
 */
export async function notifyTimeoutRelease(
  userId: string,
  amount: number,
  gameId: string
): Promise<void> {
  const notification: SettlementNotification = {
    userId,
    type: 'cleared',
    gameId,
    amount,
    message:
      'Your game review has concluded and funds have been released. ' +
      `$${amount.toFixed(2)} has been credited to your account.`,
  };

  await sendNotification(notification);

  console.log(
    `[Settlement:Notify] Timeout release notification sent to ${userId} ` +
    `(game: ${gameId}, amount: $${amount.toFixed(2)})`
  );
}

// ---------------------------------------------------------------------------
// Core Send Function
// ---------------------------------------------------------------------------

/**
 * Send a notification to a user.
 *
 * Currently logs to console and queues for testing.
 * TODO: Integrate with real notification infrastructure:
 * - WebSocket push for in-app notifications
 * - Email for important events
 * - Push notifications for mobile
 */
async function sendNotification(notification: SettlementNotification): Promise<void> {
  // Queue the notification
  const queued: QueuedNotification = {
    ...notification,
    id: `notif_${++notificationIdCounter}`,
    createdAt: new Date(),
    sent: false,
  };
  notificationQueue.push(queued);

  // TODO: Replace with real notification sending
  // Examples of what this would become:
  //
  // 1. WebSocket push (real-time in-app):
  //    await broadcastService.sendToUser(userId, {
  //      type: 'settlement:notification',
  //      payload: notification,
  //    });
  //
  // 2. Email notification:
  //    await emailService.send({
  //      to: await getUserEmail(userId),
  //      template: 'settlement-notification',
  //      data: notification,
  //    });
  //
  // 3. Database persistence (for notification center):
  //    await db.insert(userNotifications).values({
  //      userId: notification.userId,
  //      type: notification.type,
  //      data: notification,
  //    });

  // Mark as sent (simulated)
  queued.sent = true;
}

// ---------------------------------------------------------------------------
// Testing Utilities
// ---------------------------------------------------------------------------

/**
 * Get all queued notifications (for testing).
 */
export function getNotificationQueue(): QueuedNotification[] {
  return [...notificationQueue];
}

/**
 * Get notifications for a specific user (for testing).
 */
export function getUserNotifications(userId: string): QueuedNotification[] {
  return notificationQueue.filter((n) => n.userId === userId);
}

/**
 * Clear the notification queue (for testing).
 */
export function clearNotificationQueue(): void {
  notificationQueue.length = 0;
}
