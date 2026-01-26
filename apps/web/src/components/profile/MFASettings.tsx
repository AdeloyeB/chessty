'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { MFAEnrollment } from '../auth/MFAEnrollment';
import { MFACodeInput } from '../auth/MFACodeInput';
import { MFABackupCodes } from '../auth/MFABackupCodes';

interface MFAStatus {
  enabled: boolean;
  backupCodesRemaining: number;
  enrolledAt?: string;
}

type ModalType = 'none' | 'enrollment' | 'disable' | 'regenerate' | 'newCodes';

export function MFASettings() {
  const { getMFAStatus, disableMFA, regenerateBackupCodes } = useApi();

  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [activeModal, setActiveModal] = useState<ModalType>('none');

  // Disable modal state
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  // Regenerate modal state
  const [regeneratePassword, setRegeneratePassword] = useState('');
  const [regenerateError, setRegenerateError] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  // Fetch MFA status on mount
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getMFAStatus();
      setStatus({
        enabled: data.enabled,
        backupCodesRemaining: data.backupCodesRemaining,
        // Mock enrolled date for now - would come from API
        enrolledAt: data.enabled ? '2024-06-15T10:00:00Z' : undefined,
      });
    } catch (err) {
      // For development, use mock data if API fails
      console.error('Failed to fetch MFA status:', err);
      setStatus({
        enabled: false,
        backupCodesRemaining: 10,
      });
    } finally {
      setIsLoading(false);
    }
  }, [getMFAStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle enrollment completion
  const handleEnrollmentComplete = useCallback(() => {
    setActiveModal('none');
    fetchStatus(); // Refresh status
  }, [fetchStatus]);

  // Handle disable MFA
  const handleDisableMFA = useCallback(async (code: string) => {
    if (!disablePassword) {
      setDisableError('password is required');
      return;
    }

    setIsDisabling(true);
    setDisableError('');

    try {
      await disableMFA(disablePassword, code);
      setActiveModal('none');
      setDisablePassword('');
      fetchStatus(); // Refresh status
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'failed to disable mfa');
    } finally {
      setIsDisabling(false);
    }
  }, [disablePassword, disableMFA, fetchStatus]);

  // Handle regenerate backup codes
  const handleRegenerateBackupCodes = useCallback(async () => {
    if (!regeneratePassword) {
      setRegenerateError('password is required');
      return;
    }

    setIsRegenerating(true);
    setRegenerateError('');

    try {
      const data = await regenerateBackupCodes(regeneratePassword);
      setNewBackupCodes(data.backupCodes);
      setRegeneratePassword('');
      setActiveModal('newCodes');
      fetchStatus(); // Refresh status for updated count
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : 'failed to regenerate codes');
    } finally {
      setIsRegenerating(false);
    }
  }, [regeneratePassword, regenerateBackupCodes, fetchStatus]);

  // Close modal helper
  const closeModal = useCallback(() => {
    setActiveModal('none');
    setDisablePassword('');
    setDisableError('');
    setRegeneratePassword('');
    setRegenerateError('');
    setNewBackupCodes([]);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="border border-white/15">
        <div className="p-4 border-b border-white/15 bg-black">
          <p className="text-xs font-mono text-white/50 lowercase">security_settings</p>
        </div>
        <div className="p-6 bg-black">
          <div className="flex items-center justify-center py-8">
            <span className="text-white/50 font-mono text-sm lowercase flex items-center gap-2">
              <span className="animate-blink">_</span>
              loading...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="border border-white/15">
        <div className="p-4 border-b border-white/15 bg-black">
          <p className="text-xs font-mono text-white/50 lowercase">security_settings</p>
        </div>
        <div className="p-6 bg-black">
          <div className="p-4 border border-white/30 bg-black">
            <p className="text-white/70 font-mono text-sm lowercase">error: {error}</p>
            <button
              onClick={fetchStatus}
              className="mt-3 text-white/50 text-xs font-mono lowercase hover:text-white transition-colors"
            >
              [ retry ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border border-white/15">
        {/* Header */}
        <div className="p-4 border-b border-white/15 bg-black">
          <p className="text-xs font-mono text-white/50 lowercase">security_settings</p>
        </div>

        {/* Content */}
        <div className="p-6 bg-black space-y-6">
          {/* MFA Section */}
          <div className="space-y-4">
            {/* Title with status badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-white font-mono text-sm lowercase">two-factor authentication</h3>
                {status?.enabled && (
                  <span className="px-2 py-0.5 text-xs font-mono lowercase bg-green-500/20 border border-green-500/50 text-green-400">
                    enabled
                  </span>
                )}
              </div>
            </div>

            {/* Description and actions */}
            {!status?.enabled ? (
              // MFA Disabled State
              <div className="space-y-4">
                <p className="text-white/50 font-mono text-sm lowercase">
                  add an extra layer of security to your account
                </p>
                <button
                  onClick={() => setActiveModal('enrollment')}
                  className="px-5 py-2.5 text-sm font-mono bg-white text-black border border-white hover:bg-white/90 transition-all duration-150 lowercase tracking-wide"
                >
                  enable mfa
                </button>
              </div>
            ) : (
              // MFA Enabled State
              <div className="space-y-4">
                {/* Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Enrolled Date */}
                  {status.enrolledAt && (
                    <div className="p-3 bg-black border border-white/15">
                      <p className="text-xs font-mono text-white/50 lowercase">enrolled</p>
                      <p className="text-sm font-mono text-white lowercase mt-1">
                        {new Date(status.enrolledAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  )}

                  {/* Backup Codes Remaining */}
                  <div className="p-3 bg-black border border-white/15">
                    <p className="text-xs font-mono text-white/50 lowercase">backup codes</p>
                    <p className={`text-sm font-mono mt-1 lowercase ${
                      status.backupCodesRemaining <= 2
                        ? 'text-red-400'
                        : status.backupCodesRemaining <= 5
                          ? 'text-yellow-400'
                          : 'text-white'
                    }`}>
                      {status.backupCodesRemaining}/10 remaining
                    </p>
                  </div>
                </div>

                {/* Warning if low backup codes */}
                {status.backupCodesRemaining <= 2 && (
                  <div className="p-3 bg-black border border-yellow-500/30">
                    <p className="text-yellow-400 font-mono text-xs lowercase">
                      warning: you have very few backup codes left. consider regenerating them.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => setActiveModal('regenerate')}
                    className="px-4 py-2 text-sm font-mono bg-black border border-white/15 text-white/70 hover:border-white hover:text-white transition-all duration-150 lowercase"
                  >
                    regenerate backup codes
                  </button>
                  <button
                    onClick={() => setActiveModal('disable')}
                    className="px-4 py-2 text-sm font-mono bg-black border border-white/15 text-white/50 hover:border-red-500/50 hover:text-red-400 transition-all duration-150 lowercase"
                  >
                    disable mfa
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enrollment Modal */}
      {activeModal === 'enrollment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto m-4 bg-black border border-white/15">
            <div className="p-4 border-b border-white/15 flex items-center justify-between">
              <p className="text-white font-mono text-sm lowercase">enable two-factor authentication</p>
              <button
                onClick={closeModal}
                className="text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <MFAEnrollment
                onComplete={handleEnrollmentComplete}
                onCancel={closeModal}
              />
            </div>
          </div>
        </div>
      )}

      {/* Disable MFA Modal */}
      {activeModal === 'disable' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md m-4 bg-black border border-white/15">
            <div className="p-4 border-b border-white/15 flex items-center justify-between">
              <p className="text-white font-mono text-sm lowercase">disable two-factor authentication</p>
              <button
                onClick={closeModal}
                className="text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Warning */}
              <div className="p-4 bg-black border border-red-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-red-400 text-xl">⚠</span>
                  <p className="text-red-400 font-mono text-sm lowercase">
                    this will make your account less secure
                  </p>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/50 lowercase">password</label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="enter your password"
                  className="w-full px-4 py-2.5 bg-black border border-white/15 text-white font-mono text-sm lowercase placeholder:text-white/30 focus:outline-none focus:border-white transition-colors"
                  disabled={isDisabling}
                />
              </div>

              {/* TOTP Code Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/50 lowercase">authenticator code</label>
                <MFACodeInput
                  onComplete={handleDisableMFA}
                  onUseBackupCode={() => {}}
                  error={disableError}
                  isLoading={isDisabling}
                />
              </div>

              {/* Cancel Button */}
              <button
                onClick={closeModal}
                disabled={isDisabling}
                className="w-full px-4 py-2 text-sm font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all duration-150 lowercase disabled:opacity-50"
              >
                cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Backup Codes Modal */}
      {activeModal === 'regenerate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md m-4 bg-black border border-white/15">
            <div className="p-4 border-b border-white/15 flex items-center justify-between">
              <p className="text-white font-mono text-sm lowercase">regenerate backup codes</p>
              <button
                onClick={closeModal}
                className="text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Warning */}
              <div className="p-4 bg-black border border-yellow-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-yellow-400 text-xl">⚠</span>
                  <p className="text-yellow-400 font-mono text-sm lowercase">
                    this will invalidate your existing backup codes
                  </p>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/50 lowercase">password</label>
                <input
                  type="password"
                  value={regeneratePassword}
                  onChange={(e) => setRegeneratePassword(e.target.value)}
                  placeholder="enter your password"
                  className="w-full px-4 py-2.5 bg-black border border-white/15 text-white font-mono text-sm lowercase placeholder:text-white/30 focus:outline-none focus:border-white transition-colors"
                  disabled={isRegenerating}
                />
              </div>

              {/* Error Message */}
              {regenerateError && (
                <div className="p-3 bg-black border border-white/30 text-white/70 text-sm font-mono lowercase text-center">
                  error: {regenerateError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isRegenerating}
                  className="flex-1 px-4 py-2.5 text-sm font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all duration-150 lowercase disabled:opacity-50"
                >
                  cancel
                </button>
                <button
                  onClick={handleRegenerateBackupCodes}
                  disabled={isRegenerating || !regeneratePassword}
                  className="flex-1 px-4 py-2.5 text-sm font-mono bg-white text-black border border-white hover:bg-white/90 transition-all duration-150 lowercase disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-blink">_</span>
                      regenerating...
                    </span>
                  ) : (
                    'regenerate'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Backup Codes Modal */}
      {activeModal === 'newCodes' && newBackupCodes.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto m-4 bg-black border border-white/15">
            <div className="p-4 border-b border-white/15 flex items-center justify-between">
              <p className="text-white font-mono text-sm lowercase">new backup codes</p>
              <button
                onClick={closeModal}
                className="text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <MFABackupCodes
                codes={newBackupCodes}
                onComplete={closeModal}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
