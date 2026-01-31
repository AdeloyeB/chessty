/**
 * Overlay Components
 * ==================
 *
 * Components for the compact, always-on-top chess overlay window.
 * This overlay allows users to play chess while multitasking.
 *
 * Main component:
 *   - OverlayBoard: Root container that orchestrates all overlay UI
 *
 * Sub-components:
 *   - OverlayChessboard: Compact interactive chessboard
 *   - OverlayClock: Time display with urgency color coding
 *   - OverlayStats: Expandable game statistics panel
 *   - OverlaySettings: Settings dropdown for customization
 *   - OverlayDragHandle: Drag region for repositioning window
 */

export { OverlayBoard } from './OverlayBoard';
export { OverlayChessboard } from './OverlayChessboard';
export { OverlayClock } from './OverlayClock';
export { OverlayStats } from './OverlayStats';
export { OverlaySettings } from './OverlaySettings';
export { OverlayDragHandle } from './OverlayDragHandle';
