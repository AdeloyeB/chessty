'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * A small info icon that reveals a tooltip explaining wallet connection.
 * Designed to sit inline next to text (like "or connect wallet").
 */
export function WalletHelpTooltip() {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show tooltip on hover with slight delay
  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="What is a wallet?"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`
          w-3.5 h-3.5
          rounded-full
          border border-white/30
          text-white/30
          transition-all duration-150
          flex items-center justify-center
          text-[8px] font-mono
          hover:border-white/50 hover:text-white/50
          ${isOpen ? 'border-white/50 text-white/50' : ''}
        `}
      >
        i
      </button>

      {/* Tooltip - positioned to the right */}
      {isOpen && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="
            absolute z-50
            left-full ml-2 top-1/2 -translate-y-1/2
            w-64
            bg-black border border-white/20
            animate-fadeIn
          "
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-[10px] font-mono text-white/60 uppercase tracking-widest">
              what's a wallet?
            </p>
          </div>

          {/* Content */}
          <div className="px-3 py-3 space-y-2">
            <p className="text-xs font-mono text-white/70 leading-relaxed">
              A crypto wallet is like a digital bank account. It lets you store funds and sign in securely without passwords.
            </p>
            <p className="text-[10px] font-mono text-white/40 leading-relaxed">
              Popular options include Phantom, MetaMask, Coinbase Wallet, Rainbow, and Trust Wallet.
            </p>
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-white/10">
            <p className="text-[10px] font-mono text-white/30">
              Don't have one? Download Phantom or Coinbase Wallet to get started.
            </p>
          </div>

          {/* Arrow pointing left */}
          <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-2 h-2 bg-black border-l border-b border-white/20 rotate-45" />
        </div>
      )}
    </div>
  );
}
