'use client';

import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { MFACodeInput } from './MFACodeInput';
import { MFABackupCodes } from './MFABackupCodes';

interface MFAEnrollmentProps {
  onComplete: () => void;
  onCancel: () => void;
}

type EnrollmentStep = 'scan' | 'verify' | 'backup';

// Mock data for development - replace with actual API calls
const MOCK_SECRET = 'JBSWY3DPEHPK3PXP';
const MOCK_BACKUP_CODES = [
  'A1B2C3D4',
  'E5F6G7H8',
  'I9J0K1L2',
  'M3N4O5P6',
  'Q7R8S9T0',
  'U1V2W3X4',
  'Y5Z6A7B8',
  'C9D0E1F2',
  'G3H4I5J6',
  'K7L8M9N0',
];

export function MFAEnrollment({ onComplete, onCancel }: MFAEnrollmentProps) {
  const [step, setStep] = useState<EnrollmentStep>('scan');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [verifyError, setVerifyError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize enrollment - fetch secret from API
  useEffect(() => {
    const initEnrollment = async () => {
      setIsLoading(true);
      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/auth/mfa/setup', { method: 'POST' });
        // const data = await response.json();
        // setSecret(data.secret);
        // setBackupCodes(data.backupCodes);

        // Mock data for development
        await new Promise(resolve => setTimeout(resolve, 500));
        setSecret(MOCK_SECRET);
        setBackupCodes(MOCK_BACKUP_CODES);

        // Generate QR code
        const otpauthUrl = `otpauth://totp/ChessGame:user@example.com?secret=${MOCK_SECRET}&issuer=ChessGame&algorithm=SHA1&digits=6&period=30`;
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
          width: 200,
          margin: 2,
          color: {
            dark: '#ffffff',
            light: '#000000',
          },
        });
        setQrCodeUrl(qrDataUrl);
      } catch (error) {
        console.error('Failed to initialize MFA enrollment:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initEnrollment();
  }, []);

  const handleVerifyCode = useCallback(async (code: string) => {
    setIsVerifying(true);
    setVerifyError('');

    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/auth/mfa/verify-setup', {
      //   method: 'POST',
      //   body: JSON.stringify({ code }),
      // });
      // if (!response.ok) throw new Error('Invalid code');

      // Mock verification - accept any 6-digit code for dev
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate verification (in production, validate against server)
      if (code === '000000') {
        throw new Error('invalid code. please try again.');
      }

      // Move to backup codes step
      setStep('backup');
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : 'verification failed');
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const handleBackupCodesComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Format secret for display (groups of 4)
  const formatSecret = (s: string): string => {
    return s.match(/.{1,4}/g)?.join(' ') || s;
  };

  // Copy secret to clipboard
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Step indicator
  const steps = [
    { key: 'scan', label: 'scan qr' },
    { key: 'verify', label: 'verify' },
    { key: 'backup', label: 'backup' },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="space-y-6">
      {/* Step Progress */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`
                flex items-center justify-center w-6 h-6 text-xs font-mono
                border transition-all duration-150
                ${index <= currentStepIndex
                  ? 'border-white bg-white text-black'
                  : 'border-white/30 bg-black text-white/30'
                }
              `}
            >
              {index + 1}
            </div>
            <span
              className={`
                ml-2 text-xs font-mono lowercase
                ${index <= currentStepIndex ? 'text-white' : 'text-white/30'}
              `}
            >
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 h-px mx-3
                  ${index < currentStepIndex ? 'bg-white' : 'bg-white/15'}
                `}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="pt-4">
        {/* Step 1: Scan QR Code */}
        {step === 'scan' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-white font-mono text-lg lowercase">
                scan qr code
              </h3>
              <p className="text-white/50 font-mono text-sm lowercase">
                use your authenticator app to scan this code
              </p>
            </div>

            {/* QR Code Container */}
            <div className="flex justify-center">
              <div className="p-4 bg-black border border-white/15">
                {isLoading ? (
                  <div className="w-[200px] h-[200px] flex items-center justify-center">
                    <span className="text-white/50 font-mono text-sm lowercase flex items-center gap-2">
                      <span className="animate-blink">_</span>
                      generating...
                    </span>
                  </div>
                ) : qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="MFA QR Code"
                    className="w-[200px] h-[200px]"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center">
                    <span className="text-white/50 font-mono text-sm lowercase">
                      failed to load
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Manual Entry Toggle */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowManualEntry(!showManualEntry)}
                className="text-white/50 text-xs font-mono lowercase hover:text-white transition-colors duration-150"
              >
                {showManualEntry ? '[ hide manual entry ]' : '[ can\'t scan? enter manually ]'}
              </button>
            </div>

            {/* Manual Entry Section */}
            {showManualEntry && (
              <div className="space-y-3 p-4 border border-white/15 bg-black">
                <p className="text-white/50 font-mono text-xs lowercase">
                  manual entry key:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-black border border-white/15 text-white font-mono text-sm tracking-widest">
                    {formatSecret(secret)}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="px-3 py-2 border border-white/15 text-white/70 hover:border-white hover:text-white transition-all duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <p className="text-white/30 font-mono text-xs lowercase">
                  time-based (totp) • sha1 • 6 digits • 30 seconds
                </p>
              </div>
            )}

            {/* App Recommendations */}
            <div className="p-3 border border-white/15 bg-black">
              <p className="text-white/50 font-mono text-xs lowercase mb-2">
                recommended apps:
              </p>
              <div className="flex flex-wrap gap-2 text-white/70 font-mono text-xs lowercase">
                <span className="px-2 py-1 border border-white/15">google authenticator</span>
                <span className="px-2 py-1 border border-white/15">authy</span>
                <span className="px-2 py-1 border border-white/15">1password</span>
              </div>
            </div>

            {/* Continue Button */}
            <button
              type="button"
              onClick={() => setStep('verify')}
              disabled={isLoading}
              className="w-full px-5 py-2.5 text-sm font-mono bg-white text-black border border-white hover:bg-white/90 transition-all duration-150 lowercase tracking-wide disabled:opacity-50"
            >
              continue
            </button>

            {/* Cancel Link */}
            <div className="text-center">
              <button
                type="button"
                onClick={onCancel}
                className="text-white/30 text-xs font-mono lowercase hover:text-white/60 transition-colors duration-150"
              >
                cancel setup
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Verify Code */}
        {step === 'verify' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-white font-mono text-lg lowercase">
                verify setup
              </h3>
              <p className="text-white/50 font-mono text-sm lowercase">
                enter the code from your authenticator app
              </p>
            </div>

            <MFACodeInput
              onComplete={handleVerifyCode}
              onUseBackupCode={() => setStep('scan')}
              error={verifyError}
              isLoading={isVerifying}
            />

            {/* Back Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep('scan')}
                disabled={isVerifying}
                className="text-white/30 text-xs font-mono lowercase hover:text-white/60 transition-colors duration-150 disabled:opacity-50"
              >
                back to qr code
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Backup Codes */}
        {step === 'backup' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-white font-mono text-lg lowercase">
                save backup codes
              </h3>
              <p className="text-white/50 font-mono text-sm lowercase">
                two-factor authentication is now enabled
              </p>
            </div>

            <MFABackupCodes
              codes={backupCodes}
              onComplete={handleBackupCodesComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
