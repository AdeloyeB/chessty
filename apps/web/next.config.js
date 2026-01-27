/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chess-game/shared'],
  // 'export' for Tauri desktop builds (static HTML/JS/CSS, no server needed)
  // 'standalone' for web deployment (Node.js server with SSR)
  output: process.env.TAURI_ENV_PLATFORM ? 'export' : 'standalone',
  experimental: {
    // Help pnpm resolve symlinked packages
    externalDir: true,
  },
};

module.exports = nextConfig;
