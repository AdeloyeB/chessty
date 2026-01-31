'use client';

import { useAuthStore } from '@/store/auth';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { HomeDashboard } from '@/components/dashboard/HomeDashboard';

export default function Home() {
  const { user, isLoading } = useAuthStore();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center">
        <div className="text-center">
          <span className="text-5xl mb-4 block">♔</span>
          <span className="text-pure-white font-mono animate-blink">_</span>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  // Show home dashboard if authenticated
  return <HomeDashboard />;
}
