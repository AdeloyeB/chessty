'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent, ClipboardEvent } from 'react';

interface MFACodeInputProps {
  onComplete: (code: string) => void;
  onUseBackupCode: () => void;
  error?: string;
  isLoading?: boolean;
}

export function MFACodeInput({
  onComplete,
  onUseBackupCode,
  error,
  isLoading = false,
}: MFACodeInputProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-submit when all digits are filled
  useEffect(() => {
    const code = digits.join('');
    if (code.length === 6 && digits.every(d => d !== '')) {
      onComplete(code);
    }
  }, [digits, onComplete]);

  const handleChange = useCallback((index: number, value: string) => {
    // Only allow single digit
    const digit = value.slice(-1);
    if (digit && !/^\d$/.test(digit)) return;

    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (digits[index] === '' && index > 0) {
        // Move to previous input if current is empty
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
      } else {
        // Clear current input
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
      e.preventDefault();
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pastedData[i] || '';
      }
      setDigits(newDigits);

      // Focus appropriate input
      const focusIndex = Math.min(pastedData.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  }, [digits]);

  const handleFocus = useCallback((index: number) => {
    // Select the content when focusing
    inputRefs.current[index]?.select();
  }, []);

  const clearAll = useCallback(() => {
    setDigits(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  }, []);

  return (
    <div className="space-y-6">
      {/* Code Input Grid */}
      <div className="flex justify-center gap-2 sm:gap-3">
        {digits.map((digit, index) => (
          <div key={index} className="relative">
            <input
              ref={el => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              onFocus={() => handleFocus(index)}
              disabled={isLoading}
              className={`
                w-10 h-14 sm:w-12 sm:h-16
                bg-black
                border ${error ? 'border-white/50' : digit ? 'border-white' : 'border-white/15'}
                text-white text-center text-xl sm:text-2xl font-mono
                focus:outline-none focus:border-white
                transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isLoading ? 'animate-pulse' : ''}
              `}
              aria-label={`digit ${index + 1}`}
            />
            {/* Cursor animation when focused and empty */}
            {digit === '' && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-0.5 h-6 bg-white/30 animate-blink" />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-black border border-white/30 text-white/70 text-sm font-mono lowercase text-center">
          error: {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center">
          <span className="text-white/50 font-mono text-sm lowercase flex items-center justify-center gap-2">
            <span className="animate-blink">_</span>
            verifying...
          </span>
        </div>
      )}

      {/* Helper Text */}
      <div className="text-center space-y-3">
        <p className="text-white/30 text-xs font-mono lowercase">
          enter the 6-digit code from your authenticator app
        </p>

        {/* Clear Button - only show when there are digits */}
        {digits.some(d => d !== '') && !isLoading && (
          <button
            type="button"
            onClick={clearAll}
            className="text-white/30 text-xs font-mono lowercase hover:text-white/60 transition-colors duration-150"
          >
            [ clear ]
          </button>
        )}
      </div>

      {/* Backup Code Link */}
      <div className="pt-4 border-t border-white/15">
        <button
          type="button"
          onClick={onUseBackupCode}
          disabled={isLoading}
          className="w-full text-white/50 text-sm font-mono lowercase hover:text-white transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          use backup code instead
        </button>
      </div>
    </div>
  );
}
