'use client';

import type { ReactNode } from 'react';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { DevDebugPanel } from '@/components/dev/DevDebugPanel';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WalletProvider>
      {children}
      <ToastContainer />
      <DevDebugPanel />
    </WalletProvider>
  );
}
