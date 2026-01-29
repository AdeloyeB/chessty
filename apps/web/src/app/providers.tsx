'use client';

import type { ReactNode } from 'react';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { DevDebugPanel } from '@/components/dev/DevDebugPanel';
import { DesktopLayout } from '@/components/desktop/DesktopLayout';
import { DeepLinkHandler } from '@/components/desktop/DeepLinkHandler';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WalletProvider>
      <DesktopLayout />
      <DeepLinkHandler />
      {children}
      <ToastContainer />
      <DevDebugPanel />
    </WalletProvider>
  );
}
