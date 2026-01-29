'use client';

/**
 * OverwatchDevPanel Component
 *
 * The main wrapper for the Arbiter Overwatch System in dev tools.
 * Provides a tabbed interface for:
 * - Available Cases: List of pending cases to review
 * - Review: Active case review interface
 * - My Stats: Personal arbiter statistics
 *
 * HOW TO ACCESS:
 * This panel is rendered inside the DevDebugPanel when the
 * "Arbiter Overwatch" section is opened. Only visible in dev mode.
 */

import { useState, useCallback, useMemo } from 'react';
import { OverwatchCaseList } from './OverwatchCaseList';
import { OverwatchCaseReview } from './OverwatchCaseReview';
import { OverwatchStats } from './OverwatchStats';
import {
  MOCK_OVERWATCH_CASES,
  MOCK_ARBITER_STATS,
  type ChargeType,
  type VerdictOption,
} from './mockOverwatchData';

type TabId = 'cases' | 'review' | 'stats';

interface Tab {
  id: TabId;
  label: string;
  disabled?: boolean;
}

export function OverwatchDevPanel() {
  // State
  const [activeTab, setActiveTab] = useState<TabId>('cases');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [submittedCases, setSubmittedCases] = useState<Set<string>>(new Set());

  // Filter out submitted cases
  const availableCases = useMemo(() => {
    return MOCK_OVERWATCH_CASES.filter(c => !submittedCases.has(c.id));
  }, [submittedCases]);

  // Get selected case
  const selectedCase = useMemo(() => {
    if (!selectedCaseId) return null;
    return MOCK_OVERWATCH_CASES.find(c => c.id === selectedCaseId) || null;
  }, [selectedCaseId]);

  // Tab definitions
  const tabs: Tab[] = [
    { id: 'cases', label: 'available cases' },
    { id: 'review', label: 'review', disabled: !selectedCase },
    { id: 'stats', label: 'my stats' },
  ];

  // Handlers
  const handleSelectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveTab('review');
  }, []);

  const handleSubmitVerdict = useCallback((
    caseId: string,
    verdicts: Record<ChargeType, VerdictOption>
  ) => {
    console.log('[Overwatch] Verdict submitted:', { caseId, verdicts });
    setSubmittedCases(prev => new Set([...prev, caseId]));
    setSelectedCaseId(null);
    setActiveTab('cases');
  }, []);

  const handleSkipCase = useCallback((caseId: string) => {
    console.log('[Overwatch] Case skipped:', caseId);
    setSelectedCaseId(null);
    setActiveTab('cases');
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveTab('cases');
  }, []);

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-center border-b border-[#666]/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-3 text-xs font-mono transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-white border-white'
                : tab.disabled
                ? 'text-[#666] border-transparent cursor-not-allowed'
                : 'text-[#888] border-transparent hover:text-white'
            }`}
          >
            {tab.label}
            {tab.id === 'cases' && availableCases.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/10 text-[10px]">
                {availableCases.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'cases' && (
          <div className="h-full overflow-y-auto p-4">
            <OverwatchCaseList
              cases={availableCases}
              onSelectCase={handleSelectCase}
            />
          </div>
        )}

        {activeTab === 'review' && selectedCase && (
          <OverwatchCaseReview
            overwatchCase={selectedCase}
            onSubmitVerdict={handleSubmitVerdict}
            onSkipCase={handleSkipCase}
            onBack={handleBackToList}
          />
        )}

        {activeTab === 'stats' && (
          <div className="h-full overflow-y-auto p-4">
            <OverwatchStats stats={MOCK_ARBITER_STATS} />
          </div>
        )}
      </div>
    </div>
  );
}

export default OverwatchDevPanel;
