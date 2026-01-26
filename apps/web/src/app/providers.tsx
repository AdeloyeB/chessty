'use client';

import { WalletProvider } from '@/components/wallet/WalletProvider';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { DevDebugPanel } from '@/components/dev/DevDebugPanel';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {children}
      <ToastContainer />
      <DevDebugPanel />
    </WalletProvider>
  );
}
