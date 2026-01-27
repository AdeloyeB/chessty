'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { useAuthStore } from '@/store/auth';
import { OAuthButton } from './OAuthButton';
import { OAuthDivider } from './OAuthDivider';
import { WalletButton } from './WalletButton';
import { WalletHelpTooltip } from './WalletHelpTooltip';

// Animated chess piece that floats across the screen
function FloatingPiece({ piece, delay, duration, startX, startY }: {
  piece: string;
  delay: number;
  duration: number;
  startX: number;
  startY: number;
}) {
  return (
    <div
      className="absolute text-4xl opacity-10 animate-float pointer-events-none"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      {piece}
    </div>
  );
}

// Vector field inspired animated background
function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }> = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const initParticles = () => {
      particles = [];
      const numParticles = 80;
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * canvas.offsetWidth,
          y: Math.random() * canvas.offsetHeight,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.1,
        });
      }
    };

    const drawGrid = () => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;

      const gridSize = 60;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Vertical lines
      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    };

    const drawChessPattern = (time: number) => {
      const size = 80;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const cols = Math.ceil(width / size) + 1;
      const rows = Math.ceil(height / size) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const isBlack = (i + j) % 2 === 0;
          const wave = Math.sin(time * 0.001 + i * 0.3 + j * 0.3) * 0.02;
          const opacity = isBlack ? 0.03 + wave : 0;

          if (opacity > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(i * size, j * size, size, size);
          }
        }
      }
    };

    const animate = (time: number) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // Draw animated chess pattern
      drawChessPattern(time);

      // Draw grid
      drawGrid();

      // Draw and update particles
      particles.forEach((p, i) => {
        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = canvas.offsetWidth;
        if (p.x > canvas.offsetWidth) p.x = 0;
        if (p.y < 0) p.y = canvas.offsetHeight;
        if (p.y > canvas.offsetHeight) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fill();

        // Draw connections
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      // Draw animated geometric shapes
      const centerX = canvas.offsetWidth / 2;
      const centerY = canvas.offsetHeight / 2;

      // Rotating square
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(time * 0.0005);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-100, -100, 200, 200);
      ctx.restore();

      // Pulsing circle
      const pulseScale = 1 + Math.sin(time * 0.002) * 0.1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 150 * pulseScale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Chess king silhouette
      ctx.font = `${120 + Math.sin(time * 0.001) * 10}px serif`;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.sin(time * 0.001) * 0.02})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♔', centerX, centerY);

      animationId = requestAnimationFrame(animate);
    };

    resize();
    initParticles();
    animate(0);

    window.addEventListener('resize', () => {
      resize();
      initParticles();
    });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: '#000000' }}
    />
  );
}

// Mock user for development
const DEV_USER = {
  id: 'dev-user-1',
  username: 'dev_player',
  displayName: 'DevPlayer',
  email: 'dev@example.com',
  eloRating: 1200,
  peakEloRating: 1350,
  gamesPlayed: 47,
  gamesWon: 28,
  gamesLost: 15,
  gamesDraw: 4,
  balance: 0, // Users must deposit USDC via wallet
};

