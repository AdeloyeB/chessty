/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chess-game/shared'],
  output: 'standalone',
  experimental: {
    // Help pnpm resolve symlinked packages
    externalDir: true,
  },
};

module.exports = nextConfig;
