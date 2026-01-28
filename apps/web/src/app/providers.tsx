'use client';

import type { ReactNode } from 'react';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { DevDebugPanel } from '@/components/dev/DevDebugPanel';
import { DesktopLayout } from '@/components/desktop/DesktopLayout';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WalletProvider>
      <DesktopLayout />
      {children}
      <ToastContainer />
      <DevDebugPanel />
    </WalletProvider>
  );
}
