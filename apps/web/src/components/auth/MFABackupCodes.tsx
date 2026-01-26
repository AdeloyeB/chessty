'use client';

import { useState, useCallback } from 'react';

interface MFABackupCodesProps {
  codes: string[];
  onComplete: () => void;
}

export function MFABackupCodes({ codes, onComplete }: MFABackupCodesProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Format code as XXXX-XXXX
  const formatCode = (code: string): string => {
    const clean = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length <= 4) return clean;
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  };

  const handleCopyAll = useCallback(async () => {
    const formattedCodes = codes.map(formatCode).join('\n');
    const text = `chess game backup codes\n${'='.repeat(25)}\n\n${formattedCodes}\n\n${'='.repeat(25)}\nstore these codes securely.\neach code can only be used once.`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy codes:', err);
    }
  }, [codes]);

  const handleDownload = useCallback(() => {
    const formattedCodes = codes.map(formatCode).join('\n');
    const text = `CHESS GAME BACKUP CODES
${'='.repeat(25)}

${formattedCodes}

${'='.repeat(25)}
Generated: ${new Date().toISOString()}

IMPORTANT:
- Store these codes securely
- Each code can only be used once
- These codes can be used if you lose access to your authenticator
`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chess-game-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="p-4 bg-black border border-white/30">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠</span>
          <div className="space-y-2">
            <p className="text-white font-mono text-sm lowercase">
              save your backup codes
            </p>
            <p className="text-white/50 font-mono text-xs lowercase leading-relaxed">
              these codes can be used to access your account if you lose your
              authenticator device. each code can only be used once.
            </p>
          </div>
        </div>
      </div>

      {/* Codes Grid */}
      <div className="border border-white/15 bg-black">
        <div className="p-3 border-b border-white/15">
          <p className="text-xs font-mono text-white/50 lowercase">
            backup codes ({codes.length} remaining)
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2">
            {codes.map((code, index) => (
              <div
                key={index}
                className="p-2 bg-black border border-white/15 text-center font-mono text-sm text-white tracking-wider"
              >
                {formatCode(code)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCopyAll}
          className={`
            flex-1 px-4 py-2.5 text-sm font-mono lowercase tracking-wide
            border transition-all duration-150
            ${copied
              ? 'bg-white text-black border-white'
              : 'bg-black border-white/15 text-white/70 hover:border-white hover:text-white'
            }
          `}
        >
          {copied ? '[ copied ]' : 'copy all'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 px-4 py-2.5 text-sm font-mono bg-black border border-white/15 text-white/70 hover:border-white hover:text-white transition-all duration-150 lowercase tracking-wide"
        >
          download .txt
        </button>
      </div>

      {/* Confirmation Checkbox */}
      <div className="pt-4 border-t border-white/15">
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-5 h-5 border border-white/30 bg-black peer-checked:bg-white peer-checked:border-white transition-all duration-150 peer-focus:ring-1 peer-focus:ring-white/50">
              {confirmed && (
                <svg
                  className="w-5 h-5 text-black"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm font-mono text-white/70 lowercase leading-relaxed group-hover:text-white transition-colors duration-150">
            i have saved my backup codes in a secure location
          </span>
        </label>
      </div>

      {/* Complete Button */}
      <button
        type="button"
        onClick={onComplete}
        disabled={!confirmed}
        className={`
          w-full px-5 py-2.5 text-sm font-mono lowercase tracking-wide
          transition-all duration-150
          ${confirmed
            ? 'bg-white text-black border border-white hover:bg-white/90'
            : 'bg-black border border-white/15 text-white/30 cursor-not-allowed'
          }
        `}
      >
        i've saved my codes
      </button>

      {/* Help Text */}
      <p className="text-center text-white/30 text-xs font-mono lowercase">
        you can regenerate backup codes in account settings
      </p>
    </div>
  );
}
