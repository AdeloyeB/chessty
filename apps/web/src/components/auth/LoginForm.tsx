'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';

export function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useApi();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
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
    <div className="max-w-md mx-auto mt-20">
      <div className="card">
        <div className="text-center mb-8">
          <span className="text-5xl">♔</span>
          <p className="text-mid-light mt-4 font-mono text-sm">
            play • stake • win
          </p>
        </div>

        <div className="flex mb-6 border-b border-mid/30">
          <button
            className={isLogin ? 'tab-active flex-1' : 'tab-inactive flex-1'}
            onClick={() => setIsLogin(true)}
          >
            login
          </button>
          <button
            className={!isLogin ? 'tab-active flex-1' : 'tab-inactive flex-1'}
            onClick={() => setIsLogin(false)}
          >
            register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-mid-light mb-2">
              email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-mono text-mid-light mb-2">
                username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="your_name"
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-mid-light mb-2">
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="p-3 bg-pure-black border border-mid text-light text-sm font-mono">
              error: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2 font-mono">
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

        <div className="mt-6 pt-4 border-t border-mid/30 text-center">
          <p className="text-mid-light text-xs font-mono">
            new players get <span className="text-pure-white">1,000 pts</span> to start
          </p>
        </div>
      </div>
    </div>
  );
}