export function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const { login, register } = useApi();
  const { setUser, setToken, setMfaRequired } = useAuthStore();

  // Dev login for testing without backend
  const handleDevLogin = () => {
    setUser(DEV_USER);
    setToken('dev-token');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const result = await login(email, password);

        // Check if MFA verification is required
        if ('requiresMfa' in result && result.requiresMfa) {
          // MFA is required - redirect to MFA verification page
          // The tempToken is already stored in the auth store by the login function
          router.push(`/auth/verify-mfa?temp_token=${encodeURIComponent(result.tempToken)}`);
          return;
        }

        // Normal login success - no MFA required
        // User and token are already set by the login function
      } else {
        await register(email, username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-black">
      {/* Left Sidebar - Login Form */}
      <div className="w-full lg:w-[420px] bg-black border-r border-white/15 flex flex-col justify-center p-8 lg:p-12 relative z-10">
        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-5xl text-white/80">♔</span>
            </div>
            <p className="text-white/50 font-mono text-sm mt-4 lowercase">
              play • predict • win
            </p>
          </div>

          {/* OAuth Buttons */}
          <div className="flex justify-center gap-3 mb-4">
            <OAuthButton provider="google" />
            <OAuthButton provider="twitter" />
          </div>

          {/* Wallet Connection Section */}
          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest px-2 flex items-center gap-1.5">
                or connect wallet
                <WalletHelpTooltip />
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="flex justify-center gap-3">
              <WalletButton provider="phantom" />
              <WalletButton provider="walletconnect" />
              <WalletButton provider="coinbase" />
            </div>
          </div>

          <OAuthDivider />

          {/* Tab Navigation */}
          <div className="flex mb-8 border-b border-white/15">
            <button
              className={`flex-1 pb-2 text-sm transition-all duration-150 lowercase tracking-wide ${
                isLogin ? 'text-white border-b border-white' : 'text-white/30 hover:text-white/60 border-b border-transparent'
              }`}
              onClick={() => setIsLogin(true)}
            >
              login
            </button>
            <button
              className={`flex-1 pb-2 text-sm transition-all duration-150 lowercase tracking-wide ${
                !isLogin ? 'text-white border-b border-white' : 'text-white/30 hover:text-white/60 border-b border-transparent'
              }`}
              onClick={() => setIsLogin(false)}
            >
              register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-white/50 mb-2 lowercase">
                email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-black border border-white/15 text-white placeholder-white/30 lowercase tracking-wide focus:outline-none focus:border-white transition-colors duration-150 font-mono"
                placeholder="you@example.com"
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-mono text-white/50 mb-2 lowercase">
                  username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 bg-black border border-white/15 text-white placeholder-white/30 lowercase tracking-wide focus:outline-none focus:border-white transition-colors duration-150 font-mono"
                  placeholder="your_name"
                  required
                  minLength={3}
                  maxLength={20}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-white/50 mb-2 lowercase">
                password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-black border border-white/15 text-white placeholder-white/30 lowercase tracking-wide focus:outline-none focus:border-white transition-colors duration-150 font-mono"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="p-3 bg-black border border-white/30 text-white/70 text-sm font-mono lowercase">
                error: {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-5 py-2.5 text-sm font-mono bg-white text-black border border-white hover:bg-white/90 transition-all duration-150 lowercase tracking-wide disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-blink">_</span>
                  {isLogin ? 'logging_in...' : 'creating...'}
                </span>
              ) : isLogin ? (
                'login'
              ) : (
                'create_account'
              )}
            </button>
          </form>

          {/* Dev Login */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-white/15">
              <button
                type="button"
                onClick={handleDevLogin}
                className="w-full px-5 py-2.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all duration-150 lowercase"
              >
                dev_login (skip auth)
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-white/15">
            <p className="text-white/30 text-xs font-mono text-center lowercase">
              predict • play chess • win rewards
            </p>
          </div>

          {/* Stats Preview - Bento grid style */}
          <div className="mt-8 border border-white/15">
            <div className="grid grid-cols-3">
              <div className="text-center p-4 border-r border-white/15">
                <p className="text-2xl font-mono text-white">2.4k</p>
                <p className="text-xs font-mono text-white/30 lowercase">players</p>
              </div>
              <div className="text-center p-4 border-r border-white/15">
                <p className="text-2xl font-mono text-white">847</p>
                <p className="text-xs font-mono text-white/30 lowercase">live</p>
              </div>
              <div className="text-center p-4">
                <p className="text-2xl font-mono text-white">12.5k</p>
                <p className="text-xs font-mono text-white/30 lowercase">games</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Animated Background */}
      <div className="hidden lg:block flex-1 relative overflow-hidden border-l border-white/15">
        <AnimatedBackground />

        {/* Floating chess pieces */}
        <FloatingPiece piece="♔" delay={0} duration={20} startX={20} startY={30} />
        <FloatingPiece piece="♕" delay={2} duration={25} startX={70} startY={20} />
        <FloatingPiece piece="♖" delay={4} duration={22} startX={40} startY={60} />
        <FloatingPiece piece="♗" delay={6} duration={28} startX={80} startY={70} />
        <FloatingPiece piece="♘" delay={8} duration={24} startX={30} startY={80} />
        <FloatingPiece piece="♙" delay={10} duration={26} startX={60} startY={40} />
        <FloatingPiece piece="♚" delay={1} duration={23} startX={15} startY={50} />
        <FloatingPiece piece="♛" delay={3} duration={27} startX={85} startY={35} />
        <FloatingPiece piece="♜" delay={5} duration={21} startX={50} startY={85} />
        <FloatingPiece piece="♝" delay={7} duration={29} startX={25} startY={15} />

        {/* Decorative text */}
        <div className="absolute bottom-8 right-8 text-right">
          <p className="text-xs font-mono text-white/20 mb-1">v1.0.0</p>
          <p className="text-xs font-mono text-white/10 lowercase">play_chess_predict_win</p>
        </div>
      </div>
    </div>
  );
}
