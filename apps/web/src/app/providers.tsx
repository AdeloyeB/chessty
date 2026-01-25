'use client';

import { WalletProvider } from '@/components/wallet/WalletProvider';
import { ToastContainer } from '@/components/ui/ToastContainer';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {children}
      <ToastContainer />
    </WalletProvider>
  );
}
