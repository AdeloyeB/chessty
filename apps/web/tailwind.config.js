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
        // Pure black and white palette
        'pure-black': '#000000',
        'off-black': '#0a0a0a',
        'dark': '#111111',
        'mid-dark': '#1a1a1a',
        'mid': '#333333',
        'mid-light': '#666666',
        'light': '#999999',
        'off-white': '#e5e5e5',
        'pure-white': '#ffffff',

        // Accent (subtle)
        'accent': '#ffffff',

        // Status colors (grayscale)
        'success': '#ffffff',
        'warning': '#999999',
        'danger': '#666666',

        // USDC brand colors
        'usdc': {
          DEFAULT: '#0052FF',
          light: '#3377FF',
          dark: '#0041CC',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', 'Menlo', 'Monaco', 'monospace'],
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
