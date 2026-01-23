import { darkTheme, type Theme } from '@rainbow-me/rainbowkit'

/**
 * Custom RainbowKit theme matching Chessty's monospace dark aesthetic
 *
 * Color palette from tailwind.config.js:
 * - pure-black: #000000
 * - off-black: #0a0a0a
 * - mid: #666666
 * - mid-light: #888888
 * - light: #cccccc
 * - pure-white: #ffffff
 * - usdc: #2775CA
 */
export const chesstyTheme: Theme = {
  ...darkTheme({
    accentColor: '#ffffff', // Pure white for primary actions
    accentColorForeground: '#000000', // Black text on white buttons
    borderRadius: 'medium',
    fontStack: 'system',
    overlayBlur: 'small',
  }),
  colors: {
    ...darkTheme().colors,
    // Modal styling
    modalBackground: '#0a0a0a', // off-black
    modalBorder: '#333333', // darker than mid for subtle borders
    modalText: '#ffffff', // pure-white
    modalTextSecondary: '#888888', // mid-light

    // Profile/account section
    profileAction: '#1a1a1a',
    profileActionHover: '#333333',
    profileForeground: '#0a0a0a',

    // Close button
    closeButton: '#666666', // mid
    closeButtonBackground: 'transparent',

    // Connect button (when rendered standalone)
    connectButtonBackground: '#0a0a0a',
    connectButtonBackgroundError: '#1a1a1a',
    connectButtonInnerBackground: '#111111',
    connectButtonText: '#ffffff',
    connectButtonTextError: '#ff6b6b',

    // General colors
    generalBorder: '#333333',
    generalBorderDim: '#222222',
    actionButtonBorder: '#333333',
    actionButtonBorderMobile: '#333333',
    actionButtonSecondaryBackground: '#1a1a1a',

    // Menu
    menuItemBackground: '#1a1a1a',

    // Error states
    error: '#ff6b6b',

    // Download button
    downloadBottomCardBackground: 'linear-gradient(126deg, #0a0a0a 0%, #1a1a1a 100%)',
    downloadTopCardBackground: 'linear-gradient(126deg, #1a1a1a 0%, #0a0a0a 100%)',
  },
  fonts: {
    body: '"SF Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
  },
  radii: {
    actionButton: '8px',
    connectButton: '8px',
    menuButton: '8px',
    modal: '12px',
    modalMobile: '12px',
  },
  shadows: {
    connectButton: '0 4px 12px rgba(0, 0, 0, 0.4)',
    dialog: '0 8px 32px rgba(0, 0, 0, 0.6)',
    profileDetailsAction: '0 2px 6px rgba(0, 0, 0, 0.3)',
    selectedOption: '0 2px 6px rgba(0, 0, 0, 0.3)',
    selectedWallet: '0 2px 6px rgba(0, 0, 0, 0.3)',
    walletLogo: '0 2px 6px rgba(0, 0, 0, 0.3)',
  },
}
