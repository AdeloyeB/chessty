'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { ProfilePage } from '@/components/profile/ProfilePage';

export default function Profile() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

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

  if (!user) {
    return null;
  }

  return <ProfilePage />;
}
