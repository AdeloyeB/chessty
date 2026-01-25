/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Pure black and white only - blueprint aesthetic
        'black': '#000000',
        'white': '#ffffff',

        // Legacy color aliases (for backwards compatibility during migration)
        'pure-black': '#000000',
        'off-black': '#000000',  // Now pure black
        'dark': '#000000',
        'mid-dark': '#000000',
        'mid': 'rgba(255, 255, 255, 0.3)',
        'mid-light': 'rgba(255, 255, 255, 0.5)',
        'light': 'rgba(255, 255, 255, 0.7)',
        'off-white': 'rgba(255, 255, 255, 0.9)',
        'pure-white': '#ffffff',

        // USDC brand colors
        'usdc': {
          DEFAULT: '#2775CA',
          light: '#4A90E2',
          dark: '#1A5FA8',
        },
      },
      fontFamily: {
        sans: ['"JetBrains Mono"', 'monospace'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
